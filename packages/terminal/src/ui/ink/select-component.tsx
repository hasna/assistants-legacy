/** @jsxImportSource react */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useInkThemeColor } from './theme';
import { TextInput } from './text-input-component';

type SelectOptionBase<T> = {
  value: T;
  label: React.ReactNode;
  description?: string;
  disabled?: boolean;
  dimDescription?: boolean;
};

export type SelectOption<T = string> =
  | (SelectOptionBase<T> & { type?: 'text' })
  | (SelectOptionBase<T> & {
    type: 'input';
    initialValue?: string;
    inputValue?: string;
    placeholder?: string;
    allowEmptySubmit?: boolean;
    onInputChange?: (value: string, option: SelectOption<T>) => void;
    onInputSubmit?: (value: string, option: SelectOption<T>) => void;
  });

export type SelectProps<T = string> = {
  options: SelectOption<T>[];
  value?: T;
  defaultValue?: T;
  defaultFocusValue?: T;
  focusValue?: T;
  onChange?: (value: T, option: SelectOption<T>) => void;
  onSelect?: (value: T, option: SelectOption<T>) => void;
  onFocus?: (value: T, option: SelectOption<T>) => void;
  onCancel?: () => void;
  isActive?: boolean;
  isDisabled?: boolean;
  disableSelection?: boolean | 'numeric';
  hideIndexes?: boolean;
  visibleOptionCount?: number;
  wrapSelection?: boolean;
  filterText?: string;
  filterOption?: (option: SelectOption<T>, query: string) => boolean;
  inlineDescriptions?: boolean;
  inputCursorChar?: string;
  emptyText?: string;
};

function getTextContent(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (!node) return '';
  if (Array.isArray(node)) return node.map(getTextContent).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return getTextContent(node.props.children);
  }
  return '';
}

function valuesEqual<T>(left: T | undefined, right: T | undefined): boolean {
  return Object.is(left, right);
}

function firstEnabledIndex<T>(options: SelectOption<T>[]): number {
  return options.findIndex((option) => !option.disabled);
}

