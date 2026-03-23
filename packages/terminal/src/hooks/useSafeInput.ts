import { useKeyboard } from '@opentui/react';
import type { KeyEvent } from '@opentui/core';

/**
 * Key type compatible with the existing component API.
 * Maps OpenTUI's KeyEvent to the shape all 40+ components expect.
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
}

const NON_ALPHA_KEYS = ['up', 'down', 'left', 'right', 'pageup', 'pagedown', 'home', 'end', 'delete', 'backspace', 'return', 'escape', 'tab', 'enter'];

type Handler = (input: string, key: Key) => void;
type Options = { isActive?: boolean };

function keyEventToKey(e: KeyEvent): Key {
  const name = e.name.toLowerCase();
  return {
    upArrow: name === 'up',
    downArrow: name === 'down',
    leftArrow: name === 'left',
    rightArrow: name === 'right',
    pageDown: name === 'pagedown',
    pageUp: name === 'pageup',
    home: name === 'home',
    end: name === 'end',
    return: name === 'return' || name === 'enter',
    escape: name === 'escape',
    ctrl: e.ctrl,
    shift: e.shift,
    tab: name === 'tab',
    backspace: name === 'backspace',
    delete: name === 'delete',
    meta: e.meta,
  };
}

function keyEventToInput(e: KeyEvent): string {
  const name = e.name.toLowerCase();
  // For non-alpha keys, return empty string (matches old Ink behavior)
  if (NON_ALPHA_KEYS.includes(name)) {
    return '';
  }
  // For ctrl+key, return the key name
  if (e.ctrl) {
    return e.name;
  }
  // For meta+key sequences
  if (e.meta && !e.ctrl && e.name.length === 1) {
    return e.name;
  }
  // For printable characters, use the sequence (preserves actual typed char)
  if (e.sequence && e.sequence.length === 1 && e.sequence.charCodeAt(0) >= 32) {
    return e.sequence;
  }
  if (e.name.length === 1) {
    return e.name;
  }
  return '';
}

/**
 * Input hook using OpenTUI's useKeyboard.
 * Translates KeyEvent to the (input, key) API that all components expect.
 */
export function useSafeInput(handler: Handler, options: Options = {}): void {
  useKeyboard((e: KeyEvent) => {
    if (options.isActive === false) return;
    // Only handle press events (not release)
    if (e.eventType === 'release') return;

    const key = keyEventToKey(e);
    const input = keyEventToInput(e);

    // Normalize Ctrl+M / Ctrl+J to return (some terminals send these for Enter)
    if ((input === 'm' || input === 'j') && key.ctrl && !key.return) {
      handler(input === 'j' ? '\n' : '\r', { ...key, return: true, ctrl: false });
      return;
    }

    // Detect shift for uppercase letters
    if (input.length === 1 && /[A-Z]/.test(input)) {
      key.shift = true;
    }

    handler(input, key);
  });
}
