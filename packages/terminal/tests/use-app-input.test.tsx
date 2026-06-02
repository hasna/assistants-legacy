import React from 'react';
import { describe, expect, test } from 'bun:test';
import { Text } from '../src/ui/ink';
import { useAppInput, type Key } from '../src/hooks/useAppInput';
import { renderInk } from './utils/ink-test-harness';

type CapturedInput = {
  input: string;
  key: Key;
};

describe('useAppInput', () => {
  test('maps upstream Ink input events to the app key shape', async () => {
    const events: CapturedInput[] = [];

    function Probe() {
      useAppInput((input, key) => {
        events.push({ input, key });
      });
      return <Text>ready</Text>;
    }

    const harness = await renderInk(<Probe />);
    harness.typeText('a');
    harness.pressKey('space');
    harness.pressKey('up');
    harness.pressEnter();
    await harness.renderOnce();

    expect(events[0]).toMatchObject({ input: 'a', key: { upArrow: false, return: false } });
    expect(events[1]).toMatchObject({ input: ' ', key: { return: false } });
    expect(events[2]).toMatchObject({ input: '', key: { upArrow: true } });
    expect(events[3]).toMatchObject({ input: '\r', key: { return: true } });

    await harness.cleanup();
  });

  test('honors inactive handlers', async () => {
    const events: CapturedInput[] = [];

    function Probe() {
      useAppInput((input, key) => {
        events.push({ input, key });
      }, { isActive: false });
      return <Text>ready</Text>;
    }

    const harness = await renderInk(<Probe />);
    harness.typeText('x');
    await harness.renderOnce();

    expect(events).toEqual([]);

    await harness.cleanup();
  });
});
