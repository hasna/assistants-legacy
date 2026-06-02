import React from 'react';
import { describe, expect, test } from 'bun:test';
import {
  Text,
  VirtualMessageList,
  calculateVirtualRange,
  useVirtualScroll,
} from '../src/ui/ink';
import { renderInk } from './utils/ink-test-harness';

describe('Ink virtual message list', () => {
  test('calculateVirtualRange uses line heights and keeps range metadata', () => {
    const heights = [2, 3, 1, 4, 2];
    const range = calculateVirtualRange({
      itemCount: heights.length,
      viewportHeight: 4,
      scrollOffset: 3,
      getItemHeight: (index) => heights[index],
      overscan: 0,
    });

    expect(range).toEqual({
      startIndex: 1,
      endIndex: 4,
      startOffset: 2,
      endOffset: 10,
      totalHeight: 12,
      maxScrollOffset: 8,
    });
  });

  test('renders only the estimated visible message window', async () => {
    const items = [
      { id: 'a', label: 'alpha', height: 2 },
      { id: 'b', label: 'bravo', height: 3 },
      { id: 'c', label: 'charlie', height: 1 },
      { id: 'd', label: 'delta', height: 4 },
    ];

    const harness = await renderInk(
      <VirtualMessageList
        height={4}
        initialScrollOffset={3}
        items={items}
        estimateItemHeight={(item) => item.height}
        renderItem={(item) => <Text key={item.id}>{item.label}</Text>}
      />,
      { width: 50, height: 10 }
    );
    const frame = harness.captureFrame();

    expect(frame).not.toContain('alpha');
    expect(frame).toContain('bravo');
    expect(frame).toContain('charlie');
    expect(frame).toContain('delta');

    await harness.cleanup();
  });

  test('supports keyboard line and page scrolling', async () => {
    const items = Array.from({ length: 8 }, (_, index) => ({ id: String(index), label: `message ${index}` }));
    const renderList = (
      <VirtualMessageList
        focused
        height={3}
        items={items}
        estimateItemHeight={() => 1}
        renderItem={(item) => <Text key={item.id}>{item.label}</Text>}
      />
    );

    const harness = await renderInk(renderList, { width: 50, height: 10 });
    expect(harness.captureFrame()).toContain('message 0');

    harness.pressDown();
    await harness.waitForText('message 3');
    expect(harness.captureFrame()).not.toContain('message 0');

    harness.pressKey('pageDown');
    await harness.waitForText('message 6');
    expect(harness.captureFrame()).toContain('message 4');

    harness.pressKey('home');
    await harness.waitForText('message 0');
    expect(harness.captureFrame()).not.toContain('message 6');

    await harness.cleanup();
  });

  test('sticks to the bottom only while already at the bottom', async () => {
    const renderItems = (count: number) => (
      <VirtualMessageList
        focused
        stickyScroll
        height={3}
        items={Array.from({ length: count }, (_, index) => ({ id: String(index), label: `event ${index}` }))}
        estimateItemHeight={() => 1}
        renderItem={(item) => <Text key={item.id}>{item.label}</Text>}
      />
    );

    const harness = await renderInk(renderItems(3), { width: 50, height: 10 });
    await harness.waitForText('event 2');

    await harness.rerender(renderItems(5));
    await harness.waitForText('event 4');
    expect(harness.captureFrame()).not.toContain('event 0');

    harness.pressUp();
    await harness.waitForText('event 1');

    await harness.rerender(renderItems(6));
    await harness.waitForText('event 1');
    expect(harness.captureFrame()).not.toContain('event 5');

    await harness.cleanup();
  });

  test('useVirtualScroll exposes clamped state for message surfaces', async () => {
    let snapshot: ReturnType<typeof useVirtualScroll> | undefined;
    function Probe() {
      snapshot = useVirtualScroll({
        itemCount: 4,
        viewportHeight: 3,
        initialScrollOffset: 99,
        getItemHeight: (index) => [2, 1, 4, 2][index],
      });
      return <Text>{`${snapshot.scrollOffset}:${snapshot.visibleRange.startIndex}-${snapshot.visibleRange.endIndex}`}</Text>;
    }

    const harness = await renderInk(<Probe />, { width: 40, height: 6 });

    expect(snapshot?.scrollOffset).toBe(6);
    expect(snapshot?.visibleRange.startIndex).toBe(2);
    expect(snapshot?.visibleRange.endIndex).toBe(4);
    expect(harness.captureFrame()).toContain('6:2-4');

    await harness.cleanup();
  });
});
