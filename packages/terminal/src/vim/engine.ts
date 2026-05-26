/**
 * Vim engine (plan 8d98da29 P5.2) — the pure key reducer / state machine.
 *
 * `vimKey(state, key)` returns the next VimState. `key` is a single character
 * or a named key: 'Escape' | 'Backspace' | 'Enter'. The engine models INSERT
 * text editing too so it is fully testable; the React adoption can delegate
 * INSERT typing to the underlying textarea and only route NORMAL/VISUAL keys.
 */
import {
  resolveMotion,
  isInclusive,
  isLinewise,
  lineStart,
  lineEnd,
} from './motions';
import {
  clampCursor,
  type Operator,
  type VimState,
} from './types';

const MOTION_KEYS = new Set(['h', 'l', 'j', 'k', '0', '^', '$', 'w', 'W', 'b', 'B', 'e', 'E', 'G', 'gg']);
const OPERATORS = new Set<Operator>(['d', 'c', 'y']);

function resetPending(): VimState['pending'] {
  return { count: '', operator: null, operatorCount: '' };
}

/** Clamp the NORMAL-mode cursor so it never sits past the last char of a line. */
function clampNormal(text: string, cursor: number): number {
  const c = clampCursor(text, cursor);
  const ls = lineStart(text, c);
  const le = lineEnd(text, c);
  if (le > ls && c === le) return le - 1; // stay on last char, not the newline
  return c;
}

/** Compute the [start, end) range an operator+motion covers. */
function motionRange(
  text: string,
  cursor: number,
  key: string,
  count: number,
): { start: number; end: number; linewise: boolean } | null {
  const target = resolveMotion(key, text, cursor, count);
  if (target === null) return null;
  if (isLinewise(key)) {
    const a = Math.min(cursor, target);
    const b = Math.max(cursor, target);
    const start = lineStart(text, a);
    let end = lineEnd(text, b);
    if (end < text.length) end += 1; // include trailing newline
    return { start, end, linewise: true };
  }
  let start = Math.min(cursor, target);
  let end = Math.max(cursor, target);
  if (isInclusive(key)) end = Math.min(text.length, end + 1);
  return { start, end, linewise: false };
}

/** Apply an operator over a resolved range, returning the next state. */
function applyOperator(state: VimState, op: Operator, range: { start: number; end: number; linewise: boolean }): VimState {
  const { text } = state.buffer;
  const slice = text.slice(range.start, range.end);
  const register = { text: slice, linewise: range.linewise };
  if (op === 'y') {
    return {
      ...state,
      mode: 'NORMAL',
      buffer: { text, cursor: clampNormal(text, range.start) },
      pending: resetPending(),
      register,
    };
  }
  const newText = text.slice(0, range.start) + text.slice(range.end);
  const cursor = op === 'c' ? range.start : clampNormal(newText, range.start);
  return {
    ...state,
    mode: op === 'c' ? 'INSERT' : 'NORMAL',
    buffer: { text: newText, cursor },
    pending: resetPending(),
    register,
  };
}

function enterInsert(state: VimState, cursor: number): VimState {
  return { ...state, mode: 'INSERT', buffer: { ...state.buffer, cursor: clampCursor(state.buffer.text, cursor) }, pending: resetPending() };
}

/** Handle a key in INSERT mode. */
function insertKey(state: VimState, key: string): VimState {
  const { text, cursor } = state.buffer;
  if (key === 'Escape') {
    return { ...state, mode: 'NORMAL', buffer: { text, cursor: clampNormal(text, cursor - 1) }, pending: resetPending() };
  }
  if (key === 'Backspace') {
    if (cursor === 0) return state;
    return { ...state, buffer: { text: text.slice(0, cursor - 1) + text.slice(cursor), cursor: cursor - 1 } };
  }
  const ch = key === 'Enter' ? '\n' : key;
  if (ch.length !== 1) return state;
  return { ...state, buffer: { text: text.slice(0, cursor) + ch + text.slice(cursor), cursor: cursor + 1 } };
}

/** Paste the register relative to the cursor (p = after, P = before). */
function paste(state: VimState, after: boolean): VimState {
  const { text, cursor } = state.buffer;
  const { text: reg, linewise } = state.register;
  if (!reg) return { ...state, pending: resetPending() };
  if (linewise) {
    const body = reg.endsWith('\n') ? reg.slice(0, -1) : reg;
    let at: number;
    let insert: string;
    let pastedLineStart: number;
    if (after) {
      at = lineEnd(text, cursor);
      insert = '\n' + body;
      pastedLineStart = at + 1;
    } else {
      at = lineStart(text, cursor);
      insert = body + '\n';
      pastedLineStart = at;
    }
    const next = text.slice(0, at) + insert + text.slice(at);
    return { ...state, buffer: { text: next, cursor: clampNormal(next, pastedLineStart) }, pending: resetPending() };
  }
  const at = after ? Math.min(text.length, cursor + 1) : cursor;
  const next = text.slice(0, at) + reg + text.slice(at);
  return { ...state, buffer: { text: next, cursor: clampNormal(next, at + reg.length - 1) }, pending: resetPending() };
}

