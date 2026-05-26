/**
 * Pure prompt-input helpers (plan 8d98da29 P5.1) — extracted from Input.tsx so
 * the paste-detection and text-measurement logic is unit-testable in isolation.
 */

export interface PasteThresholds {
  chars?: number;
  words?: number;
  lines?: number;
}

/** Defaults above which pasted text is treated as a "large paste". */
export const DEFAULT_PASTE_THRESHOLDS: Required<PasteThresholds> = {
  chars: 500,
  words: 100,
  lines: 20,
};

/** Normalize CRLF/CR line endings to LF. */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** Count whitespace-delimited words. */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Count lines (1 for non-empty single-line, splits on '\n'). */
export function countLines(text: string): number {
  return text.split('\n').length;
}

/** Placeholder shown in place of a large pasted block. */
export function formatPastePlaceholder(text: string): string {
  const chars = text.length;
  const words = countWords(text);
  return `📋 Pasted ${words.toLocaleString()} words / ${chars.toLocaleString()} chars`;
}

/** True when text exceeds any of the paste thresholds. */
export function isLargePaste(text: string, thresholds: PasteThresholds = DEFAULT_PASTE_THRESHOLDS): boolean {
  const charThreshold = thresholds.chars ?? DEFAULT_PASTE_THRESHOLDS.chars;
  const wordThreshold = thresholds.words ?? DEFAULT_PASTE_THRESHOLDS.words;
  const lineThreshold = thresholds.lines ?? DEFAULT_PASTE_THRESHOLDS.lines;
  return (
    text.length > charThreshold ||
    countWords(text) > wordThreshold ||
    countLines(text) > lineThreshold
  );
}
