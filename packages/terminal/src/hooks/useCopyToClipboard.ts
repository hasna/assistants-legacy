import { useCallback, useState } from 'react';
import { useInkClipboard } from '../ui/ink';

/**
 * Hook to copy text to clipboard via OSC52.
 * Returns a copy function and a "just copied" flash state.
 *
 * [brutus] Extracted from Messages.tsx to avoid circular dependencies.
 */
export function useCopyToClipboard(): { copy: (text: string) => boolean; justCopied: boolean } {
  const clipboard = useInkClipboard();
  const [justCopied, setJustCopied] = useState(false);

  const copy = useCallback(
    (text: string): boolean => {
      const ok = clipboard.copy(text);
      if (ok) {
        setJustCopied(true);
        setTimeout(() => setJustCopied(false), 1500);
      }
      return ok;
    },
    [clipboard],
  );

  return { copy, justCopied: justCopied || clipboard.justCopied };
}
