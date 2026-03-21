/**
 * Secrets SDK adapter
 *
 * Accesses the same SQLite database that @hasna/secrets CLI uses:
 *   ~/.open-secrets/vault.db  (or OPEN_SECRETS_DB env var)
 *
 * Schema is compatible with @hasna/secrets v0.1.x. All operations
 * are synchronous (SQLite via bun:sqlite).
 *
 * Namespace convention (mirrors @hasna/secrets CLI):
 *   "global/{name}"                     → scope: 'global'
 *   "assistant/{assistantId}/{name}"     → scope: 'assistant' (scoped)
 *   "{name}"                             → scope: 'assistant' (default, unscoped)
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync } from 'fs';

// ─── DB lifecycle ─────────────────────────────────────────────────────────────

function getDbPath(): string {
  return process.env.OPEN_SECRETS_DB ?? join(homedir(), '.open-secrets', 'vault.db');
}

let _db: Database | null = null;

function getDb(): Database {
  const path = getDbPath();
  if (_db && (_db as any).filename !== path) { _db.close(); _db = null; }
  if (!_db) {
    const dir = join(path, '..');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
    _db = new Database(path, { create: true });
    _db.exec('PRAGMA journal_mode=WAL');
    migrate(_db);
  }
  return _db;
}

function migrate(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS secrets (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      type       TEXT NOT NULL DEFAULT 'other',
      label      TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      action    TEXT NOT NULL,
      key       TEXT NOT NULL,
      agent     TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );
  `);
}

function auditRecord(action: 'get' | 'set' | 'delete', key: string): void {
  const agent = process.env.AGENT_ID ?? process.env.USER ?? 'assistants';
  try {
    getDb().prepare('INSERT INTO audit_log (action, key, agent, timestamp) VALUES (?, ?, ?, ?)').run(action, key, agent, new Date().toISOString());
  } catch { /* audit failure is non-fatal */ }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type SecretScope = 'global' | 'assistant';
export type SecretType = 'api_key' | 'password' | 'token' | 'credential' | 'other';

