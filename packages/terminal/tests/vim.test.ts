/**
 * Tests for the prompt vim engine (plan 8d98da29 P5.2).
 * Pure reducer: motions, operators, counts, insert entries, paste, visual.
 */
import { describe, expect, test } from 'bun:test';
import {
  vimKey,
  initialVimState,
  resolveMotion,
  type VimState,
} from '../src/vim';

/** Start in NORMAL mode with the given text and cursor. */
function normal(text: string, cursor = 0): VimState {
  return { ...initialVimState(text, cursor), mode: 'NORMAL' };
}
/** Apply a sequence of keys (each a single char or named key). */
function keys(state: VimState, ...ks: string[]): VimState {
  return ks.reduce((s, k) => vimKey(s, k), state);
}

describe('motions', () => {
  const t = 'hello world foo';
  test('h/l move by one within the line', () => {
    expect(resolveMotion('l', t, 0)).toBe(1);
    expect(resolveMotion('h', t, 5)).toBe(4);
    expect(resolveMotion('h', t, 0)).toBe(0); // clamped at line start
  });
  test('0/$ jump to line ends', () => {
    expect(resolveMotion('0', t, 7)).toBe(0);
    expect(resolveMotion('$', t, 0)).toBe(t.length);
  });
  test('w/b/e word motions', () => {
    expect(resolveMotion('w', t, 0)).toBe(6); // start of "world"
    expect(resolveMotion('e', t, 0)).toBe(4); // end of "hello"
    expect(resolveMotion('b', t, 6)).toBe(0); // back to "hello"
  });
  test('count repeats a motion', () => {
    expect(resolveMotion('w', t, 0, 2)).toBe(12); // start of "foo"
  });
  test('j/k move across logical lines preserving column', () => {
    const two = 'abcd\nefgh';
    expect(resolveMotion('j', two, 1)).toBe(6); // col 1 on line 2
    expect(resolveMotion('k', two, 6)).toBe(1);
  });
});

describe('mode transitions', () => {
  test('i enters INSERT, Escape returns to NORMAL', () => {
    let s = keys(normal('abc', 1), 'i');
    expect(s.mode).toBe('INSERT');
    s = vimKey(s, 'Escape');
    expect(s.mode).toBe('NORMAL');
  });
  test('a enters insert after the cursor; typing inserts', () => {
    let s = keys(normal('ac', 0), 'a'); // insert after index 0
    s = keys(s, 'b');
    expect(s.buffer.text).toBe('abc');
    expect(s.mode).toBe('INSERT');
  });
  test('o opens a new line below in INSERT', () => {
    const s = keys(normal('abc', 0), 'o');
    expect(s.buffer.text).toBe('abc\n');
    expect(s.mode).toBe('INSERT');
    expect(s.buffer.cursor).toBe(4);
  });
});

describe('operators', () => {
  test('dw deletes a word and yanks it', () => {
    const s = keys(normal('hello world', 0), 'd', 'w');
    expect(s.buffer.text).toBe('world');
    expect(s.register.text).toBe('hello ');
    expect(s.mode).toBe('NORMAL');
  });
  test('cw deletes a word and enters INSERT', () => {
    const s = keys(normal('hello world', 0), 'c', 'w');
    expect(s.buffer.text).toBe('world');
    expect(s.mode).toBe('INSERT');
  });
  test('count applies to operator (d2w)', () => {
    const s = keys(normal('one two three', 0), 'd', '2', 'w');
    expect(s.buffer.text).toBe('three');
  });
  test('dd deletes the whole line (linewise)', () => {
    const s = keys(normal('line1\nline2', 0), 'd', 'd');
    expect(s.buffer.text).toBe('line2');
    expect(s.register.linewise).toBe(true);
  });
  test('yy yanks the line without deleting', () => {
    const s = keys(normal('keep\nme', 0), 'y', 'y');
    expect(s.buffer.text).toBe('keep\nme');
    expect(s.register.text).toBe('keep\n');
    expect(s.register.linewise).toBe(true);
  });
  test('d$ deletes to end of line (inclusive)', () => {
    const s = keys(normal('hello world', 6), 'd', '$');
    expect(s.buffer.text).toBe('hello ');
  });
});

describe('char ops + paste', () => {
  test('x deletes the char under the cursor', () => {
    const s = keys(normal('abc', 1), 'x');
    expect(s.buffer.text).toBe('ac');
    expect(s.register.text).toBe('b');
  });
  test('D deletes to end of line', () => {
    const s = keys(normal('hello world', 5), 'D');
    expect(s.buffer.text).toBe('hello');
  });
  test('p pastes a charwise register after the cursor', () => {
    let s = keys(normal('abc', 0), 'x'); // register='a', text='bc', cursor 0
    s = vimKey(s, 'p'); // paste 'a' after 'b' → 'bac'
    expect(s.buffer.text).toBe('bac');
  });
  test('dd then p pastes the line below', () => {
    let s = keys(normal('l1\nl2', 0), 'd', 'd'); // text='l2', register='l1\n'
    s = vimKey(s, 'p'); // paste the line below 'l2'
    expect(s.buffer.text).toBe('l2\nl1');
  });
});

describe('visual mode', () => {
  test('v + l selects and d deletes the selection inclusively', () => {
    let s = keys(normal('abcdef', 1), 'v'); // anchor at 1
    s = keys(s, 'l', 'l'); // cursor → 3
    s = vimKey(s, 'd'); // delete indices 1..3 inclusive ('bcd')
    expect(s.buffer.text).toBe('aef');
    expect(s.mode).toBe('NORMAL');
  });
  test('v + $ + y yanks to end of line', () => {
    let s = keys(normal('abc', 0), 'v', '$');
    s = vimKey(s, 'y');
    expect(s.register.text).toContain('abc');
    expect(s.mode).toBe('NORMAL');
  });
});

describe('insert editing', () => {
  test('Backspace deletes before the cursor', () => {
    let s = keys(normal('ab', 2), 'a'); // INSERT after end
    s = vimKey(s, 'Backspace');
    expect(s.buffer.text).toBe('a');
  });
  test('Enter inserts a newline', () => {
    let s = keys(normal('ab', 0), 'A'); // INSERT at end of line
    s = vimKey(s, 'Enter');
    expect(s.buffer.text).toBe('ab\n');
  });
});
