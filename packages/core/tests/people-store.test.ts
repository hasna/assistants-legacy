import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { setRuntime, hasRuntime } from '../src/runtime';
import { bunRuntime } from '../../runtime-bun/src';
import { closeDatabase, resetDatabaseSingleton, getDatabase } from '../src/database';
import { PeopleStore } from '../src/people/store';

if (!hasRuntime()) setRuntime(bunRuntime);

let tempDir: string;
let store: PeopleStore;
let origDir: string | undefined;

beforeEach(async () => {
  origDir = process.env.ASSISTANTS_DIR;
  tempDir = mkdtempSync(join(tmpdir(), 'people-test-'));
  process.env.ASSISTANTS_DIR = tempDir;
  closeDatabase();
  resetDatabaseSingleton();
  store = new PeopleStore(getDatabase());
  await store.initialize();
});

afterEach(() => {
  closeDatabase();
  resetDatabaseSingleton();
  if (origDir === undefined) delete process.env.ASSISTANTS_DIR;
  else process.env.ASSISTANTS_DIR = origDir;
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── create / get / getByName ─────────────────────────────────────────────────

describe('create / get / getByName', () => {
  test('creates a person and returns it', async () => {
    const person = await store.create('Alice Smith', 'alice@example.com');
    expect(person.id).toBeDefined();
    expect(person.name).toBe('Alice Smith');
    expect(person.email).toBe('alice@example.com');
  });

  test('get returns created person', async () => {
    const person = await store.create('Bob');
    const found = store.get(person.id);
    expect(found?.name).toBe('Bob');
  });

  test('get returns null for unknown ID', () => {
    expect(store.get('no-such')).toBeNull();
  });

  test('getByName finds person', async () => {
    await store.create('Carol');
    const found = store.getByName('Carol');
    expect(found?.name).toBe('Carol');
  });

  test('getByName returns null for unknown', () => {
    expect(store.getByName('Ghost')).toBeNull();
  });

  test('resolve finds by ID or name', async () => {
    const p = await store.create('Dave');
    expect(store.resolve(p.id)?.name).toBe('Dave');
    expect(store.resolve('Dave')?.name).toBe('Dave');
  });

  test('resolve returns null for unknown', () => {
    expect(store.resolve('nobody')).toBeNull();
  });

  test('creates with optional fields', async () => {
    const person = await store.create('Eve', 'eve@example.com', '+1-555-0200', 'admin', 'VIP person');
    const found = store.get(person.id);
    expect(found?.email).toBe('eve@example.com');
    expect(found?.role).toBe('admin');
    expect(found?.notes).toBe('VIP person');
  });
});

// ─── update / delete ──────────────────────────────────────────────────────────

describe('update / delete', () => {
  test('update changes person fields', async () => {
    const person = await store.create('Frank');
    await store.update(person.id, { name: 'Franklin', role: 'manager' });
    const found = store.get(person.id);
    expect(found?.name).toBe('Franklin');
    expect(found?.role).toBe('manager');
  });

  test('delete removes person', async () => {
    const person = await store.create('Grace');
    await store.delete(person.id);
    expect(store.get(person.id)).toBeNull();
  });
});

// ─── list ─────────────────────────────────────────────────────────────────────

describe('list', () => {
  test('returns empty initially', () => {
    expect(store.list()).toHaveLength(0);
  });

  test('returns all people', async () => {
    await store.create('Henry');
    await store.create('Irene');
    expect(store.list()).toHaveLength(2);
  });

  test('list items have required fields', async () => {
    await store.create('Jack', 'jack@example.com');
    const items = store.list();
    expect(items[0].name).toBeDefined();
    expect(items[0].id).toBeDefined();
  });
});

// ─── setActive / getActive ────────────────────────────────────────────────────

describe('setActive / getActive', () => {
  test('getActive returns null initially', () => {
    expect(store.getActive()).toBeNull();
  });

  test('setActive + getActive', async () => {
    const p = await store.create('Kate');
    await store.setActive(p.id);
    expect(store.getActive()?.name).toBe('Kate');
    expect(store.getActiveId()).toBe(p.id);
  });

  test('setActive(null) clears active', async () => {
    const p = await store.create('Leo');
    await store.setActive(p.id);
    await store.setActive(null);
    expect(store.getActive()).toBeNull();
    expect(store.getActiveId()).toBeNull();
  });
});
