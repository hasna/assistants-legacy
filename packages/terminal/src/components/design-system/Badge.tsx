import React from 'react';
import { color, type ColorValue } from './color';

interface BadgeProps {
  label: string;
  /** Semantic token (or raw value) for the badge text. Default: 'info'. */
  tone?: ColorValue;
  /** Wrap the label in square brackets. Default: true. */
  brackets?: boolean;
}

/**
 * Inline label pill like `[beta]`, colored by tone. Renders a `<span>`, so it
 * must live inside a `<text>`.
 *
 * @example
 * <text><Badge label="beta" tone="warning" /><span> feature</span></text>
 */
export function Badge({ label, tone = 'info', brackets = true }: BadgeProps) {
  const text = brackets ? `[${label}]` : label;
  return <span fg={color(tone)}><b>{text}</b></span>;
}
