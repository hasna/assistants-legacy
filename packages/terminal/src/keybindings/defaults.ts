/**
 * Default keymap (plan 8d98da29 P3.1) — grounded in the app's current hardcoded
 * bindings in App.tsx, lifted to named actions so they become configurable.
 */
import type { Keymap, KeybindingAction } from './types';

/** Built-in defaults. Each action maps to one or more binding strings. */
export const DEFAULT_KEYMAP: Record<KeybindingAction, string[]> = {
  'app:interrupt': ['ctrl+c'],
  'app:cancel': ['escape'],
  'app:clearScreen': ['ctrl+l'],
  'app:pushToTalk': ['ctrl+r'],
  'app:toggleVerbose': ['ctrl+o'],
  'session:cycle': ['ctrl+]'],
  'panel:assistantsDashboard': ['ctrl+a'],
  'panel:budget': ['ctrl+b'],
  'panel:commands': ['ctrl+p'],
  'panel:messages': ['ctrl+m'],
};

/** A fresh copy of the default keymap as a plain Keymap. */
export function defaultKeymap(): Keymap {
  const out: Keymap = {};
  for (const [action, values] of Object.entries(DEFAULT_KEYMAP)) {
    out[action] = [...values];
  }
  return out;
}
