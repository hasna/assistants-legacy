/** @jsxImportSource react */
import React from 'react';
import {
  Box as InkBox,
  Text as InkText,
  Newline,
  Spacer,
  Static,
  Transform,
  measureElement,
  render,
  renderToString,
  useAnimation,
  useApp,
  useBoxMetrics,
  useCursor,
  useFocus,
  useFocusManager,
  useInput,
  useIsScreenReaderEnabled,
  usePaste,
  useStderr,
  useStdin,
  useStdout,
  useWindowSize,
} from 'ink';
import type { ComponentProps, ReactNode } from 'react';

export {
  Newline,
  Spacer,
  Static,
  Transform,
  measureElement,
  render,
  renderToString,
  useAnimation,
  useApp,
  useBoxMetrics,
  useCursor,
  useFocus,
  useFocusManager,
  useInput,
  useIsScreenReaderEnabled,
  usePaste,
  useStderr,
  useStdin,
  useStdout,
  useWindowSize,
};

type InkBoxProps = ComponentProps<typeof InkBox>;
type InkTextProps = ComponentProps<typeof InkText>;
type Color = NonNullable<InkTextProps['color']>;

type BorderEdge = 'top' | 'right' | 'bottom' | 'left';

export type BoxProps = Omit<InkBoxProps, 'borderTop' | 'borderRight' | 'borderBottom' | 'borderLeft'> & {
  /**
   * Convenience alias for array-based border edges. Ink models border edges as
   * booleans, so the facade normalizes edge arrays for app components.
   */
  border?: boolean | readonly BorderEdge[];
};

function normalizeBorder(border: BoxProps['border']): Pick<InkBoxProps, 'borderTop' | 'borderRight' | 'borderBottom' | 'borderLeft'> {
  if (border === undefined) return {};

  if (typeof border === 'boolean') {
    return {
      borderTop: border,
      borderRight: border,
      borderBottom: border,
      borderLeft: border,
    };
  }

  const edges = new Set(border);
  return {
    borderTop: edges.has('top'),
    borderRight: edges.has('right'),
    borderBottom: edges.has('bottom'),
    borderLeft: edges.has('left'),
  };
}

export function Box({ border, ...props }: BoxProps): React.JSX.Element {
  return <InkBox {...normalizeBorder(border)} {...props} />;
}

export type TextAttributes = number | undefined;

export type TextProps = Omit<InkTextProps, 'color' | 'backgroundColor' | 'wrap'> & {
  fg?: Color;
  bg?: Color;
  color?: Color;
  backgroundColor?: Color;
  attributes?: TextAttributes;
  wrap?: InkTextProps['wrap'];
  wrapMode?: 'word' | 'char' | 'truncate' | 'truncate-end' | 'truncate-middle' | 'truncate-start' | InkTextProps['wrap'];
  children?: ReactNode;
};

function attributeStyles(attributes: TextAttributes): Pick<InkTextProps, 'bold' | 'underline' | 'italic' | 'inverse'> {
  if (!attributes) return {};

  return {
    bold: (attributes & 1) === 1,
    italic: (attributes & 3) === 3,
    underline: (attributes & 4) === 4,
    inverse: (attributes & 7) === 7,
  };
}

function normalizeWrap(wrapMode: TextProps['wrapMode'], wrap: TextProps['wrap']): InkTextProps['wrap'] {
  if (wrap !== undefined) return wrap;
  if (wrapMode === undefined) return undefined;
  if (wrapMode === 'word') return 'wrap';
  if (wrapMode === 'char') return 'wrap';
  return wrapMode;
}

export function Text({
  fg,
  bg,
  color,
  backgroundColor,
  attributes,
  wrapMode,
  wrap,
  children,
  ...props
}: TextProps): React.JSX.Element | null {
  return (
    <InkText
      color={color ?? fg}
      backgroundColor={backgroundColor ?? bg}
      wrap={normalizeWrap(wrapMode, wrap)}
      {...attributeStyles(attributes)}
      {...props}
    >
      {children}
    </InkText>
  );
}

