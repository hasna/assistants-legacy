import React, { useState } from 'react';
import { describe, expect, test } from 'bun:test';
import { VimTextarea, type VimMode } from '../src/components/prompt-input';
import { renderInk } from './utils/ink-test-harness';

function ControlledVimTextarea({
  initialValue,
  initialCursorOffset = initialValue.length,
  initialMode = 'NORMAL',
}: {
  initialValue: string;
  initialCursorOffset?: number;
  initialMode?: VimMode;
}) {
  const [value, setValue] = useState(initialValue);
  const [cursorOffset, setCursorOffset] = useState(initialCursorOffset);
  const [mode, setMode] = useState<VimMode>(initialMode);

  return (
    <VimTextarea
      value={value}
      onChange={setValue}
      cursorOffset={cursorOffset}
      onCursorOffsetChange={setCursorOffset}
      mode={mode}
      onModeChange={setMode}
      columns={20}
      cursorChar="|"
    />
  );
}

describe('Ink VimTextarea', () => {
  test('normal-mode edits update the controlled Ink Textarea model', async () => {
    const harness = await renderInk(<ControlledVimTextarea initialValue="abc" initialCursorOffset={0} />);

    try {
      await harness.waitForText('|abc');
      harness.pressKey('x');
      const frame = await harness.waitForText('|bc');
      expect(frame).toContain('|bc');
      expect(frame).toContain('NORMAL');
    } finally {
      await harness.cleanup();
    }
  });

  test('insert-entry commands switch mode and delegate printable input to Textarea', async () => {
    const harness = await renderInk(<ControlledVimTextarea initialValue="abc" initialCursorOffset={0} />);

    try {
      harness.pressKey('i');
      await harness.waitForText('INSERT');
      harness.typeText('Z');
      const frame = await harness.waitForText('Z|abc');
      expect(frame).toContain('Z|abc');
      expect(frame).toContain('INSERT');
    } finally {
      await harness.cleanup();
    }
  });
});
