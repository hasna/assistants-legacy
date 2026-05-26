/**
 * Vim mode for the prompt (plan 8d98da29 P5.2) — types.
 *
 * A self-contained, string-index-based vim engine for a single text buffer
 * (the prompt). Operates on { text, cursor } where cursor is a char index into
 * text, so it adopts directly onto the prompt textarea's plainText + cursor.
 * Pure: no React, no I/O — see engine.ts for the reducer.
 */

export type VimMode = 'NORMAL' | 'INSERT' | 'VISUAL';

/** The editable buffer: full text and a cursor char-index (0..text.length). */
export interface Buffer {
  text: string;
  cursor: number;
}

export type Operator = 'd' | 'c' | 'y';

/** Pending NORMAL-mode command being assembled (count + operator). */
export interface Pending {
  /** Numeric count prefix being typed (e.g. "12"), or '' when none. */
  count: string;
  /** A pending operator awaiting a motion (d/c/y), or null. */
  operator: Operator | null;
  /** Count typed after the operator (e.g. d2w), or '' when none. */
  operatorCount: string;
}

/** The unnamed register: yanked/deleted text + whether it was linewise. */
export interface Register {
  text: string;
  linewise: boolean;
}

/** Full engine state. */
export interface VimState {
  mode: VimMode;
  buffer: Buffer;
  pending: Pending;
  register: Register;
  /** Anchor index for VISUAL selection (where it started). */
  visualAnchor: number;
}

export function initialVimState(text = '', cursor = 0): VimState {
  return {
    mode: 'INSERT',
    buffer: { text, cursor: clampCursor(text, cursor) },
    pending: { count: '', operator: null, operatorCount: '' },
    register: { text: '', linewise: false },
    visualAnchor: 0,
  };
}

/** Clamp a cursor to a valid index for the given text (0..length). */
export function clampCursor(text: string, cursor: number): number {
  return Math.max(0, Math.min(cursor, text.length));
}
