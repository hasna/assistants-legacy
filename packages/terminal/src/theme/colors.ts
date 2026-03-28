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

import { getThemeMode } from './setup';

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
  const palette = getThemeMode() === 'light' ? LIGHT_PALETTE : DARK_PALETTE;
  return (palette as any)[resolved] ?? resolved;
}

export function getThemePalette() {
  return getThemeMode() === 'light' ? { ...LIGHT_PALETTE } : { ...DARK_PALETTE };
}
