import { createHash } from 'crypto';
import type { HookConfig, HookMatcher, HookEvent, HookHandler } from '@hasna/assistants-shared';
import { getDatabase } from '../database';

/**
 * Hook storage location
 */
export type HookLocation = 'user' | 'project' | 'local';

/**
 * Information about a hook including its source
 */
export interface HookInfo {
  id: string;
  event: HookEvent;
  matcher?: string;
  handler: HookHandler;
  location: HookLocation;
  filePath: string;
}

/**
 * Generate a unique ID for a hook
 */
function generateHookId(event: string, hook: HookHandler): string {
  const content = hook.command || hook.prompt || '';
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 8);
  return `${event.toLowerCase()}-${hook.type}-${hash}`;
}

/**
 * Row type returned from the hooks SQLite table
 */
type HookRow = {
  id: string;
  event: string;
  matcher: string | null;
  type: string;
  name: string | null;
  description: string | null;
  command: string | null;
  prompt: string | null;
  model: string | null;
  timeout: number | null;
  async: number;
  enabled: number;
  status_message: string | null;
  scope: string;
  source: string;
  cli_name: string | null;
};

/**
 * SQL columns selected from the hooks table (shared across queries)
 */
const HOOK_SELECT_COLS = `id, event, matcher, type, name, description, command, prompt, model, timeout, async, enabled, status_message, scope, source, cli_name`;

/**
 * Convert a database row to a HookHandler object
 */
function rowToHandler(row: HookRow): HookHandler {
  const handler: HookHandler = {
    id: row.id,
    type: row.type as HookHandler['type'],
    enabled: row.enabled === 1,
  };
  if (row.name) handler.name = row.name;
  if (row.description) handler.description = row.description;
  if (row.command) handler.command = row.command;
  if (row.prompt) handler.prompt = row.prompt;
  if (row.model) handler.model = row.model;
  if (row.timeout) handler.timeout = row.timeout;
  if (row.async) handler.async = true;
  if (row.status_message) handler.statusMessage = row.status_message;
  if (row.cli_name) handler.cliName = row.cli_name;
  if (row.source) handler.source = row.source;
  return handler;
}

/**
 * Convert a database row to a HookInfo object
 */
function rowToHookInfo(row: HookRow): HookInfo {
  return {
    id: row.id,
    event: row.event as HookEvent,
    matcher: row.matcher || undefined,
    handler: rowToHandler(row),
    location: row.scope as HookLocation,
    filePath: '',
  };
}

/**
 * Hook store - manages hook persistence using SQLite
 */
export class HookStore {
  constructor() {}

  /**
   * Load hooks from SQLite and assemble into HookConfig format
   */
  loadAll(): HookConfig {
    const db = getDatabase();
    const merged: HookConfig = {};

    const rows = db.prepare(
      `SELECT ${HOOK_SELECT_COLS} FROM hooks ORDER BY priority ASC, rowid ASC`
    ).all() as HookRow[];

    for (const row of rows) {
      const event = row.event;
      if (!merged[event]) {
        merged[event] = [];
      }

      const handler = rowToHandler(row);

      // Find or create a matcher group for this event + matcher pattern
      const matcherKey = row.matcher || undefined;
      let targetMatcher = merged[event].find((m) => m.matcher === matcherKey);
      if (!targetMatcher) {
        targetMatcher = { matcher: matcherKey, hooks: [] };
        merged[event].push(targetMatcher);
      }

      targetMatcher.hooks.push(handler);
    }

    return merged;
  }

  /**
   * Add a single hook
   */
  addHook(
    event: HookEvent,
    handler: HookHandler,
    location: HookLocation = 'project',
    matcher?: string
  ): string {
    const db = getDatabase();
    const now = new Date().toISOString();

    if (!handler.id) {
      handler.id = generateHookId(event, handler);
    }

    db.prepare(
      `INSERT OR REPLACE INTO hooks (id, event, matcher, type, name, description, command, prompt, model, timeout, async, enabled, status_message, scope, source, priority, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'config', 100, ?, ?)`
    ).run(
      handler.id,
      event,
      matcher || null,
      handler.type,
      handler.name || null,
      handler.description || null,
      handler.command || null,
      handler.prompt || null,
      handler.model || null,
      handler.timeout || null,
      handler.async ? 1 : 0,
      handler.enabled !== false ? 1 : 0,
      handler.statusMessage || null,
      location,
      now,
      now
    );

    return handler.id;
  }

  /**
   * Remove a hook by ID
   */
  removeHook(hookId: string): boolean {
    const db = getDatabase();
    const result = db.prepare(
      `DELETE FROM hooks WHERE id = ?`
    ).run(hookId);
    return (result as { changes: number }).changes > 0;
  }

  /**
   * Enable or disable a hook by ID
   */
  setEnabled(hookId: string, enabled: boolean): boolean {
    const db = getDatabase();
    const now = new Date().toISOString();
    const result = db.prepare(
      `UPDATE hooks SET enabled = ?, updated_at = ? WHERE id = ?`
    ).run(enabled ? 1 : 0, now, hookId);
    return (result as { changes: number }).changes > 0;
  }

  /**
   * Get a hook by ID
   */
  getHook(hookId: string): HookInfo | null {
    const db = getDatabase();
    const row = db.prepare(
      `SELECT ${HOOK_SELECT_COLS} FROM hooks WHERE id = ?`
    ).get(hookId) as HookRow | undefined;

    if (!row) return null;
    return rowToHookInfo(row);
  }

  /**
   * List all hooks with metadata
   */
  listHooks(): HookInfo[] {
    const db = getDatabase();
    const rows = db.prepare(
      `SELECT ${HOOK_SELECT_COLS} FROM hooks ORDER BY priority ASC, rowid ASC`
    ).all() as HookRow[];

    return rows.map(rowToHookInfo);
  }

  /**
   * Upsert hooks discovered from CLI sources
   */
  upsertFromCli(cliHooks: Array<{
    id: string;
    event: string;
    matcher?: string;
    type: string;
    name?: string;
    description?: string;
    command?: string;
    timeout?: number;
    cliName: string;
  }>): void {
    const db = getDatabase();
    const now = new Date().toISOString();

    const stmt = db.prepare(
      `INSERT OR REPLACE INTO hooks (id, event, matcher, type, name, description, command, prompt, model, timeout, async, enabled, status_message, scope, source, cli_name, priority, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, 0, 1, NULL, 'project', 'cli', ?, 100, ?, ?)`
    );

    for (const hook of cliHooks) {
      stmt.run(
        hook.id,
        hook.event,
        hook.matcher || null,
        hook.type,
        hook.name || null,
        hook.description || null,
        hook.command || null,
        hook.timeout || null,
        hook.cliName,
        now,
        now
      );
    }
  }

  /**
   * Save hooks config (backwards compatibility for tools.ts enable/disable)
   * In SQLite mode, individual methods handle persistence directly.
   */
  save(_location: HookLocation, _config: HookConfig): void {
    // No-op in SQLite mode - individual methods persist directly
  }
}
