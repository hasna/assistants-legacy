import React from 'react';
import { Inline } from '../../ui/ink';
import { color } from './color';

interface KeyboardShortcutHintProps {
  /** The key or chord to display, e.g. "ctrl+o", "Enter", "↑/↓". */
  shortcut: string;
  /** The action it performs, e.g. "expand", "select". */
  action: string;
  /** Wrap the whole hint in parentheses. Default: false. */
  parens?: boolean;
}

/**
 * Inline keyboard-shortcut hint like `ctrl+o expand` — the shortcut is
 * emphasized, the action muted.
 *
 * @example
 * <Text><KeyboardShortcutHint shortcut="esc" action="cancel" parens /></Text>
 */
export function KeyboardShortcutHint({ shortcut, action, parens = false }: KeyboardShortcutHintProps) {
  const muted = color('muted');
  return (
    <>
      {parens ? <Inline fg={muted}>(</Inline> : null}
      <Inline fg={color('text')} bold>{shortcut}</Inline>
      <Inline fg={muted}> {action}</Inline>
      {parens ? <Inline fg={muted}>)</Inline> : null}
    </>
  );
}
