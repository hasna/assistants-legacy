import React from 'react';
import { describe, expect, test } from 'bun:test';
import { ScrollBox, Text, useScrollBox } from '../src/ui/ink';
import { renderInk } from './utils/ink-test-harness';

const rows = Array.from({ length: 8 }, (_, index) => `row ${index}`);

describe('Ink ScrollBox primitive', () => {
  test('renders a bounded viewport of rows', async () => {
    const harness = await renderInk(
      <ScrollBox height={3} items={rows} renderItem={(row) => <Text key={row}>{row}</Text>} />,
      { width: 40, height: 10 }
    );
    const frame = harness.captureFrame();

    expect(frame).toContain('row 0');
    expect(frame).toContain('row 2');
    expect(frame).not.toContain('row 3');

    await harness.cleanup();
  });

  test('responds to keyboard scroll commands when focused', async () => {
    const harness = await renderInk(
      <ScrollBox focused height={3} items={rows} renderItem={(row) => <Text key={row}>{row}</Text>} />,
      { width: 40, height: 10 }
    );

    harness.pressDown();
    await harness.waitForText('row 3');
    expect(harness.captureFrame()).not.toContain('row 0');

    harness.pressKey('pageDown');
    await harness.waitForText('row 6');
    expect(harness.captureFrame()).toContain('row 4');

    harness.pressKey('home');
    await harness.waitForText('row 0');
    expect(harness.captureFrame()).not.toContain('row 7');

    await harness.cleanup();
  });

  test('sticks to the bottom while output grows only when already at bottom', async () => {
    const renderRows = (count: number) => (
      <ScrollBox
        focused
        height={3}
        stickyScroll
        items={Array.from({ length: count }, (_, index) => `line ${index}`)}
        renderItem={(row) => <Text key={row}>{row}</Text>}
      />
    );

    const harness = await renderInk(renderRows(3), { width: 40, height: 12 });
    await harness.waitForText('line 2');

    await harness.rerender(renderRows(5));
    await harness.waitForText('line 4');

    expect(harness.captureFrame()).toContain('line 4');
    expect(harness.captureFrame()).not.toContain('line 0');

    harness.pressUp();
    await harness.waitForText('line 1');

    await harness.rerender(renderRows(6));
    await harness.waitForText('line 1');

    expect(harness.captureFrame()).toContain('line 1');
    expect(harness.captureFrame()).not.toContain('line 5');

    await harness.cleanup();
  });

  test('useScrollBox exposes clamped range controls', async () => {
    let snapshot: ReturnType<typeof useScrollBox> | undefined;
    function Probe() {
      snapshot = useScrollBox({
        itemCount: 10,
        viewportHeight: 4,
        initialScrollOffset: 100,
      });
      return <Text>{`${snapshot.scrollOffset}:${snapshot.visibleRange.start}-${snapshot.visibleRange.end}`}</Text>;
    }

    const harness = await renderInk(<Probe />, { width: 40, height: 6 });

    expect(snapshot?.scrollOffset).toBe(6);
    expect(snapshot?.visibleRange).toEqual({ start: 6, end: 10 });
    expect(harness.captureFrame()).toContain('6:6-10');

    await harness.cleanup();
  });
});
