/**
 * Regression test for the PanelHeader shared primitive.
 *
 * Pins title, count, and hints onto one Ink row so panels keep a compact header.
 */
import React from 'react';
import { describe, expect, test } from 'bun:test';
import { PanelHeader } from '../src/components/PanelHeader';
import { renderInk } from './utils/ink-test-harness';

describe('PanelHeader', () => {
  test('renders title, count, and hints on a single line', async () => {
    const harness = await renderInk(
      <PanelHeader title="Connectors" count={7} hints="n new | q quit" />,
      { width: 80, height: 6 },
    );
    try {
      const frame = await harness.waitForText('Connectors');
      const line = frame.split('\n').find((l) => l.includes('Connectors')) ?? '';
      expect(line).toContain('Connectors');
      expect(line).toContain('[7]');
      expect(line).toContain('n new | q quit');
    } finally {
      await harness.cleanup();
    }
  });

  test('renders title-only header without count/hints', async () => {
    const harness = await renderInk(
      <PanelHeader title="Memory" />,
      { width: 80, height: 6 },
    );
    try {
      expect(await harness.waitForText('Memory')).toContain('Memory');
    } finally {
      await harness.cleanup();
    }
  });
});
