import React, { type ReactNode } from 'react';
import { Box, Inline, Text } from '../../ui/ink';
import { color, type ColorValue } from './color';

interface PaneProps {
  /** Title shown in the top border row. */
  title: string;
  /** Optional count rendered after the title, e.g. "Skills (3)". */
  count?: number;
  /** Optional right-aligned hint string, e.g. key hints. */
  hints?: string;
  /** Border token (or raw value). Default: 'border'. */
  tone?: ColorValue;
  children?: ReactNode;
}

/**
 * A titled, bordered container — the standard panel chrome (a superset of
 * PanelHeader that also wraps content).
 */
export function Pane({ title, count, hints, tone = 'border', children }: PaneProps) {
  const borderCol = color(tone);
  const muted = color('muted');
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderCol} paddingX={1}>
      <Text>
        <Inline fg={color('text')} bold>{title}</Inline>
        {count !== undefined ? <Inline fg={muted}> ({count})</Inline> : null}
        {hints ? <Inline fg={muted}>   {hints}</Inline> : null}
      </Text>
      {children}
    </Box>
  );
}
