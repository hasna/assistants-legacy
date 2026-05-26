/**
 * Theme-aware color palette — copied EXACTLY from OpenCode's opencode.go theme.
 * Source: /Users/hasna/Workspace/hasnaxyz/community/community-opencode/internal/tui/theme/opencode.go
 *
 * Uses AdaptiveColor pattern: different hex values for dark vs light terminals.
 *
 * Color categories (from spec section 11.3):
 *   Base:       Primary, Secondary, Accent
 *   Status:     Error, Warning, Success, Info
 *   Text:       Text, TextMuted, TextEmphasized
 *   Background: Background, BackgroundSecondary, BackgroundDarker
 *   Border:     BorderNormal, BorderFocused, BorderDim
 *   Diff:       DiffAdded, DiffRemoved, DiffContext, DiffHunkHeader, DiffHighlightAdded,
 *               DiffHighlightRemoved, DiffAddedBg, DiffRemovedBg, DiffContextBg,
 *               DiffLineNumber, DiffAddedLineNumberBg, DiffRemovedLineNumberBg
 *   Markdown:   MarkdownText, MarkdownHeading, MarkdownLink, MarkdownLinkText, MarkdownCode,
 *               MarkdownBlockQuote, MarkdownEmph, MarkdownStrong, MarkdownHorizontalRule,
 *               MarkdownListItem, MarkdownListEnumeration, MarkdownImage, MarkdownImageText,
 *               MarkdownCodeBlock
 *   Syntax:     SyntaxComment, SyntaxKeyword, SyntaxFunction, SyntaxVariable, SyntaxString,
 *               SyntaxNumber, SyntaxType, SyntaxOperator, SyntaxPunctuation
 */

import { getThemeMode, applyThemeSetting } from './setup';

// ─── OpenCode Dark Mode (spec section 11.4) ────────────────────────────────

const DARK_PALETTE = {
  // Base colors
  primary: '#fab283',           // orange/gold
  secondary: '#5c9cf5',         // blue
  accent: '#9d7cd8',            // purple

  // Status colors
  error: '#e06c75',
  warning: '#f5a742',
  success: '#7fd88f',
  info: '#56b6c2',

  // Text colors
  text: '#e0e0e0',
  muted: '#6a6a6a',             // TextMuted
  emphasized: '#e5c07b',        // TextEmphasized (yellow)

  // Background colors
  bg: '#212121',                // Background
  surface: '#252525',           // BackgroundSecondary
  bgDarker: '#121212',          // BackgroundDarker

  // Border colors
  border: '#4b4c5c',            // BorderNormal
  borderFocused: '#fab283',     // BorderFocused (= Primary)
  borderDim: '#303030',         // BorderDim

  // Diff colors
  diffAdded: '#478247',
  diffRemoved: '#7C4444',
  diffContext: '#a0a0a0',
  diffHunkHeader: '#a0a0a0',
  diffHighlightAdded: '#DAFADA',
  diffHighlightRemoved: '#FADADD',
  diffAddedBg: '#303A30',
  diffRemovedBg: '#3A3030',
  diffContextBg: '#212121',     // = Background
  diffLineNumber: '#888888',
  diffAddedLineNumberBg: '#293229',
  diffRemovedLineNumberBg: '#332929',

  // Markdown colors (derived from base palette, matching OpenCode defaults)
  markdownText: '#e0e0e0',
  markdownHeading: '#fab283',
  markdownLink: '#5c9cf5',
  markdownLinkText: '#5c9cf5',
  markdownCode: '#e5c07b',
  markdownBlockQuote: '#6a6a6a',
  markdownEmph: '#9d7cd8',
  markdownStrong: '#e0e0e0',
  markdownHorizontalRule: '#4b4c5c',
  markdownListItem: '#fab283',
  markdownListEnumeration: '#fab283',
  markdownImage: '#5c9cf5',
  markdownImageText: '#5c9cf5',
  markdownCodeBlock: '#252525',

  // Syntax colors (derived from theme palette)
  syntaxComment: '#6a6a6a',
  syntaxKeyword: '#9d7cd8',
  syntaxFunction: '#5c9cf5',
  syntaxVariable: '#e0e0e0',
  syntaxString: '#7fd88f',
  syntaxNumber: '#f5a742',
  syntaxType: '#fab283',
  syntaxOperator: '#e5c07b',
  syntaxPunctuation: '#6a6a6a',

  // Semantic aliases (backward compat)
  prompt: '#5c9cf5',
  highlight: '#9d7cd8',
  selection: '#303030',
};

// ─── OpenCode Light Mode (spec section 11.4) ───────────────────────────────

