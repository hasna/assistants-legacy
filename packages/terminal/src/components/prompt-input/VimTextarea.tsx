import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, Textarea, useInkThemeColor, type TextareaProps } from '../../ui/ink';
import {
  applyVimTextareaInkInput,
  createVimTextareaAdapterState,
  type VimMode,
  type VimTextareaAdapterState,
} from './vimTextareaAdapter';
import type { Key } from '../../keybindings';

export type VimTextareaProps = Omit<TextareaProps, 'inputFilter' | 'cursorOffset' | 'onCursorOffsetChange'> & {
  initialMode?: VimMode;
  mode?: VimMode;
  onModeChange?: (mode: VimMode) => void;
  cursorOffset?: number;
  onCursorOffsetChange?: (offset: number) => void;
  inputFilter?: (input: string, key: Key) => string;
  showModeIndicator?: boolean;
};

export function VimTextarea({
  initialMode = 'INSERT',
  mode,
  onModeChange,
  cursorOffset,
  onCursorOffsetChange,
  inputFilter,
  showModeIndicator = true,
  value,
  onChange,
  children,
  ...props
}: VimTextareaProps): React.ReactNode {
  const [internalCursorOffset, setInternalCursorOffset] = useState(() => value.length);
  const [vimState, setVimState] = useState<VimTextareaAdapterState>(() => createVimTextareaAdapterState(initialMode));
  const activeCursorOffset = cursorOffset ?? internalCursorOffset;
  const activeMode = mode ?? vimState.mode;
  const modeColor = useInkThemeColor(activeMode === 'INSERT' ? 'success' : activeMode === 'VISUAL' ? 'warning' : 'primary');

  useEffect(() => {
    if (mode && mode !== vimState.mode) {
      setVimState((current) => ({ ...current, mode }));
    }
  }, [mode, vimState.mode]);

  const updateCursorOffset = useCallback((nextOffset: number) => {
    setInternalCursorOffset(nextOffset);
    onCursorOffsetChange?.(nextOffset);
  }, [onCursorOffsetChange]);

  const updateVimState = useCallback((nextState: VimTextareaAdapterState) => {
    setVimState(nextState);
    if (nextState.mode !== activeMode) {
      onModeChange?.(nextState.mode);
    }
  }, [activeMode, onModeChange]);

  const adapterState = useMemo<VimTextareaAdapterState>(() => ({
    ...vimState,
    mode: activeMode,
  }), [activeMode, vimState]);

  const handleInputFilter = useCallback((rawInput: string, key: Key): string => {
    const filteredInput = inputFilter ? inputFilter(rawInput, key) : rawInput;
    if (filteredInput === '' && rawInput !== '') return '';

    const result = applyVimTextareaInkInput(
      { value, cursorOffset: activeCursorOffset },
      adapterState,
      filteredInput,
      key,
    );

    if (!result.handled) {
      return filteredInput;
    }

    updateVimState(result.state);
    if (result.model.value !== value) {
      onChange(result.model.value);
    }
    if (result.model.cursorOffset !== activeCursorOffset) {
      updateCursorOffset(result.model.cursorOffset);
    }
    return '';
  }, [
    activeCursorOffset,
    adapterState,
    inputFilter,
    onChange,
    updateCursorOffset,
    updateVimState,
    value,
  ]);

  return (
    <Textarea
      {...props}
      value={value}
      onChange={onChange}
      cursorOffset={activeCursorOffset}
      onCursorOffsetChange={updateCursorOffset}
      inputFilter={handleInputFilter}
    >
      {showModeIndicator ? <Text color={modeColor}>{` ${activeMode} `}</Text> : null}
      {children}
    </Textarea>
  );
}
