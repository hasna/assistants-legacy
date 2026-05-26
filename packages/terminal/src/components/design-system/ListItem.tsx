import React from 'react';
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
 * the shared building block for the app's many list panels. Renders a
 * block-level `<box flexDirection="row">`.
 *
 *   ❯ Label   description
 */
export function ListItem({ isFocused, isSelected = false, label, description }: ListItemProps) {
  const pointer = isFocused ? '❯ ' : isSelected ? '✓ ' : '  ';
  const pointerColor = isFocused ? color('primary') : color('success');
  const labelColor = isFocused ? color('primary') : color('text');
  return (
    <box flexDirection="row">
      <text>
        <span fg={pointerColor}>{pointer}</span>
        <span fg={labelColor}>{isFocused ? <b>{label}</b> : label}</span>
        {description ? <span fg={color('muted')}>   {description}</span> : null}
      </text>
    </box>
  );
}
