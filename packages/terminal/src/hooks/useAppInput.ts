import { useInput as useInkInput, type Key as InkKey } from '../ui/ink';

/**
 * Key type compatible with the app component API.
 * Maps terminal keyboard events to the shape terminal components expect.
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

type Handler = (input: string, key: Key) => void;
type Options = { isActive?: boolean };

function inkKeyToKey(key: InkKey): Key {
  return {
    upArrow: Boolean(key.upArrow),
    downArrow: Boolean(key.downArrow),
    leftArrow: Boolean(key.leftArrow),
    rightArrow: Boolean(key.rightArrow),
    pageDown: Boolean(key.pageDown),
    pageUp: Boolean(key.pageUp),
    home: Boolean(key.home),
    end: Boolean(key.end),
    return: Boolean(key.return),
    escape: Boolean(key.escape),
    ctrl: Boolean(key.ctrl),
    shift: Boolean(key.shift),
    tab: Boolean(key.tab),
    backspace: Boolean(key.backspace),
    delete: Boolean((key as InkKey & { delete?: boolean }).delete),
    meta: Boolean(key.meta || (key as InkKey & { option?: boolean }).option),
  };
}

function normalizeInput(input: string, key: Key): string {
  if (key.return && input === '') return '\r';
  if (key.tab && input === '') return '\t';
  return input;
}

function withShiftFromInput(input: string, key: Key): Key {
  if (input.length === 1 && /[A-Z]/.test(input)) {
    return { ...key, shift: true };
  }
  return key;
}

function emitInput(handler: Handler, input: string, key: Key): void {
  const normalizedKey = withShiftFromInput(input, key);

  // Normalize Ctrl+M to return because some terminals send it instead of Enter.
  if (input === 'm' && normalizedKey.ctrl && !normalizedKey.return) {
    handler('\r', { ...normalizedKey, return: true, ctrl: false });
    return;
  }

  handler(input, normalizedKey);
}

/**
 * App-level input hook using upstream Ink.
 *
 * Translates terminal keyboard events to the `(input, key)` API shared by app
 * components and keybinding helpers.
 */
export function useAppInput(handler: Handler, options: Options = {}): void {
  useInkInput((rawInput, inkKey) => {
    const key = inkKeyToKey(inkKey);
    const input = normalizeInput(rawInput, key);

    if (
      input.length > 1
      && !key.ctrl
      && !key.meta
      && !key.return
      && !key.tab
      && !key.backspace
      && !key.delete
    ) {
      for (const char of Array.from(input)) {
        emitInput(handler, char, key);
      }
      return;
    }

    emitInput(handler, input, key);
  }, {
    isActive: options.isActive !== false,
  });
}
