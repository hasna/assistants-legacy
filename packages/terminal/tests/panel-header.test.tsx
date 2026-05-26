/**
 * Regression test for the PanelHeader design-system primitive.
 *
 * It was a <box> (boxes default to flexDirection=column) holding sibling <text>
 * children, so title/count/hints stacked vertically and nested text dropped — which
 * is why no panel adopted it. Fixed to a flex-row box with a single <text> of inline
 * <span> runs. This pins that title, count, and hints all render on ONE line.
 */
import React from 'react';
import { describe, expect, test } from 'bun:test';
import { testRender } from '@opentui/react/test-utils';
import { PanelHeader } from '../src/components/PanelHeader';

const wait = () => new Promise((r) => setTimeout(r, 60));

describe('PanelHeader', () => {
  test('renders title, count, and hints on a single line', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <PanelHeader title="Connectors" count={7} hints="n new | q quit" />,
      { width: 80, height: 6 },
    );
    await renderOnce();
    await wait();
    const frame = captureCharFrame();
    const line = frame.split('\n').find((l) => l.includes('Connectors')) ?? '';
    expect(line).toContain('Connectors');
    expect(line).toContain('[7]'); // count rendered via design-system Badge (plan P2.2)
    expect(line).toContain('n new | q quit');
  });

  test('renders title-only header without count/hints', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <PanelHeader title="Memory" />,
      { width: 80, height: 6 },
    );
    await renderOnce();
    await wait();
    expect(captureCharFrame()).toContain('Memory');
  });
});
