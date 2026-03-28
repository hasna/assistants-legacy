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

const NON_ALPHA_KEYS = ['up', 'down', 'left', 'right', 'pageup', 'pagedown', 'home', 'end', 'delete', 'backspace', 'return', 'escape', 'tab', 'linefeed', 'insert', 'clear', 'space'];

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
    return: name === 'return' || name === 'linefeed',
    escape: name === 'escape',
    ctrl: e.ctrl,
    shift: e.shift,
    tab: name === 'tab',
    backspace: name === 'backspace',
    delete: name === 'delete',
    meta: e.meta || e.option,
  };
}

function keyEventToInput(e: KeyEvent): string {
  const name = e.name.toLowerCase();
  // Space bar: OpenTUI names it "space", but components expect ' ' as input
  if (name === 'space') {
    return ' ';
  }
  // Linefeed (Ctrl+J / \n): return newline char, components see key.return=true
  if (name === 'linefeed') {
    return '\n';
  }
  // For non-alpha keys, return empty string (matches old Ink behavior)
  if (NON_ALPHA_KEYS.includes(name)) {
    return '';
  }
  // For ctrl+key, return the key name (e.g. ctrl+c → input='c')
  if (e.ctrl) {
    return e.name;
  }
  // For meta/option+key sequences
  if ((e.meta || e.option) && !e.ctrl && e.name.length === 1) {
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

    // Normalize Ctrl+M to return (some terminals send this instead of Enter).
    // Note: Ctrl+J (linefeed) is handled in keyEventToKey/keyEventToInput above.
    if (input === 'm' && key.ctrl && !key.return) {
      handler('\r', { ...key, return: true, ctrl: false });
      return;
    }

    // Detect shift for uppercase letters
    if (input.length === 1 && /[A-Z]/.test(input)) {
      key.shift = true;
    }

    handler(input, key);
  });
}
