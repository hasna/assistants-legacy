import React from 'react';
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
 * emphasized, the action muted. Renders `<span>`s, so it must live inside a
 * `<text>`. Separate multiple hints with a middot in the parent `<text>`.
 *
 * @example
 * <text><KeyboardShortcutHint shortcut="esc" action="cancel" parens /></text>
 */
export function KeyboardShortcutHint({ shortcut, action, parens = false }: KeyboardShortcutHintProps) {
  const muted = color('muted');
  return (
    <>
      {parens && <span fg={muted}>(</span>}
      <span fg={color('text')}><b>{shortcut}</b></span>
      <span fg={muted}> {action}</span>
      {parens && <span fg={muted}>)</span>}
    </>
  );
}
