/**
 * Vim mode for the prompt (plan 8d98da29 P5.2).
 *
 * A pure, self-contained vim engine for a single text buffer: NORMAL/INSERT/
 * VISUAL modes, motions (h l j k 0 ^ $ w b e + WORD variants, gg G), operators
 * (d c y with motions + doubled linewise), counts, insert entries (i a I A o O),
 * x/D/C, and p/P paste. Adopt by routing prompt keys through `vimKey` and
 * syncing the resulting { text, cursor } back to the textarea (P5.1 wiring).
 */
export type { VimMode, VimState, Buffer, Operator, Pending, Register } from './types';
export { initialVimState, clampCursor } from './types';
export { vimKey } from './engine';
export {
  resolveMotion,
  isInclusive,
  isLinewise,
  lineStart,
  lineEnd,
  firstNonBlank,
} from './motions';
