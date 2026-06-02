/** @jsxImportSource react */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Key } from 'ink';
import type { ReactNode } from 'react';
import { useInkThemeColor } from './theme';

export type ScrollBoxRange = {
  start: number;
  end: number;
};

export type UseScrollBoxProps = {
  itemCount: number;
  viewportHeight: number;
  initialScrollOffset?: number;
  stickyScroll?: boolean;
  pageSize?: number;
  onScrollOffsetChange?: (scrollOffset: number) => void;
};

export type UseScrollBoxResult = {
  scrollOffset: number;
  maxScrollOffset: number;
  viewportHeight: number;
  visibleRange: ScrollBoxRange;
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

export type ScrollBoxProps<T = ReactNode> = {
  height: number;
  width?: number | string;
  items?: readonly T[];
  renderItem?: (item: T, index: number) => ReactNode;
  children?: ReactNode;
  focused?: boolean;
  disabled?: boolean;
  stickyScroll?: boolean;
  initialScrollOffset?: number;
  pageSize?: number;
  showIndicators?: boolean;
  empty?: ReactNode;
  onScrollOffsetChange?: (scrollOffset: number) => void;
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function normalizeHeight(height: number): number {
  if (!Number.isFinite(height)) return 1;
  return Math.max(0, Math.floor(height));
}

function maxScrollOffset(itemCount: number, viewportHeight: number): number {
  return Math.max(0, Math.max(0, itemCount) - Math.max(0, viewportHeight));
}

export function useScrollBox({
  itemCount,
  viewportHeight: rawViewportHeight,
  initialScrollOffset,
  stickyScroll = false,
  pageSize,
  onScrollOffsetChange,
}: UseScrollBoxProps): UseScrollBoxResult {
  const viewportHeight = normalizeHeight(rawViewportHeight);
  const normalizedItemCount = Math.max(0, Math.floor(itemCount));
  const maxOffset = maxScrollOffset(normalizedItemCount, viewportHeight);
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
      const next = stickyScroll && wasAtBottom ? maxOffset : clamp(current, 0, maxOffset);
      return next;
    });
    previousMaxOffset.current = maxOffset;
  }, [maxOffset, stickyScroll]);

  useEffect(() => {
    onScrollOffsetChange?.(scrollOffset);
  }, [onScrollOffsetChange, scrollOffset]);

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

  const visibleRange = useMemo<ScrollBoxRange>(() => {
    const start = clamp(scrollOffset, 0, maxOffset);
    return {
      start,
      end: Math.min(normalizedItemCount, start + viewportHeight),
    };
  }, [maxOffset, normalizedItemCount, scrollOffset, viewportHeight]);

  return {
    scrollOffset: visibleRange.start,
    maxScrollOffset: maxOffset,
    viewportHeight,
    visibleRange,
    isAtTop: visibleRange.start <= 0,
    isAtBottom: visibleRange.start >= maxOffset,
    scrollTo: setScrollOffset,
    scrollBy,
    scrollToTop,
    scrollToBottom,
    pageUp,
    pageDown,
    handleKey,
  };
}

function renderItems<T>(items: readonly T[] | undefined, renderItem: ScrollBoxProps<T>['renderItem'], children: ReactNode): ReactNode[] {
  if (items) {
    return items.map((item, index) => {
      if (renderItem) return renderItem(item, index);
      return <Text key={index}>{String(item)}</Text>;
    });
  }

  return React.Children.toArray(children);
}

export function ScrollBox<T = ReactNode>({
  height,
  width,
  items,
  renderItem,
  children,
  focused = false,
  disabled = false,
  stickyScroll = false,
  initialScrollOffset,
  pageSize,
  showIndicators = false,
  empty,
  onScrollOffsetChange,
}: ScrollBoxProps<T>): React.JSX.Element {
  const muted = useInkThemeColor('muted');
  const normalizedHeight = normalizeHeight(height);
  const indicatorRows = showIndicators ? 2 : 0;
  const bodyHeight = Math.max(0, normalizedHeight - indicatorRows);
  const renderedItems = renderItems(items, renderItem, children);

  const state = useScrollBox({
    itemCount: renderedItems.length,
    viewportHeight: bodyHeight,
    initialScrollOffset,
    stickyScroll,
    pageSize,
    onScrollOffsetChange,
  });

  useInput((input, key) => {
    state.handleKey(input, key);
  }, { isActive: focused && !disabled });

  const visibleItems = renderedItems.slice(state.visibleRange.start, state.visibleRange.end);
  const blankCount = Math.max(0, bodyHeight - visibleItems.length);
  const topIndicator = state.isAtTop ? '' : `^ ${state.scrollOffset}/${state.maxScrollOffset}`;
  const bottomIndicator = state.isAtBottom ? '' : `v ${state.scrollOffset}/${state.maxScrollOffset}`;

  return (
    <Box flexDirection="column" width={width} height={normalizedHeight} overflow="hidden">
      {showIndicators ? <Text color={muted}>{topIndicator}</Text> : null}
      {visibleItems.length > 0
        ? visibleItems.map((item, index) => (
          <React.Fragment key={`scroll-item-${state.visibleRange.start + index}`}>
            {item}
          </React.Fragment>
        ))
        : empty
          ? <>{empty}</>
          : null}
      {Array.from({ length: blankCount }, (_, index) => (
        <Text key={`scroll-blank-${index}`}> </Text>
      ))}
      {showIndicators ? <Text color={muted}>{bottomIndicator}</Text> : null}
    </Box>
  );
}
