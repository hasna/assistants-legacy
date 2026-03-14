/**
 * Database connection for the web UI
 *
 * Connects to the shared ~/.assistants/assistants.db SQLite database
 * and the local subscribers database.
 */

import Database from 'better-sqlite3';
import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync } from 'fs';

// ============================================
// Subscribers DB (marketing / landing page)
// ============================================

let subscribersDb: Database.Database | null = null;

export function getSubscribersDb(): Database.Database {
  if (!subscribersDb) {
    mkdirSync(join(process.cwd(), 'data'), { recursive: true });
    const DB_PATH = join(process.cwd(), 'data', 'subscribers.db');
    subscribersDb = new Database(DB_PATH);
    subscribersDb.pragma('journal_mode = WAL');
    subscribersDb.exec(`
      CREATE TABLE IF NOT EXISTS subscribers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
  }
  return subscribersDb;
}

// ============================================
// Assistants DB (shared with terminal)
// ============================================

let assistantsDb: Database.Database | null = null;

function getAssistantsDir(): string {
  // Respect ASSISTANTS_DIR > ASSISTANTS_PROFILE > default
  if (process.env.ASSISTANTS_DIR) return process.env.ASSISTANTS_DIR;
  const profile = process.env.ASSISTANTS_PROFILE;
  if (profile) return join(homedir(), '.assistants', 'profiles', profile);
  return join(homedir(), '.assistants');
}

export function getDb(): Database.Database {
  if (!assistantsDb) {
    const assistantsDir = getAssistantsDir();
    mkdirSync(assistantsDir, { recursive: true });
    const dbPath = join(assistantsDir, 'assistants.db');
    assistantsDb = new Database(dbPath, { readonly: false });
    assistantsDb.pragma('journal_mode = WAL');
    assistantsDb.pragma('busy_timeout = 5000');
    assistantsDb.pragma('foreign_keys = ON');

    // Ensure required tables exist (in case DB was just created)
    assistantsDb.exec(`
      CREATE TABLE IF NOT EXISTS persisted_sessions (
        id TEXT PRIMARY KEY,
        cwd TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        assistant_id TEXT,
        label TEXT,
        status TEXT NOT NULL DEFAULT 'active'
      )
    `);
    assistantsDb.exec(`
      CREATE TABLE IF NOT EXISTS session_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        tool_calls TEXT,
        tool_results TEXT
      )
    `);
    assistantsDb.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        scope_id TEXT,
        category TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        summary TEXT,
        importance INTEGER DEFAULT 5,
        tags TEXT,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        accessed_at TEXT,
        access_count INTEGER DEFAULT 0,
        expires_at TEXT,
        UNIQUE(scope, scope_id, key)
      )
    `);

    assistantsDb.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        priority TEXT NOT NULL DEFAULT 'normal',
        result TEXT,
        error TEXT,
        assignee TEXT,
        project_id TEXT,
        blocked_by TEXT,
        blocks TEXT,
        is_recurring_template INTEGER DEFAULT 0,
        next_run_at INTEGER,
        recurrence TEXT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER
      )
    `);
    assistantsDb.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_project_path ON tasks(project_path)`);
    assistantsDb.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
    assistantsDb.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority)`);
  }
  return assistantsDb;
}

// ============================================
// Row Types
// ============================================

export interface SessionRow {
  id: string;
  cwd: string;
  started_at: number;
  updated_at: number;
  assistant_id: string | null;
  label: string | null;
  status: string;
}

export interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  timestamp: number;
  tool_calls: string | null;
  tool_results: string | null;
}

export interface MemoryRow {
  id: string;
  scope: string;
  scope_id: string | null;
  category: string;
  key: string;
  value: string;
  summary: string | null;
  importance: number;
  tags: string;
  source: string;
  created_at: string;
  updated_at: string;
}

// ============================================
// Query Helpers
// ============================================

export function getSessions(limit: number = 50): SessionRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM persisted_sessions
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(limit) as SessionRow[];
}

export function getSessionMessages(sessionId: string, limit: number = 200): MessageRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM session_messages
    WHERE session_id = ?
    ORDER BY timestamp ASC
    LIMIT ?
  `).all(sessionId, limit) as MessageRow[];
}

export function getMemories(options?: {
  scope?: string;
  category?: string;
  search?: string;
  limit?: number;
}): MemoryRow[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options?.scope) {
    conditions.push('scope = ?');
    params.push(options.scope);
  }
  if (options?.category) {
    conditions.push('category = ?');
    params.push(options.category);
  }
  if (options?.search) {
    conditions.push('(key LIKE ? OR summary LIKE ? OR value LIKE ?)');
    const term = `%${options.search}%`;
    params.push(term, term, term);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options?.limit || 50;
  params.push(limit);

  return db.prepare(`
    SELECT * FROM memories
    ${where}
    ORDER BY importance DESC, updated_at DESC
    LIMIT ?
  `).all(...params) as MemoryRow[];
}