function findIndexByValue<T>(options: SelectOption<T>[], value: T | undefined): number {
  if (value === undefined) return -1;
  return options.findIndex((option) => valuesEqual(option.value, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function Select<T = string>({
  options,
  value,
  defaultValue,
  defaultFocusValue,
  focusValue,
  onChange,
  onSelect,
  onFocus,
  onCancel,
  isActive = true,
  isDisabled = false,
  disableSelection = false,
  hideIndexes = false,
  visibleOptionCount = 5,
  wrapSelection = true,
  filterText = '',
  filterOption,
  inlineDescriptions = false,
  inputCursorChar = '|',
  emptyText = 'No options',
}: SelectProps<T>): React.JSX.Element {
  const primary = useInkThemeColor('primary');
  const selectedText = useInkThemeColor('background');
  const text = useInkThemeColor('text');
  const muted = useInkThemeColor('textMuted');
  const dim = useInkThemeColor('textDim');
  const disabled = useInkThemeColor('borderDim');

  const filteredOptions = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => {
      if (filterOption) return filterOption(option, query);
      return `${getTextContent(option.label)} ${option.description ?? ''}`.toLowerCase().includes(query);
    });
  }, [filterOption, filterText, options]);

  const [internalValue, setInternalValue] = useState<T | undefined>(defaultValue);
  const selectedValue = value ?? internalValue;
  const [focusedIndex, setFocusedIndex] = useState(() => {
    const explicitFocus = findIndexByValue(filteredOptions, defaultFocusValue ?? defaultValue);
    return explicitFocus >= 0 ? explicitFocus : firstEnabledIndex(filteredOptions);
  });
  const [inputModeValue, setInputModeValue] = useState<T | null>(null);
  const [inputValues, setInputValues] = useState<Map<T, string>>(() => {
    const next = new Map<T, string>();
    for (const option of options) {
      if (option.type === 'input') {
        next.set(option.value, option.inputValue ?? option.initialValue ?? '');
      }
    }
    return next;
  });

  const active = isActive && !isDisabled;
  const maxVisible = Math.max(1, Math.floor(visibleOptionCount));
  const focusedOption = filteredOptions[focusedIndex];
  const visibleFromIndex = clamp(focusedIndex - maxVisible + 1, 0, Math.max(0, filteredOptions.length - maxVisible));
  const visibleOptions = filteredOptions.slice(visibleFromIndex, visibleFromIndex + maxVisible);

  useEffect(() => {
    if (focusValue !== undefined) {
      const next = findIndexByValue(filteredOptions, focusValue);
      if (next >= 0) setFocusedIndex(next);
      return;
    }

    setFocusedIndex((current) => {
      if (current >= 0 && current < filteredOptions.length && !filteredOptions[current]?.disabled) {
        return current;
      }
      return firstEnabledIndex(filteredOptions);
    });
  }, [filteredOptions, focusValue]);

  useEffect(() => {
    if (focusedOption && !focusedOption.disabled) {
      onFocus?.(focusedOption.value, focusedOption);
    }
  }, [focusedOption, onFocus]);

  const moveFocus = useCallback((delta: number) => {
    if (filteredOptions.length === 0) return;

    setFocusedIndex((current) => {
      const start = current >= 0 ? current : firstEnabledIndex(filteredOptions);
      if (start < 0) return -1;

      for (let step = 1; step <= filteredOptions.length; step += 1) {
        const raw = start + delta * step;
        if (!wrapSelection && (raw < 0 || raw >= filteredOptions.length)) return start;
        const next = (raw + filteredOptions.length) % filteredOptions.length;
        if (!filteredOptions[next]?.disabled) return next;
      }

      return start;
    });
  }, [filteredOptions, wrapSelection]);

  const focusAbsolute = useCallback((nextIndex: number) => {
    const clamped = clamp(nextIndex, 0, Math.max(0, filteredOptions.length - 1));
    if (!filteredOptions[clamped]?.disabled) {
      setFocusedIndex(clamped);
      return;
    }

    const nextEnabled = filteredOptions.findIndex((option, index) => index >= clamped && !option.disabled);
    if (nextEnabled >= 0) {
      setFocusedIndex(nextEnabled);
      return;
    }

    setFocusedIndex(firstEnabledIndex(filteredOptions));
  }, [filteredOptions]);

  const commitOption = useCallback((option: SelectOption<T> | undefined) => {
    if (!option || option.disabled || disableSelection === true) return;
    if (option.type === 'input' && !valuesEqual(inputModeValue ?? undefined, option.value)) {
      setInputModeValue(option.value);
      return;
    }

    setInternalValue(option.value);
    onChange?.(option.value, option);
    onSelect?.(option.value, option);
  }, [disableSelection, inputModeValue, onChange, onSelect]);

  const handleInputValueChange = useCallback((option: SelectOption<T>, nextValue: string) => {
    setInputValues((current) => {
      const next = new Map(current);
      next.set(option.value, nextValue);
      return next;
    });
    if (option.type === 'input') {
      option.onInputChange?.(nextValue, option);
    }
  }, []);

  useInput((input, key) => {
    if (!active) return;

    if (inputModeValue !== null) {
      if (key.escape || input === '\x1b') {
        setInputModeValue(null);
      }
      return;
    }

    if (key.escape || input === '\x1b') {
      onCancel?.();
      return;
    }

    if (key.upArrow || input === 'k' || (key.ctrl && input === 'p')) {
      moveFocus(-1);
      return;
    }
    if (key.downArrow || input === 'j' || (key.ctrl && input === 'n')) {
      moveFocus(1);
      return;
    }
    if (key.pageUp) {
      moveFocus(-maxVisible);
      return;
    }
    if (key.pageDown) {
      moveFocus(maxVisible);
      return;
    }
    if (key.home) {
      focusAbsolute(0);
      return;
    }
    if (key.end) {
      focusAbsolute(filteredOptions.length - 1);
      return;
    }
    if (key.return || input === '\r' || input === '\n') {
      commitOption(focusedOption);
      return;
    }
    if (!hideIndexes && disableSelection !== 'numeric' && /^[1-9]$/.test(input)) {
      const visibleIndex = Number(input) - 1;
      commitOption(visibleOptions[visibleIndex]);
    }
  }, { isActive: active });

  if (filteredOptions.length === 0 || focusedIndex < 0) {
    return <Text color={muted}>{emptyText}</Text>;
  }

  return (
    <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
      {visibleFromIndex > 0 ? <Text color={dim}>^ more</Text> : null}
      {visibleOptions.map((option, visibleIndex) => {
        const absoluteIndex = visibleFromIndex + visibleIndex;
        const isFocused = absoluteIndex === focusedIndex;
        const isSelected = valuesEqual(option.value, selectedValue);
        const isInputMode = option.type === 'input' && inputModeValue !== null && valuesEqual(inputModeValue, option.value);
        const rowColor = option.disabled ? disabled : isFocused ? selectedText : text;
        const rowBackground = isFocused ? primary : undefined;
        const indexLabel = hideIndexes ? '' : `${absoluteIndex + 1}. `;
        const marker = isFocused ? '> ' : '  ';
        const selectedMarker = isSelected ? '* ' : '  ';
        const inputValue = option.type === 'input'
          ? option.inputValue ?? inputValues.get(option.value) ?? option.initialValue ?? ''
          : '';

        return (
          <Box key={`${absoluteIndex}:${getTextContent(option.label)}`} flexDirection="column" minWidth={0}>
            <Box minWidth={0}>
              <Text color={rowColor} backgroundColor={rowBackground}>
                {marker}
                {selectedMarker}
                {indexLabel}
              </Text>
              {isInputMode && option.type === 'input' ? (
                <TextInput
                  value={inputValue}
                  onChange={(nextValue) => handleInputValueChange(option, nextValue)}
                  onSubmit={(nextValue) => {
                    if (nextValue.length > 0 || option.allowEmptySubmit) {
                      option.onInputSubmit?.(nextValue, option);
                      setInputModeValue(null);
                    } else {
                      setInputModeValue(null);
                      onCancel?.();
                    }
                  }}
                  onCancel={() => setInputModeValue(null)}
                  placeholder={option.placeholder}
                  isActive={active}
                  cursorChar={inputCursorChar}
                  columns={80}
                />
              ) : (
                <Text color={rowColor} backgroundColor={rowBackground} wrap="truncate-end">
                  {option.label}
                  {option.type === 'input' && inputValue.length > 0 ? `: ${inputValue}` : ''}
                  {inlineDescriptions && option.description ? `  ${option.description}` : ''}
                </Text>
              )}
            </Box>
            {!inlineDescriptions && option.description ? (
              <Text color={option.dimDescription === false ? muted : dim}>
                {'    '}
                {option.description}
              </Text>
            ) : null}
          </Box>
        );
      })}
      {visibleFromIndex + visibleOptions.length < filteredOptions.length ? <Text color={dim}>v more</Text> : null}
    </Box>
  );
}

