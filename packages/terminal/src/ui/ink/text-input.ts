import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInput } from 'ink';
import type { Key } from '../../keybindings';
import { getGraphemeSegmenter } from '../../utils/intl';

export type TextInputSubmitMode = 'submit' | 'newline';

export type UseTextInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  onCancel?: () => void;
  onClear?: () => void;
  onHistoryUp?: () => void;
  onHistoryDown?: () => void;
  isActive?: boolean;
  multiline?: boolean;
  submitMode?: TextInputSubmitMode;
  allowEmptySubmit?: boolean;
  clearOnEscape?: boolean;
  cursorOffset?: number;
  onCursorOffsetChange?: (offset: number) => void;
  columns?: number;
  maxVisibleLines?: number;
  mask?: string;
  cursorChar?: string;
  showCursor?: boolean;
  inputFilter?: (input: string, key: Key) => string;
};

export type TextInputLayoutLine = {
  text: string;
  start: number;
  end: number;
};

export type UseTextInputResult = {
  value: string;
  renderedValue: string;
  visibleValue: string;
  cursorOffset: number;
  cursorLine: number;
  cursorColumn: number;
  viewportCharOffset: number;
  viewportCharEnd: number;
  lines: TextInputLayoutLine[];
  setCursorOffset: (offset: number) => void;
  setValue: (value: string, cursorOffset?: number) => void;
  clear: () => void;
  onInput: (input: string, key: Key) => void;
};

type TextInputSnapshot = Required<Pick<
  UseTextInputProps,
  'value' | 'multiline' | 'allowEmptySubmit' | 'clearOnEscape' | 'columns' | 'maxVisibleLines' | 'mask' | 'cursorChar' | 'showCursor'
>> & {
  cursorOffset: number;
  submitMode: TextInputSubmitMode;
};

type EditEffect =
  | { type: 'change'; value: string; cursorOffset: number }
  | { type: 'submit'; value: string }
  | { type: 'cancel' }
  | { type: 'clear' }
  | { type: 'historyUp' }
  | { type: 'historyDown' }
  | { type: 'none' };

const ANSI_PATTERN = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g;

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, '');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function graphemeBoundaries(text: string): number[] {
  const boundaries = [0];
  for (const part of getGraphemeSegmenter().segment(text)) {
    boundaries.push(part.index + part.segment.length);
  }
  if (boundaries.at(-1) !== text.length) {
    boundaries.push(text.length);
  }
  return boundaries;
}

function previousGraphemeOffset(text: string, offset: number): number {
  const clamped = clamp(offset, 0, text.length);
  let previous = 0;
  for (const boundary of graphemeBoundaries(text)) {
    if (boundary >= clamped) return previous;
    previous = boundary;
  }
  return previous;
}

function nextGraphemeOffset(text: string, offset: number): number {
  const clamped = clamp(offset, 0, text.length);
  for (const boundary of graphemeBoundaries(text)) {
    if (boundary > clamped) return boundary;
  }
  return text.length;
}

function lineStart(text: string, offset: number): number {
  return text.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
}

function lineEnd(text: string, offset: number): number {
  const next = text.indexOf('\n', offset);
  return next === -1 ? text.length : next;
}

function isWordChar(char: string): boolean {
  return /[\p{L}\p{N}_]/u.test(char);
}

function previousWordOffset(text: string, offset: number): number {
  let cursor = previousGraphemeOffset(text, offset);
  while (cursor > 0 && /\s/.test(text.slice(cursor, nextGraphemeOffset(text, cursor)))) {
    cursor = previousGraphemeOffset(text, cursor);
  }

  const wordLike = isWordChar(text.slice(cursor, nextGraphemeOffset(text, cursor)));
  while (cursor > 0) {
    const previous = previousGraphemeOffset(text, cursor);
    const char = text.slice(previous, cursor);
    if (/\s/.test(char)) break;
    if (isWordChar(char) !== wordLike) break;
    cursor = previous;
  }

  return cursor;
}

