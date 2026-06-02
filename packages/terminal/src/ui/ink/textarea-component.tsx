/** @jsxImportSource react */
import React, { useCallback } from 'react';
import { Box, Text } from 'ink';
import { useInkThemeColor } from './theme';
import { useTextInput, type TextInputSubmitMode, type UseTextInputProps } from './text-input';
import { normalizePastedText, useInkPaste } from './terminal-hooks';

export type TextareaProps = Omit<
  UseTextInputProps,
  'isActive' | 'multiline' | 'onSubmit' | 'cursorChar' | 'showCursor' | 'submitMode'
> & {
  focus?: boolean;
  isActive?: boolean;
  placeholder?: string;
  placeholderElement?: React.ReactNode;
  argumentHint?: string;
  dimColor?: boolean;
  cursorChar?: string;
  showCursor?: boolean;
  submitMode?: TextInputSubmitMode;
  disabled?: boolean;
  disabledText?: string;
  loading?: boolean;
  loadingText?: string;
  onSubmit?: (value: string) => void;
  onPaste?: (text: string) => void;
  pasteFilter?: (text: string) => string;
  children?: React.ReactNode;
};

function shouldShowArgumentHint(value: string, argumentHint?: string): boolean {
  if (!argumentHint || !value.startsWith('/')) return false;
  return value.trim().indexOf(' ') === -1 || value.endsWith(' ');
}

export function Textarea({
  focus,
  isActive,
  placeholder,
  placeholderElement,
  argumentHint,
  dimColor,
  cursorChar = '|',
  showCursor = true,
  submitMode = 'submit',
  disabled = false,
  disabledText = 'Input disabled',
  loading = false,
  loadingText = 'Working...',
  onSubmit,
  onPaste,
  pasteFilter,
  children,
  value,
  onChange,
  ...props
}: TextareaProps): React.JSX.Element {
  const active = (isActive ?? focus ?? true) && !disabled && !loading;
  const textColor = useInkThemeColor('text');
  const placeholderColor = useInkThemeColor('textMuted');
  const hintColor = useInkThemeColor('textDim');
  const statusColor = useInkThemeColor(loading ? 'info' : 'textDim');

  const input = useTextInput({
    ...props,
    value,
    onChange,
    onSubmit,
    isActive: active,
    multiline: true,
    submitMode,
    cursorChar,
    showCursor: showCursor && active,
  });

  const handlePaste = useCallback((rawText: string) => {
    if (!active) return;

    const pastedText = pasteFilter
      ? pasteFilter(normalizePastedText(rawText))
      : normalizePastedText(rawText);
    if (pastedText.length === 0) return;

    onPaste?.(pastedText);
    const offset = input.cursorOffset;
    input.setValue(
      `${value.slice(0, offset)}${pastedText}${value.slice(offset)}`,
      offset + pastedText.length,
    );
  }, [active, input, onPaste, pasteFilter, value]);

  useInkPaste(handlePaste, { isActive: active, normalize: false });

  const showPlaceholder = value.length === 0 && Boolean(placeholder || placeholderElement);
  const showHint = shouldShowArgumentHint(value, argumentHint);
  const statusText = loading ? loadingText : disabled ? disabledText : null;

  return (
    <Box flexDirection="column" flexGrow={1} flexShrink={1} minHeight={1} minWidth={0}>
      <Text wrap="wrap" dimColor={dimColor || disabled || loading}>
        {showPlaceholder && placeholderElement ? (
          placeholderElement
        ) : showPlaceholder ? (
          <>
            {showCursor && active ? <Text color={textColor}>{cursorChar}</Text> : null}
            <Text color={placeholderColor}>{placeholder}</Text>
          </>
        ) : (
          input.visibleValue
        )}
      </Text>
      {showHint ? (
        <Text color={hintColor} wrap="truncate-end">
          {value.endsWith(' ') ? '' : ' '}
          {argumentHint}
        </Text>
      ) : null}
      {statusText ? (
        <Text color={statusColor} wrap="truncate-end">
          {statusText}
        </Text>
      ) : null}
      {children}
    </Box>
  );
}
