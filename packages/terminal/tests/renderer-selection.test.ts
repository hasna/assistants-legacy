/**
 * Tests for renderer selection (plan P0.2 flag-gated cutover).
 */
import { describe, expect, test } from 'bun:test';
import { selectRenderer, DEFAULT_RENDERER } from '../src/renderer-selection';

describe('selectRenderer', () => {
  test('defaults to opentui when unset', () => {
    expect(selectRenderer({})).toEqual({ renderer: 'opentui', requested: 'opentui' });
    expect(DEFAULT_RENDERER).toBe('opentui');
  });

  test('explicit opentui is honored without a notice', () => {
    const r = selectRenderer({ TUI_RENDERER: 'opentui' });
    expect(r.renderer).toBe('opentui');
    expect(r.notice).toBeUndefined();
  });

  test('ink falls back to opentui with a notice (not implemented yet)', () => {
    const r = selectRenderer({ TUI_RENDERER: 'ink' });
    expect(r.renderer).toBe('opentui');
    expect(r.requested).toBe('ink');
    expect(r.notice).toContain('ink');
  });

  test('unknown value falls back to opentui with a notice', () => {
    const r = selectRenderer({ TUI_RENDERER: 'bogus' });
    expect(r.renderer).toBe('opentui');
    expect(r.notice).toContain('Unknown');
  });

  test('is case/space-insensitive', () => {
    expect(selectRenderer({ TUI_RENDERER: '  Ink ' }).requested).toBe('ink');
  });
});
