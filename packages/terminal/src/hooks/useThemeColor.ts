import { createContext, useContext } from 'react';
import { getThemeFg, getThemeMode } from '../theme/setup';
import { useInkTheme } from '../ui/ink/theme';

/**
 * Detects terminal theme and provides appropriate default text color.
 */

export type ThemeMode = 'dark' | 'light';

const ThemeContext = createContext<{ fg: string; mode: ThemeMode } | null>(null);

export function useThemeColor() {
  const override = useContext(ThemeContext);
  const inkTheme = useInkTheme();

  return override ?? {
    fg: inkTheme.palette.text ?? getThemeFg(),
    mode: inkTheme.mode,
  };
}

export const ThemeProvider = ThemeContext.Provider;

export function useDetectTheme(): { fg: string; mode: ThemeMode } {
  const theme = useThemeColor();
  return {
    fg: theme.fg ?? getThemeFg(),
    mode: theme.mode ?? getThemeMode(),
  };
}
