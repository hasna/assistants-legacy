/**
 * Theme-aware color palette — maps semantic color names to hex values
 * based on the detected terminal theme (light vs dark).
 *
 * On dark terminals, colors like cyan/green/yellow are fine.
 * On light terminals, those same colors are nearly invisible on white backgrounds.
 * This module provides darker variants for light themes.
 *
 * [cassius] Created for light-theme contrast fix.
 */

import { getThemeMode } from './setup';

const DARK_PALETTE = {
  primary: '#61dafb',    // cyan-ish
  success: '#50fa7b',    // green
  warning: '#f1fa8c',    // yellow
  error: '#ff5555',      // red
  muted: '#6272a4',      // gray
  accent: '#bd93f9',     // purple
  info: '#8be9fd',       // light blue
  highlight: '#ff79c6',  // pink
  prompt: '#50fa7b',     // green for > prompt
  border: '#44475a',     // dark gray
};

const LIGHT_PALETTE = {
  primary: '#0077b6',    // darker cyan
  success: '#2d6a4f',    // darker green
  warning: '#b8860b',    // dark goldenrod
  error: '#d00000',      // dark red
  muted: '#555555',      // medium gray
  accent: '#6a0dad',     // dark purple
  info: '#0077b6',       // dark blue
  highlight: '#c71585',  // dark pink
  prompt: '#2d6a4f',     // dark green for > prompt
  border: '#cccccc',     // light gray
};

export type SemanticColor = keyof typeof DARK_PALETTE;

/**
 * Get a theme-appropriate color for a semantic color name.
 * Call at render time — reads the current theme mode.
 */
export function themeColor(name: SemanticColor): string {
  return getThemeMode() === 'light' ? LIGHT_PALETTE[name] : DARK_PALETTE[name];
}

/**
 * Get the full palette object for the current theme.
 * Useful when you need multiple colors at once.
 */
export function getThemePalette() {
  return getThemeMode() === 'light' ? { ...LIGHT_PALETTE } : { ...DARK_PALETTE };
}
