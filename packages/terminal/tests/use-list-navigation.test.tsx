/**
 * Tests for useListNavigation (plan 8d98da29 P6.1 backfill).
 * The shared list-navigation hook used across panels: bounds, wraparound,
 * arrow handling, and clamping when itemCount shrinks.
 */
import React from 'react';
import { describe, expect, test } from 'bun:test';
import { testRender } from '@opentui/react/test-utils';
import { useListNavigation } from '../src/hooks/useListNavigation';

const wait = () => new Promise((r) => setTimeout(r, 30));

/** Render the hook and expose its API + a live selectedIndex reader. */
async function mountNav(opts: Parameters<typeof useListNavigation>[0]) {
  let api: ReturnType<typeof useListNavigation>;
  function Probe() {
    api = useListNavigation(opts);
    return <text>{String(api.selectedIndex)}</text>;
  }
  const { renderOnce } = await testRender(<Probe />, { width: 10, height: 2 });
  await renderOnce();
  await wait();
  return {
    get index() { return api.selectedIndex; },
    async act(fn: (a: ReturnType<typeof useListNavigation>) => void) {
      fn(api);
      await renderOnce();
      await wait();
    },
  };
}

describe('useListNavigation', () => {
  test('moveDown/moveUp respect bounds without wraparound', async () => {
    const nav = await mountNav({ itemCount: 3 });
    expect(nav.index).toBe(0);
    await nav.act((a) => a.moveUp());      // clamp at 0
    expect(nav.index).toBe(0);
    await nav.act((a) => a.moveDown());
    await nav.act((a) => a.moveDown());
    expect(nav.index).toBe(2);
    await nav.act((a) => a.moveDown());    // clamp at last
    expect(nav.index).toBe(2);
  });

  test('wraparound cycles past the ends', async () => {
    const nav = await mountNav({ itemCount: 3, wrapAround: true });
    await nav.act((a) => a.moveUp());      // 0 → last
    expect(nav.index).toBe(2);
    await nav.act((a) => a.moveDown());    // last → 0
    expect(nav.index).toBe(0);
  });

  test('handleArrowKey returns false for an empty list', async () => {
    const nav = await mountNav({ itemCount: 0 });
    let handled = true;
    await nav.act((a) => { handled = a.handleArrowKey('down'); });
    expect(handled).toBe(false);
    expect(nav.index).toBe(0);
  });

  test('reset returns to the initial index', async () => {
    const nav = await mountNav({ itemCount: 5, initialIndex: 2 });
    expect(nav.index).toBe(2);
    await nav.act((a) => a.moveDown());
    expect(nav.index).toBe(3);
    await nav.act((a) => a.reset());
    expect(nav.index).toBe(2);
  });
});
