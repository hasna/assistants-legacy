import { describe, test, expect } from 'bun:test';
import {
  pcmToMulaw,
  mulawToPcm,
  downsample16kTo8k,
  upsample8kTo16k,
  twilioToElevenLabs,
  elevenLabsToTwilio,
  decodeTwilioPayload,
  encodeTwilioPayload,
} from '../src/telephony/audio-codec';

function pcmBufferFromSamples(samples: number[]): Buffer {
  const buf = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => buf.writeInt16LE(s, i * 2));
  return buf;
}

function pcmToSamples(buf: Buffer): number[] {
  const out: number[] = [];
  for (let i = 0; i < Math.floor(buf.length / 2); i++) out.push(buf.readInt16LE(i * 2));
  return out;
}

describe('audio-codec: pcmToMulaw / mulawToPcm', () => {
  test('produces one mulaw byte per PCM sample', () => {
    const pcm = pcmBufferFromSamples([0, 100, -100, 8000, -8000]);
    const mulaw = pcmToMulaw(pcm);
    expect(mulaw.length).toBe(5);
  });

  test('mulawToPcm produces two bytes per mulaw byte', () => {
    const mulaw = Buffer.from([0x00, 0x7f, 0xff, 0x80]);
    const pcm = mulawToPcm(mulaw);
    expect(pcm.length).toBe(8);
  });

  test('drops a trailing odd byte when computing sample count', () => {
    // 3 bytes => 1 full sample (1.5 floored to 1)
    const oddBuffer = Buffer.from([0x10, 0x20, 0x30]);
    const mulaw = pcmToMulaw(oddBuffer);
    expect(mulaw.length).toBe(1);
  });

  test('empty buffer round-trips to empty', () => {
    expect(pcmToMulaw(Buffer.alloc(0)).length).toBe(0);
    expect(mulawToPcm(Buffer.alloc(0)).length).toBe(0);
  });

  // Regression test for a codec bug: the encoder used a non-standard bias (33)
  // and clip (0x1fff), which reconstructed 4000 as 2415 (~40% error) and would
  // have heavily distorted Twilio<->ElevenLabs voice audio. Standard G.711
  // mu-law keeps companding error small (a few percent), which this asserts.
  test('round-trip matches G.711 mu-law quantization quality', () => {
    const samples = [0, 1, -1, 50, -50, 500, -500, 4000, -4000, 16000, -16000];
    const pcm = pcmBufferFromSamples(samples);
    const recovered = pcmToSamples(mulawToPcm(pcmToMulaw(pcm)));
    expect(recovered.length).toBe(samples.length);
    samples.forEach((orig, i) => {
      const rec = recovered[i];
      if (orig === 0) {
        expect(Math.abs(rec)).toBeLessThan(8);
      } else {
        if (Math.abs(orig) > 16) {
          expect(Math.sign(rec)).toBe(Math.sign(orig));
        }
        // Standard mu-law: ~7% relative companding error plus a small floor.
        const err = Math.abs(rec - orig);
        expect(err).toBeLessThanOrEqual(Math.abs(orig) * 0.07 + 8);
      }
    });
  });

  test('encodes a representative loud sample to the known G.711 byte', () => {
    // 4000 must reconstruct close to itself, not collapse to ~2415 (the bug).
    const pcm = pcmBufferFromSamples([4000]);
    const recovered = mulawToPcm(pcmToMulaw(pcm)).readInt16LE(0);
    expect(Math.abs(recovered - 4000)).toBeLessThanOrEqual(128);
  });

  test('every possible mulaw byte decodes to a finite 16-bit-range sample', () => {
    for (let b = 0; b < 256; b++) {
      const pcm = mulawToPcm(Buffer.from([b]));
      const sample = pcm.readInt16LE(0);
      expect(Number.isFinite(sample)).toBe(true);
      expect(sample).toBeGreaterThanOrEqual(-32768);
      expect(sample).toBeLessThanOrEqual(32767);
    }
  });
});

describe('audio-codec: resampling', () => {
  test('downsample16kTo8k halves the sample count', () => {
    const pcm16 = pcmBufferFromSamples([1, 2, 3, 4, 5, 6]);
    const pcm8 = downsample16kTo8k(pcm16);
    expect(pcmToSamples(pcm8)).toEqual([1, 3, 5]);
  });

  test('upsample8kTo16k doubles the sample count', () => {
    const pcm8 = pcmBufferFromSamples([100, 200]);
    const pcm16 = upsample8kTo16k(pcm8);
    const samples = pcmToSamples(pcm16);
    expect(samples.length).toBe(4);
    expect(samples[0]).toBe(100); // original
    expect(samples[1]).toBe(150); // interpolated between 100 and 200
    expect(samples[2]).toBe(200); // original
    expect(samples[3]).toBe(200); // last sample repeats (no next)
  });

  test('upsample of empty buffer is empty', () => {
    expect(upsample8kTo16k(Buffer.alloc(0)).length).toBe(0);
    expect(downsample16kTo8k(Buffer.alloc(0)).length).toBe(0);
  });
});

describe('audio-codec: end-to-end pipelines', () => {
  test('twilioToElevenLabs expands mulaw to 16kHz PCM (4x bytes)', () => {
    const mulaw = Buffer.from([0x10, 0x20, 0x30, 0x40]);
    const pcm16 = twilioToElevenLabs(mulaw);
    // 4 mulaw bytes -> 4 PCM 8k samples (8 bytes) -> 8 PCM 16k samples (16 bytes)
    expect(pcm16.length).toBe(16);
  });

  test('elevenLabsToTwilio compresses 16kHz PCM back to mulaw (1/4 samples)', () => {
    const pcm16 = pcmBufferFromSamples([10, 20, 30, 40, 50, 60, 70, 80]);
    const mulaw = elevenLabsToTwilio(pcm16);
    // 8 samples @16k -> 4 samples @8k -> 4 mulaw bytes
    expect(mulaw.length).toBe(4);
  });

  test('base64 payload decode/encode are inverses of the buffer pipelines', () => {
    const mulaw = Buffer.from([0x05, 0x55, 0xaa, 0xf0]);
    const base64 = mulaw.toString('base64');
    const decoded = decodeTwilioPayload(base64);
    expect(decoded.equals(twilioToElevenLabs(mulaw))).toBe(true);

    const pcm16 = pcmBufferFromSamples([100, -100, 200, -200]);
    const encoded = encodeTwilioPayload(pcm16);
    expect(encoded).toBe(elevenLabsToTwilio(pcm16).toString('base64'));
  });

  test('full Twilio -> ElevenLabs -> Twilio loop preserves byte count', () => {
    const mulaw = pcmToMulaw(pcmBufferFromSamples([500, -500, 1000, -1000, 2000, -2000, 100, 0]));
    const pcm16 = twilioToElevenLabs(mulaw);
    const backToMulaw = elevenLabsToTwilio(pcm16);
    expect(backToMulaw.length).toBe(mulaw.length);
  });
});
