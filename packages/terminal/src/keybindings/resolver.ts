/**
 * Keybinding resolver (plan 8d98da29 P3.1) — turns a keymap into a stateful
 * matcher that resolves (input, key) events to action ids, including multi-key
 * chord sequences (e.g. "ctrl+k ctrl+s"). Pure; no React, no I/O.
 */
import { parseChord } from './parser';
import { matchesKeystroke } from './match';
import type { Chord, Key, Keymap } from './types';

interface CompiledBinding {
  action: string;
  chord: Chord;
}

/** A binding value of "none" (any case) or an empty list disables the action. */
function isDisabled(values: string[]): boolean {
  return values.length === 0 || (values.length === 1 && values[0].trim().toLowerCase() === 'none');
}

export type ResolveResult =
  | { type: 'match'; action: string }
  | { type: 'pending' } // a multi-key chord prefix matched; awaiting the next key
  | { type: 'none' };

/**
 * Compiles a keymap once and resolves events against it. A single instance
 * holds the pending-chord state across events, so it is per-input-surface.
 */
export class KeybindingMatcher {
  private readonly bindings: CompiledBinding[] = [];
  // Candidate bindings whose chord prefix has matched so far, and the next
  // position to check. Empty candidates = no chord in progress.
  private candidates: CompiledBinding[] = [];
  private pos = 0;

  constructor(keymap: Keymap) {
    for (const [action, values] of Object.entries(keymap)) {
      if (isDisabled(values)) continue;
      for (const value of values) {
        const chord = parseChord(value);
        if (chord.length > 0) this.bindings.push({ action, chord });
      }
    }
  }

  /** Reset any in-progress chord (e.g. on a non-matching key or surface change). */
  reset(): void {
    this.candidates = [];
    this.pos = 0;
  }

  /** True while a multi-key chord is partially matched. */
  get isPending(): boolean {
    return this.pos > 0;
  }

  /**
   * Resolve one event. Returns the matched action, 'pending' when a longer chord
   * prefix matched (caller should swallow the key and wait), or 'none'.
   */
  resolve(input: string, key: Key): ResolveResult {
    const pool = this.pos > 0 ? this.candidates : this.bindings;
    const matched = pool.filter(
      (b) => b.chord.length > this.pos && matchesKeystroke(b.chord[this.pos], input, key),
    );

    // A binding that completes at this position wins (shortest chord first).
    const completed = matched
      .filter((b) => b.chord.length === this.pos + 1)
      .sort((a, b) => a.chord.length - b.chord.length);
    if (completed.length > 0) {
      this.reset();
      return { type: 'match', action: completed[0].action };
    }

    // Longer chords still in the running → wait for the next keystroke.
    if (matched.length > 0) {
      this.candidates = matched;
      this.pos += 1;
      return { type: 'pending' };
    }

    this.reset();
    return { type: 'none' };
  }
}

/** One-shot resolution against a keymap (single-keystroke bindings). */
export function resolveAction(keymap: Keymap, input: string, key: Key): string | null {
  const result = new KeybindingMatcher(keymap).resolve(input, key);
  return result.type === 'match' ? result.action : null;
}