function nextWordOffset(text: string, offset: number): number {
  let cursor = clamp(offset, 0, text.length);
  while (cursor < text.length && !/\s/.test(text.slice(cursor, nextGraphemeOffset(text, cursor)))) {
    cursor = nextGraphemeOffset(text, cursor);
  }
  while (cursor < text.length && /\s/.test(text.slice(cursor, nextGraphemeOffset(text, cursor)))) {
    cursor = nextGraphemeOffset(text, cursor);
  }
  return cursor;
}

function insertText(snapshot: TextInputSnapshot, text: string): EditEffect {
  if (text.length === 0) return { type: 'none' };
  const offset = clamp(snapshot.cursorOffset, 0, snapshot.value.length);
  const value = snapshot.value.slice(0, offset) + text + snapshot.value.slice(offset);
  return { type: 'change', value, cursorOffset: offset + text.length };
}

function replaceRange(snapshot: TextInputSnapshot, start: number, end: number, replacement = ''): EditEffect {
  const from = clamp(start, 0, snapshot.value.length);
  const to = clamp(end, from, snapshot.value.length);
  if (from === to && replacement.length === 0) return { type: 'none' };
  const value = snapshot.value.slice(0, from) + replacement + snapshot.value.slice(to);
  return { type: 'change', value, cursorOffset: from + replacement.length };
}

function moveTo(snapshot: TextInputSnapshot, cursorOffset: number): EditEffect {
  const next = clamp(cursorOffset, 0, snapshot.value.length);
  return next === snapshot.cursorOffset ? { type: 'none' } : { type: 'change', value: snapshot.value, cursorOffset: next };
}

function normalizePrintableInput(input: string): string {
  return stripAnsi(input).replace(/\r\n?/g, '\n');
}

function returnSuffixLength(input: string): number {
  if (input.endsWith('\r\n')) return 2;
  if (input.endsWith('\r') || input.endsWith('\n')) return 1;
  return 0;
}

function snapshotAfterChange(snapshot: TextInputSnapshot, effect: EditEffect): TextInputSnapshot {
  return effect.type === 'change'
    ? { ...snapshot, value: effect.value, cursorOffset: effect.cursorOffset }
    : snapshot;
}

export function buildTextInputLayout(text: string, cursorOffset: number, columns: number): {
  lines: TextInputLayoutLine[];
  cursorLine: number;
  cursorColumn: number;
} {
  const width = Math.max(1, Math.floor(columns));
  const lines: TextInputLayoutLine[] = [];
  const logicalLines = text.split('\n');
  let offset = 0;

  for (const [lineIndex, line] of logicalLines.entries()) {
    if (line.length === 0) {
      lines.push({ text: '', start: offset, end: offset });
    } else {
      for (let start = 0; start < line.length; start += width) {
        const segment = line.slice(start, start + width);
        lines.push({
          text: segment,
          start: offset + start,
          end: offset + start + segment.length,
        });
      }
    }

    offset += line.length;
    if (lineIndex < logicalLines.length - 1) {
      offset += 1;
    }
  }

  const clampedCursor = clamp(cursorOffset, 0, text.length);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.start === line.end && clampedCursor === line.start) {
      return { lines, cursorLine: index, cursorColumn: 0 };
    }
    if (clampedCursor >= line.start && clampedCursor < line.end) {
      return { lines, cursorLine: index, cursorColumn: clampedCursor - line.start };
    }
    if (clampedCursor === line.end && (index === lines.length - 1 || lines[index + 1]?.start !== line.end)) {
      return { lines, cursorLine: index, cursorColumn: clampedCursor - line.start };
    }
  }

  const lastLine = lines.at(-1) ?? { text: '', start: 0, end: 0 };
  return {
    lines,
    cursorLine: Math.max(0, lines.length - 1),
    cursorColumn: clamp(clampedCursor - lastLine.start, 0, lastLine.text.length),
  };
}

function moveVertical(snapshot: TextInputSnapshot, direction: -1 | 1): EditEffect {
  const layout = buildTextInputLayout(snapshot.value, snapshot.cursorOffset, snapshot.columns);
  const targetLine = layout.cursorLine + direction;
  if (targetLine < 0) return { type: 'historyUp' };
  if (targetLine >= layout.lines.length) return { type: 'historyDown' };

  const line = layout.lines[targetLine];
  return moveTo(snapshot, line.start + Math.min(layout.cursorColumn, line.text.length));
}

