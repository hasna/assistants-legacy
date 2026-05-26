/**
 * Design-system color helper (plan 8d98da29 P2.1).
 *
 * Re-exports the theme token resolver under the conventional `color()` name and
 * the semantic token type, so design-system primitives (and, later, panels in
 * P2.2) reference colors by token rather than hardcoding hex values. Resolution
 * always goes through the active theme — see theme/colors.ts.
 */
import { themeColor, type SemanticColor } from '../../theme/colors';

export type { SemanticColor };

/** A color is either a semantic theme token (resolved live) or a raw value. */
export type ColorValue = SemanticColor | string;

/**
 * Resolve a color token to its current hex value. Raw hex/rgb/ansi values pass
 * through unchanged; known token names resolve against the active theme.
 */
export function color(value: ColorValue): string {
  return themeColor(value);
}