const LIGHT_PALETTE = {
  // Base colors
  primary: '#3b7dd8',           // blue
  secondary: '#7b5bb6',         // purple
  accent: '#d68c27',            // orange/gold

  // Status colors
  error: '#d1383d',
  warning: '#d68c27',
  success: '#3d9a57',
  info: '#318795',

  // Text colors
  text: '#2a2a2a',
  muted: '#8a8a8a',             // TextMuted
  emphasized: '#b0851f',        // TextEmphasized

  // Background colors
  bg: '#f8f8f8',                // Background
  surface: '#f0f0f0',           // BackgroundSecondary
  bgDarker: '#ffffff',          // BackgroundDarker

  // Border colors
  border: '#d3d3d3',            // BorderNormal
  borderFocused: '#3b7dd8',     // BorderFocused (= Primary)
  borderDim: '#e5e5e6',         // BorderDim

  // Diff colors
  diffAdded: '#2E7D32',
  diffRemoved: '#C62828',
  diffContext: '#757575',
  diffHunkHeader: '#757575',
  diffHighlightAdded: '#A5D6A7',
  diffHighlightRemoved: '#EF9A9A',
  diffAddedBg: '#E8F5E9',
  diffRemovedBg: '#FFEBEE',
  diffContextBg: '#f8f8f8',     // = Background
  diffLineNumber: '#9E9E9E',
  diffAddedLineNumberBg: '#C8E6C9',
  diffRemovedLineNumberBg: '#FFCDD2',

  // Markdown colors (derived from base palette, matching OpenCode defaults)
  markdownText: '#2a2a2a',
  markdownHeading: '#3b7dd8',
  markdownLink: '#7b5bb6',
  markdownLinkText: '#7b5bb6',
  markdownCode: '#b0851f',
  markdownBlockQuote: '#8a8a8a',
  markdownEmph: '#d68c27',
  markdownStrong: '#2a2a2a',
  markdownHorizontalRule: '#d3d3d3',
  markdownListItem: '#3b7dd8',
  markdownListEnumeration: '#3b7dd8',
  markdownImage: '#7b5bb6',
  markdownImageText: '#7b5bb6',
  markdownCodeBlock: '#f0f0f0',

  // Syntax colors (derived from theme palette)
  syntaxComment: '#8a8a8a',
  syntaxKeyword: '#7b5bb6',
  syntaxFunction: '#3b7dd8',
  syntaxVariable: '#2a2a2a',
  syntaxString: '#3d9a57',
  syntaxNumber: '#d68c27',
  syntaxType: '#3b7dd8',
  syntaxOperator: '#b0851f',
  syntaxPunctuation: '#8a8a8a',

  // Semantic aliases (backward compat)
  prompt: '#7b5bb6',
  highlight: '#d68c27',
  selection: '#e5e5e6',
};

// ─── Theme variants: six themes via mode × variant (plan 8d98da29 P1.2) ─────
//
// The default palettes above are tuned for full-color terminals. Two extra
// variants make the UI accessible without hand-maintaining four more 70-token
// tables: each derives from the mode base and overrides only the hue-critical
// semantic tokens.
//
//  • daltonized — colorblind-safe (Okabe-Ito palette). Red/green become
//    vermillion/bluish-green so deuteranopes/protanopes can still tell
//    error from success and diff-added from diff-removed.
//  • ansi — the 16 standard ANSI colors (xterm hex), so the theme reads well
//    on low-color terminals and respects a user's terminal palette intent.

type Palette = typeof DARK_PALETTE;

/** Okabe-Ito colorblind-safe overrides — valid against both dark and light bases. */
const DALTONIZED_OVERRIDES: Partial<Palette> = {
  primary: '#0072B2', // blue
  secondary: '#56B4E9', // sky blue
  accent: '#CC79A7', // reddish purple
  error: '#D55E00', // vermillion — distinct from success even with no red perception
  warning: '#E69F00', // orange
  success: '#009E73', // bluish green
  info: '#56B4E9',
  emphasized: '#F0E442', // yellow
  borderFocused: '#0072B2',
  diffAdded: '#009E73',
  diffRemoved: '#D55E00',
  diffHighlightAdded: '#009E73',
  diffHighlightRemoved: '#D55E00',
  syntaxKeyword: '#CC79A7',
  syntaxFunction: '#56B4E9',
  syntaxString: '#009E73',
  syntaxNumber: '#E69F00',
  syntaxType: '#0072B2',
  markdownHeading: '#0072B2',
  markdownLink: '#56B4E9',
  markdownLinkText: '#56B4E9',
  markdownEmph: '#CC79A7',
  markdownListItem: '#0072B2',
  markdownListEnumeration: '#0072B2',
  prompt: '#56B4E9',
  highlight: '#CC79A7',
};

/** Standard ANSI (xterm) overrides — keeps each mode's text/bg, swaps accents to 16-color-safe hexes. */
const ANSI_OVERRIDES: Partial<Palette> = {
  primary: '#0000ee', // blue
  secondary: '#00cdcd', // cyan
  accent: '#cd00cd', // magenta
  error: '#cd0000', // red
  warning: '#cdcd00', // yellow
  success: '#00cd00', // green
  info: '#00cdcd', // cyan
  borderFocused: '#0000ee',
  diffAdded: '#00cd00',
  diffRemoved: '#cd0000',
  diffHighlightAdded: '#00ff00',
  diffHighlightRemoved: '#ff0000',
  syntaxComment: '#7f7f7f',
  syntaxKeyword: '#cd00cd',
  syntaxFunction: '#0000ee',
  syntaxString: '#00cd00',
  syntaxNumber: '#cdcd00',
  syntaxType: '#00cdcd',
  markdownHeading: '#0000ee',
  markdownLink: '#00cdcd',
  markdownLinkText: '#00cdcd',
  markdownEmph: '#cd00cd',
  markdownListItem: '#0000ee',
  markdownListEnumeration: '#0000ee',
  prompt: '#00cdcd',
  highlight: '#cd00cd',
};

