import React, { useState } from 'react';
import { describe, expect, test } from 'bun:test';
import { Textarea } from '../src/ui/ink';
import { renderInk } from './utils/ink-test-harness';

function ControlledTextarea({
  initialValue = '',
  submitMode = 'submit',
  disabled = false,
  loading = false,
  onSubmit,
  onPaste,
  onHistoryUp,
  onHistoryDown,
}: {
  initialValue?: string;
  submitMode?: 'submit' | 'newline';
  disabled?: boolean;
  loading?: boolean;
  onSubmit?: (value: string) => void;
  onPaste?: (value: string) => void;
  onHistoryUp?: () => void;
  onHistoryDown?: () => void;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <Textarea
      value={value}
      onChange={setValue}
      onSubmit={onSubmit}
      onPaste={onPaste}
      onHistoryUp={onHistoryUp}
      onHistoryDown={onHistoryDown}
      submitMode={submitMode}
      disabled={disabled}
      loading={loading}
      placeholder="Prompt"
      columns={12}
      maxVisibleLines={3}
      cursorChar="|"
    />
  );
}

describe('Ink Textarea component', () => {
  test('renders placeholder with a visible cursor when empty', async () => {
    const harness = await renderInk(<ControlledTextarea />);

    try {
      const frame = await harness.waitForText('|Prompt');
      expect(frame).toContain('|Prompt');
    } finally {
      await harness.cleanup();
    }
  });

  test('submits on enter and inserts multiline newline with backslash-enter', async () => {
    const submitted: string[] = [];
    const harness = await renderInk(<ControlledTextarea onSubmit={(value) => submitted.push(value)} />);

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

  test('can use enter as newline when submitMode is newline', async () => {
    const submitted: string[] = [];
    const harness = await renderInk(
      <ControlledTextarea submitMode="newline" onSubmit={(value) => submitted.push(value)} />,
    );

    try {
      harness.typeText('alpha');
      await harness.waitForText('alpha|');
      harness.pressEnter();
      harness.typeText('beta');
      const frame = await harness.waitForText('beta|');
      expect(frame).toContain('alpha');
      expect(frame).toContain('beta|');
      expect(submitted).toEqual([]);
    } finally {
      await harness.cleanup();
    }
  });

  test('handles bracketed paste as one insertion', async () => {
    const pasted: string[] = [];
    const harness = await renderInk(<ControlledTextarea onPaste={(value) => pasted.push(value)} />);

    try {
      harness.pasteText('one\r\ntwo');
      const frame = await harness.waitForText('two|');
      expect(frame).toContain('one');
      expect(frame).toContain('two|');
      expect(pasted).toEqual(['one\ntwo']);
    } finally {
      await harness.cleanup();
    }
  });

  test('routes vertical movement to history callbacks at boundaries', async () => {
    let up = 0;
    let down = 0;
    const harness = await renderInk(
      <ControlledTextarea
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

  test('disabled and loading states render status and ignore typing', async () => {
    const submitted: string[] = [];
    const disabledHarness = await renderInk(
      <ControlledTextarea disabled onSubmit={(value) => submitted.push(value)} />,
    );

    try {
      disabledHarness.typeText('ignored');
      disabledHarness.pressEnter();
      await disabledHarness.renderOnce();
      const frame = disabledHarness.captureFrame();
      expect(frame).toContain('Prompt');
      expect(frame).toContain('Input disabled');
      expect(frame).not.toContain('ignored');
      expect(submitted).toEqual([]);
    } finally {
      await disabledHarness.cleanup();
    }

    const loadingHarness = await renderInk(<ControlledTextarea loading />);
    try {
      const frame = await loadingHarness.waitForText('Working...');
      expect(frame).toContain('Working...');
    } finally {
      await loadingHarness.cleanup();
    }
  });
});

