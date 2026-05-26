/**
 * Configurable keybinding engine (plan 8d98da29 P3.1).
 *
 * Pure core (parser → match → resolver) + config merge + display formatting +
 * a React integration layer (KeybindingProvider/useKeybinding). Bindings are
 * authored as strings, overridable via config.json `keybindings`, and matched
 * against the app's existing (input, key) event model.
 */
export type { ParsedKeystroke, Chord, Keymap, KeybindingAction, Key } from './types';
export { parseKeystroke, parseChord } from './parser';
export { matchesKeystroke } from './match';
export { KeybindingMatcher, resolveAction, type ResolveResult } from './resolver';
export { DEFAULT_KEYMAP, defaultKeymap } from './defaults';
export { mergeKeymap, loadUserKeymap } from './config';
export { formatBinding, primaryBindingLabel, generateHelp } from './format';
export { KeybindingProvider, useKeybinding, useKeymap } from './KeybindingContext';