/** The six concrete theme names: mode × variant. */
export const THEME_NAMES = [
  'dark',
  'light',
  'dark-daltonized',
  'light-daltonized',
  'dark-ansi',
  'light-ansi',
] as const;

export type ThemeName = (typeof THEME_NAMES)[number];

/** A persisted theme choice: a concrete theme name, or 'auto' to detect mode. */
export const THEME_SETTINGS = ['auto', ...THEME_NAMES] as const;
export type ThemeSettingName = (typeof THEME_SETTINGS)[number];

/** Registry of all six palettes, built once from the two bases + variant overrides. */
export const THEMES: Record<ThemeName, Palette> = {
  'dark': DARK_PALETTE,
  'light': LIGHT_PALETTE,
  'dark-daltonized': { ...DARK_PALETTE, ...DALTONIZED_OVERRIDES },
  'light-daltonized': { ...LIGHT_PALETTE, ...DALTONIZED_OVERRIDES },
  'dark-ansi': { ...DARK_PALETTE, ...ANSI_OVERRIDES },
  'light-ansi': { ...LIGHT_PALETTE, ...ANSI_OVERRIDES },
};

/** Extract the mode ('dark' | 'light') a theme name is built on. */
export function themeNameMode(name: ThemeName): 'dark' | 'light' {
  return name.startsWith('light') ? 'light' : 'dark';
}

/** Human-readable label for a theme setting, used by the /theme picker. */
export function themeSettingLabel(setting: ThemeSettingName): string {
  if (setting === 'auto') return 'Auto (match terminal)';
  const mode = themeNameMode(setting);
  const variant = setting.endsWith('-daltonized')
    ? ' · colorblind-safe'
    : setting.endsWith('-ansi')
      ? ' · 16-color'
      : '';
  return `${mode[0].toUpperCase()}${mode.slice(1)}${variant}`;
}

// Active theme name — defaults to the detected mode's plain variant. The /theme
// command and startup resolution update this via setActiveTheme().
let activeThemeName: ThemeName | null = null;

/** Set the active theme by name (one of THEME_NAMES). */
export function setActiveTheme(name: ThemeName): void {
  activeThemeName = name;
}

/** The currently active theme name, falling back to the detected mode's plain variant. */
export function getActiveTheme(): ThemeName {
  return activeThemeName ?? (getThemeMode() === 'light' ? 'light' : 'dark');
}

/** The currently active palette (all ~70 resolved tokens). */
function getActivePalette(): Palette {
  return THEMES[getActiveTheme()];
}

/** The variant suffix of a theme setting ('' | '-daltonized' | '-ansi'). */
function variantSuffix(setting: ThemeSettingName): '' | '-daltonized' | '-ansi' {
  if (setting.endsWith('-daltonized')) return '-daltonized';
  if (setting.endsWith('-ansi')) return '-ansi';
  return '';
}

/**
 * Apply a full theme setting (one of THEME_SETTINGS). Resolves the concrete mode
 * via the existing fg/detection machinery — so an explicit HASNA_THEME override
 * still wins for the dark/light axis — while preserving the chosen variant, then
 * activates the matching palette. Returns the concrete theme name applied.
 *
 * This is the single entry point the /theme picker and startup should call.
 */
export function applyThemeName(setting: ThemeSettingName): ThemeName {
  const requestedMode = setting === 'auto' ? 'auto' : themeNameMode(setting);
  const mode = applyThemeSetting(requestedMode);
  const variant = setting === 'auto' ? '' : variantSuffix(setting);
  const name = `${mode}${variant}` as ThemeName;
  setActiveTheme(name);
  return name;
}

export type SemanticColor = keyof typeof DARK_PALETTE;

/**
 * Resolve a semantic color name to its current hex value.
 *
 * For backward compatibility with older component code that used raw color
 * names like themeColor('red'), themeColor('green'), etc., this function
 * maps those to the correct semantic equivalents. New code should always
 * use the proper semantic names (error, success, warning, etc.).
 */
export function themeColor(name: SemanticColor | string): string {
  // Legacy name aliases — map raw color words to semantic slots
  const LEGACY_ALIASES: Record<string, SemanticColor> = {
    red: 'error',
    green: 'success',
    yellow: 'warning',
    orange: 'warning',
    cyan: 'info',
    blue: 'secondary',
    purple: 'accent',
  };
  const resolved = LEGACY_ALIASES[name] ?? name;
  const palette = getActivePalette();
  return (palette as any)[resolved] ?? resolved;
}

export function getThemePalette() {
  return { ...getActivePalette() };
}
