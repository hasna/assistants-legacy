/**
 * Tests for the usePanelVisibility store (plan P0.3 — state-store extraction).
 *
 * Covers the pure single-source-of-truth transition (one panel at a time) and that
 * the store exposes a complete legacy showXxx/setShowXxx interface, so App.tsx can
 * adopt it without changing call sites.
 */
import React from 'react';
import { describe, expect, test } from 'bun:test';
import { usePanelVisibility, nextActivePanel, PANEL_IDS } from '../src/state/usePanelVisibility';
import { Text } from '../src/ui/ink';
import { renderInk } from './utils/ink-test-harness';

const wait = () => new Promise((r) => setTimeout(r, 40));

describe('nextActivePanel (pure transition)', () => {
  test('opening a panel makes it active, closing any other', () => {
    expect(nextActivePanel(null, 'config', true)).toBe('config');
    expect(nextActivePanel('skills', 'config', true)).toBe('config');
  });
  test('closing the active panel clears it', () => {
    expect(nextActivePanel('config', 'config', false)).toBeNull();
  });
  test('closing a non-active panel is a no-op', () => {
    expect(nextActivePanel('config', 'skills', false)).toBe('config');
    expect(nextActivePanel(null, 'skills', false)).toBeNull();
  });
});

describe('usePanelVisibility interface', () => {
  test('exposes show + set for every panel id, plus activePanel controls', async () => {
    let pv: any;
    function Probe() { pv = usePanelVisibility(); return <Text>x</Text>; }
    const harness = await renderInk(<Probe />, { width: 20, height: 2 });
    await harness.renderOnce();
    await wait();

    expect(pv.activePanel).toBeNull();
    expect(typeof pv.setActivePanel).toBe('function');
    expect(typeof pv.closeAllPanels).toBe('function');

    // Every panel id must surface a boolean getter and a function setter.
    let getters = 0;
    let setters = 0;
    for (const key of Object.keys(pv)) {
      if (key.startsWith('setShow') && typeof pv[key] === 'function') setters++;
      else if (key.startsWith('show') && typeof pv[key] === 'boolean') getters++;
    }
    expect(getters).toBe(PANEL_IDS.length);
    expect(setters).toBe(PANEL_IDS.length);
    expect(pv.showConfigPanel).toBe(false);
    expect(typeof pv.setShowConfigPanel).toBe('function');
    await harness.cleanup();
  });

  test('setters accept React SetStateAction functional updaters and enforce one-at-a-time', async () => {
    let pv: any;
    function Probe() { pv = usePanelVisibility(); return <Text>x</Text>; }
    const harness = await renderInk(<Probe />, { width: 20, height: 2 });
    await harness.renderOnce();
    await wait();

    // Boolean form opens config.
    pv.setShowConfigPanel(true);
    await harness.renderOnce();
    await wait();
    expect(pv.showConfigPanel).toBe(true);

    // Opening another panel closes config (single source of truth).
    pv.setShowSkillsPanel(true);
    await harness.renderOnce();
    await wait();
    expect(pv.showSkillsPanel).toBe(true);
    expect(pv.showConfigPanel).toBe(false);

    // Functional updater resolves against the panel's current visibility (toggle off).
    pv.setShowSkillsPanel((prev: boolean) => !prev);
    await harness.renderOnce();
    await wait();
    expect(pv.showSkillsPanel).toBe(false);
    expect(pv.activePanel).toBeNull();
    await harness.cleanup();
  });
});
