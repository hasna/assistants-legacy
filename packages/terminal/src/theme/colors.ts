/**
 * Theme-aware color palette — Dracula-inspired semantic color system.
 *
 * Dark palette: Dracula colors (#282a36 base, #f8f8f2 text)
 * Light palette: High-contrast equivalents for readability on white backgrounds.
 *
 * All components should use themeColor() instead of hardcoded color strings.
 *
 * [nero] Rewritten with full Dracula-inspired palette for OpenCode parity.
 */

import { getThemeMode } from './setup';

const DARK_PALETTE = {
  // Backgrounds
  bg: '#1e1e2e',
  surface: '#282a36',
  border: '#44475a',

  // Text
  text: '#f8f8f2',
  muted: '#6272a4',

  // Accents
  cyan: '#8be9fd',
  green: '#50fa7b',
  orange: '#ffb86c',
  pink: '#ff79c6',
  purple: '#bd93f9',
  red: '#ff5555',
  yellow: '#f1fa8c',

  // Semantic aliases (mapped to accents)
  primary: '#8be9fd',     // cyan
  success: '#50fa7b',     // green
  warning: '#f1fa8c',     // yellow
  error: '#ff5555',       // red
  accent: '#bd93f9',      // purple
  info: '#8be9fd',        // cyan
  highlight: '#ff79c6',   // pink
  prompt: '#50fa7b',      // green
};

const LIGHT_PALETTE = {
  // Backgrounds
  bg: '#fafafa',
  surface: '#f0f0f0',
  border: '#d4d4d8',

  // Text
  text: '#1a1a2e',
  muted: '#555555',

  // Accents (darker for contrast on light bg)
  cyan: '#0097a7',
  green: '#2e7d32',
  orange: '#e65100',
  pink: '#c2185b',
  purple: '#6a1b9a',
  red: '#c62828',
  yellow: '#f9a825',

  // Semantic aliases
  primary: '#0097a7',     // dark cyan
  success: '#2e7d32',     // dark green
  warning: '#f9a825',     // dark yellow
  error: '#c62828',       // dark red
  accent: '#6a1b9a',      // dark purple
  info: '#0097a7',        // dark cyan
  highlight: '#c2185b',   // dark pink
  prompt: '#2e7d32',      // dark green
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