export type InlineProps = TextProps;

export function Inline(props: InlineProps): React.JSX.Element | null {
  return <Text {...props} />;
}

export type BoldProps = { children?: ReactNode };

export function Bold({ children }: BoldProps): React.JSX.Element | null {
  return <Text bold>{children}</Text>;
}

export type ItalicProps = { children?: ReactNode };

export function Italic({ children }: ItalicProps): React.JSX.Element | null {
  return <Text italic>{children}</Text>;
}

export type UnderlineProps = { children?: ReactNode };

export function Underline({ children }: UnderlineProps): React.JSX.Element | null {
  return <Text underline>{children}</Text>;
}

export type { Key } from 'ink';
export {
  InkThemeProvider,
  ThemeProvider,
  resolveInkColor,
  resolveInkThemeName,
  useInkTheme,
  useInkThemeColor,
  type InkColorName,
  type InkColorToken,
  type InkPalette,
  type InkThemeContextValue,
  type InkThemeProviderProps,
} from './theme';
export {
  BlankLines,
  BorderLine,
  Divider,
  RawAnsi,
  type BlankLinesProps,
  type DividerProps,
  type RawAnsiProps,
} from './helpers';
export {
  INK_KEYBOARD_PRIORITIES,
  InkKeyboardProvider,
  InkKeyboardRouter,
  createInkKeyboardRouter,
  useInkCommandMenuPriority,
  useInkEscape,
  useInkFocusState,
  useInkKeyHandler,
  useInkKeyboardRouter,
  useInkKeybinding,
  useInkModalPriority,
  useInkVimMode,
  type InkFocusOptions,
  type InkFocusScope,
  type InkFocusState,
  type InkHandlerOptions,
  type InkKeyEvent,
  type InkKeyHandler,
  type InkKeyboardDispatchResult,
  type InkKeyboardProviderProps,
} from './focus';
export {
  buildTextInputLayout,
  reduceTextInput,
  useTextInput,
  type TextInputLayoutLine,
  type TextInputSubmitMode,
  type UseTextInputProps,
  type UseTextInputResult,
} from './text-input';
export {
  TextInput,
  type TextInputProps,
  type TextInputValidationResult,
} from './text-input-component';
export {
  Textarea,
  type TextareaProps,
} from './textarea-component';
export {
  Select,
  type SelectOption,
  type SelectProps,
} from './select-component';
export {
  Markdown,
  MarkdownTable,
  renderMarkdown,
  renderMarkdownTableLines,
  type MarkdownProps,
  type MarkdownTableAlign,
  type MarkdownTableProps,
} from './markdown-component';
export {
  ScrollBox,
  useScrollBox,
  type ScrollBoxProps,
  type ScrollBoxRange,
  type UseScrollBoxProps,
  type UseScrollBoxResult,
} from './scrollbox-component';
export {
  VirtualMessageList,
  calculateVirtualRange,
  useVirtualScroll,
  type CalculateVirtualRangeProps,
  type UseVirtualScrollProps,
  type UseVirtualScrollResult,
  type VirtualMessageListProps,
  type VirtualRange,
} from './virtual-message-list-component';
export {
  BRACKETED_PASTE_END,
  BRACKETED_PASTE_START,
  DISABLE_TERMINAL_FOCUS_REPORTING,
  ENABLE_TERMINAL_FOCUS_REPORTING,
  TERMINAL_FOCUS_IN,
  TERMINAL_FOCUS_OUT,
  createOsc52ClipboardSequence,
  normalizePastedText,
  parseBracketedPasteInput,
  parseTerminalFocusInput,
  useInkClipboard,
  useInkPaste,
  useTerminalFocus,
  writeOsc52Clipboard,
  type InkClipboardOptions,
  type InkClipboardState,
  type InkPasteOptions,
  type TerminalFocusOptions,
  type TerminalFocusState,
} from './terminal-hooks';
