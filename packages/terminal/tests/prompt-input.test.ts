/**
 * Tests for the PromptInput suite (plan 8d98da29 P5.1):
 * pure paste/text helpers + the vim -> Ink Textarea adapter.
 */
import { describe, expect, test } from 'bun:test';
import {
  normalizeLineEndings,
  countWords,
  countLines,
  formatPastePlaceholder,
  isLargePaste,
  applyVimTextareaInkInput,
  applyVimTextareaKey,
  createVimTextareaAdapterState,
  vimKeyFromInkInput,
} from '../src/components/prompt-input';
import type { Key } from '../src/keybindings';

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

describe('vim -> Ink textarea adapter: motions', () => {
  test('hjkl and word/buffer motions update the controlled cursor', () => {
    const state = createVimTextareaAdapterState('NORMAL');

    expect(applyVimTextareaKey({ value: 'hello world', cursorOffset: 0 }, state, 'l').model.cursorOffset).toBe(1);
    expect(applyVimTextareaKey({ value: 'hello world', cursorOffset: 1 }, state, 'h').model.cursorOffset).toBe(0);
    expect(applyVimTextareaKey({ value: 'hello world', cursorOffset: 0 }, state, 'w').model.cursorOffset).toBe(6);
    expect(applyVimTextareaKey({ value: 'hello world', cursorOffset: 6 }, state, 'b').model.cursorOffset).toBe(0);
    expect(applyVimTextareaKey({ value: 'hello\nworld', cursorOffset: 0 }, state, 'G').model.cursorOffset).toBe(6);
  });

  test('gg goes to buffer home through pending state', () => {
    let state = createVimTextareaAdapterState('NORMAL');
    let result = applyVimTextareaKey({ value: 'one\ntwo', cursorOffset: 5 }, state, 'g');
    expect(result.state.gPrefix).toBe(true);

    state = result.state;
    result = applyVimTextareaKey(result.model, state, 'g');
    expect(result.model.cursorOffset).toBe(0);
  });
});

describe('vim -> Ink textarea adapter: insert entries', () => {
  test('i/a/I/A/o/O enter INSERT with the right controlled model', () => {
    const state = createVimTextareaAdapterState('NORMAL');

    expect(applyVimTextareaKey({ value: 'abc', cursorOffset: 1 }, state, 'i').state.mode).toBe('INSERT');
    expect(applyVimTextareaKey({ value: 'abc', cursorOffset: 1 }, state, 'a').model.cursorOffset).toBe(2);
    expect(applyVimTextareaKey({ value: 'abc', cursorOffset: 1 }, state, 'A').model.cursorOffset).toBe(3);

    const openedBelow = applyVimTextareaKey({ value: 'abc', cursorOffset: 0 }, state, 'o');
    expect(openedBelow.model.value).toBe('abc\n');
    expect(openedBelow.model.cursorOffset).toBe(4);
    expect(openedBelow.state.mode).toBe('INSERT');

    const openedAbove = applyVimTextareaKey({ value: 'abc', cursorOffset: 2 }, state, 'O');
    expect(openedAbove.model.value).toBe('\nabc');
    expect(openedAbove.model.cursorOffset).toBe(0);
    expect(openedAbove.state.mode).toBe('INSERT');
  });
});

describe('vim -> Ink textarea adapter: edits + operators', () => {
  test('x and D edit the controlled value', () => {
    const state = createVimTextareaAdapterState('NORMAL');

    expect(applyVimTextareaKey({ value: 'abc', cursorOffset: 1 }, state, 'x').model.value).toBe('ac');
    expect(applyVimTextareaKey({ value: 'hello world', cursorOffset: 5 }, state, 'D').model.value).toBe('hello');
  });

  test('dw deletes a word; dd deletes the line; cw deletes word then INSERT', () => {
    let result = applyVimTextareaKey(
      { value: 'hello world', cursorOffset: 0 },
      createVimTextareaAdapterState('NORMAL'),
      'd',
    );
    expect(result.state.pending.operator).toBe('d');
    result = applyVimTextareaKey(result.model, result.state, 'w');
    expect(result.model.value).toBe('world');
    expect(result.state.mode).toBe('NORMAL');

    result = applyVimTextareaKey(
      { value: 'line1\nline2', cursorOffset: 0 },
      createVimTextareaAdapterState('NORMAL'),
      'd',
    );
    result = applyVimTextareaKey(result.model, result.state, 'd');
    expect(result.model.value).toBe('line2');

    result = applyVimTextareaKey(
      { value: 'hello world', cursorOffset: 0 },
      createVimTextareaAdapterState('NORMAL'),
      'c',
    );
    result = applyVimTextareaKey(result.model, result.state, 'w');
    expect(result.model.value).toBe('world');
    expect(result.state.mode).toBe('INSERT');
  });

  test('insert mode delegates printable text to Textarea but handles Escape', () => {
    let result = applyVimTextareaKey(
      { value: 'abc', cursorOffset: 3 },
      createVimTextareaAdapterState('INSERT'),
      'x',
    );
    expect(result.handled).toBe(false);
    expect(result.model.value).toBe('abc');

    result = applyVimTextareaKey(result.model, result.state, 'Escape');
    expect(result.handled).toBe(true);
    expect(result.state.mode).toBe('NORMAL');
  });

  test('Ink key translation maps terminal keys to Vim keys', () => {
    const plainKey = {} as Key;

    expect(vimKeyFromInkInput('x', plainKey)).toBe('x');
    expect(vimKeyFromInkInput('', { escape: true } as Key)).toBe('Escape');
    expect(vimKeyFromInkInput('', { return: true } as Key)).toBe('Enter');
    expect(vimKeyFromInkInput('', { leftArrow: true } as Key)).toBe('h');
    expect(vimKeyFromInkInput('', { eventType: 'release' } as Key)).toBe(null);
  });

  test('Ink input application returns handled=false for delegated INSERT keys', () => {
    const result = applyVimTextareaInkInput(
      { value: 'abc', cursorOffset: 3 },
      createVimTextareaAdapterState('INSERT'),
      'z',
      {} as Key,
    );

    expect(result.handled).toBe(false);
    expect(result.model.value).toBe('abc');
  });
});
