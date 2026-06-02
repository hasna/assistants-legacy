import React from 'react';
import { Box, Inline, Text } from '../../ui/ink';
import { color } from './color';

interface ListItemProps {
  /** Keyboard-focused row — shows the pointer (❯) and highlights the label. */
  isFocused: boolean;
  /** Chosen/checked row — shows a checkmark (✓). Default: false. */
  isSelected?: boolean;
  /** Main row label. */
  label: string;
  /** Optional dimmed description after the label. */
  description?: string;
}

/**
 * A selectable list row with a focus pointer and optional selection check —
 * the shared building block for the app's many list panels.
 *
 *   ❯ Label   description
 */
export function ListItem({ isFocused, isSelected = false, label, description }: ListItemProps) {
  const pointer = isFocused ? '❯ ' : isSelected ? '✓ ' : '  ';
  const pointerColor = isFocused ? color('primary') : color('success');
  const labelColor = isFocused ? color('primary') : color('text');
  return (
    <Box flexDirection="row">
      <Text>
        <Inline fg={pointerColor}>{pointer}</Inline>
        <Inline fg={labelColor} bold={isFocused}>{label}</Inline>
        {description ? <Inline fg={color('muted')}>   {description}</Inline> : null}
      </Text>
    </Box>
  );
}
