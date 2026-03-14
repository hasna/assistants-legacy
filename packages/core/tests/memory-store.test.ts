import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { setRuntime, hasRuntime } from '../src/runtime';
import { bunRuntime } from '../../runtime-bun/src';
import { closeDatabase, resetDatabaseSingleton, getDatabase } from '../src/database';
import { MemoryStore } from '../src/memory/store';

if (!hasRuntime()) setRuntime(bunRuntime);

let tempDir: string;
let store: MemoryStore;
let origDir: string | undefined;

beforeEach(() => {
  origDir = process.env.ASSISTANTS_DIR;
  tempDir = mkdtempSync(join(tmpdir(), 'mem-store-test-'));
  process.env.ASSISTANTS_DIR = tempDir;
  closeDatabase();
  resetDatabaseSingleton();
  store = new MemoryStore(getDatabase());
});

afterEach(() => {
  closeDatabase();
  resetDatabaseSingleton();
  if (origDir === undefined) delete process.env.ASSISTANTS_DIR;
  else process.env.ASSISTANTS_DIR = origDir;
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── set / get ────────────────────────────────────────────────────────────────

describe('set / get', () => {
  test('stores and retrieves a string', () => {
    store.set('greeting', 'hello');
    expect(store.get<string>('greeting')).toBe('hello');
  });

  test('stores and retrieves an object', () => {
    const obj = { name: 'Alice', age: 30 };
    store.set('user', obj);
    expect(store.get<typeof obj>('user')).toEqual(obj);
  });

  test('stores and retrieves a number', () => {
    store.set('count', 42);
    expect(store.get<number>('count')).toBe(42);
  });

  test('stores and retrieves a boolean', () => {
    store.set('flag', true);
    expect(store.get<boolean>('flag')).toBe(true);
  });

  test('stores and retrieves an array', () => {
    store.set('list', [1, 2, 3]);
    expect(store.get<number[]>('list')).toEqual([1, 2, 3]);
  });

  test('returns null for missing key', () => {
    expect(store.get('no-such-key')).toBeNull();
  });

  test('overwrites existing value', () => {
    store.set('x', 'first');
    store.set('x', 'second');
    expect(store.get<string>('x')).toBe('second');
  });

  test('stores null explicitly', () => {
    store.set('nullval', null);
    expect(store.get('nullval')).toBeNull();
  });
});

// ─── TTL ──────────────────────────────────────────────────────────────────────

describe('TTL / expiry', () => {
  test('returns value before TTL expires', () => {
    store.set('temp', 'alive', 60_000); // 60s TTL
    expect(store.get<string>('temp')).toBe('alive');
  });

  test('returns null after TTL expires', async () => {
    store.set('expires', 'soon', 10); // 10ms TTL
    await new Promise(r => setTimeout(r, 20));
    expect(store.get('expires')).toBeNull();
  });
});

// ─── delete / has / keys ──────────────────────────────────────────────────────

describe('delete / has / keys', () => {
  test('delete removes a key', () => {
    store.set('to-delete', 'value');
    store.delete('to-delete');
    expect(store.get('to-delete')).toBeNull();
  });

  test('delete is safe for unknown key', () => {
    expect(() => store.delete('ghost')).not.toThrow();
  });

  test('has returns true for existing key', () => {
    store.set('exists', 1);
    expect(store.has('exists')).toBe(true);
  });

  test('has returns false for missing key', () => {
    expect(store.has('missing')).toBe(false);
  });

  test('keys returns all stored keys', () => {
    store.set('a', 1);
    store.set('b', 2);
    store.set('c', 3);
    const ks = store.keys();
    expect(ks).toContain('a');
    expect(ks).toContain('b');
    expect(ks).toContain('c');
  });

  test('keys filters by pattern', () => {
    store.set('pref:color', 'blue');
    store.set('pref:lang', 'ts');
    store.set('other:key', 'x');
    const pref = store.keys('pref:*');
    expect(pref.every(k => k.startsWith('pref:'))).toBe(true);
    expect(pref).toHaveLength(2);
  });
});

// ─── clearExpired ─────────────────────────────────────────────────────────────

describe('clearExpired', () => {
  test('removes expired entries and returns count', async () => {
    store.set('exp1', 'a', 10);
    store.set('exp2', 'b', 10);
    store.set('alive', 'c', 60_000);
    await new Promise(r => setTimeout(r, 20));
    const removed = store.clearExpired();
    expect(removed).toBeGreaterThanOrEqual(2);
    expect(store.get('alive')).toBe('c');
  });

  test('returns 0 when nothing to clear', () => {
    store.set('kept', 'x', 60_000);
    expect(store.clearExpired()).toBe(0);
  });
});

// ─── Assistant scoping ────────────────────────────────────────────────────────

describe('assistant scoping', () => {
  test('different assistantIds have isolated namespaces', () => {
    const s1 = new MemoryStore(getDatabase(), 'agent-1');
    const s2 = new MemoryStore(getDatabase(), 'agent-2');

    s1.set('key', 'from-agent-1');
    s2.set('key', 'from-agent-2');

    expect(s1.get<string>('key')).toBe('from-agent-1');
    expect(s2.get<string>('key')).toBe('from-agent-2');
  });

  test('null assistantId is its own namespace', () => {
    const global = new MemoryStore(getDatabase(), null);
    const agent = new MemoryStore(getDatabase(), 'agent-x');

    global.set('shared', 'global-val');
    agent.set('shared', 'agent-val');

    expect(global.get<string>('shared')).toBe('global-val');
    expect(agent.get<string>('shared')).toBe('agent-val');
  });
});