export interface SecretEntry {
  key: string;
  name: string;     // key without namespace prefix
  namespace: string; // 'global' | 'assistant'
  value: string;
  type: SecretType;
  label?: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AuditEntry {
  id: number;
  action: 'get' | 'set' | 'delete';
  key: string;
  agent: string;
  timestamp: string;
}

// ─── Namespace helpers ────────────────────────────────────────────────────────

function toKey(name: string, scope: SecretScope, assistantId?: string): string {
  if (scope === 'global') return `global/${name}`;
  if (assistantId) return `assistant/${assistantId}/${name}`;
  return name;
}

function parseKey(sdkKey: string): { name: string; namespace: string } {
  if (sdkKey.startsWith('global/')) return { name: sdkKey.slice(7), namespace: 'global' };
  const m = sdkKey.match(/^assistant\/[^/]+\/(.+)$/);
  if (m) return { name: m[1], namespace: 'assistant' };
  return { name: sdkKey, namespace: 'assistant' };
}

function enrichRow(row: Record<string, unknown>): SecretEntry {
  const { name, namespace } = parseKey(String(row.key));
  return { ...(row as any), name, namespace };
}

// ─── Core operations ──────────────────────────────────────────────────────────

export function listSecrets(scope: SecretScope | 'all' = 'all'): SecretEntry[] {
  const db = getDb();
  let rows: Record<string, unknown>[];
  if (scope === 'all') {
    rows = db.prepare('SELECT * FROM secrets ORDER BY key').all() as Record<string, unknown>[];
  } else if (scope === 'global') {
    rows = db.prepare("SELECT * FROM secrets WHERE key LIKE 'global/%' ORDER BY key").all() as Record<string, unknown>[];
  } else {
    // assistant: keys that DON'T start with 'global/'
    rows = db.prepare("SELECT * FROM secrets WHERE key NOT LIKE 'global/%' ORDER BY key").all() as Record<string, unknown>[];
  }
  return rows.map(enrichRow);
}

export function getSecret(name: string, scope: SecretScope = 'assistant', assistantId?: string): SecretEntry | null {
  const db = getDb();
  const key = toKey(name, scope, assistantId);
  let row = db.prepare('SELECT * FROM secrets WHERE key = ?').get(key) as Record<string, unknown> | undefined;
  // Assistant fallback: try unscoped key
  if (!row && scope === 'assistant') {
    row = db.prepare('SELECT * FROM secrets WHERE key = ?').get(name) as Record<string, unknown> | undefined;
  }
  if (!row) return null;
  auditRecord('get', String(row.key));
  return enrichRow(row);
}

export function getSecretAnyScope(name: string, assistantId?: string): SecretEntry | null {
  return getSecret(name, 'assistant', assistantId) ?? getSecret(name, 'global');
}

export function setSecret(
  name: string,
  value: string,
  options: { scope?: SecretScope; type?: SecretType; label?: string; ttl?: string; assistantId?: string } = {},
): SecretEntry {
  const db = getDb();
  const { scope = 'assistant', type = 'other', label, ttl, assistantId } = options;
  const key = toKey(name, scope, assistantId);
  const now = new Date().toISOString();

  let expiresAt: string | undefined;
  if (ttl) {
    const m = ttl.match(/^(\d+)([dhm])$/);
    if (m) {
      const ms = m[2] === 'd' ? +m[1] * 86400000 : m[2] === 'h' ? +m[1] * 3600000 : +m[1] * 60000;
      expiresAt = new Date(Date.now() + ms).toISOString();
    }
  }

  const existing = db.prepare('SELECT created_at FROM secrets WHERE key = ?').get(key) as { created_at: string } | undefined;
  db.prepare(`
    INSERT INTO secrets (key, value, type, label, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, type=excluded.type,
      label=excluded.label, expires_at=excluded.expires_at, updated_at=excluded.updated_at
  `).run(key, value, type, label ?? null, expiresAt ?? null, existing?.created_at ?? now, now);

  auditRecord('set', key);
  return getSecret(name, scope, assistantId)!;
}

export function deleteSecret(name: string, scope: SecretScope = 'assistant', assistantId?: string): boolean {
  const db = getDb();
  const key = toKey(name, scope, assistantId);
  const r = db.prepare('DELETE FROM secrets WHERE key = ?').run(key);
  if (r.changes > 0) { auditRecord('delete', key); return true; }
  // Try unscoped fallback for assistant
  if (scope === 'assistant') {
    const r2 = db.prepare('DELETE FROM secrets WHERE key = ?').run(name);
    if (r2.changes > 0) { auditRecord('delete', name); return true; }
  }
  return false;
}

export function searchSecrets(query: string): SecretEntry[] {
  const db = getDb();
  const q = `%${query}%`;
  const rows = db.prepare('SELECT * FROM secrets WHERE key LIKE ? OR label LIKE ? OR type LIKE ? ORDER BY key').all(q, q, q) as Record<string, unknown>[];
  return rows.map(enrichRow);
}

export function getAuditLog(name?: string, limit = 50): AuditEntry[] {
  const db = getDb();
  if (name) {
    return db.prepare('SELECT * FROM audit_log WHERE key = ? ORDER BY id DESC LIMIT ?').all(name, limit) as AuditEntry[];
  }
  return db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit) as AuditEntry[];
}

export function pruneExpiredSecrets(): number {
  const db = getDb();
  const r = db.prepare("DELETE FROM secrets WHERE expires_at IS NOT NULL AND expires_at < ?").run(new Date().toISOString());
  return r.changes;
}

export function exportSecrets(redact = false): Record<string, unknown> {
  const entries = listSecrets('all');
  const secrets: Record<string, unknown> = {};
  for (const e of entries) {
    secrets[e.key] = redact ? { ...e, value: '***' } : e;
  }
  return { version: 1, secrets };
}
