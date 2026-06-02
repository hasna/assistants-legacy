/**
 * Configurable keybinding engine — types (plan 8d98da29 P3.1).
 *
 * Runtime-agnostic core. Bindings are authored as human strings ("ctrl+r",
 * "escape", "ctrl+k ctrl+s") and parsed into normalized keystrokes that match
 * against the app's existing (input, key) event model. The shape intentionally
 * matches upstream Ink's Key type while staying independent of a renderer.
 */

export interface Key {
  upArrow: boolean;
  downArrow: boolean;
  leftArrow: boolean;
  rightArrow: boolean;
  pageDown: boolean;
  pageUp: boolean;
  home: boolean;
  end: boolean;
  return: boolean;
  escape: boolean;
  ctrl: boolean;
  shift: boolean;
  tab: boolean;
  backspace: boolean;
  delete: boolean;
  meta: boolean;
  super?: boolean;
  hyper?: boolean;
  capsLock?: boolean;
  numLock?: boolean;
  eventType?: 'press' | 'repeat' | 'release';
}

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
