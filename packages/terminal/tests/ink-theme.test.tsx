import React from 'react';
import { describe, expect, test } from 'bun:test';
import {
  InkThemeProvider,
  Text,
  renderToString,
  resolveInkColor,
  resolveInkThemeName,
  useInkTheme,
  useInkThemeColor,
} from '../src/ui/ink';

function ThemeProbe() {
  const theme = useInkTheme();
  const error = useInkThemeColor('red');

  return (
    <Text>
      {theme.name}:{theme.mode}:{theme.color('text')}:{error}
    </Text>
  );
}

describe('Ink theme provider', () => {
  test('resolves concrete theme settings', () => {
    expect(resolveInkThemeName('dark')).toBe('dark');
    expect(resolveInkThemeName('light-daltonized')).toBe('light-daltonized');
  });

  test('maps semantic and legacy color tokens through a palette', () => {
    expect(resolveInkColor('red', {
      error: '#error',
      text: '#text',
    } as any)).toBe('#error');
    expect(resolveInkColor('text', {
      error: '#error',
      text: '#text',
    } as any)).toBe('#text');
    expect(resolveInkColor('#123456', {
      error: '#error',
      text: '#text',
    } as any)).toBe('#123456');
  });

  test('provides theme name, mode, and token resolver to Ink components', () => {
    const output = renderToString(
      <InkThemeProvider initialTheme="light-ansi">
        <ThemeProbe />
      </InkThemeProvider>,
    );

    expect(output).toContain('light-ansi:light:');
  });
});
