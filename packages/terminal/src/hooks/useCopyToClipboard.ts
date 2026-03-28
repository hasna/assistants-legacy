import { useCallback, useState } from 'react';
import { useAppContext } from '@opentui/react';

/**
 * Hook to copy text to clipboard via OSC52.
 * Returns a copy function and a "just copied" flash state.
 *
 * [brutus] Extracted from Messages.tsx to avoid circular dependencies.
 */
export function useCopyToClipboard(): { copy: (text: string) => boolean; justCopied: boolean } {
  const { renderer } = useAppContext();
  const [justCopied, setJustCopied] = useState(false);

  const copy = useCallback(
    (text: string): boolean => {
      if (!renderer) return false;
      const ok = renderer.copyToClipboardOSC52(text);
      if (ok) {
        setJustCopied(true);
        setTimeout(() => setJustCopied(false), 1500);
      }
      return ok;
    },
    [renderer],
  );

  return { copy, justCopied };
}
