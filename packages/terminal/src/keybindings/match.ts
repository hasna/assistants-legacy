/**
 * Keystroke matching (plan 8d98da29 P3.1) — does a parsed binding keystroke
 * match an actual (input, key) event from useSafeInput? Pure and synchronous.
 */
import type { Key, ParsedKeystroke } from './types';

/** Named keys → the boolean field they map to on the app's Key event. */
const NAMED_KEY_FIELD: Record<string, keyof Key> = {
  escape: 'escape',
  enter: 'return',
  tab: 'tab',
  up: 'upArrow',
  down: 'downArrow',
  left: 'leftArrow',
  right: 'rightArrow',
  pageup: 'pageUp',
  pagedown: 'pageDown',
  home: 'home',
  end: 'end',
  backspace: 'backspace',
  delete: 'delete',
};

/**
 * True when `ks` matches the given event. ctrl and meta must match exactly
 * (alt folds into meta, matching useSafeInput which sets meta from meta||option).
 * shift is enforced only when the binding requests it.
 */
export function matchesKeystroke(ks: ParsedKeystroke, input: string, key: Key): boolean {
  if (ks.ctrl !== key.ctrl) return false;
  const wantMeta = ks.meta || ks.alt;
  if (wantMeta !== key.meta) return false;

  const named = NAMED_KEY_FIELD[ks.key];
  if (named) {
    if (!key[named]) return false;
    if (ks.shift && !key.shift) return false;
    return true;
  }

  if (ks.key === ' ') return input === ' ';

  if (ks.key.length >= 1) {
    if (ks.shift && !key.shift) return false;
    return input.toLowerCase() === ks.key.toLowerCase();
  }
  return false;
}
