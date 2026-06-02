/** @jsxImportSource react */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Key } from 'ink';
import type { ReactNode } from 'react';
import { useInkThemeColor } from './theme';

export type VirtualRange = {
  startIndex: number;
  endIndex: number;
  startOffset: number;
  endOffset: number;
  totalHeight: number;
  maxScrollOffset: number;
};

export type CalculateVirtualRangeProps = {
  itemCount: number;
  viewportHeight: number;
  scrollOffset: number;
  getItemHeight: (index: number) => number;
  overscan?: number;
};

export type UseVirtualScrollProps = {
  itemCount: number;
  viewportHeight: number;
  getItemHeight: (index: number) => number;
  initialScrollOffset?: number;
  stickyScroll?: boolean;
  pageSize?: number;
  overscan?: number;
  onScrollOffsetChange?: (scrollOffset: number) => void;
};

export type UseVirtualScrollResult = {
  scrollOffset: number;
  maxScrollOffset: number;
  viewportHeight: number;
  totalHeight: number;
  visibleRange: VirtualRange;
  isAtTop: boolean;
  isAtBottom: boolean;
  scrollTo: (offset: number) => void;
  scrollBy: (delta: number) => void;
  scrollToTop: () => void;
  scrollToBottom: () => void;
  pageUp: () => void;
  pageDown: () => void;
  handleKey: (input: string, key: Key) => boolean;
};

export type VirtualMessageListProps<T> = {
  height: number;
  width?: number | string;
  items: readonly T[];
  renderItem: (item: T, index: number) => ReactNode;
  estimateItemHeight?: (item: T, index: number) => number;
  focused?: boolean;
  disabled?: boolean;
  stickyScroll?: boolean;
  initialScrollOffset?: number;
  pageSize?: number;
  overscan?: number;
  showIndicators?: boolean;
  empty?: ReactNode;
  onScrollOffsetChange?: (scrollOffset: number) => void;
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function normalizeCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizeHeight(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.floor(value));
}

function itemHeight(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
}

function getTotalHeight(itemCount: number, getItemHeight: (index: number) => number): number {
  let total = 0;
  for (let index = 0; index < itemCount; index++) {
    total += itemHeight(getItemHeight(index));
  }
  return total;
}

export function calculateVirtualRange({
  itemCount: rawItemCount,
  viewportHeight: rawViewportHeight,
  scrollOffset: rawScrollOffset,
  getItemHeight,
  overscan = 0,
}: CalculateVirtualRangeProps): VirtualRange {
  const itemCount = normalizeCount(rawItemCount);
  const viewportHeight = normalizeHeight(rawViewportHeight);
  const totalHeight = getTotalHeight(itemCount, getItemHeight);
  const maxScrollOffset = Math.max(0, totalHeight - viewportHeight);
  const scrollOffset = clamp(rawScrollOffset, 0, maxScrollOffset);
  const overscanLines = Math.max(0, Math.floor(overscan));
  const windowStart = Math.max(0, scrollOffset - overscanLines);
  const windowEnd = Math.min(totalHeight, scrollOffset + viewportHeight + overscanLines);

  let cursor = 0;
  let startIndex = itemCount;
  let endIndex = itemCount;
  let startOffset = totalHeight;
  let endOffset = totalHeight;

  for (let index = 0; index < itemCount; index++) {
    const height = itemHeight(getItemHeight(index));
    const itemStart = cursor;
    const itemEnd = cursor + height;

    if (itemEnd > windowStart && itemStart < windowEnd) {
      if (startIndex === itemCount) {
        startIndex = index;
        startOffset = itemStart;
      }
      endIndex = index + 1;
      endOffset = itemEnd;
    }

    cursor = itemEnd;
  }

  if (itemCount === 0) {
    startIndex = 0;
    endIndex = 0;
    startOffset = 0;
    endOffset = 0;
  }

  return {
    startIndex,
    endIndex,
    startOffset,
    endOffset,
    totalHeight,
    maxScrollOffset,
  };
}

