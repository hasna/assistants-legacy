/**
 * Tests for the six-theme system (plan 8d98da29 P1.2 — daltonized + ansi variants).
 *
 * Verifies the theme registry is complete, variants override the hue-critical
 * tokens for accessibility, and selecting a theme by name activates the right
 * palette (honoring the dark/light mode axis).
 */
import { describe, expect, test, afterEach } from 'bun:test';
import {
  THEMES,
  THEME_NAMES,
  THEME_SETTINGS,
  type ThemeName,
  themeColor,
  getThemePalette,
  setActiveTheme,
  getActiveTheme,
  applyThemeName,
  themeNameMode,
  themeSettingLabel,
} from '../src/theme/colors';

const HEX = /^#[0-9a-fA-F]{6}$/;

// Restore a deterministic theme after each test.
afterEach(() => setActiveTheme('dark'));

describe('theme registry', () => {
  test('exposes exactly six concrete themes', () => {
    expect(THEME_NAMES.length).toBe(6);
    expect(new Set(THEME_NAMES).size).toBe(6);
    expect(THEME_SETTINGS).toEqual(['auto', ...THEME_NAMES]);
  });

  test('every theme is a complete palette with the same token set', () => {
    const darkKeys = Object.keys(THEMES.dark).sort();
    for (const name of THEME_NAMES) {
      const keys = Object.keys(THEMES[name as ThemeName]).sort();
      expect(keys).toEqual(darkKeys);
      // Core tokens must all be valid hex.
      for (const token of ['primary', 'error', 'success', 'warning', 'text', 'bg']) {
        expect((THEMES[name as ThemeName] as any)[token]).toMatch(HEX);
      }
    }
  });

  test('themeNameMode maps each theme to its dark/light base', () => {
    expect(themeNameMode('dark')).toBe('dark');
    expect(themeNameMode('light')).toBe('light');
    expect(themeNameMode('dark-daltonized')).toBe('dark');
    expect(themeNameMode('light-ansi')).toBe('light');
  });
});

describe('accessibility variants', () => {
  test('daltonized keeps the mode background but makes error≠success distinguishable', () => {
    // Background preserved from the base mode (dark stays dark).
    expect(THEMES['dark-daltonized'].bg).toBe(THEMES.dark.bg);
    // Okabe-Ito: error becomes vermillion, success bluish-green — and they differ.
    expect(THEMES['dark-daltonized'].error.toLowerCase()).toBe('#d55e00');
    expect(THEMES['dark-daltonized'].success.toLowerCase()).toBe('#009e73');
    expect(THEMES['dark-daltonized'].error).not.toBe(THEMES['dark-daltonized'].success);
    // Diff colors follow the same accessible mapping.
    expect(THEMES['dark-daltonized'].diffAdded).toBe(THEMES['dark-daltonized'].success);
    expect(THEMES['dark-daltonized'].diffRemoved).toBe(THEMES['dark-daltonized'].error);
  });

  test('ansi variant maps accents to 16-color-safe hexes while keeping mode text/bg', () => {
    expect(THEMES['dark-ansi'].bg).toBe(THEMES.dark.bg);
    expect(THEMES['light-ansi'].bg).toBe(THEMES.light.bg);
    expect(THEMES['dark-ansi'].error.toLowerCase()).toBe('#cd0000');
    expect(THEMES['dark-ansi'].success.toLowerCase()).toBe('#00cd00');
  });
});

describe('active theme selection', () => {
  test('setActiveTheme switches the palette themeColor() resolves against', () => {
    setActiveTheme('dark');
    expect(getActiveTheme()).toBe('dark');
    expect(themeColor('error')).toBe(THEMES.dark.error);

    setActiveTheme('dark-daltonized');
    expect(getActiveTheme()).toBe('dark-daltonized');
    expect(themeColor('error').toLowerCase()).toBe('#d55e00');
    // Legacy alias 'red' also routes through the active palette.
    expect(themeColor('red').toLowerCase()).toBe('#d55e00');
    expect(getThemePalette().error.toLowerCase()).toBe('#d55e00');
  });

  test('applyThemeName preserves the chosen variant on the resolved mode', () => {
    const applied = applyThemeName('dark-ansi');
    expect(applied).toBe('dark-ansi');
    expect(getActiveTheme()).toBe('dark-ansi');
    expect(themeColor('success').toLowerCase()).toBe('#00cd00');
  });

  test('themeSettingLabel renders human-readable labels', () => {
    expect(themeSettingLabel('auto')).toContain('Auto');
    expect(themeSettingLabel('dark')).toBe('Dark');
    expect(themeSettingLabel('light-daltonized')).toContain('colorblind-safe');
    expect(themeSettingLabel('dark-ansi')).toContain('16-color');
  });
});
