/**
 * Regression tests for explicit theme override.
 *
 * Bug: on terminals that don't answer the OSC 11 background query (ttyd, some
 * CI PTYs), renderer probes can report 'light' on a dark terminal, making the
 * light-palette text invisible. HASNA_THEME gives users an authoritative
 * override that wins over all detection.
 */
import { describe, expect, test, afterEach } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  explicitThemeOverride,
  applyThemeSetting,
  getThemeFg,
  getThemeMode,
  setupThemeDefaults,
} from '../src/theme/setup';

const KEYS = ['HASNA_THEME', 'HASNA_ASSISTANTS_THEME'] as const;
function clear() {
  for (const k of KEYS) delete process.env[k];
}
afterEach(clear);

describe('explicitThemeOverride', () => {
  test('returns null when unset', () => {
    clear();
    expect(explicitThemeOverride()).toBeNull();
  });

  test('HASNA_THEME=dark forces dark', () => {
    clear();
    process.env.HASNA_THEME = 'dark';
    expect(explicitThemeOverride()).toBe('dark');
  });

  test('HASNA_THEME=light forces light (case/space insensitive)', () => {
    clear();
    process.env.HASNA_THEME = '  Light ';
    expect(explicitThemeOverride()).toBe('light');
  });

  test("'auto' or junk means no override", () => {
    clear();
    process.env.HASNA_THEME = 'auto';
    expect(explicitThemeOverride()).toBeNull();
    process.env.HASNA_THEME = 'banana';
    expect(explicitThemeOverride()).toBeNull();
  });

  test('HASNA_ASSISTANTS_THEME is honored as a fallback alias', () => {
    clear();
    process.env.HASNA_ASSISTANTS_THEME = 'dark';
    expect(explicitThemeOverride()).toBe('dark');
  });

  test('HASNA_THEME takes precedence over the alias', () => {
    clear();
    process.env.HASNA_THEME = 'light';
    process.env.HASNA_ASSISTANTS_THEME = 'dark';
    expect(explicitThemeOverride()).toBe('light');
  });
});

describe('applyThemeSetting (used by /theme)', () => {
  test('concrete settings apply and are reflected by getThemeMode', () => {
    clear();
    expect(applyThemeSetting('dark')).toBe('dark');
    expect(getThemeMode()).toBe('dark');
    expect(applyThemeSetting('light')).toBe('light');
    expect(getThemeMode()).toBe('light');
  });

  test("'auto' resolves via detection (dark by default, no env hints)", () => {
    clear();
    delete process.env.COLORFGBG;
    delete process.env.TERMINAL_THEME;
    expect(applyThemeSetting('auto')).toBe('dark');
  });

  test('HASNA_THEME override beats the requested setting', () => {
    clear();
    process.env.HASNA_THEME = 'light';
    expect(applyThemeSetting('dark')).toBe('light');
    expect(getThemeMode()).toBe('light');
  });
});

describe('Ink theme bootstrap', () => {
  const retiredPackageScope = ['@open', 'tui'].join('');
  const retiredRenderableMarker = ['Text', 'Renderable'].join('');
  const retiredColorType = ['R', 'G', 'B', 'A'].join('');

  test('theme setup has no renderer-specific imports or patching', () => {
    const source = readFileSync(join(import.meta.dir, '../src/theme/setup.ts'), 'utf8');

    expect(source).not.toContain(retiredPackageScope);
    expect(source).not.toContain(retiredRenderableMarker);
    expect(source).not.toContain('extend(');
    expect(source).not.toContain(retiredColorType);
  });

  test('setupThemeDefaults accepts renderer mode without importing renderer internals', async () => {
    clear();
    const handlers: Array<(mode: 'dark' | 'light') => void> = [];
    await setupThemeDefaults({
      themeMode: 'light',
      destroy: () => {},
      on: (event, handler) => {
        if (event === 'theme_mode') handlers.push(handler);
      },
    });

    expect(getThemeMode()).toBe('light');
    expect(getThemeFg()).toBe('#2a2a2a');

    handlers[0]?.('dark');
    expect(getThemeMode()).toBe('dark');
    expect(getThemeFg()).toBe('#e0e0e0');
  });
});