export function useVirtualScroll({
  itemCount: rawItemCount,
  viewportHeight: rawViewportHeight,
  getItemHeight,
  initialScrollOffset,
  stickyScroll = false,
  pageSize,
  overscan = 0,
  onScrollOffsetChange,
}: UseVirtualScrollProps): UseVirtualScrollResult {
  const itemCount = normalizeCount(rawItemCount);
  const viewportHeight = normalizeHeight(rawViewportHeight);
  const totalHeight = useMemo(() => getTotalHeight(itemCount, getItemHeight), [getItemHeight, itemCount]);
  const maxOffset = Math.max(0, totalHeight - viewportHeight);
  const previousMaxOffset = useRef(maxOffset);

  const [scrollOffset, setScrollOffsetState] = useState(() => {
    const initial = initialScrollOffset ?? (stickyScroll ? maxOffset : 0);
    return clamp(initial, 0, maxOffset);
  });

  const setScrollOffset = useCallback((offset: number) => {
    setScrollOffsetState(clamp(offset, 0, maxOffset));
  }, [maxOffset]);

  const scrollBy = useCallback((delta: number) => {
    setScrollOffsetState((current) => clamp(current + delta, 0, maxOffset));
  }, [maxOffset]);

  const scrollToTop = useCallback(() => {
    setScrollOffsetState(0);
  }, []);

  const scrollToBottom = useCallback(() => {
    setScrollOffsetState(maxOffset);
  }, [maxOffset]);

  const resolvedPageSize = Math.max(1, Math.floor(pageSize ?? viewportHeight));

  const pageUp = useCallback(() => {
    scrollBy(-resolvedPageSize);
  }, [resolvedPageSize, scrollBy]);

  const pageDown = useCallback(() => {
    scrollBy(resolvedPageSize);
  }, [resolvedPageSize, scrollBy]);

  useLayoutEffect(() => {
    setScrollOffsetState((current) => {
      const wasAtBottom = current >= previousMaxOffset.current;
      return stickyScroll && wasAtBottom ? maxOffset : clamp(current, 0, maxOffset);
    });
    previousMaxOffset.current = maxOffset;
  }, [maxOffset, stickyScroll]);

  useEffect(() => {
    onScrollOffsetChange?.(scrollOffset);
  }, [onScrollOffsetChange, scrollOffset]);

  const visibleRange = useMemo(() => {
    return calculateVirtualRange({
      itemCount,
      viewportHeight,
      scrollOffset,
      getItemHeight,
      overscan,
    });
  }, [getItemHeight, itemCount, overscan, scrollOffset, viewportHeight]);

  const handleKey = useCallback((input: string, key: Key): boolean => {
    if (key.upArrow || input === 'k') {
      scrollBy(-1);
      return true;
    }
    if (key.downArrow || input === 'j') {
      scrollBy(1);
      return true;
    }
    if (key.pageUp || (key.ctrl && (input === 'b' || input === 'u'))) {
      pageUp();
      return true;
    }
    if (key.pageDown || (key.ctrl && (input === 'f' || input === 'd'))) {
      pageDown();
      return true;
    }
    if (key.home || input === 'g') {
      scrollToTop();
      return true;
    }
    if (key.end || input === 'G') {
      scrollToBottom();
      return true;
    }
    return false;
  }, [pageDown, pageUp, scrollBy, scrollToBottom, scrollToTop]);

  const clampedOffset = clamp(scrollOffset, 0, maxOffset);

  return {
    scrollOffset: clampedOffset,
    maxScrollOffset: maxOffset,
    viewportHeight,
    totalHeight,
    visibleRange,
    isAtTop: clampedOffset <= 0,
    isAtBottom: clampedOffset >= maxOffset,
    scrollTo: setScrollOffset,
    scrollBy,
    scrollToTop,
    scrollToBottom,
    pageUp,
    pageDown,
    handleKey,
  };
}

function defaultEstimateItemHeight(item: unknown): number {
  if (item && typeof item === 'object' && '__lineCount' in item) {
    const lineCount = (item as { __lineCount?: unknown }).__lineCount;
    if (typeof lineCount === 'number' && Number.isFinite(lineCount)) {
      return Math.max(1, Math.floor(lineCount));
    }
  }
  return 1;
}

export function VirtualMessageList<T>({
  height,
  width,
  items,
  renderItem,
  estimateItemHeight,
  focused = false,
  disabled = false,
  stickyScroll = false,
  initialScrollOffset,
  pageSize,
  overscan = 0,
  showIndicators = false,
  empty,
  onScrollOffsetChange,
}: VirtualMessageListProps<T>): React.JSX.Element {
  const muted = useInkThemeColor('muted');
  const normalizedHeight = normalizeHeight(height);
  const indicatorRows = showIndicators ? 2 : 0;
  const bodyHeight = Math.max(0, normalizedHeight - indicatorRows);
  const estimate = useCallback((index: number) => {
    const item = items[index];
    return estimateItemHeight ? estimateItemHeight(item, index) : defaultEstimateItemHeight(item);
  }, [estimateItemHeight, items]);

  const state = useVirtualScroll({
    itemCount: items.length,
    viewportHeight: bodyHeight,
    getItemHeight: estimate,
    initialScrollOffset,
    stickyScroll,
    pageSize,
    overscan,
    onScrollOffsetChange,
  });

  useInput((input, key) => {
    state.handleKey(input, key);
  }, { isActive: focused && !disabled });

  const visibleItems = items.slice(state.visibleRange.startIndex, state.visibleRange.endIndex);
  const topIndicator = state.isAtTop ? '' : `^ ${state.scrollOffset}/${state.maxScrollOffset}`;
  const bottomIndicator = state.isAtBottom ? '' : `v ${state.scrollOffset}/${state.maxScrollOffset}`;

  return (
    <Box flexDirection="column" width={width} height={normalizedHeight} overflow="hidden">
      {showIndicators ? <Text color={muted}>{topIndicator}</Text> : null}
      {visibleItems.length > 0
        ? visibleItems.map((item, offset) => (
          <React.Fragment key={`virtual-message-${state.visibleRange.startIndex + offset}`}>
            {renderItem(item, state.visibleRange.startIndex + offset)}
          </React.Fragment>
        ))
        : empty
          ? <>{empty}</>
          : null}
      {showIndicators ? <Text color={muted}>{bottomIndicator}</Text> : null}
    </Box>
  );
}