export function reduceTextInput(snapshot: TextInputSnapshot, input: string, key: Key): EditEffect {
  if (key.eventType === 'release') return { type: 'none' };

  const isReturn = key.return || input === '\r' || input === '\n' || input === '\r\n';
  const isEscape = key.escape || input === '\x1b';
  const trailingReturnLength = returnSuffixLength(input);

  if (trailingReturnLength > 0 && input.length > trailingReturnLength) {
    const beforeReturn = normalizePrintableInput(input.slice(0, -trailingReturnLength));
    if (beforeReturn.length > 0) {
      if (snapshot.multiline && snapshot.submitMode === 'newline') {
        const insertedPrefix = insertText(snapshot, beforeReturn);
        return insertText(snapshotAfterChange(snapshot, insertedPrefix), '\n');
      }

      if (snapshot.multiline && beforeReturn.endsWith('\\')) {
        const insertedPrefix = insertText(snapshot, beforeReturn.slice(0, -1));
        return insertText(snapshotAfterChange(snapshot, insertedPrefix), '\n');
      }

      const inserted = insertText(snapshot, beforeReturn);
      if (inserted.type === 'change') {
        return { type: 'submit', value: inserted.value };
      }
    }
  }

  if (isReturn) {
    if (snapshot.multiline && snapshot.submitMode === 'newline') {
      return insertText(snapshot, '\n');
    }

    if (snapshot.multiline && snapshot.cursorOffset > 0 && snapshot.value[snapshot.cursorOffset - 1] === '\\') {
      const withoutSlash: TextInputSnapshot = {
        ...snapshot,
        value: snapshot.value.slice(0, snapshot.cursorOffset - 1) + snapshot.value.slice(snapshot.cursorOffset),
        cursorOffset: snapshot.cursorOffset - 1,
      };
      return insertText(withoutSlash, '\n');
    }
    if (snapshot.multiline && (key.meta || key.shift)) {
      return insertText(snapshot, '\n');
    }
    if (snapshot.value.trim().length > 0 || snapshot.allowEmptySubmit) {
      return { type: 'submit', value: snapshot.value };
    }
    return { type: 'none' };
  }

  if (isEscape) {
    if (snapshot.clearOnEscape && snapshot.value.length > 0) {
      return { type: 'clear' };
    }
    return { type: 'cancel' };
  }

  if (key.upArrow) return moveVertical(snapshot, -1);
  if (key.downArrow) return moveVertical(snapshot, 1);
  if (key.leftArrow) return moveTo(snapshot, key.ctrl || key.meta ? previousWordOffset(snapshot.value, snapshot.cursorOffset) : previousGraphemeOffset(snapshot.value, snapshot.cursorOffset));
  if (key.rightArrow) return moveTo(snapshot, key.ctrl || key.meta ? nextWordOffset(snapshot.value, snapshot.cursorOffset) : nextGraphemeOffset(snapshot.value, snapshot.cursorOffset));
  if (key.home || (key.ctrl && input === 'a')) return moveTo(snapshot, lineStart(snapshot.value, snapshot.cursorOffset));
  if (key.end || (key.ctrl && input === 'e')) return moveTo(snapshot, lineEnd(snapshot.value, snapshot.cursorOffset));

  if (key.backspace) {
    const from = key.ctrl || key.meta
      ? previousWordOffset(snapshot.value, snapshot.cursorOffset)
      : previousGraphemeOffset(snapshot.value, snapshot.cursorOffset);
    return replaceRange(snapshot, from, snapshot.cursorOffset);
  }

  if (key.delete || (key.ctrl && input === 'd')) {
    if (snapshot.value.length === 0 && key.ctrl && input === 'd') return { type: 'cancel' };
    const to = key.meta
      ? lineEnd(snapshot.value, snapshot.cursorOffset)
      : nextGraphemeOffset(snapshot.value, snapshot.cursorOffset);
    return replaceRange(snapshot, snapshot.cursorOffset, to);
  }

  if (key.ctrl) {
    switch (input) {
      case 'b':
        return moveTo(snapshot, previousGraphemeOffset(snapshot.value, snapshot.cursorOffset));
      case 'f':
        return moveTo(snapshot, nextGraphemeOffset(snapshot.value, snapshot.cursorOffset));
      case 'k':
        return replaceRange(snapshot, snapshot.cursorOffset, lineEnd(snapshot.value, snapshot.cursorOffset));
      case 'u':
        return replaceRange(snapshot, lineStart(snapshot.value, snapshot.cursorOffset), snapshot.cursorOffset);
      case 'w':
        return replaceRange(snapshot, previousWordOffset(snapshot.value, snapshot.cursorOffset), snapshot.cursorOffset);
      case 'p':
        return { type: 'historyUp' };
      case 'n':
        return { type: 'historyDown' };
      case 'c':
        return snapshot.value.length > 0 ? { type: 'clear' } : { type: 'cancel' };
      default:
        return { type: 'none' };
    }
  }

  if (key.meta) {
    switch (input) {
      case 'b':
        return moveTo(snapshot, previousWordOffset(snapshot.value, snapshot.cursorOffset));
      case 'f':
        return moveTo(snapshot, nextWordOffset(snapshot.value, snapshot.cursorOffset));
      case 'd':
        return replaceRange(snapshot, snapshot.cursorOffset, nextWordOffset(snapshot.value, snapshot.cursorOffset));
      default:
        return { type: 'none' };
    }
  }

  if (key.tab) return { type: 'none' };

  const text = normalizePrintableInput(input);
  if (text.length === 0) return { type: 'none' };

  return insertText(snapshot, text);
}

