/**
 * Pure text helpers for message rendering (plan 8d98da29 P4.2).
 * Extracted from Messages.tsx so they can be unit-tested directly.
 */

/** Strip SGR ANSI color escapes from a string. */
export function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-9;]*m/g, '');
}

/**
 * Normalize user-typed content for display: unify newlines, drop non-breaking
 * spaces, expand tabs, and collapse runs of spaces/blank lines (except inside
 * fenced code blocks, where whitespace is preserved).
 */
export function normalizeUserDisplay(content: string): string {
  const normalized = content.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
  if (normalized.includes('```')) {
    return normalized.replace(/\t/g, '  ');
  }
  return normalized
    .split('\n')
    .map((line) => line.replace(/\t/g, '  ').replace(/ {2,}/g, ' '))
    .join('\n')
    .replace(/\n{2,}/g, '\n');
}

/** True when the first non-empty line begins a markdown list, table, code fence, or box-drawing. */
export function startsWithListOrTable(content: string): boolean {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = stripAnsi(line).trimStart();
    if (!trimmed) continue;
    if (/^[-*•]\s+/.test(trimmed)) return true;
    if (/^\d+\.\s+/.test(trimmed)) return true;
    if (trimmed.startsWith('|')) return true;
    if (trimmed.startsWith('```')) return true;
    if (trimmed.startsWith(':::')) return true;
    if (/^[┌┐└┘├┤┬┴┼│]/.test(trimmed)) return true;
    if (/^[╭╮╰╯│]/.test(trimmed)) return true;
    return false;
  }
  return false;
}
