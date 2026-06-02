import React from 'react';
import { Inline } from '../../ui/ink';
import { color, type ColorValue } from './color';

interface BadgeProps {
  label: string;
  /** Semantic token (or raw value) for the badge text. Default: 'info'. */
  tone?: ColorValue;
  /** Wrap the label in square brackets. Default: true. */
  brackets?: boolean;
}

/**
 * Inline label pill like `[beta]`, colored by tone.
 *
 * @example
 * <Text><Badge label="beta" tone="warning" /> feature</Text>
 */
export function Badge({ label, tone = 'info', brackets = true }: BadgeProps) {
  const text = brackets ? `[${label}]` : label;
  return <Inline fg={color(tone)} bold>{text}</Inline>;
}
