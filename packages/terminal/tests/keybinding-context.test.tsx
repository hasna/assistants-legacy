/**
 * Integration test for the keybinding React layer (plan 8d98da29 P3.1):
 * KeybindingProvider resolves events and dispatches to useKeybinding handlers.
 */
import React from 'react';
import { describe, expect, test } from 'bun:test';
import { testRender } from '@opentui/react/test-utils';
import { KeybindingProvider, useKeybinding, useKeymap } from '../src/keybindings';

const wait = () => new Promise((r) => setTimeout(r, 40));

describe('KeybindingProvider + useKeybinding', () => {
  test('useKeymap exposes the active keymap to descendants', async () => {
    let seen: string[] | undefined;
    function Probe() {
      seen = useKeymap()['app:interrupt'];
      return <text>x</text>;
    }
    const { renderOnce } = await testRender(
      <KeybindingProvider>
        <Probe />
      </KeybindingProvider>,
      { width: 20, height: 2 },
    );
    await renderOnce();
    await wait();
    expect(seen).toEqual(['ctrl+c']);
  });

  test('a registered handler dispatches when its action resolves', async () => {
    let fired = 0;
    function Comp() {
      useKeybinding('app:pushToTalk', () => { fired += 1; });
      return <text>ready</text>;
    }
    const { renderOnce, mockInput } = await testRender(
      <KeybindingProvider>
        <Comp />
      </KeybindingProvider>,
      { width: 20, height: 2 },
    );
    await renderOnce();
    await wait();

    // ctrl+r is the default binding for app:pushToTalk.
    mockInput.pressKey('r', { ctrl: true });
    await wait();
    expect(fired).toBeGreaterThanOrEqual(1);
  });
});
