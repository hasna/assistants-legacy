/**
 * Terminal theme setup — patches OpenTUI's default text fg color based on detected theme.
 *
 * OpenTUI defaults all <text> elements to white RGBA(1,1,1,1) which is invisible on
 * light terminal themes. This module creates a themed TextRenderable subclass that
 * uses the terminal's detected theme mode to pick an appropriate default fg color,
 * then registers it as the `text` component via OpenTUI's `extend()` API.
 *
 * This is a ROOT-LEVEL fix: it changes the default for ALL <text> elements without
 * requiring modifications to any individual component file.
 */

import { TextRenderable, RGBA, type ThemeMode } from '@opentui/core';
import type { CliRenderer } from '@opentui/core';
import { extend } from '@opentui/react';

// [cassius] Theme-aware default fg colors
const DARK_FG = '#e0e0e0';  // Light gray on dark backgrounds
const LIGHT_FG = '#1a1a1a'; // Near-black on light backgrounds

/** Shared mutable state — the current default fg for text elements. */
let currentDefaultFg: string = DARK_FG;

/**
 * Detect the initial theme mode from env vars before the renderer is ready.
 * Returns 'light' or 'dark'.
 */
function detectThemeFromEnv(): ThemeMode {
  // COLORFGBG is set by many terminals (xterm, iTerm2, etc.)
  const colorFgBg = process.env.COLORFGBG;
  if (colorFgBg) {
    const parts = colorFgBg.split(';');
    const bg = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(bg) && bg > 8) return 'light';
  }
  // Explicit env var override
  if (process.env.TERMINAL_THEME === 'light') return 'light';
  // macOS: check for light appearance
  if (process.env.TERM_PROGRAM === 'Apple_Terminal') {
    // Apple Terminal defaults to light; check if dark scheme is set
    if (!process.env.COLORFGBG) return 'light';
  }
  return 'dark';
}

/**
 * A TextRenderable subclass that uses a theme-aware default fg color.
 *
 * Instead of hardcoding white, it reads the current theme fg from the
 * shared `currentDefaultFg` variable at construction time. When the
 * JSX `<text>` element provides an explicit `fg` prop, that takes
 * precedence (handled by the parent constructor).
 */
class ThemedTextRenderable extends TextRenderable {
  constructor(ctx: any, options: any) {
    // If no explicit fg was provided, inject the themed default
    if (options.fg === undefined || options.fg === null) {
      super(ctx, { ...options, fg: currentDefaultFg });
    } else {
      super(ctx, options);
    }
  }
}

/**
 * Initialize theme-aware text rendering.
 *
 * Call this BEFORE `root.render()` so the themed TextRenderable is
 * registered before any React elements are created.
 *
 * @param renderer - The CliRenderer instance (used to detect theme and listen for changes)
 */
export function setupThemeDefaults(renderer: CliRenderer): void {
  // 1. Detect initial theme
  const envTheme = detectThemeFromEnv();
  const rendererTheme = renderer.themeMode;
  const initialMode = rendererTheme ?? envTheme;
  currentDefaultFg = initialMode === 'light' ? LIGHT_FG : DARK_FG;

  // 2. Register our themed text renderable, replacing the default
  extend({ text: ThemedTextRenderable as any });

  // 3. Listen for runtime theme changes (e.g., user switches OS dark/light mode)
  renderer.on('theme_mode', (mode: ThemeMode) => {
    currentDefaultFg = mode === 'light' ? LIGHT_FG : DARK_FG;
    // Note: existing TextRenderable instances keep their construction-time fg.
    // New instances created after this point will use the updated default.
    // For a full live-switch, a re-render of the component tree is needed.
    // OpenTUI's React reconciler will create new instances on re-render.
  });
}

/**
 * Get the current theme-appropriate fg color (for use outside React components).
 */
export function getThemeFg(): string {
  return currentDefaultFg;
}

/**
 * Get the current theme mode.
 */
export function getThemeMode(): ThemeMode {
  return currentDefaultFg === LIGHT_FG ? 'light' : 'dark';
}
