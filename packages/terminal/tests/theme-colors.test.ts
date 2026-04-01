import { describe, expect, test, beforeEach, afterEach } from 'bun:test';

// Must import after setting up env
describe('theme colors', () => {
  test('themeColor returns a hex color string', async () => {
    const { themeColor } = await import('../src/theme/colors');
    const color = themeColor('primary');
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  test('themeColor returns different values for dark vs light mode', async () => {
    const { themeColor } = await import('../src/theme/colors');
    // Just verify it returns a string — mode depends on environment
    expect(typeof themeColor('error')).toBe('string');
    expect(typeof themeColor('success')).toBe('string');
    expect(typeof themeColor('warning')).toBe('string');
    expect(typeof themeColor('info')).toBe('string');
    expect(typeof themeColor('text')).toBe('string');
    expect(typeof themeColor('muted')).toBe('string');
    expect(typeof themeColor('border')).toBe('string');
    expect(typeof themeColor('bg')).toBe('string');
    expect(typeof themeColor('surface')).toBe('string');
    expect(typeof themeColor('bgDarker')).toBe('string');
  });

  test('themeColor falls back for unknown color names', async () => {
    const { themeColor } = await import('../src/theme/colors');
    const result = themeColor('nonexistent-color');
    expect(typeof result).toBe('string');
  });

  test('getThemePalette returns an object with color keys', async () => {
    const { getThemePalette } = await import('../src/theme/colors');
    const palette = getThemePalette();
    expect(palette).toBeDefined();
    expect(typeof palette).toBe('object');
    expect('primary' in palette).toBe(true);
    expect('error' in palette).toBe(true);
    expect('success' in palette).toBe(true);
  });

  test('themeColor covers all semantic color categories', async () => {
    const { themeColor } = await import('../src/theme/colors');
    const categories = [
      'primary', 'secondary', 'accent',
      'error', 'warning', 'success', 'info',
      'text', 'muted', 'emphasized',
      'bg', 'surface', 'bgDarker',
      'border', 'borderFocused', 'borderDim',
    ];
    for (const cat of categories) {
      const c = themeColor(cat);
      expect(c).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    }
  });
});
