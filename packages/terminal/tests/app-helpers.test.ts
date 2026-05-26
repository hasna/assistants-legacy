/**
 * Tests for the pure helpers in appHelpers.ts (plan P6 — test parity).
 */
import { describe, expect, test } from 'bun:test';
import {
  extractJsonObject,
  normalizeAllowedTools,
  formatShellResult,
  formatElapsedDuration,
  deepMerge,
} from '../src/components/appHelpers';

describe('extractJsonObject', () => {
  test('extracts the outermost object from surrounding text', () => {
    expect(extractJsonObject('prefix {"a":1} suffix')).toBe('{"a":1}');
  });
  test('spans from first { to last }', () => {
    expect(extractJsonObject('x {"a":{"b":2}} y')).toBe('{"a":{"b":2}}');
  });
  test('returns null when there is no object', () => {
    expect(extractJsonObject('no braces here')).toBeNull();
    expect(extractJsonObject('}{')).toBeNull(); // end before start
    expect(extractJsonObject('')).toBeNull();
  });
});

describe('normalizeAllowedTools', () => {
  test('splits a comma string into trimmed tool names', () => {
    expect(normalizeAllowedTools('read, write , bash')).toEqual(['read', 'write', 'bash']);
  });
  test('normalizes an array, trimming and dropping empties', () => {
    expect(normalizeAllowedTools(['read', ' ', 'bash'])).toEqual(['read', 'bash']);
  });
  test('returns undefined for empty/falsy/unknown input', () => {
    expect(normalizeAllowedTools('')).toBeUndefined();
    expect(normalizeAllowedTools(null)).toBeUndefined();
    expect(normalizeAllowedTools([])).toBeUndefined();
    expect(normalizeAllowedTools('  ,  ')).toBeUndefined();
    expect(normalizeAllowedTools(42)).toBeUndefined();
  });
});

describe('formatElapsedDuration', () => {
  test('sub-second shows <1s', () => {
    expect(formatElapsedDuration(0)).toBe('<1s');
    expect(formatElapsedDuration(999)).toBe('<1s');
  });
  test('seconds under a minute', () => {
    expect(formatElapsedDuration(3000)).toBe('3s');
    expect(formatElapsedDuration(59_000)).toBe('59s');
  });
  test('minutes and seconds', () => {
    expect(formatElapsedDuration(60_000)).toBe('1m 0s');
    expect(formatElapsedDuration(125_000)).toBe('2m 5s');
  });
  test('clamps negative to <1s', () => {
    expect(formatElapsedDuration(-500)).toBe('<1s');
  });
});

describe('deepMerge', () => {
  test('overrides scalars from source', () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: 3 })).toEqual({ a: 1, b: 3 });
  });
  test('recursively merges nested objects', () => {
    expect(deepMerge({ x: { a: 1, b: 2 } }, { x: { b: 9 } } as any)).toEqual({ x: { a: 1, b: 9 } });
  });
  test('replaces arrays rather than merging them', () => {
    expect(deepMerge({ list: [1, 2, 3] } as any, { list: [4] } as any)).toEqual({ list: [4] });
  });
  test('ignores undefined source values', () => {
    expect(deepMerge({ a: 1 }, { a: undefined } as any)).toEqual({ a: 1 });
  });
  test('does not mutate the target', () => {
    const target = { a: { b: 1 } };
    deepMerge(target, { a: { b: 2 } } as any);
    expect(target).toEqual({ a: { b: 1 } });
  });
});

describe('formatShellResult', () => {
  test('includes command, exit code, and stdout', () => {
    const out = formatShellResult('ls -la', { exitCode: 0, stdout: 'file.txt', stderr: '', truncated: false });
    expect(out).toContain('$ ls -la');
    expect(out).toContain('Exit code: 0');
    expect(out).toContain('file.txt');
  });
  test('marks empty stdout and includes stderr when present', () => {
    const out = formatShellResult('boom', { exitCode: 1, stdout: '', stderr: 'oops', truncated: false });
    expect(out).toContain('STDOUT: (empty)');
    expect(out).toContain('STDERR:');
    expect(out).toContain('oops');
  });
  test('notes truncation', () => {
    const out = formatShellResult('cat big', { exitCode: 0, stdout: 'x', stderr: '', truncated: true });
    expect(out).toContain('truncated');
  });
});
