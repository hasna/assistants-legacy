/**
 * Mementos Adapter
 *
 * Wraps the @hasna/mementos SDK behind the same MemoryStore interface
 * used by the native key-value store (store.ts).
 *
 * Scope mapping:
 *   native "global"  -> mementos "global"
 *   native "project"/"shared" -> mementos "shared"
 *   native "session"/"private" -> mementos "private"
 *
 * TTL mapping:
 *   native ttlMs (milliseconds) -> mementos expires_at (ISO string)
 */

import {
  createMemory,
  getMemoryByKey,
  deleteMemory as mementosDeleteMemory,
  listMemories,
  cleanExpiredMemories,
  getDatabase,
  type CreateMemoryInput,
  type MemoryFilter,
  type Memory as MementosMemory,
} from '@hasna/mementos';

/**
 * MemoryStore — mementos-backed implementation
 *
 * Drop-in replacement for the native SQLite key-value store.
 * Uses @hasna/mementos SDK for persistence, keeping the same
 * set/get/delete/has/keys/clearExpired API surface.
 */
export class MemoryStore {
  private agentId: string | null;
  private projectId: string | null;
  private scope: 'global' | 'shared' | 'private';

  constructor(
    _db?: unknown,
    assistantId?: string | null,
    options?: { projectId?: string; scope?: 'global' | 'shared' | 'private' }
  ) {
    // _db is accepted for signature compatibility but ignored —
    // mementos manages its own database via getDatabase()
    this.agentId = assistantId || null;
    this.projectId = options?.projectId || null;
    this.scope = options?.scope || 'shared';

    // Ensure the mementos database is initialized
    getDatabase();
  }

  /**
   * Store a key-value pair
   */
  set(key: string, value: unknown, ttlMs?: number): void {
    const input: CreateMemoryInput = {
      key,
      value: typeof value === 'string' ? value : JSON.stringify(value),
      scope: this.scope,
      category: 'knowledge',
      source: 'agent',
      ...(this.agentId ? { agent_id: this.agentId } : {}),
      ...(this.projectId ? { project_id: this.projectId } : {}),
    };

    if (typeof ttlMs === 'number' && ttlMs > 0) {
      input.ttl_ms = ttlMs;
    }

    // createMemory with dedupeMode "merge" handles upsert by key+scope+agent+project
    createMemory(input, 'merge');
  }

  /**
   * Get a value by key
   */
  get<T>(key: string): T | null {
    const memory = getMemoryByKey(
      key,
      this.scope,
      this.agentId || undefined,
      this.projectId || undefined
    );

    if (!memory) return null;

    // Check expiration
    if (memory.expires_at && new Date(memory.expires_at) < new Date()) {
      mementosDeleteMemory(memory.id);
      return null;
    }

    try {
      // The mementos SDK stores value as a string.
      // Try to parse it as JSON; if it fails, return the raw string.
      return JSON.parse(memory.value) as T;
    } catch {
      return memory.value as T;
    }
  }

  /**
   * Delete a key
   */
  delete(key: string): void {
    const memory = getMemoryByKey(
      key,
      this.scope,
      this.agentId || undefined,
      this.projectId || undefined
    );

    if (memory) {
      mementosDeleteMemory(memory.id);
    }
  }

  /**
   * Check if a key exists
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Get all keys matching a pattern
   *
   * Pattern uses '*' as wildcard (SQL LIKE '%' style).
   * The mementos SDK's listMemories supports a 'search' filter
   * which does LIKE matching on key/value/summary.
   */
  keys(pattern?: string): string[] {
    const filter: MemoryFilter = {
      scope: this.scope,
      ...(this.agentId ? { agent_id: this.agentId } : {}),
      ...(this.projectId ? { project_id: this.projectId } : {}),
    };

    if (pattern) {
      // Convert glob-style '*' to a search term
      // For key-only matching, use the search filter which does LIKE on key
      filter.search = pattern.replace(/\*/g, '');
    }

    const memories = listMemories(filter);

    // If a pattern was provided, do additional key-level filtering
    // since the search filter matches value/summary too
    if (pattern) {
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
      );
      return memories.filter((m) => regex.test(m.key)).map((m) => m.key);
    }

    return memories.map((m) => m.key);
  }

  /**
   * Clear all expired entries
   */
  clearExpired(): number {
    return cleanExpiredMemories();
  }

  /**
   * Close the database connection (no-op — mementos manages its own connection)
   */
  close(): void {}
}
