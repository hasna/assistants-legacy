import React from 'react';
import { color as dsColor, Badge } from './design-system';

interface PanelHeaderProps {
  title: string;
  /** Deprecated/unused — retained for backward-compatible call sites. */
  color?: string;
  count?: number;
  hints?: string;
}

/**
 * Standardized panel header — the shared chrome for all panels (plan P2.2).
 * Composed from design-system primitives (color() tokens + Badge for the count)
 * so every panel inherits consistent, theme-driven header styling from one place.
 * [cassius] Uses theme-aware colors for light/dark terminal contrast.
 */
export function PanelHeader({ title, count, hints }: PanelHeaderProps) {
  const mutedColor = dsColor('muted');
  const borderCol = dsColor('border');

  return (
    <box flexDirection="row" borderStyle="rounded" borderColor={borderCol} border={["top", "bottom"]} paddingX={0} marginBottom={1}>
      {/* One <text> with inline <span> runs: sibling <box>/<span> children would
          stack (boxes default to column) and nested <span> drops its content. */}
      <text>
        <span fg={dsColor('text')}><b>{title}</b></span>
        {count !== undefined && <span fg={mutedColor}> </span>}
        {count !== undefined && <Badge label={String(count)} tone="muted" />}
        {hints && <span fg={mutedColor}> | {hints}</span>}
      </text>
    </box>
  );
}
