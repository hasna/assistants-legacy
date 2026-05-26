import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parseSource, resolvePackagesDir } from '../src/packages/installer';

let tempDir: string;
let origAssistantsDir: string | undefined;

beforeEach(() => {
  origAssistantsDir = process.env.ASSISTANTS_DIR;
  tempDir = mkdtempSync(join(tmpdir(), 'pkg-test-'));
  process.env.ASSISTANTS_DIR = tempDir;
});

afterEach(() => {
  if (origAssistantsDir === undefined) delete process.env.ASSISTANTS_DIR;
  else process.env.ASSISTANTS_DIR = origAssistantsDir;
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── parseSource ──────────────────────────────────────────────────────────────

describe('parseSource', () => {
  test('parses npm: prefix', () => {
    const r = parseSource('npm:lodash');
    expect(r.source).toBe('npm');
    expect(r.identifier).toBe('lodash');
  });

  test('parses npm: with scoped package', () => {
    const r = parseSource('npm:@hasna/assistants');
    expect(r.source).toBe('npm');
    expect(r.identifier).toBe('@hasna/assistants');
  });

  test('parses git: prefix', () => {
    const r = parseSource('git:https://github.com/org/repo.git');
    expect(r.source).toBe('git');
    expect(r.identifier).toBe('https://github.com/org/repo.git');
  });

  test('defaults to npm for plain package name', () => {
    const r = parseSource('express');
    expect(r.source).toBe('npm');
    expect(r.identifier).toBe('express');
  });

  test('preserves version specifiers', () => {
    const r = parseSource('npm:lodash@4.17.21');
    expect(r.source).toBe('npm');
    expect(r.identifier).toBe('lodash@4.17.21');
  });
});

// ─── resolvePackagesDir ───────────────────────────────────────────────────────

describe('resolvePackagesDir', () => {
  test('global scope uses home directory', () => {
    const dir = resolvePackagesDir('global');
    expect(dir).toContain('.hasna');
    expect(dir).toContain('packages');
    expect(dir).toMatch(/\/\.hasna\/assistants\/packages$/);
  });

  test('local scope uses cwd', () => {
    const dir = resolvePackagesDir('local', '/my/project');
    expect(dir).toBe('/my/project/.assistants/packages');
  });

  test('local scope uses process.cwd() when no cwd provided', () => {
    const dir = resolvePackagesDir('local');
    expect(dir).toContain('.assistants');
    expect(dir).toContain('packages');
  });

  test('global and local return different paths', () => {
    const global = resolvePackagesDir('global');
    const local = resolvePackagesDir('local', tempDir);
    expect(global).not.toBe(local);
  });
});
