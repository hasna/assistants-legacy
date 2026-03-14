import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { setRuntime, hasRuntime, getRuntime } from '../src/runtime';
import { bunRuntime } from '../../runtime-bun/src';
import {
  getDatabase,
  closeDatabase,
  resetDatabaseSingleton,
  getDatabasePath,
  getSchemaVersion,
} from '../src/database';
import { SCHEMA_VERSION } from '../src/database/schema';

if (!hasRuntime()) setRuntime(bunRuntime);

let tempDir: string;
let origAssistantsDir: string | undefined;

beforeEach(() => {
  origAssistantsDir = process.env.ASSISTANTS_DIR;
  tempDir = mkdtempSync(join(tmpdir(), 'database-test-'));
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

// ─── getDatabasePath ──────────────────────────────────────────────────────────

describe('getDatabasePath', () => {
  test('returns path ending in assistants.db', () => {
    const path = getDatabasePath();
    expect(path).toMatch(/assistants\.db$/);
  });

  test('uses ASSISTANTS_DIR env when set', () => {
    expect(getDatabasePath()).toContain(tempDir);
  });

  test('uses provided baseDir when given', () => {
    const custom = join(tempDir, 'custom');
    expect(getDatabasePath(custom)).toBe(join(custom, 'assistants.db'));
  });
});

// ─── getDatabase ─────────────────────────────────────────────────────────────

describe('getDatabase', () => {
  test('returns a DatabaseConnection', () => {
    const db = getDatabase();
    expect(db).toBeDefined();
    expect(typeof db.exec).toBe('function');
    expect(typeof db.query).toBe('function');
  });

  test('returns singleton (same object on second call)', () => {
    const db1 = getDatabase();
    const db2 = getDatabase();
    expect(db1).toBe(db2);
  });

  test('creates database file in ASSISTANTS_DIR', () => {
    const { existsSync } = require('fs');
    getDatabase();
    expect(existsSync(join(tempDir, 'assistants.db'))).toBe(true);
  });

  test('creates required tables', () => {
    const db = getDatabase();
    // persisted_sessions should exist
    const result = db
      .query<{ count: number }>('SELECT COUNT(*) as count FROM persisted_sessions')
      .get();
    expect(result?.count).toBe(0);
  });

  test('creates config table', () => {
    const db = getDatabase();
    const result = db
      .query<{ count: number }>('SELECT COUNT(*) as count FROM config')
      .get();
    expect(result?.count).toBe(0);
  });

  test('creates memories table', () => {
    const db = getDatabase();
    const result = db
      .query<{ count: number }>('SELECT COUNT(*) as count FROM memories')
      .get();
    expect(result?.count).toBe(0);
  });

  test('creates tasks table', () => {
    const db = getDatabase();
    const result = db
      .query<{ count: number }>('SELECT COUNT(*) as count FROM tasks')
      .get();
    expect(result?.count).toBe(0);
  });

  test('has parent_session_id column in persisted_sessions (migration)', () => {
    const db = getDatabase();
    // Verify the migration ran by checking column existence
    const cols = db.query<{ name: string }>(
      "PRAGMA table_info(persisted_sessions)"
    ).all();
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('parent_session_id');
  });
});

// ─── closeDatabase / resetDatabaseSingleton ───────────────────────────────────

describe('closeDatabase / resetDatabaseSingleton', () => {
  test('closeDatabase allows a new connection to be opened', () => {
    const db1 = getDatabase();
    closeDatabase();
    resetDatabaseSingleton();
    const db2 = getDatabase();
    // Different instance after reset
    expect(db2).toBeDefined();
  });

  test('resetDatabaseSingleton without close does not crash', () => {
    getDatabase();
    expect(() => resetDatabaseSingleton()).not.toThrow();
  });

  test('closeDatabase is idempotent', () => {
    getDatabase();
    expect(() => {
      closeDatabase();
      closeDatabase(); // second close should not throw
    }).not.toThrow();
  });
});

// ─── getSchemaVersion ────────────────────────────────────────────────────────

describe('getSchemaVersion', () => {
  test('returns current schema version after init', () => {
    const version = getSchemaVersion();
    expect(version).toBe(SCHEMA_VERSION);
    expect(version).toBeGreaterThan(0);
  });

  test('schema version matches SCHEMA_VERSION constant', () => {
    const db = getDatabase();
    expect(getSchemaVersion(db)).toBe(SCHEMA_VERSION);
  });
});
