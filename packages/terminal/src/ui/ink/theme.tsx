/** @jsxImportSource react */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  THEMES,
  THEME_NAMES,
  getActiveTheme,
  themeNameMode,
  type SemanticColor,
  type ThemeName,
  type ThemeSettingName,
} from '../../theme/colors';
import { getThemeMode } from '../../theme/setup';

export type InkPalette = (typeof THEMES)[ThemeName];
export type InkColorToken = keyof InkPalette;
export type InkColorName = InkColorToken | SemanticColor | string;

const LEGACY_ALIASES: Record<string, InkColorToken> = {
  red: 'error',
  green: 'success',
  yellow: 'warning',
  orange: 'warning',
  cyan: 'info',
  blue: 'secondary',
  purple: 'accent',
};

export type InkThemeContextValue = {
  name: ThemeName;
  mode: 'dark' | 'light';
  palette: InkPalette;
  color: (name: InkColorName) => string;
  setTheme: (setting: ThemeSettingName | ThemeName) => void;
};

export function resolveInkThemeName(setting?: ThemeSettingName | ThemeName | null): ThemeName {
  if (!setting || setting === 'auto') {
    return getActiveTheme() ?? (getThemeMode() === 'light' ? 'light' : 'dark');
  }

  if ((THEME_NAMES as readonly string[]).includes(setting)) {
    return setting as ThemeName;
  }

  return getThemeMode() === 'light' ? 'light' : 'dark';
}

export function resolveInkColor(name: InkColorName, palette: InkPalette = THEMES[resolveInkThemeName()]): string {
  const token = LEGACY_ALIASES[name] ?? name;
  return (palette as Record<string, string>)[token] ?? name;
}

const InkThemeContext = createContext<InkThemeContextValue | null>(null);

export type InkThemeProviderProps = {
  initialTheme?: ThemeSettingName | ThemeName | null;
  children?: React.ReactNode;
};

export function InkThemeProvider({ initialTheme, children }: InkThemeProviderProps): React.JSX.Element {
  const [themeName, setThemeName] = useState<ThemeName>(() => resolveInkThemeName(initialTheme));
  const setTheme = useCallback((setting: ThemeSettingName | ThemeName) => {
    setThemeName(resolveInkThemeName(setting));
  }, []);

  const value = useMemo<InkThemeContextValue>(() => {
    const palette = THEMES[themeName];

    return {
      name: themeName,
      mode: themeNameMode(themeName),
      palette,
      color: (name) => resolveInkColor(name, palette),
      setTheme,
    };
  }, [setTheme, themeName]);

  return (
    <InkThemeContext.Provider value={value}>
      {children}
    </InkThemeContext.Provider>
  );
}

export const ThemeProvider = InkThemeProvider;

export function useInkTheme(): InkThemeContextValue {
  const context = useContext(InkThemeContext);
  if (!context) {
    const name = resolveInkThemeName();
    const palette = THEMES[name];

    return {
      name,
      mode: themeNameMode(name),
      palette,
      color: (colorName) => resolveInkColor(colorName, palette),
      setTheme: () => {},
    };
  }

  return context;
}

export function useInkThemeColor(name: InkColorName): string {
  return useInkTheme().color(name);
}
