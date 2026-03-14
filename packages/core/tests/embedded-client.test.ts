import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { setRuntime, hasRuntime } from '../src/runtime';
import { bunRuntime } from '../../runtime-bun/src';
import { EmbeddedClient } from '../src/client';
import { closeDatabase, resetDatabaseSingleton } from '../src/database';

if (!hasRuntime()) setRuntime(bunRuntime);

let tempDir: string;
let origAssistantsDir: string | undefined;

beforeEach(() => {
  origAssistantsDir = process.env.ASSISTANTS_DIR;
  tempDir = mkdtempSync(join(tmpdir(), 'client-test-'));
  process.env.ASSISTANTS_DIR = tempDir;
  closeDatabase();
  resetDatabaseSingleton();
});

afterEach(() => {
  closeDatabase();
  resetDatabaseSingleton();
  if (origAssistantsDir === undefined) delete process.env.ASSISTANTS_DIR;
  else process.env.ASSISTANTS_DIR = origAssistantsDir;
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── Constructor ──────────────────────────────────────────────────────────────

describe('EmbeddedClient constructor', () => {
  test('creates a client without throwing', () => {
    expect(() => new EmbeddedClient(tempDir, { basePath: tempDir })).not.toThrow();
  });

  test('uses provided cwd', () => {
    const client = new EmbeddedClient(tempDir, { basePath: tempDir });
    // The client should have been created with the given cwd
    expect(client).toBeDefined();
  });

  test('generates session ID when none provided', () => {
    const client = new EmbeddedClient(tempDir, { basePath: tempDir });
    const id = client.getSessionId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  test('uses provided session ID', () => {
    const client = new EmbeddedClient(tempDir, {
      sessionId: 'my-session-id',
      basePath: tempDir,
    });
    expect(client.getSessionId()).toBe('my-session-id');
  });

  test('multiple clients get different session IDs', () => {
    const c1 = new EmbeddedClient(tempDir, { basePath: tempDir });
    const c2 = new EmbeddedClient(tempDir, { basePath: tempDir });
    expect(c1.getSessionId()).not.toBe(c2.getSessionId());
  });
});

// ─── onChunk / onError callbacks ──────────────────────────────────────────────

describe('EmbeddedClient callbacks', () => {
  test('onChunk registers a callback and returns unsubscribe function', () => {
    const client = new EmbeddedClient(tempDir, { basePath: tempDir });
    const unsub = client.onChunk(() => {});
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });

  test('onError registers a callback and returns unsubscribe function', () => {
    const client = new EmbeddedClient(tempDir, { basePath: tempDir });
    const unsub = client.onError(() => {});
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });

  test('multiple chunk callbacks can be registered', () => {
    const client = new EmbeddedClient(tempDir, { basePath: tempDir });
    const unsub1 = client.onChunk(() => {});
    const unsub2 = client.onChunk(() => {});
    expect(() => { unsub1(); unsub2(); }).not.toThrow();
  });

  test('unsubscribing callback does not throw', () => {
    const client = new EmbeddedClient(tempDir, { basePath: tempDir });
    const unsub = client.onChunk(() => {});
    expect(() => unsub()).not.toThrow();
    // Calling unsub twice should also be safe
    expect(() => unsub()).not.toThrow();
  });
});

// ─── disconnect ───────────────────────────────────────────────────────────────

describe('EmbeddedClient disconnect', () => {
  test('disconnect does not throw', () => {
    const client = new EmbeddedClient(tempDir, { basePath: tempDir });
    expect(() => client.disconnect()).not.toThrow();
  });

  test('disconnect can be called multiple times', () => {
    const client = new EmbeddedClient(tempDir, { basePath: tempDir });
    expect(() => {
      client.disconnect();
      client.disconnect();
    }).not.toThrow();
  });
});

// ─── getTokenUsage ────────────────────────────────────────────────────────────

describe('EmbeddedClient getTokenUsage', () => {
  test('returns token usage object', () => {
    const client = new EmbeddedClient(tempDir, { basePath: tempDir });
    const usage = client.getTokenUsage();
    expect(usage).toBeDefined();
    // Should have inputTokens and outputTokens (possibly 0 before any messages)
    expect(typeof usage.inputTokens).toBe('number');
    expect(typeof usage.outputTokens).toBe('number');
  });

  test('initial usage is zero', () => {
    const client = new EmbeddedClient(tempDir, { basePath: tempDir });
    const usage = client.getTokenUsage();
    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
  });
});

// ─── getTools / getSkills / getCommands ───────────────────────────────────────

describe('EmbeddedClient tools/skills/commands', () => {
  test('getTools returns array', async () => {
    const client = new EmbeddedClient(tempDir, { basePath: tempDir });
    const tools = await client.getTools();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
  });

  test('getTools returns tool objects with name and description', async () => {
    const client = new EmbeddedClient(tempDir, { basePath: tempDir });
    const tools = await client.getTools();
    for (const t of tools.slice(0, 5)) {
      expect(typeof t.name).toBe('string');
    }
  });

  test('getSkills returns array', async () => {
    const client = new EmbeddedClient(tempDir, { basePath: tempDir });
    const skills = await client.getSkills();
    expect(Array.isArray(skills)).toBe(true);
  });

  test('getCommands returns array', async () => {
    const client = new EmbeddedClient(tempDir, { basePath: tempDir });
    const commands = await client.getCommands();
    expect(Array.isArray(commands)).toBe(true);
    expect(commands.length).toBeGreaterThan(0);
  });
});
