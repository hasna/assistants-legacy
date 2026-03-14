import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { atomicWriteFileSync, atomicWriteJsonSync, atomicWriteFile } from '../src/utils/atomic-write';
import { fetchWithTimeout } from '../src/utils/fetch-with-timeout';
import { ToolExecutionError } from '../src/errors';
import { ErrorCodes } from '../src/errors';

let tempDir: string;
beforeEach(() => { tempDir = mkdtempSync(join(tmpdir(), 'utils-test-')); });
afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

// ─── atomicWriteFileSync ──────────────────────────────────────────────────────

describe('atomicWriteFileSync', () => {
  test('writes content to file', () => {
    const path = join(tempDir, 'out.txt');
    atomicWriteFileSync(path, 'hello world');
    expect(readFileSync(path, 'utf-8')).toBe('hello world');
  });

  test('overwrites existing file atomically', () => {
    const path = join(tempDir, 'over.txt');
    atomicWriteFileSync(path, 'first');
    atomicWriteFileSync(path, 'second');
    expect(readFileSync(path, 'utf-8')).toBe('second');
  });

  test('does not leave .tmp file on success', () => {
    const path = join(tempDir, 'clean.txt');
    atomicWriteFileSync(path, 'data');
    expect(existsSync(`${path}.${process.pid}.tmp`)).toBe(false);
  });

  test('writes empty string', () => {
    const path = join(tempDir, 'empty.txt');
    atomicWriteFileSync(path, '');
    expect(readFileSync(path, 'utf-8')).toBe('');
  });
});

// ─── atomicWriteJsonSync ─────────────────────────────────────────────────────

describe('atomicWriteJsonSync', () => {
  test('writes valid JSON', () => {
    const path = join(tempDir, 'data.json');
    atomicWriteJsonSync(path, { key: 'value', arr: [1, 2, 3] });
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    expect(parsed.key).toBe('value');
    expect(parsed.arr).toEqual([1, 2, 3]);
  });

  test('uses 2-space indent by default', () => {
    const path = join(tempDir, 'indented.json');
    atomicWriteJsonSync(path, { a: 1 });
    expect(readFileSync(path, 'utf-8')).toContain('  "a"');
  });

  test('accepts custom indent', () => {
    const path = join(tempDir, 'tab.json');
    atomicWriteJsonSync(path, { a: 1 }, 4);
    expect(readFileSync(path, 'utf-8')).toContain('    "a"');
  });

  test('writes arrays', () => {
    const path = join(tempDir, 'arr.json');
    atomicWriteJsonSync(path, [1, 2, 3]);
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    expect(parsed).toEqual([1, 2, 3]);
  });
});

// ─── atomicWriteFile (async) ─────────────────────────────────────────────────

describe('atomicWriteFile', () => {
  test('writes content to file', async () => {
    const path = join(tempDir, 'async.txt');
    await atomicWriteFile(path, 'async content');
    expect(readFileSync(path, 'utf-8')).toBe('async content');
  });

  test('does not leave .tmp file on success', async () => {
    const path = join(tempDir, 'async-clean.txt');
    await atomicWriteFile(path, 'data');
    expect(existsSync(`${path}.${process.pid}.tmp`)).toBe(false);
  });

  test('overwrites existing file', async () => {
    const path = join(tempDir, 'async-over.txt');
    await atomicWriteFile(path, 'v1');
    await atomicWriteFile(path, 'v2');
    expect(readFileSync(path, 'utf-8')).toBe('v2');
  });
});

// ─── fetchWithTimeout ─────────────────────────────────────────────────────────

describe('fetchWithTimeout', () => {
  test('fetches a URL successfully', async () => {
    // Use a tiny local HTTP server via Bun
    const server = Bun.serve({
      port: 0,
      fetch() { return new Response('ok'); },
    });

    try {
      const res = await fetchWithTimeout(`http://127.0.0.1:${server.port}/`);
      expect(res.ok).toBe(true);
      expect(await res.text()).toBe('ok');
    } finally {
      server.stop();
    }
  });

  test('throws ToolExecutionError on timeout', async () => {
    const server = Bun.serve({
      port: 0,
      async fetch() {
        await new Promise(r => setTimeout(r, 200));
        return new Response('slow');
      },
    });

    try {
      await fetchWithTimeout(`http://127.0.0.1:${server.port}/`, { timeout: 50 });
      expect(true).toBe(false); // should not reach
    } catch (e) {
      expect(e).toBeInstanceOf(ToolExecutionError);
      expect((e as ToolExecutionError).code).toBe(ErrorCodes.TOOL_TIMEOUT);
    } finally {
      server.stop();
    }
  });

  test('uses default 30s timeout (does not throw for fast requests)', async () => {
    const server = Bun.serve({
      port: 0,
      fetch() { return new Response('fast'); },
    });

    try {
      const res = await fetchWithTimeout(`http://127.0.0.1:${server.port}/`);
      // default timeout is 30s, fast request should succeed
      expect(res.ok).toBe(true);
    } finally {
      server.stop();
    }
  });

  test('throws on external signal abort', async () => {
    const server = Bun.serve({
      port: 0,
      async fetch() {
        await new Promise(r => setTimeout(r, 500));
        return new Response('never');
      },
    });

    const controller = new AbortController();
    const fetchPromise = fetchWithTimeout(`http://127.0.0.1:${server.port}/`, {
      signal: controller.signal,
      timeout: 5000,
    });

    setTimeout(() => controller.abort(), 50);

    try {
      await fetchPromise;
      expect(true).toBe(false); // should not reach
    } catch (e) {
      expect(e).toBeInstanceOf(ToolExecutionError);
    } finally {
      server.stop();
    }
  });

  test('passes custom toolName in error', async () => {
    const server = Bun.serve({
      port: 0,
      async fetch() {
        await new Promise(r => setTimeout(r, 200));
        return new Response('slow');
      },
    });

    try {
      await fetchWithTimeout(`http://127.0.0.1:${server.port}/`, {
        timeout: 50,
        toolName: 'my_tool',
      });
    } catch (e) {
      expect((e as ToolExecutionError).toolName).toBe('my_tool');
    } finally {
      server.stop();
    }
  });
});