function maskValue(value: string, mask: string): string {
  if (!mask) return value;
  return [...getGraphemeSegmenter().segment(value)].map(() => mask).join('');
}

function visibleRange(layout: ReturnType<typeof buildTextInputLayout>, maxVisibleLines: number): { fromLine: number; toLine: number } {
  if (maxVisibleLines <= 0 || layout.lines.length <= maxVisibleLines) {
    return { fromLine: 0, toLine: layout.lines.length };
  }

  const half = Math.floor(maxVisibleLines / 2);
  const fromLine = clamp(layout.cursorLine - half, 0, Math.max(0, layout.lines.length - maxVisibleLines));
  return { fromLine, toLine: fromLine + maxVisibleLines };
}

export function useTextInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  onClear,
  onHistoryUp,
  onHistoryDown,
  isActive = true,
  multiline = false,
  submitMode = 'submit',
  allowEmptySubmit = false,
  clearOnEscape = true,
  cursorOffset,
  onCursorOffsetChange,
  columns = 80,
  maxVisibleLines = 0,
  mask = '',
  cursorChar = ' ',
  showCursor = true,
  inputFilter,
}: UseTextInputProps): UseTextInputResult {
  const [internalCursorOffset, setInternalCursorOffset] = useState(() => value.length);
  const activeCursorOffset = clamp(cursorOffset ?? internalCursorOffset, 0, value.length);

  const propsRef = useRef({
    onChange,
    onSubmit,
    onCancel,
    onClear,
    onHistoryUp,
    onHistoryDown,
    onCursorOffsetChange,
    inputFilter,
  });
  propsRef.current = {
    onChange,
    onSubmit,
    onCancel,
    onClear,
    onHistoryUp,
    onHistoryDown,
    onCursorOffsetChange,
    inputFilter,
  };

  const snapshotRef = useRef<TextInputSnapshot>({
    value,
    cursorOffset: activeCursorOffset,
    multiline,
    submitMode,
    allowEmptySubmit,
    clearOnEscape,
    columns,
    maxVisibleLines,
    mask,
    cursorChar,
    showCursor,
  });

  snapshotRef.current = {
    value,
    cursorOffset: activeCursorOffset,
    multiline,
    submitMode,
    allowEmptySubmit,
    clearOnEscape,
    columns,
    maxVisibleLines,
    mask,
    cursorChar,
    showCursor,
  };

  const setCursorOffset = useCallback((nextOffset: number) => {
    const snapshot = snapshotRef.current;
    const next = clamp(nextOffset, 0, snapshot.value.length);
    snapshotRef.current = { ...snapshot, cursorOffset: next };
    setInternalCursorOffset(next);
    propsRef.current.onCursorOffsetChange?.(next);
  }, []);

  useEffect(() => {
    if (activeCursorOffset !== cursorOffset && cursorOffset !== undefined) {
      setCursorOffset(activeCursorOffset);
    } else if (activeCursorOffset !== internalCursorOffset) {
      setInternalCursorOffset(activeCursorOffset);
    }
  }, [activeCursorOffset, cursorOffset, internalCursorOffset, setCursorOffset]);

  const setValue = useCallback((nextValue: string, nextCursorOffset = nextValue.length) => {
    const nextOffset = clamp(nextCursorOffset, 0, nextValue.length);
    snapshotRef.current = { ...snapshotRef.current, value: nextValue, cursorOffset: nextOffset };
    propsRef.current.onChange(nextValue);
    setCursorOffset(nextOffset);
  }, [setCursorOffset]);

  const clear = useCallback(() => {
    setValue('', 0);
    propsRef.current.onClear?.();
  }, [setValue]);

  const applyEffect = useCallback((effect: EditEffect) => {
    switch (effect.type) {
      case 'change':
        setValue(effect.value, effect.cursorOffset);
        break;
      case 'submit':
        propsRef.current.onSubmit?.(effect.value);
        break;
      case 'cancel':
        propsRef.current.onCancel?.();
        break;
      case 'clear':
        clear();
        break;
      case 'historyUp':
        propsRef.current.onHistoryUp?.();
        break;
      case 'historyDown':
        propsRef.current.onHistoryDown?.();
        break;
      case 'none':
        break;
    }
  }, [clear, setValue]);

  const onInput = useCallback((rawInput: string, key: Key) => {
    const filteredInput = propsRef.current.inputFilter
      ? propsRef.current.inputFilter(rawInput, key)
      : rawInput;

    if (filteredInput === '' && rawInput !== '') return;
    applyEffect(reduceTextInput(snapshotRef.current, filteredInput, key));
  }, [applyEffect]);

  useInput((input, key) => {
    onInput(input, key);
  }, { isActive });

  const layout = useMemo(
    () => buildTextInputLayout(value, activeCursorOffset, columns),
    [activeCursorOffset, columns, value],
  );
  const range = visibleRange(layout, maxVisibleLines);
  const viewportCharOffset = layout.lines[range.fromLine]?.start ?? 0;
  const viewportCharEnd = range.toLine >= layout.lines.length
    ? value.length
    : layout.lines[range.toLine]?.start ?? value.length;
  const renderedBase = maskValue(value, mask);
  const renderedValue = showCursor
    ? `${renderedBase.slice(0, activeCursorOffset)}${cursorChar}${renderedBase.slice(activeCursorOffset)}`
    : renderedBase;
  const visibleValue = layout.lines
    .slice(range.fromLine, range.toLine)
    .map((line, index) => {
      const absoluteLine = range.fromLine + index;
      const lineText = renderedBase.slice(line.start, line.end);
      if (!showCursor || absoluteLine !== layout.cursorLine) {
        return lineText;
      }

      const lineCursorColumn = clamp(activeCursorOffset - line.start, 0, lineText.length);
      return `${lineText.slice(0, lineCursorColumn)}${cursorChar}${lineText.slice(lineCursorColumn)}`;
    })
    .join('\n');

  return {
    value,
    renderedValue,
    visibleValue,
    cursorOffset: activeCursorOffset,
    cursorLine: layout.cursorLine - range.fromLine,
    cursorColumn: layout.cursorColumn,
    viewportCharOffset,
    viewportCharEnd,
    lines: layout.lines,
    setCursorOffset,
    setValue,
    clear,
    onInput,
  };
}
