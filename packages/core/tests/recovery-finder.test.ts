/**
 * Regression tests for findRecoverableSessions.
 *
 * Bugs:
 *  1. Empty sessions (0 messages) flooded the recovery list — abandoned launches
 *     have nothing to recover and should be skipped.
 *  2. The list was unbounded; a single dev box accumulated 100+ entries. It is
 *     now capped (most-recent first).
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { setRuntime, hasRuntime } from '../src/runtime';
import { bunRuntime } from '../../runtime-bun/src';
import { closeDatabase, resetDatabaseSingleton, getDatabase } from '../src/database';
import { findRecoverableSessions } from '../src/heartbeat/finder';

if (!hasRuntime()) setRuntime(bunRuntime);

let tempDir: string;
let origDir: string | undefined;

const STALE_MS = 10 * 60 * 1000; // 10 min ago — older than the 120s stale threshold

function insertSession(id: string, opts: { stale?: boolean; messages?: number } = {}) {
  const db = getDatabase();
  const now = Date.now();
  const hbTime = new Date(now - (opts.stale === false ? 0 : STALE_MS)).toISOString();
  const heartbeat = { timestamp: hbTime, lastActivity: hbTime, status: 'idle' };
  const context = { cwd: '/tmp/project' };
  // session_messages has a FK to sessions(id) — create the parent row first.
  db.prepare(
    'INSERT OR REPLACE INTO sessions (id, created_at, updated_at, metadata) VALUES (?, ?, ?, ?)',
  ).run(id, now, now, null);
  db.prepare(
    'INSERT OR REPLACE INTO heartbeat_state (session_id, heartbeat, context, timestamp) VALUES (?, ?, ?, ?)',
  ).run(id, JSON.stringify(heartbeat), JSON.stringify(context), new Date(now).toISOString());

  for (let i = 0; i < (opts.messages ?? 0); i++) {
    db.prepare(
      'INSERT INTO session_messages (id, session_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)',
    ).run(`${id}-m${i}`, id, 'user', `hello ${i}`, now - 1000 + i);
  }
}

beforeEach(() => {
  origDir = process.env.ASSISTANTS_DIR;
  tempDir = mkdtempSync(join(tmpdir(), 'recovery-test-'));
  process.env.ASSISTANTS_DIR = tempDir;
  closeDatabase();
  resetDatabaseSingleton();
  getDatabase();
});

afterEach(() => {
  closeDatabase();
  resetDatabaseSingleton();
  if (origDir === undefined) delete process.env.ASSISTANTS_DIR;
  else process.env.ASSISTANTS_DIR = origDir;
  rmSync(tempDir, { recursive: true, force: true });
});

describe('findRecoverableSessions', () => {
  test('skips empty (0-message) sessions', () => {
    insertSession('s-empty', { stale: true, messages: 0 });
    insertSession('s-real', { stale: true, messages: 3 });
    const result = findRecoverableSessions();
    const ids = result.map((r) => r.sessionId);
    expect(ids).toContain('s-real');
    expect(ids).not.toContain('s-empty');
  });

  test('skips still-active (non-stale) sessions', () => {
    insertSession('s-active', { stale: false, messages: 5 });
    const result = findRecoverableSessions();
    expect(result.map((r) => r.sessionId)).not.toContain('s-active');
  });

  test('caps the number of returned sessions (most-recent first)', () => {
    for (let i = 0; i < 40; i++) insertSession(`s-${i}`, { stale: true, messages: 2 });
    const result = findRecoverableSessions(120000, 24 * 60 * 60 * 1000, undefined, 25);
    expect(result.length).toBe(25);
  });

  test('maxResults=0 means no cap', () => {
    for (let i = 0; i < 30; i++) insertSession(`u-${i}`, { stale: true, messages: 1 });
    const result = findRecoverableSessions(120000, 24 * 60 * 60 * 1000, undefined, 0);
    expect(result.length).toBe(30);
  });
});
