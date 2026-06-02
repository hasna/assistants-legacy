import React from 'react';
import { describe, expect, test } from 'bun:test';
import {
  Text,
  createOsc52ClipboardSequence,
  parseBracketedPasteInput,
  useInkClipboard,
  useInkPaste,
  useInput,
  useTerminalFocus,
} from '../src/ui/ink';
import { renderInk } from './utils/ink-test-harness';

describe('Ink terminal hooks', () => {
  test('creates OSC52 clipboard sequences', () => {
    expect(createOsc52ClipboardSequence('hello')).toBe('\x1b]52;c;aGVsbG8=\x07');
  });

  test('parses and normalizes bracketed paste payloads', () => {
    const pasted = parseBracketedPasteInput('before\x1b[200~one\r\ntwo\x1b[201~after');
    expect(pasted).toEqual(['one\ntwo']);
  });

  test('useInkPaste receives normalized bracketed paste text', async () => {
    const received: string[] = [];
    function Probe() {
      useInkPaste((text) => {
        received.push(text);
      });
      return <Text>ready</Text>;
    }

    const harness = await renderInk(<Probe />, { width: 40, height: 6 });
    harness.pasteText('alpha\r\nbeta');
    await harness.renderOnce();

    expect(received).toEqual(['alpha\nbeta']);

    await harness.cleanup();
  });

  test('useTerminalFocus tracks terminal focus in and out events', async () => {
    function Probe() {
      const { isFocused } = useTerminalFocus({ enableReporting: false });
      return <Text>{isFocused ? 'focused' : 'blurred'}</Text>;
    }

    const harness = await renderInk(<Probe />, { width: 40, height: 6 });
    expect(harness.captureFrame()).toContain('focused');

    harness.typeText('\x1b[O');
    await harness.waitForText('blurred');

    harness.typeText('\x1b[I');
    await harness.waitForText('focused');

    await harness.cleanup();
  });

  test('useInkClipboard writes OSC52 through Ink stdout and flashes copied state', async () => {
    function Probe() {
      const { copy, justCopied } = useInkClipboard({ resetDelayMs: 1000 });
      useInput((input) => {
        if (input === 'c') copy('hello');
      });
      return <Text>{justCopied ? 'copied' : 'idle'}</Text>;
    }

    const harness = await renderInk(<Probe />, { width: 40, height: 6 });
    harness.typeText('c');
    await harness.waitForText('copied');

    expect(harness.captureRawOutput()).toContain(createOsc52ClipboardSequence('hello'));

    await harness.cleanup();
  });
});
