/**
 * Vim → textarea adapter (plan 8d98da29 P5.1, bridging P5.2's engine).
 *
 * The opentui Textarea exposes editing *methods* (moveCursorLeft, moveWordForward,
 * deleteLine, …) but no settable cursor index, so live vim drives those methods
 * rather than the pure index-based engine. This adapter maps a NORMAL-mode key
 * (with a small pending state for operators and the `g` prefix) to method calls
 * on a minimal, mockable Textarea surface. The pure engine (src/vim) remains the
 * tested reference for buffer semantics; this is the live wiring.
 */

/** The subset of TextareaRenderable methods vim drives. Mockable for tests. */
export interface VimTextarea {
  moveCursorLeft(): boolean;
  moveCursorRight(): boolean;
  moveCursorUp(): boolean;
  moveCursorDown(): boolean;
  gotoLineHome(): boolean;
  gotoLineEnd(): boolean;
  gotoBufferHome(): boolean;
  gotoBufferEnd(): boolean;
  moveWordForward(): boolean;
  moveWordBackward(): boolean;
  deleteChar(): boolean;
  deleteToLineEnd(): boolean;
  deleteLine(): boolean;
  deleteWordForward(): boolean;
  deleteWordBackward(): boolean;
  newLine(): boolean;
}

export type VimMode = 'NORMAL' | 'INSERT';

/** Pending NORMAL-mode prefix: an operator (d/c) and/or the `g` prefix. */
export interface VimPending {
  operator: 'd' | 'c' | null;
  g: boolean;
}

export const emptyPending: VimPending = { operator: null, g: false };

export interface VimApplyResult {
  mode: VimMode;
  pending: VimPending;
  /** True when the key was consumed by vim (caller should not pass it on). */
  handled: boolean;
}

/** Move the cursor for a motion key. Returns false for a non-motion key. */
function applyMotion(ta: VimTextarea, key: string): boolean {
  switch (key) {
    case 'h': ta.moveCursorLeft(); return true;
    case 'l': ta.moveCursorRight(); return true;
    case 'j': ta.moveCursorDown(); return true;
    case 'k': ta.moveCursorUp(); return true;
    case '0': case '^': ta.gotoLineHome(); return true;
    case '$': ta.gotoLineEnd(); return true;
    case 'w': case 'e': ta.moveWordForward(); return true;
    case 'b': ta.moveWordBackward(); return true;
    case 'G': ta.gotoBufferEnd(); return true;
    default: return false;
  }
}

/**
 * Apply one NORMAL-mode key. `key` is a single char. Returns the next mode +
 * pending, and whether the key was handled (consumed) by vim.
 */
export function applyNormalKey(ta: VimTextarea, key: string, pending: VimPending = emptyPending): VimApplyResult {
  const insert = (): VimApplyResult => ({ mode: 'INSERT', pending: emptyPending, handled: true });
  const stay = (next: VimPending = emptyPending): VimApplyResult => ({ mode: 'NORMAL', pending: next, handled: true });

  // `g` prefix (gg = buffer home).
  if (pending.g) {
    if (key === 'g') ta.gotoBufferHome();
    return stay();
  }

  // Operator pending (d/c) → apply over a motion or doubled.
  if (pending.operator) {
    const op = pending.operator;
    const enterInsertAfter = op === 'c';
    switch (key) {
      case 'd': if (op === 'd') ta.deleteLine(); return enterInsertAfter ? insert() : stay();
      case 'c': if (op === 'c') { ta.deleteLine(); return insert(); } return stay();
      case 'w': ta.deleteWordForward(); return enterInsertAfter ? insert() : stay();
      case 'b': ta.deleteWordBackward(); return enterInsertAfter ? insert() : stay();
      case '$': ta.deleteToLineEnd(); return enterInsertAfter ? insert() : stay();
      default: return stay(); // unknown motion cancels the operator
    }
  }

  // Operators start a pending state.
  if (key === 'd' || key === 'c') return stay({ operator: key, g: false });
  if (key === 'g') return stay({ operator: null, g: true });

  // Insert-entry commands.
  switch (key) {
    case 'i': return insert();
    case 'a': ta.moveCursorRight(); return insert();
    case 'I': ta.gotoLineHome(); return insert();
    case 'A': ta.gotoLineEnd(); return insert();
    case 'o': ta.gotoLineEnd(); ta.newLine(); return insert();
    case 'O': ta.gotoLineHome(); ta.newLine(); ta.moveCursorUp(); return insert();
    case 'x': ta.deleteChar(); return stay();
    case 'D': ta.deleteToLineEnd(); return stay();
  }

  // Pure motions.
  if (applyMotion(ta, key)) return stay();

  // Unhandled: swallow in NORMAL mode so stray chars don't get typed.
  return { mode: 'NORMAL', pending: emptyPending, handled: true };
}
