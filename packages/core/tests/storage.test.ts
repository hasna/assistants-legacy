import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, rmSync } from 'fs';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { closeDatabase, getDatabase, resetDatabaseSingleton, setRuntime } from '../src';
import { bunRuntime } from '../../runtime-bun/src';
import {
  ASSISTANTS_STORAGE_ENV,
  assistantsStorageSnapshotKey,
  createAssistantsStorageSnapshot,
  getAssistantsStorageStatus,
  storageSync,
} from '../src/storage';

setRuntime(bunRuntime);

let tempDir: string;
let oldAssistantsDir: string | undefined;
let oldDbPath: string | undefined;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'assistants-storage-test-'));
  oldAssistantsDir = process.env.ASSISTANTS_DIR;
  oldDbPath = process.env.HASNA_ASSISTANTS_DB_PATH;
  process.env.ASSISTANTS_DIR = tempDir;
  delete process.env.HASNA_ASSISTANTS_DB_PATH;
  closeDatabase();
  resetDatabaseSingleton();
});

afterEach(() => {
  closeDatabase();
  resetDatabaseSingleton();
  if (oldAssistantsDir === undefined) delete process.env.ASSISTANTS_DIR;
  else process.env.ASSISTANTS_DIR = oldAssistantsDir;
  if (oldDbPath === undefined) delete process.env.HASNA_ASSISTANTS_DB_PATH;
  else process.env.HASNA_ASSISTANTS_DB_PATH = oldDbPath;
  rmSync(tempDir, { recursive: true, force: true });
});

describe('assistants storage', () => {
  test('status exposes local paths, tables, and canonical env names', () => {
    const status = getAssistantsStorageStatus({});

    expect(status.mode).toBe('local');
    expect(status.local.configDir).toBe(tempDir);
    expect(status.local.dbPath).toBe(join(tempDir, 'assistants.db'));
    expect(status.local.dbExists).toBe(false);
    expect(status.env.s3Bucket).toBe(ASSISTANTS_STORAGE_ENV.s3Bucket);
    expect(status.tables).toContain('sessions');
    expect(status.tables).toContain('feedback');
  });

  test('creates a portable SQLite snapshot from the local database', () => {
    const db = getDatabase();
    db.exec("INSERT INTO config (scope, key, value, updated_at) VALUES ('global', 'storage-test', 'ok', '2026-01-01T00:00:00.000Z')");

    const snapshot = createAssistantsStorageSnapshot({
      HASNA_ASSISTANTS_MACHINE_ID: 'test-machine',
    });

    expect(snapshot.source).toBe('assistants');
    expect(snapshot.machineId).toBe('test-machine');
    expect(snapshot.path).toContain('assistants-storage-');
    expect(snapshot.sizeBytes).toBeGreaterThan(0);
    expect(existsSync(snapshot.path)).toBe(true);
  });

  test('sync is a no-op until S3 is configured', async () => {
    const result = await storageSync({});

    expect(result.skipped).toBe(true);
    expect(result.reason).toContain('S3 bucket is not configured');
    expect(result.key).toBe('assistants/assistants.db');
  });

  test('snapshot key respects configured S3 prefix', () => {
    expect(assistantsStorageSnapshotKey({
      HASNA_ASSISTANTS_S3_PREFIX: 'internal/assistants',
    })).toBe('internal/assistants/assistants.db');
  });
});
