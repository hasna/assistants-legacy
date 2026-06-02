import React, { useState } from 'react';
import { describe, expect, test } from 'bun:test';
import { Text, useTextInput } from '../src/ui/ink';
import { renderInk } from './utils/ink-test-harness';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function TextInputProbe({
  initialValue = '',
  multiline = false,
  onSubmit,
  onCancel,
  onHistoryUp,
  onHistoryDown,
}: {
  initialValue?: string;
  multiline?: boolean;
  onSubmit?: (value: string) => void;
  onCancel?: () => void;
  onHistoryUp?: () => void;
  onHistoryDown?: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const input = useTextInput({
    value,
    onChange: setValue,
    onSubmit,
    onCancel,
    onHistoryUp,
    onHistoryDown,
    multiline,
    columns: 12,
    cursorChar: '|',
  });

  return <Text>{input.renderedValue} [{input.cursorOffset}]</Text>;
}

function VisibleValueProbe({
  initialValue,
  cursorOffset,
}: {
  initialValue: string;
  cursorOffset: number;
}) {
  const [value, setValue] = useState(initialValue);
  const input = useTextInput({
    value,
    onChange: setValue,
    cursorOffset,
    columns: 5,
    maxVisibleLines: 2,
    cursorChar: '|',
  });

  return <Text>{input.visibleValue.replaceAll('\n', '/')}</Text>;
}

describe('useTextInput', () => {
  test('inserts typed text and advances the cursor', async () => {
    const harness = await renderInk(<TextInputProbe />);
    try {
      harness.typeText('abc');
      const frame = await harness.waitForText('abc| [3]');
      expect(frame).toContain('abc| [3]');
    } finally {
      await harness.cleanup();
    }
  });

  test('moves left and backspaces by grapheme', async () => {
    const harness = await renderInk(<TextInputProbe />);
    try {
      harness.typeText('abc');
      await harness.waitForText('abc| [3]');
      harness.pressKey('left');
      await harness.waitForText('ab|c [2]');
      harness.pressKey('backspace');
      const frame = await harness.waitForText('a|c [1]');
      expect(frame).toContain('a|c [1]');
    } finally {
      await harness.cleanup();
    }
  });

  test('supports readline-style ctrl+a, ctrl+e, ctrl+k, and ctrl+u', async () => {
    const harness = await renderInk(<TextInputProbe />);
    try {
      harness.typeText('hello world');
      await harness.waitForText('hello world| [11]');
      harness.pressKey('a', { ctrl: true });
      await harness.waitForText('|hello world [0]');
      harness.typeText('say ');
      await harness.waitForText('say |hello world [4]');
      harness.pressKey('e', { ctrl: true });
      await harness.waitForText('say hello world| [15]');
      harness.pressKey('k', { ctrl: true });
      await harness.waitForText('say hello world| [15]');
      harness.pressKey('u', { ctrl: true });
      const frame = await harness.waitForText('| [0]');
      expect(frame).toContain('| [0]');
    } finally {
      await harness.cleanup();
    }
  });

  test('submits on enter and inserts multiline newline with backslash-enter', async () => {
    const submitted: string[] = [];
    const harness = await renderInk(<TextInputProbe multiline onSubmit={(value) => submitted.push(value)} />);
    try {
      harness.typeText('first\\');
      harness.pressEnter();
      await harness.waitForText('first');
      harness.typeText('second');
      await harness.waitForText('second|');
      harness.pressEnter();
      await harness.renderOnce();
      expect(submitted).toEqual(['first\nsecond']);
    } finally {
      await harness.cleanup();
    }
  });

  test('routes vertical movement to history callbacks at boundaries', async () => {
    let up = 0;
    let down = 0;
    const harness = await renderInk(
      <TextInputProbe
        onHistoryUp={() => {
          up += 1;
        }}
        onHistoryDown={() => {
          down += 1;
        }}
      />,
    );

    try {
      harness.pressUp();
      harness.pressDown();
      await harness.renderOnce();
      expect(up).toBe(1);
      expect(down).toBe(1);
    } finally {
      await harness.cleanup();
    }
  });

  test('renders visible wrapped lines without cursor offset drift', async () => {
    const harness = await renderInk(<VisibleValueProbe initialValue="abcdefghijkl" cursorOffset={7} />);

    try {
      const frame = await harness.waitForText('abcde/fg|hij');
      expect(frame).toContain('abcde/fg|hij');
    } finally {
      await harness.cleanup();
    }
  });

  test('calls cancel on escape when there is no text to clear', async () => {
    let canceled = 0;
    const harness = await renderInk(<TextInputProbe onCancel={() => { canceled += 1; }} />);

    try {
      harness.pressEscape();
      await delay(30);
      await harness.renderOnce();
      expect(canceled).toBe(1);
    } finally {
      await harness.cleanup();
    }
  });
});
