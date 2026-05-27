/**
 * Configurable keybinding engine — types (plan 8d98da29 P3.1).
 *
 * Runtime-agnostic core. Bindings are authored as human strings ("ctrl+r",
 * "escape", "ctrl+k ctrl+s") and parsed into normalized keystrokes that match
 * against the app's existing (input, key) event model (see hooks/useSafeInput).
 */
import type { Key } from '../hooks/useSafeInput';

export type { Key };

/** A single normalized keystroke: a base key plus modifier flags. */
export interface ParsedKeystroke {
  /** Normalized base key: a single lowercase char, or a named key like
   *  'escape' | 'enter' | 'tab' | 'up' | 'down' | 'left' | 'right' |
   *  'pageup' | 'pagedown' | 'home' | 'end' | 'backspace' | 'delete' | ' '. */
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

/** A chord is a sequence of keystrokes pressed in order (e.g. "ctrl+k ctrl+s"). */
export type Chord = ParsedKeystroke[];

/** A keymap maps an action id to one or more binding strings. "none"/[] disables. */
export type Keymap = Record<string, string[]>;

/** The set of built-in action ids the app dispatches. */
export type KeybindingAction =
  | 'app:interrupt'
  | 'app:cancel'
  | 'app:clearScreen'
  | 'app:pushToTalk'
  | 'app:toggleVerbose'
  | 'session:cycle'
  | 'panel:assistantsDashboard'
  | 'panel:budget'
  | 'panel:commands'
  | 'panel:messages';
