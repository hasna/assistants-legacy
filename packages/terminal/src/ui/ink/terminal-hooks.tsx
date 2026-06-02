/** @jsxImportSource react */
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePaste, useStdin, useStdout } from 'ink';

export const BRACKETED_PASTE_START = '\x1b[200~';
export const BRACKETED_PASTE_END = '\x1b[201~';
export const TERMINAL_FOCUS_IN = '\x1b[I';
export const TERMINAL_FOCUS_OUT = '\x1b[O';
export const ENABLE_TERMINAL_FOCUS_REPORTING = '\x1b[?1004h';
export const DISABLE_TERMINAL_FOCUS_REPORTING = '\x1b[?1004l';

export type InkClipboardOptions = {
  resetDelayMs?: number;
};

export type InkClipboardState = {
  copy: (text: string) => boolean;
  justCopied: boolean;
};

export type TerminalFocusOptions = {
  isActive?: boolean;
  enableReporting?: boolean;
  initialFocused?: boolean;
};

export type TerminalFocusState = {
  isFocused: boolean;
  lastEvent: 'focus' | 'blur' | null;
};

export type InkPasteOptions = {
  isActive?: boolean;
  normalize?: boolean;
};

type WritableOutput = {
  write?: (chunk: string) => unknown;
};

export function normalizePastedText(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

export function createOsc52ClipboardSequence(text: string): string {
  const encoded = Buffer.from(text, 'utf8').toString('base64');
  return `\x1b]52;c;${encoded}\x07`;
}

export function writeOsc52Clipboard(text: string, output?: WritableOutput | null): boolean {
  const sequence = createOsc52ClipboardSequence(text);
  if (!output?.write) return false;

  output.write(sequence);
  return true;
}

export function parseBracketedPasteInput(input: string): string[] {
  const pasted: string[] = [];
  let searchFrom = 0;

  while (searchFrom < input.length) {
    const start = input.indexOf(BRACKETED_PASTE_START, searchFrom);
    if (start < 0) break;

    const contentStart = start + BRACKETED_PASTE_START.length;
    const end = input.indexOf(BRACKETED_PASTE_END, contentStart);
    if (end < 0) break;

    pasted.push(normalizePastedText(input.slice(contentStart, end)));
    searchFrom = end + BRACKETED_PASTE_END.length;
  }

  return pasted;
}

export function parseTerminalFocusInput(input: string): Array<'focus' | 'blur'> {
  const events: Array<'focus' | 'blur'> = [];
  let index = 0;

  while (index < input.length) {
    const focusIn = input.indexOf(TERMINAL_FOCUS_IN, index);
    const focusOut = input.indexOf(TERMINAL_FOCUS_OUT, index);

    if (focusIn < 0 && focusOut < 0) break;
    if (focusIn >= 0 && (focusOut < 0 || focusIn < focusOut)) {
      events.push('focus');
      index = focusIn + TERMINAL_FOCUS_IN.length;
    } else {
      events.push('blur');
      index = focusOut + TERMINAL_FOCUS_OUT.length;
    }
  }

  return events;
}

export function useInkClipboard({ resetDelayMs = 1500 }: InkClipboardOptions = {}): InkClipboardState {
  const { stdout, write } = useStdout();
  const [justCopied, setJustCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const copy = useCallback((text: string): boolean => {
    const sequence = createOsc52ClipboardSequence(text);
    if (write) {
      write(sequence);
    } else if (stdout?.write) {
      stdout.write(sequence);
    } else {
      return false;
    }

    setJustCopied(true);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      setJustCopied(false);
      resetTimer.current = null;
    }, resetDelayMs);
    return true;
  }, [resetDelayMs, stdout, write]);

  return { copy, justCopied };
}

export function useInkPaste(handler: (text: string) => void, { isActive = true, normalize = true }: InkPasteOptions = {}): void {
  const handlePaste = useCallback((text: string) => {
    handler(normalize ? normalizePastedText(text) : text);
  }, [handler, normalize]);

  usePaste(handlePaste, { isActive });
}

export function useTerminalFocus({
  isActive = true,
  enableReporting = true,
  initialFocused = true,
}: TerminalFocusOptions = {}): TerminalFocusState {
  const { stdin } = useStdin();
  const { stdout, write } = useStdout();
  const [state, setState] = useState<TerminalFocusState>({
    isFocused: initialFocused,
    lastEvent: null,
  });

  useEffect(() => {
    if (!isActive) return;

    if (enableReporting) {
      if (write) write(ENABLE_TERMINAL_FOCUS_REPORTING);
      else stdout?.write?.(ENABLE_TERMINAL_FOCUS_REPORTING);
    }

    const onData = (chunk: Buffer | string) => {
      const input = String(chunk);
      for (const event of parseTerminalFocusInput(input)) {
        setState({
          isFocused: event === 'focus',
          lastEvent: event,
        });
      }
    };

    stdin.on('data', onData);
    return () => {
      stdin.off('data', onData);
      if (enableReporting) {
        if (write) write(DISABLE_TERMINAL_FOCUS_REPORTING);
        else stdout?.write?.(DISABLE_TERMINAL_FOCUS_REPORTING);
      }
    };
  }, [enableReporting, isActive, stdin, stdout, write]);

  return state;
}
