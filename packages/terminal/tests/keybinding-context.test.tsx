/**
 * Integration test for the keybinding React layer (plan 8d98da29 P3.1):
 * KeybindingProvider resolves events and dispatches to useKeybinding handlers.
 */
import React from 'react';
import { describe, expect, test } from 'bun:test';
import { KeybindingProvider, useKeybinding, useKeymap } from '../src/keybindings';
import { Text } from '../src/ui/ink';
import { renderInk } from './utils/ink-test-harness';

const wait = () => new Promise((r) => setTimeout(r, 40));

describe('KeybindingProvider + useKeybinding', () => {
  test('useKeymap exposes the active keymap to descendants', async () => {
    let seen: string[] | undefined;
    function Probe() {
      seen = useKeymap()['app:interrupt'];
      return <Text>x</Text>;
    }
    const harness = await renderInk(
      <KeybindingProvider>
        <Probe />
      </KeybindingProvider>,
      { width: 20, height: 2 },
    );
    await harness.renderOnce();
    await wait();
    expect(seen).toEqual(['ctrl+c']);
    await harness.cleanup();
  });

  test('a registered handler dispatches when its action resolves', async () => {
    let fired = 0;
    function Comp() {
      useKeybinding('app:pushToTalk', () => { fired += 1; });
      return <Text>ready</Text>;
    }
    const harness = await renderInk(
      <KeybindingProvider>
        <Comp />
      </KeybindingProvider>,
      { width: 20, height: 2 },
    );
    await harness.renderOnce();
    await wait();

    // ctrl+r is the default binding for app:pushToTalk.
    harness.pressKey('r', { ctrl: true });
    await wait();
    expect(fired).toBeGreaterThanOrEqual(1);
    await harness.cleanup();
  });
});
