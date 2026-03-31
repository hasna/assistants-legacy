/**
 * DB-backed config store using the `config` table.
 *
 * Provides simple key-value access for runtime config flags
 * (e.g. onboardingCompleted, firstGreetingShown) that persist
 * across sessions without requiring a config.json file.
 *
 * Falls back gracefully when the database is not yet initialized.
 */

import { getDatabase } from './database';

/**
 * Get a config value from the DB.
 * Returns null if not found or DB not available.
 */
export function getConfigValue(key: string, scope: string = 'global', scopeId: string = ''): string | null {
  try {
    const db = getDatabase();
    const row = db
      .query<{ value: string }>('SELECT value FROM config WHERE scope = ? AND scope_id = ? AND key = ?')
      .get(scope, scopeId, key);
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Set a config value in the DB.
 */
export function setConfigValue(key: string, value: string, scope: string = 'global', scopeId: string = ''): void {
  try {
    const db = getDatabase();
    db.prepare(
      `INSERT INTO config (scope, scope_id, key, value, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (scope, scope_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(scope, scopeId, key, value, new Date().toISOString());
  } catch {
    // Silently fail if DB not available
  }
}

/**
 * Check if onboarding has been completed (checks both DB and JSON config).
 */
export function isOnboardingCompleted(): boolean {
  const val = getConfigValue('onboardingCompleted');
  return val === 'true';
}

/**
 * Mark onboarding as completed in the DB.
 */
export function markOnboardingCompleted(): void {
  setConfigValue('onboardingCompleted', 'true');
}

/**
 * Check if the first greeting has been shown.
 */
export function isFirstGreetingShown(): boolean {
  const val = getConfigValue('firstGreetingShown');
  return val === 'true';
}

/**
 * Mark the first greeting as shown.
 */
export function markFirstGreetingShown(): void {
  setConfigValue('firstGreetingShown', 'true');
}

/**
 * Get a config value parsed as JSON.
 */
export function getConfigJson<T = unknown>(key: string, scope: string = 'global', scopeId: string = ''): T | null {
  const raw = getConfigValue(key, scope, scopeId);
  if (raw == null) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

/**
 * Set a config value as JSON.
 */
export function setConfigJson(key: string, value: unknown, scope: string = 'global', scopeId: string = ''): void {
  setConfigValue(key, JSON.stringify(value), scope, scopeId);
}

/**
 * Delete a config key.
 */
export function deleteConfigValue(key: string, scope: string = 'global', scopeId: string = ''): boolean {
  try {
    const db = getDatabase();
    db.prepare('DELETE FROM config WHERE scope = ? AND scope_id = ? AND key = ?').run(scope, scopeId, key);
    return true;
  } catch {
    return false;
  }
}

/**
 * List all config entries, optionally filtered by scope.
 */
export function listConfigEntries(scope?: string, scopeId?: string): Array<{ scope: string; scopeId: string; key: string; value: string; updatedAt: string }> {
  try {
    const db = getDatabase();
    let sql = 'SELECT scope, scope_id, key, value, updated_at FROM config';
    const params: string[] = [];
    if (scope) { sql += ' WHERE scope = ?'; params.push(scope); }
    if (scope && scopeId !== undefined) { sql += ' AND scope_id = ?'; params.push(scopeId); }
    sql += ' ORDER BY scope, key';
    const rows = db.prepare(sql).all(...params) as Array<{ scope: string; scope_id: string; key: string; value: string; updated_at: string }>;
    return rows.map((r) => ({ scope: r.scope, scopeId: r.scope_id, key: r.key, value: r.value, updatedAt: r.updated_at }));
  } catch {
    return [];
  }
}

/**
 * Migrate a JSON config object into the SQLite config table.
 * Flattens nested keys with dot notation (e.g., "llm.model", "voice.provider").
 */
export function migrateJsonToConfig(config: Record<string, unknown>, scope: string = 'global', scopeId: string = '', prefix: string = ''): number {
  let count = 0;
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined || value === null) continue;
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && !Array.isArray(value)) {
      count += migrateJsonToConfig(value as Record<string, unknown>, scope, scopeId, fullKey);
    } else {
      const strValue = typeof value === 'string' ? value : JSON.stringify(value);
      setConfigValue(fullKey, strValue, scope, scopeId);
      count++;
    }
  }
  return count;
}

/**
 * Build a nested config object from flat dot-notation keys in SQLite.
 */
export function buildConfigFromDb(scope: string = 'global', scopeId: string = ''): Record<string, unknown> {
  const entries = listConfigEntries(scope, scopeId);
  const result: Record<string, unknown> = {};
  for (const entry of entries) {
    const parts = entry.key.split('.');
    let current = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current) || typeof current[parts[i]] !== 'object') {
        current[parts[i]] = {};
      }
      current = current[parts[i]] as Record<string, unknown>;
    }
    const lastKey = parts[parts.length - 1];
    // Try to parse JSON values back
    try {
      current[lastKey] = JSON.parse(entry.value);
    } catch {
      current[lastKey] = entry.value;
    }
  }
  return result;
}
