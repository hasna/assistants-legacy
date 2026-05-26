import { useEffect, useRef } from 'react';
import { CLEAR_SCREEN_TOKEN } from '../output/sanitize';

/**
 * Clear the terminal screen whenever `value` changes (after the first render).
 *
 * Panels that swap between layouts (e.g. a list view vs a detail view) need this:
 * OpenTUI does not always clear cells that the previous layout occupied, so the
 * old view bleeds through the new one's blank space (garbled, overlapping text).
 * Writing the clear token forces a full repaint on the transition.
 *
 * The first render is skipped — the panel mount is already cleared by the parent
 * panel transition, and clearing again would flicker.
 */
export function useClearOnChange(value: unknown): void {
  const firstRef = useRef(true);
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    process.stdout.write(CLEAR_SCREEN_TOKEN);
  }, [value]);
}
