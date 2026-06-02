import type { TerminalRendererHandle, TerminalThemeMode } from '../types/terminal-controls';

const DARK_FG = '#e0e0e0';
const LIGHT_FG = '#2a2a2a';

let currentThemeMode: TerminalThemeMode = 'dark';
let currentDefaultFg: string = DARK_FG;

export type ThemeSetting = 'auto' | TerminalThemeMode;

function setThemeMode(mode: TerminalThemeMode): TerminalThemeMode {
  currentThemeMode = mode;
  currentDefaultFg = mode === 'light' ? LIGHT_FG : DARK_FG;
  return mode;
}

/**
 * An explicit, authoritative theme choice from the environment.
 *
 * Accepted via HASNA_THEME or HASNA_ASSISTANTS_THEME = 'dark' | 'light'.
 * 'auto' or any other value means "no override, detect normally".
 */
export function explicitThemeOverride(): TerminalThemeMode | null {
  const raw = (process.env.HASNA_THEME ?? process.env.HASNA_ASSISTANTS_THEME ?? '').trim().toLowerCase();
  if (raw === 'dark' || raw === 'light') return raw;
  return null;
}

function detectThemeFromEnv(): TerminalThemeMode {
  const forced = explicitThemeOverride();
  if (forced) return forced;

  const colorFgBg = process.env.COLORFGBG;
  if (colorFgBg) {
    const parts = colorFgBg.split(';');
    const bg = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(bg) && bg > 8) return 'light';
  }

  if (process.env.TERMINAL_THEME === 'light') return 'light';
  if (process.env.TERMINAL_THEME === 'dark') return 'dark';

  if (process.env.TERM_PROGRAM === 'Apple_Terminal' && !process.env.COLORFGBG) {
    return 'light';
  }

  return 'dark';
}

function resolveThemeMode(
  setting: ThemeSetting | null | undefined,
  rendererMode?: TerminalThemeMode | null,
): TerminalThemeMode {
  const forced = explicitThemeOverride();
  if (forced) return forced;
  if (setting && setting !== 'auto') return setting;
  if (rendererMode) return rendererMode;
  return detectThemeFromEnv();
}

/**
 * Resolve a theme setting to a concrete mode and apply it globally.
 *
 * Precedence: explicit HASNA_THEME env override > the given concrete setting >
 * terminal/env detection. Returns the resolved concrete mode.
 */
export function applyThemeSetting(setting: ThemeSetting | null | undefined): TerminalThemeMode {
  return setThemeMode(resolveThemeMode(setting));
}

/**
 * Initialize Ink theme defaults.
 *
 * The upstream Ink renderer does not need runtime component patching. This
 * bootstrap only resolves the initial mode and mirrors later terminal theme
 * events into the shared theme state used by the palette helpers.
 */
export async function setupThemeDefaults(
  renderer: TerminalRendererHandle | null | undefined,
  persistedSetting?: ThemeSetting,
): Promise<void> {
  setThemeMode(resolveThemeMode(persistedSetting, renderer?.themeMode));

  if (!renderer || explicitThemeOverride()) return;

  renderer.on('theme_mode', (mode: TerminalThemeMode) => {
    setThemeMode(mode === 'light' ? 'light' : 'dark');
  });
}

export function getThemeFg(): string {
  return currentDefaultFg;
}

export function getThemeMode(): TerminalThemeMode {
  return currentThemeMode;
}
