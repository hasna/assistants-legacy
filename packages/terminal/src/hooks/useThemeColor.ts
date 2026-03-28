import { useState, useEffect, createContext, useContext } from 'react';
import { useAppContext } from '@opentui/react';
import { getThemeFg, getThemeMode } from '../theme/setup';

/**
 * Detects terminal theme and provides appropriate default text color.
 *
 * OpenTUI defaults to white RGBA(1,1,1,1) which is invisible on light terminals.
 * The root-level fix in theme/setup.ts patches the TextRenderable default via
 * OpenTUI's extend() API. This hook provides React-level theme awareness for
 * components that need to react to theme changes (e.g., dynamic color choices).
 */

export type ThemeMode = 'dark' | 'light';

const ThemeContext = createContext<{ fg: string; mode: ThemeMode }>({
  fg: getThemeFg(),
  mode: getThemeMode(),
});

export function useThemeColor() {
  return useContext(ThemeContext);
}

export const ThemeProvider = ThemeContext.Provider;

export function useDetectTheme(): { fg: string; mode: ThemeMode } {
  const ctx = useAppContext();
  const [mode, setMode] = useState<ThemeMode>(() => {
    // Use the already-detected theme from setup (avoids duplicate detection)
    return getThemeMode();
  });

  useEffect(() => {
    const renderer = ctx.renderer;
    if (!renderer) return;

    const handler = (detectedMode: string) => {
      setMode(detectedMode === 'light' ? 'light' : 'dark');
    };

    renderer.on('theme_mode', handler);
    // Check immediately in case it was detected after initial render
    if (renderer.themeMode) {
      setMode(renderer.themeMode === 'light' ? 'light' : 'dark');
    }
    return () => {
      renderer.off('theme_mode', handler);
    };
  }, [ctx.renderer]);

  return {
    fg: mode === 'light' ? '#1a1a1a' : '#e0e0e0',
    mode,
  };
}