/** Handle a key in NORMAL mode (count → operator → motion/command). */
function normalKey(state: VimState, key: string): VimState {
  const { text, cursor } = state.buffer;
  const p = state.pending;

  if (key === 'Escape') return { ...state, pending: resetPending() };

  // Count accumulation ('0' is a motion unless a count is already in progress).
  const collectingOp = p.operator !== null;
  const curCount = collectingOp ? p.operatorCount : p.count;
  if (/[1-9]/.test(key) || (key === '0' && curCount !== '')) {
    const next = curCount + key;
    return collectingOp
      ? { ...state, pending: { ...p, operatorCount: next } }
      : { ...state, pending: { ...p, count: next } };
  }

  const count = Math.max(1, parseInt(p.count || '1', 10));

  // Pending operator: a doubled operator (dd/yy/cc) is linewise on the line(s).
  if (p.operator) {
    const opCount = Math.max(1, parseInt(p.operatorCount || '1', 10)) * count;
    if (key === p.operator) {
      const start = lineStart(text, cursor);
      let end = lineEnd(text, cursor);
      // Span opCount lines.
      for (let k = 1; k < opCount && end < text.length; k++) end = lineEnd(text, end + 1);
      const incEnd = end < text.length ? end + 1 : end;
      return applyOperator(state, p.operator, { start, end: incEnd, linewise: true });
    }
    if (MOTION_KEYS.has(key)) {
      const range = motionRange(text, cursor, key, opCount);
      if (!range) return { ...state, pending: resetPending() };
      return applyOperator(state, p.operator, range);
    }
    // Unknown key cancels the operator.
    return { ...state, pending: resetPending() };
  }

  // Operators
  if (OPERATORS.has(key as Operator)) {
    return { ...state, pending: { ...p, operator: key as Operator, operatorCount: '' } };
  }

  // Motions
  if (MOTION_KEYS.has(key)) {
    const target = resolveMotion(key, text, cursor, count);
    if (target === null) return { ...state, pending: resetPending() };
    return { ...state, buffer: { text, cursor: clampNormal(text, target) }, pending: resetPending() };
  }

  // Insert-entry commands
  switch (key) {
    case 'i': return enterInsert(state, cursor);
    case 'a': return enterInsert(state, cursor + 1);
    case 'I': return enterInsert(state, lineStart(text, cursor));
    case 'A': return enterInsert(state, lineEnd(text, cursor));
    case 'o': {
      const at = lineEnd(text, cursor);
      const next = text.slice(0, at) + '\n' + text.slice(at);
      return { ...state, mode: 'INSERT', buffer: { text: next, cursor: at + 1 }, pending: resetPending() };
    }
    case 'O': {
      const at = lineStart(text, cursor);
      const next = text.slice(0, at) + '\n' + text.slice(at);
      return { ...state, mode: 'INSERT', buffer: { text: next, cursor: at }, pending: resetPending() };
    }
    case 'x': {
      if (cursor >= text.length || text[cursor] === '\n') return { ...state, pending: resetPending() };
      const end = Math.min(lineEnd(text, cursor), cursor + count);
      const removed = text.slice(cursor, end);
      const next = text.slice(0, cursor) + text.slice(end);
      return { ...state, buffer: { text: next, cursor: clampNormal(next, cursor) }, pending: resetPending(), register: { text: removed, linewise: false } };
    }
    case 'D': {
      const end = lineEnd(text, cursor);
      const removed = text.slice(cursor, end);
      const next = text.slice(0, cursor) + text.slice(end);
      return { ...state, buffer: { text: next, cursor: clampNormal(next, cursor) }, pending: resetPending(), register: { text: removed, linewise: false } };
    }
    case 'C': {
      const end = lineEnd(text, cursor);
      const removed = text.slice(cursor, end);
      const next = text.slice(0, cursor) + text.slice(end);
      return { ...state, mode: 'INSERT', buffer: { text: next, cursor }, pending: resetPending(), register: { text: removed, linewise: false } };
    }
    case 'p': return paste(state, true);
    case 'P': return paste(state, false);
    case 'v': return { ...state, mode: 'VISUAL', visualAnchor: cursor, pending: resetPending() };
    default: return { ...state, pending: resetPending() };
  }
}

/** Handle a key in VISUAL mode (motions extend; operators act on the selection). */
function visualKey(state: VimState, key: string): VimState {
  const { text, cursor } = state.buffer;
  if (key === 'Escape') return { ...state, mode: 'NORMAL', pending: resetPending() };

  if (MOTION_KEYS.has(key)) {
    const target = resolveMotion(key, text, cursor, 1);
    if (target === null) return state;
    return { ...state, buffer: { text, cursor: clampCursor(text, target) } };
  }

  if (key === 'd' || key === 'x' || key === 'y' || key === 'c') {
    const start = Math.min(state.visualAnchor, cursor);
    const end = Math.min(text.length, Math.max(state.visualAnchor, cursor) + 1); // inclusive
    const op: Operator = key === 'y' ? 'y' : key === 'c' ? 'c' : 'd';
    const result = applyOperator({ ...state, mode: 'NORMAL' }, op, { start, end, linewise: false });
    return result;
  }
  return state;
}

/** The reducer: apply one key to the engine state. */
export function vimKey(state: VimState, key: string): VimState {
  switch (state.mode) {
    case 'INSERT': return insertKey(state, key);
    case 'NORMAL': return normalKey(state, key);
    case 'VISUAL': return visualKey(state, key);
  }
}
