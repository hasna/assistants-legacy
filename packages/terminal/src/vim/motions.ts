/**
 * Vim motions (plan 8d98da29 P5.2) — pure cursor-index resolution over text.
 * A "motion" maps (text, cursor, count) → a target index. Word motions follow
 * vim semantics (w/b/e on word boundaries; WORD variants on whitespace).
 */

/** Index of the start of the line containing `i`. */
export function lineStart(text: string, i: number): number {
  const nl = text.lastIndexOf('\n', i - 1);
  return nl === -1 ? 0 : nl + 1;
}

/** Index just past the last char of the line containing `i` (at the newline or text end). */
export function lineEnd(text: string, i: number): number {
  const nl = text.indexOf('\n', i);
  return nl === -1 ? text.length : nl;
}

/** First non-blank index on the line containing `i`. */
export function firstNonBlank(text: string, i: number): number {
  const s = lineStart(text, i);
  const e = lineEnd(text, i);
  let j = s;
  while (j < e && (text[j] === ' ' || text[j] === '\t')) j++;
  return j;
}

const isWordChar = (c: string) => /[A-Za-z0-9_]/.test(c);
const isSpace = (c: string) => c === '' || /\s/.test(c);

/** Character class for word motions: 'word' | 'punct' | 'space'. */
function wordClass(c: string): 'word' | 'punct' | 'space' {
  if (isSpace(c)) return 'space';
  return isWordChar(c) ? 'word' : 'punct';
}

/** Next word start (w). When `big`, words are whitespace-delimited (W). */
function nextWordStart(text: string, i: number, big: boolean): number {
  const n = text.length;
  if (i >= n) return n;
  const startClass = wordClass(text[i]);
  let j = i;
  if (big) {
    while (j < n && !isSpace(text[j])) j++;
    while (j < n && isSpace(text[j])) j++;
    return j;
  }
  if (startClass !== 'space') {
    while (j < n && wordClass(text[j]) === startClass) j++;
  }
  while (j < n && wordClass(text[j]) === 'space') j++;
  return j;
}

/** Previous word start (b). */
function prevWordStart(text: string, i: number, big: boolean): number {
  let j = i - 1;
  while (j > 0 && isSpace(text[j])) j--;
  if (j <= 0) return 0;
  if (big) {
    while (j > 0 && !isSpace(text[j - 1])) j--;
    return j;
  }
  const cls = wordClass(text[j]);
  while (j > 0 && wordClass(text[j - 1]) === cls) j--;
  return j;
}

/** End of word (e) — lands on the last char of the next word. */
function endOfWord(text: string, i: number, big: boolean): number {
  const n = text.length;
  let j = i + 1;
  while (j < n && isSpace(text[j])) j++;
  if (j >= n) return n - 1 < 0 ? 0 : n - 1;
  if (big) {
    while (j + 1 < n && !isSpace(text[j + 1])) j++;
    return j;
  }
  const cls = wordClass(text[j]);
  while (j + 1 < n && wordClass(text[j + 1]) === cls) j++;
  return j;
}

/** Move cursor up/down one logical line, preserving column where possible. */
function verticalMove(text: string, i: number, dir: -1 | 1): number {
  const col = i - lineStart(text, i);
  if (dir === -1) {
    const ps = lineStart(text, i);
    if (ps === 0) return i;
    const prevStart = lineStart(text, ps - 1);
    const prevEnd = ps - 1;
    return Math.min(prevStart + col, prevEnd);
  }
  const ne = lineEnd(text, i);
  if (ne >= text.length) return i;
  const nextStart = ne + 1;
  const nextEnd = lineEnd(text, nextStart);
  return Math.min(nextStart + col, nextEnd);
}

/** True for motions that include the destination char when used with an operator. */
export function isInclusive(key: string): boolean {
  return key === 'e' || key === 'E' || key === '$';
}

/** True for motions that operate on whole lines under an operator. */
export function isLinewise(key: string): boolean {
  return key === 'j' || key === 'k' || key === 'G' || key === 'gg';
}

/** Resolve a motion to a target index. Returns null for an unknown key. */
export function resolveMotion(key: string, text: string, cursor: number, count = 1): number | null {
  let pos = cursor;
  const once = (k: string, p: number): number | null => {
    const n = text.length;
    switch (k) {
      case 'h': return Math.max(lineStart(text, p), p - 1);
      case 'l': return Math.min(lineEnd(text, p), p + 1);
      case 'j': return verticalMove(text, p, 1);
      case 'k': return verticalMove(text, p, -1);
      case '0': return lineStart(text, p);
      case '^': return firstNonBlank(text, p);
      case '$': return lineEnd(text, p);
      case 'w': return nextWordStart(text, p, false);
      case 'W': return nextWordStart(text, p, true);
      case 'b': return prevWordStart(text, p, false);
      case 'B': return prevWordStart(text, p, true);
      case 'e': return endOfWord(text, p, false);
      case 'E': return endOfWord(text, p, true);
      case 'G': return lineStart(text, n);
      case 'gg': return 0;
      default: return null;
    }
  };
  for (let c = 0; c < count; c++) {
    const next = once(key, pos);
    if (next === null) return null;
    if (next === pos) break;
    pos = next;
  }
  return pos;
}
