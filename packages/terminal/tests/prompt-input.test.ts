/**
 * Tests for the PromptInput suite (plan 8d98da29 P5.1):
 * pure paste/text helpers + the vim→textarea adapter.
 */
import { describe, expect, test } from 'bun:test';
import {
  normalizeLineEndings,
  countWords,
  countLines,
  formatPastePlaceholder,
  isLargePaste,
  applyNormalKey,
  emptyPending,
  type VimTextarea,
  type VimPending,
} from '../src/components/prompt-input';

describe('paste/text helpers', () => {
  test('normalizeLineEndings unifies CRLF/CR to LF', () => {
    expect(normalizeLineEndings('a\r\nb\rc')).toBe('a\nb\nc');
  });
  test('countWords / countLines', () => {
    expect(countWords('  hello   world ')).toBe(2);
    expect(countWords('')).toBe(0);
    expect(countLines('a\nb\nc')).toBe(3);
  });
  test('formatPastePlaceholder reports words and chars', () => {
    const out = formatPastePlaceholder('one two three');
    expect(out).toContain('3 words');
    expect(out).toContain('13 chars');
  });
  test('isLargePaste trips on any threshold', () => {
    expect(isLargePaste('short')).toBe(false);
    expect(isLargePaste('x'.repeat(600))).toBe(true);
    expect(isLargePaste(Array(25).fill('l').join('\n'))).toBe(true);
    expect(isLargePaste('w '.repeat(150))).toBe(true);
  });
});

/** A VimTextarea mock that records the method names it received. */
function mockTextarea(): VimTextarea & { calls: string[] } {
  const calls: string[] = [];
  const rec = (name: string) => () => { calls.push(name); return true; };
  return {
    calls,
    moveCursorLeft: rec('moveCursorLeft'),
    moveCursorRight: rec('moveCursorRight'),
    moveCursorUp: rec('moveCursorUp'),
    moveCursorDown: rec('moveCursorDown'),
    gotoLineHome: rec('gotoLineHome'),
    gotoLineEnd: rec('gotoLineEnd'),
    gotoBufferHome: rec('gotoBufferHome'),
    gotoBufferEnd: rec('gotoBufferEnd'),
    moveWordForward: rec('moveWordForward'),
    moveWordBackward: rec('moveWordBackward'),
    deleteChar: rec('deleteChar'),
    deleteToLineEnd: rec('deleteToLineEnd'),
    deleteLine: rec('deleteLine'),
    deleteWordForward: rec('deleteWordForward'),
    deleteWordBackward: rec('deleteWordBackward'),
    newLine: rec('newLine'),
  };
}

describe('vim → textarea adapter: motions', () => {
  test('hjkl and line/word/buffer motions call the right methods', () => {
    const cases: Array<[string, string]> = [
      ['h', 'moveCursorLeft'], ['l', 'moveCursorRight'],
      ['j', 'moveCursorDown'], ['k', 'moveCursorUp'],
      ['0', 'gotoLineHome'], ['$', 'gotoLineEnd'],
      ['w', 'moveWordForward'], ['b', 'moveWordBackward'],
      ['G', 'gotoBufferEnd'],
    ];
    for (const [key, method] of cases) {
      const ta = mockTextarea();
      const r = applyNormalKey(ta, key);
      expect(ta.calls).toEqual([method]);
      expect(r.mode).toBe('NORMAL');
      expect(r.handled).toBe(true);
    }
  });

  test('gg goes to buffer home (two-key prefix)', () => {
    const ta = mockTextarea();
    let r = applyNormalKey(ta, 'g');
    expect(r.pending.g).toBe(true);
    r = applyNormalKey(ta, 'g', r.pending);
    expect(ta.calls).toEqual(['gotoBufferHome']);
  });
});

describe('vim → textarea adapter: insert entries', () => {
  test('i/a/I/A/o/O enter INSERT with the right cursor setup', () => {
    expect(applyNormalKey(mockTextarea(), 'i').mode).toBe('INSERT');
    const a = mockTextarea(); applyNormalKey(a, 'a'); expect(a.calls).toEqual(['moveCursorRight']);
    const big = mockTextarea(); applyNormalKey(big, 'A'); expect(big.calls).toEqual(['gotoLineEnd']);
    const o = mockTextarea(); const ro = applyNormalKey(o, 'o');
    expect(o.calls).toEqual(['gotoLineEnd', 'newLine']);
    expect(ro.mode).toBe('INSERT');
  });
});

describe('vim → textarea adapter: edits + operators', () => {
  test('x and D edit in place', () => {
    const x = mockTextarea(); applyNormalKey(x, 'x'); expect(x.calls).toEqual(['deleteChar']);
    const d = mockTextarea(); applyNormalKey(d, 'D'); expect(d.calls).toEqual(['deleteToLineEnd']);
  });
  test('dw deletes a word; dd deletes the line; cw deletes word then INSERT', () => {
    let ta = mockTextarea();
    let r = applyNormalKey(ta, 'd');
    expect(r.pending.operator).toBe('d');
    r = applyNormalKey(ta, 'w', r.pending);
    expect(ta.calls).toEqual(['deleteWordForward']);
    expect(r.mode).toBe('NORMAL');

    ta = mockTextarea();
    r = applyNormalKey(ta, 'd');
    r = applyNormalKey(ta, 'd', r.pending);
    expect(ta.calls).toEqual(['deleteLine']);

    ta = mockTextarea();
    r = applyNormalKey(ta, 'c');
    r = applyNormalKey(ta, 'w', r.pending);
    expect(ta.calls).toEqual(['deleteWordForward']);
    expect(r.mode).toBe('INSERT');
  });
  test('an unknown motion cancels a pending operator without editing', () => {
    const ta = mockTextarea();
    let r = applyNormalKey(ta, 'd');
    r = applyNormalKey(ta, 'z', r.pending);
    expect(ta.calls).toEqual([]);
    expect(r.pending).toEqual(emptyPending);
  });
  test('unknown keys are swallowed in NORMAL mode (no typing through)', () => {
    const ta = mockTextarea();
    const r = applyNormalKey(ta, 'z');
    expect(ta.calls).toEqual([]);
    expect(r.handled).toBe(true);
  });
});
