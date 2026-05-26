import React, { type ReactNode } from 'react';
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
 * PanelHeader that also wraps content). Renders a block-level `<box>`.
 */
export function Pane({ title, count, hints, tone = 'border', children }: PaneProps) {
  const borderCol = color(tone);
  const muted = color('muted');
  return (
    <box flexDirection="column" borderStyle="rounded" borderColor={borderCol} paddingX={1}>
      <text>
        <span fg={color('text')}><b>{title}</b></span>
        {count !== undefined && <span fg={muted}> ({count})</span>}
        {hints && <span fg={muted}>   {hints}</span>}
      </text>
      {children}
    </box>
  );
}
