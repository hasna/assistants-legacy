/**
 * Keybinding parser (plan 8d98da29 P3.1) — turns human binding strings into
 * normalized keystrokes/chords. Supports modifier aliases (ctrl/control,
 * alt/opt/option, cmd/command/super/meta) and key aliases (esc, return, space,
 * arrows).
 */
import type { Chord, ParsedKeystroke } from './types';

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  escape: 'escape',
  return: 'enter',
  enter: 'enter',
  space: ' ',
  spacebar: ' ',
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  '↑': 'up',
  '↓': 'down',
  '←': 'left',
  '→': 'right',
  pageup: 'pageup',
  pagedown: 'pagedown',
  home: 'home',
  end: 'end',
  backspace: 'backspace',
  del: 'delete',
  delete: 'delete',
  tab: 'tab',
};

/** Parse a single keystroke like "ctrl+shift+k" into a ParsedKeystroke. */
export function parseKeystroke(input: string): ParsedKeystroke {
  const ks: ParsedKeystroke = { key: '', ctrl: false, alt: false, shift: false, meta: false };
  // Split on '+' but keep a literal trailing '+' (e.g. "ctrl++") as the key.
  const parts = input.split('+').map((p) => (p === '' ? '+' : p));
  for (const part of parts) {
    const lower = part.toLowerCase();
    switch (lower) {
      case 'ctrl':
      case 'control':
        ks.ctrl = true;
        break;
      case 'alt':
      case 'opt':
      case 'option':
        ks.alt = true;
        break;
      case 'shift':
        ks.shift = true;
        break;
      case 'cmd':
      case 'command':
      case 'super':
      case 'win':
      case 'meta':
        ks.meta = true;
        break;
      default:
        ks.key = KEY_ALIASES[lower] ?? lower;
        break;
    }
  }
  return ks;
}

/** Parse a chord string like "ctrl+k ctrl+s" (space-separated) into keystrokes. */
export function parseChord(input: string): Chord {
  return input
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(parseKeystroke);
}
