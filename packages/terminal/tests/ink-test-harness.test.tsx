import React, { useState } from 'react';
import { describe, expect, test } from 'bun:test';
import { Text, useInput, useWindowSize } from '../src/ui/ink';
import { renderInk, renderInkStatic, stripInkAnsi } from './utils/ink-test-harness';

describe('Ink test harness', () => {
  test('renders static Ink output without mounting a terminal app', () => {
    const frame = renderInkStatic(<Text color="green">static hello</Text>, { columns: 40 });

    expect(stripInkAnsi(frame)).toContain('static hello');
  });

  test('captures interactive output and simulates typed text', async () => {
    function Probe() {
      const [value, setValue] = useState('');
      useInput((input) => {
        setValue((prev) => prev + input);
      });

      return <Text>value:{value}</Text>;
    }

    const harness = await renderInk(<Probe />);
    try {
      harness.typeText('abc');
      const frame = await harness.waitForText('value:abc');
      expect(frame).toContain('value:abc');
    } finally {
      await harness.cleanup();
    }
  });

  test('simulates navigation keys for useInput handlers', async () => {
    function Probe() {
      const [row, setRow] = useState(0);
      useInput((_input, key) => {
        if (key.downArrow) setRow((prev) => prev + 1);
        if (key.upArrow) setRow((prev) => prev - 1);
      });

      return <Text>row:{row}</Text>;
    }

    const harness = await renderInk(<Probe />);
    try {
      harness.pressDown();
      harness.pressDown();
      harness.pressUp();
      const frame = await harness.waitForText('row:1');
      expect(frame).toContain('row:1');
    } finally {
      await harness.cleanup();
    }
  });

  test('emits resize events for useWindowSize assertions', async () => {
    function Probe() {
      const { columns, rows } = useWindowSize();
      return <Text>{columns}x{rows}</Text>;
    }

    const harness = await renderInk(<Probe />, { width: 20, height: 8 });
    try {
      await harness.waitForText('20x8');
      harness.resize(33, 12);
      const frame = await harness.waitForText('33x12');
      expect(frame).toContain('33x12');
    } finally {
      await harness.cleanup();
    }
  });
});
