import React from 'react';
import { color, type ColorValue } from './color';

interface DividerProps {
  /** Width in characters. Default: 80. */
  width?: number;
  /** Theme token (or raw value) for the line. Default: 'border'. */
  tone?: ColorValue;
  /** Character for the rule. Default: '─'. */
  char?: string;
  /** Optional title shown left-aligned within the rule. */
  title?: string;
}

/**
 * Horizontal rule, optionally with a left-aligned title — `── Title ───────`.
 * Renders a block-level `<text>`.
 */
export function Divider({ width = 80, tone = 'border', char = '─', title }: DividerProps) {
  const line = color(tone);
  const w = Math.max(1, width);
  if (!title) {
    return <text fg={line}>{char.repeat(w)}</text>;
  }
  const label = ` ${title} `;
  const lead = 2;
  const rest = Math.max(0, w - lead - label.length);
  return (
    <text>
      <span fg={line}>{char.repeat(lead)}</span>
      <span fg={color('text')}><b>{label}</b></span>
      <span fg={line}>{char.repeat(rest)}</span>
    </text>
  );
}
