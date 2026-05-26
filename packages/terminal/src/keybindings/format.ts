/**
 * Binding display formatting (plan 8d98da29 P3.1) — render a binding string for
 * help text and shortcut hints, and auto-generate a keymap help listing.
 */
import { parseChord } from './parser';
import type { Keymap, ParsedKeystroke } from './types';

const MOD_LABEL: Array<[keyof ParsedKeystroke, string]> = [
  ['ctrl', 'Ctrl'],
  ['alt', 'Alt'],
  ['shift', 'Shift'],
  ['meta', 'Cmd'],
];

const KEY_LABEL: Record<string, string> = {
  ' ': 'Space',
  escape: 'Esc',
  enter: 'Enter',
  tab: 'Tab',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  pageup: 'PgUp',
  pagedown: 'PgDn',
  home: 'Home',
  end: 'End',
  backspace: 'Backspace',
  delete: 'Del',
};

function formatKeystroke(ks: ParsedKeystroke): string {
  const parts: string[] = [];
  for (const [flag, label] of MOD_LABEL) if (ks[flag]) parts.push(label);
  const key = KEY_LABEL[ks.key] ?? (ks.key.length === 1 ? ks.key.toUpperCase() : ks.key);
  parts.push(key);
  return parts.join('+');
}

/** Format a binding string ("ctrl+k ctrl+s") for display ("Ctrl+K Ctrl+S"). */
export function formatBinding(binding: string): string {
  return parseChord(binding).map(formatKeystroke).join(' ');
}

/** First (primary) display binding for an action, or '' if unbound/disabled. */
export function primaryBindingLabel(keymap: Keymap, action: string): string {
  const values = keymap[action];
  if (!values || values.length === 0) return '';
  if (values.length === 1 && values[0].trim().toLowerCase() === 'none') return '';
  return formatBinding(values[0]);
}

/** Auto-generate "action — Key" help rows for every bound action, sorted by action. */
export function generateHelp(keymap: Keymap): Array<{ action: string; keys: string }> {
  return Object.keys(keymap)
    .sort()
    .map((action) => ({ action, keys: primaryBindingLabel(keymap, action) }))
    .filter((row) => row.keys !== '');
}
