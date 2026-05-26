/**
 * Keymap config loading + merge (plan 8d98da29 P3.1).
 *
 * User overrides (from config.json `keybindings`) replace the default binding
 * list per action. A value of "none" (or []) disables the action. Unknown
 * actions are kept (forward-compatible with plugin actions).
 */
import { defaultKeymap } from './defaults';
import type { Keymap } from './types';

/** Normalize a raw override value to a string[] (accepts a string or array). */
function toList(value: unknown): string[] | undefined {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return undefined;
}

/**
 * Merge user overrides over the defaults. For each action present in the
 * overrides, the user's list fully replaces the default. "none" disables.
 */
export function mergeKeymap(overrides: Record<string, unknown> | null | undefined): Keymap {
  const map = defaultKeymap();
  if (!overrides || typeof overrides !== 'object') return map;
  for (const [action, raw] of Object.entries(overrides)) {
    const list = toList(raw);
    if (list === undefined) continue;
    map[action] = list;
  }
  return map;
}

/** Validate a parsed config object's keybindings field into a Keymap. */
export function loadUserKeymap(config: { keybindings?: Record<string, unknown> } | null | undefined): Keymap {
  return mergeKeymap(config?.keybindings);
}
