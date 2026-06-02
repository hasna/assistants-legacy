/** @jsxImportSource react */
import React, { useCallback, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import { useInkThemeColor } from './theme';
import { useTextInput, type UseTextInputProps } from './text-input';

export type TextInputValidationResult = boolean | string | null | undefined;

export type TextInputProps = Omit<
  UseTextInputProps,
  'isActive' | 'multiline' | 'onSubmit' | 'cursorChar' | 'showCursor'
> & {
  focus?: boolean;
  isActive?: boolean;
  placeholder?: string;
  placeholderElement?: React.ReactNode;
  argumentHint?: string;
  dimColor?: boolean;
  cursorChar?: string;
  showCursor?: boolean;
  validate?: (value: string) => TextInputValidationResult;
  validationError?: string | null;
  validationMode?: 'always' | 'on-submit';
  onValidationFailure?: (message: string, value: string) => void;
  onSubmit?: (value: string) => void;
  children?: React.ReactNode;
};

function validationMessageFromResult(result: TextInputValidationResult): string | null {
  if (result === false) return 'Invalid input';
  if (typeof result === 'string' && result.length > 0) return result;
  return null;
}

function shouldShowArgumentHint(value: string, argumentHint?: string): boolean {
  if (!argumentHint || !value.startsWith('/')) return false;
  return value.trim().indexOf(' ') === -1 || value.endsWith(' ');
}

export function TextInput({
  focus,
  isActive,
  placeholder,
  placeholderElement,
  argumentHint,
  dimColor,
  cursorChar = '|',
  showCursor = true,
  validate,
  validationError,
  validationMode = 'always',
  onValidationFailure,
  onSubmit,
  children,
  value,
  onChange,
  ...props
}: TextInputProps): React.JSX.Element {
  const active = isActive ?? focus ?? true;
  const textColor = useInkThemeColor('text');
  const placeholderColor = useInkThemeColor('textMuted');
  const hintColor = useInkThemeColor('textDim');
  const errorColor = useInkThemeColor('error');
  const [submitValidationError, setSubmitValidationError] = useState<string | null>(null);

  const getValidationError = useCallback((nextValue: string): string | null => {
    return validationMessageFromResult(validate?.(nextValue));
  }, [validate]);

  const liveValidationError = useMemo(() => {
    if (validationMode !== 'always') return null;
    return getValidationError(value);
  }, [getValidationError, validationMode, value]);

  const handleSubmit = useCallback((nextValue: string) => {
    const message = getValidationError(nextValue);
    if (message) {
      setSubmitValidationError(message);
      onValidationFailure?.(message, nextValue);
      return;
    }

    setSubmitValidationError(null);
    onSubmit?.(nextValue);
  }, [getValidationError, onSubmit, onValidationFailure]);

  const handleChange = useCallback((nextValue: string) => {
    if (submitValidationError) {
      setSubmitValidationError(null);
    }
    onChange(nextValue);
  }, [onChange, submitValidationError]);

  const input = useTextInput({
    ...props,
    value,
    onChange: handleChange,
    onSubmit: handleSubmit,
    isActive: active,
    multiline: false,
    cursorChar,
    showCursor,
  });

  const showPlaceholder = value.length === 0 && Boolean(placeholder || placeholderElement);
  const visibleValidationError = validationError ?? liveValidationError ?? submitValidationError;
  const showHint = shouldShowArgumentHint(value, argumentHint);

  return (
    <Box flexDirection="column" flexGrow={1} flexShrink={1} minHeight={1} minWidth={0}>
      <Text wrap="truncate-end" dimColor={dimColor}>
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
      {visibleValidationError ? (
        <Text color={errorColor} wrap="wrap">
          {visibleValidationError}
        </Text>
      ) : null}
      {children}
    </Box>
  );
}

