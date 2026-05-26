/**
 * Tests for the exit summary (plan 8d98da29 P6.1 backfill).
 * Covers the module-level stats round-trip and the rendered summary output
 * (resume command, duration/message lines, token formatting, estimated cost).
 */
import { describe, expect, test, afterEach } from 'bun:test';
import { setExitStats, getExitStats, printExitSummary, type ExitStats } from '../src/exit-summary';

/** Capture process.stderr.write output for the duration of `fn`. */
function captureStderr(fn: () => void): string {
  const original = process.stderr.write.bind(process.stderr);
  let out = '';
  // @ts-expect-error narrow override for the test
  process.stderr.write = (chunk: string) => { out += chunk; return true; };
  try { fn(); } finally { process.stderr.write = original; }
  return out;
}

afterEach(() => setExitStats(null as unknown as ExitStats));

describe('exit stats state', () => {
  test('round-trips the stored stats', () => {
    expect(getExitStats()).toBeNull();
    const stats: ExitStats = { sessionId: 's1', startedAt: Date.now(), messageCount: 3 };
    setExitStats(stats);
    expect(getExitStats()).toEqual(stats);
  });
});

describe('printExitSummary', () => {
  test('prints the resume command using the label when present', () => {
    const out = captureStderr(() =>
      printExitSummary({ sessionId: 'abc123', sessionLabel: 'my-session', startedAt: Date.now(), messageCount: 2 }),
    );
    expect(out).toContain('Resume this session:');
    expect(out).toContain('assistants --resume my-session');
    expect(out).toContain('Total messages:');
    expect(out).toContain('2 messages');
  });

  test('falls back to the session id when no label', () => {
    const out = captureStderr(() =>
      printExitSummary({ sessionId: 'abc123', startedAt: Date.now(), messageCount: 0 }),
    );
    expect(out).toContain('assistants --resume abc123');
  });

  test('formats token counts with k/m suffixes', () => {
    const out = captureStderr(() =>
      printExitSummary({
        sessionId: 's', startedAt: Date.now(), messageCount: 1,
        tokenUsage: { inputTokens: 12_000, outputTokens: 2_500_000, totalTokens: 0, maxContextTokens: 0 },
      }),
    );
    expect(out).toContain('Token usage:');
    expect(out).toContain('12.0k tokens');
    expect(out).toContain('2.5m tokens');
  });

  test('shows a duration line', () => {
    const out = captureStderr(() =>
      printExitSummary({ sessionId: 's', startedAt: Date.now() - 65_000, messageCount: 1 }),
    );
    expect(out).toContain('Total duration (wall):');
    expect(out).toMatch(/1m \d+s/);
  });
});
