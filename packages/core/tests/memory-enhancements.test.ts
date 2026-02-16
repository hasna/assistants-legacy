import { describe, test, expect, beforeEach } from 'bun:test';
import { GlobalMemoryManager } from '../src/memory/global-memory';
import { MemoryInjector } from '../src/memory/injector';
import { ProjectMemoryManager } from '../src/memory/project-memory';
import { PreferenceLearner } from '../src/memory/preference-learner';

// ============================================
// In-memory SQLite helper
// ============================================

function createInMemoryDb() {
  const { Database } = require('bun:sqlite');
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(`
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
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_access_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_id TEXT NOT NULL,
      session_id TEXT,
      assistant_id TEXT,
      action TEXT NOT NULL,
      timestamp TEXT NOT NULL
    )
  `);

  return {
    prepare: (sql: string) => {
      const stmt = db.prepare(sql);
      return {
        run: (...args: unknown[]) => stmt.run(...args),
      };
    },
    query: (sql: string) => ({
      get: (...args: unknown[]) => db.prepare(sql).get(...args) || null,
      all: (...args: unknown[]) => db.prepare(sql).all(...args),
    }),
    _raw: db,
    _close: () => db.close(),
  } as any;
}

// ============================================
// ProjectMemoryManager
// ============================================

describe('ProjectMemoryManager', () => {
  // -------------------------------------------
  // getScopeId
  // -------------------------------------------
  describe('getScopeId', () => {
    test('returns consistent scope ID for the same path', () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'shared' });
      const pm1 = new ProjectMemoryManager(manager, '/home/user/my-project');
      const pm2 = new ProjectMemoryManager(manager, '/home/user/my-project');

      expect(pm1.getScopeId()).toBe(pm2.getScopeId());
    });

    test('returns different scope IDs for different paths', () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'shared' });
      const pmA = new ProjectMemoryManager(manager, '/path/a');
      const pmB = new ProjectMemoryManager(manager, '/path/b');

      expect(pmA.getScopeId()).not.toBe(pmB.getScopeId());
    });

    test('matches the expected regex pattern project:<12 hex chars>', () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'shared' });
      const pm = new ProjectMemoryManager(manager, '/any/path');

      expect(pm.getScopeId()).toMatch(/^project:[a-f0-9]{12}$/);
    });
  });

  // -------------------------------------------
  // remember
  // -------------------------------------------
  describe('remember', () => {
    test('uses default category=fact and importance=6', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'shared' });
      const pm = new ProjectMemoryManager(manager, '/proj');

      await pm.remember('tool', 'TypeScript');

      const memories = await pm.list();
      expect(memories.length).toBe(1);
      expect(memories[0].category).toBe('fact');
      expect(memories[0].importance).toBe(6);
    });

    test('accepts custom category and importance', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'shared' });
      const pm = new ProjectMemoryManager(manager, '/proj');

      await pm.remember('note', 'something', 'knowledge', 9);

      const memories = await pm.list();
      expect(memories.length).toBe(1);
      expect(memories[0].category).toBe('knowledge');
      expect(memories[0].importance).toBe(9);
    });
  });

  // -------------------------------------------
  // recall
  // -------------------------------------------
  describe('recall', () => {
    test('returns memories matching the query', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'shared' });
      const pm = new ProjectMemoryManager(manager, '/proj');

      await pm.remember('stack', 'React and TypeScript are used');

      const results = await pm.recall('React');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].key).toBe('stack');
    });

    test('returns empty array when no matches', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'shared' });
      const pm = new ProjectMemoryManager(manager, '/proj');

      await pm.remember('stack', 'React is used');

      const results = await pm.recall('zzzznonexistent');
      expect(results).toEqual([]);
    });
  });

  // -------------------------------------------
  // recordDecision
  // -------------------------------------------
  describe('recordDecision', () => {
    test('records a decision with context', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'shared' });
      const pm = new ProjectMemoryManager(manager, '/proj');

      await pm.recordDecision('Use PostgreSQL', 'Better JSON support');

      const memories = await pm.list('knowledge');
      expect(memories.length).toBe(1);
      expect(memories[0].tags).toContain('decision');
      expect(memories[0].tags).toContain('project');
      const value = memories[0].value as string;
      expect(value).toContain('Use PostgreSQL');
      expect(value).toContain('Context: Better JSON support');
    });

    test('records a decision without context', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'shared' });
      const pm = new ProjectMemoryManager(manager, '/proj');

      await pm.recordDecision('Switch to Vite');

      const memories = await pm.list('knowledge');
      expect(memories.length).toBe(1);
      const value = memories[0].value as string;
      expect(value).toBe('Switch to Vite');
      expect(value).not.toContain('Context:');
    });

    test('truncates summary for long decisions (>200 chars)', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'shared' });
      const pm = new ProjectMemoryManager(manager, '/proj');

      const longDecision = 'A'.repeat(300);
      await pm.recordDecision(longDecision);

      const memories = await pm.list('knowledge');
      expect(memories.length).toBe(1);
      expect(memories[0].summary).toBeDefined();
      expect(memories[0].summary!.length).toBe(200);
    });
  });

  // -------------------------------------------
  // getProjectContext
  // -------------------------------------------
  describe('getProjectContext', () => {
    test('returns empty string for a project with no memories', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'shared' });
      const pm = new ProjectMemoryManager(manager, '/empty');

      const ctx = await pm.getProjectContext();
      expect(ctx).toBe('');
    });

    test('returns formatted context with summaries for populated project', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'shared' });
      const pm = new ProjectMemoryManager(manager, '/proj');

      await pm.remember('lang', 'TypeScript');
      await pm.remember('db', 'PostgreSQL');

      const ctx = await pm.getProjectContext();
      expect(ctx).toContain('## Project Memory');
      expect(ctx).toContain('/proj');
      expect(ctx).toContain('TypeScript');
      expect(ctx).toContain('PostgreSQL');
    });

    test('uses value as fallback when memory has no summary', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'shared' });
      const pm = new ProjectMemoryManager(manager, '/proj');

      // remember() does not set summary, so fallback to value
      await pm.remember('info', 'Some important info');

      const ctx = await pm.getProjectContext();
      expect(ctx).toContain('Some important info');
    });
  });

  // -------------------------------------------
  // list
  // -------------------------------------------
  describe('list', () => {
    test('returns all memories without category filter', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'shared' });
      const pm = new ProjectMemoryManager(manager, '/proj');

      await pm.remember('a', 'val-a', 'fact');
      await pm.remember('b', 'val-b', 'knowledge');

      const all = await pm.list();
      expect(all.length).toBe(2);
    });

    test('filters by category', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'shared' });
      const pm = new ProjectMemoryManager(manager, '/proj');

      await pm.remember('a', 'val-a', 'fact');
      await pm.remember('b', 'val-b', 'knowledge');

      const facts = await pm.list('fact');
      expect(facts.length).toBe(1);
      expect(facts[0].key).toBe('a');
    });

    test('returns empty array for category with no matches', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'shared' });
      const pm = new ProjectMemoryManager(manager, '/proj');

      await pm.remember('a', 'val-a', 'fact');

      const prefs = await pm.list('preference');
      expect(prefs).toEqual([]);
    });
  });

  // -------------------------------------------
  // forget
  // -------------------------------------------
  describe('forget', () => {
    test('returns true when deleting an existing key', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'shared' });
      const pm = new ProjectMemoryManager(manager, '/proj');

      await pm.remember('temp', 'delete me');
      const result = await pm.forget('temp');
      expect(result).toBe(true);
    });

    test('returns false when key does not exist', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'shared' });
      const pm = new ProjectMemoryManager(manager, '/proj');

      const result = await pm.forget('nonexistent');
      expect(result).toBe(false);
    });

    test('memory is no longer retrievable after forget', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'shared' });
      const pm = new ProjectMemoryManager(manager, '/proj');

      await pm.remember('temp', 'delete me');
      await pm.forget('temp');

      const remaining = (await pm.list()).filter(m => m.key === 'temp');
      expect(remaining.length).toBe(0);
    });
  });
});

// ============================================
// PreferenceLearner
// ============================================

describe('PreferenceLearner', () => {
  // -------------------------------------------
  // observe
  // -------------------------------------------
  describe('observe', () => {
    test('creates a new pattern with count=1', () => {
      const learner = new PreferenceLearner(3);

      learner.observe({ type: 'style', key: 'indent', value: 'tabs' });

      const patterns = learner.getPatterns();
      expect(patterns.length).toBe(1);
      expect(patterns[0].count).toBe(1);
      expect(patterns[0].value).toBe('tabs');
    });

    test('increments count for an existing pattern', () => {
      const learner = new PreferenceLearner(3);

      learner.observe({ type: 'style', key: 'indent', value: 'tabs' });
      learner.observe({ type: 'style', key: 'indent', value: 'tabs' });
      learner.observe({ type: 'style', key: 'indent', value: 'tabs' });

      const patterns = learner.getPatterns();
      expect(patterns.length).toBe(1);
      expect(patterns[0].count).toBe(3);
    });

    test('updates lastSeen timestamp on re-observe', () => {
      const learner = new PreferenceLearner(3);

      learner.observe({ type: 'style', key: 'indent', value: 'tabs' });
      const first = (learner as any).patterns.get('style:indent:tabs')!;
      const firstLastSeen = first.lastSeen;

      const before = Date.now();
      learner.observe({ type: 'style', key: 'indent', value: 'tabs' });
      const second = (learner as any).patterns.get('style:indent:tabs')!;

      expect(second.lastSeen).toBeGreaterThanOrEqual(before);
      expect(second.count).toBe(2);
    });
  });

  // -------------------------------------------
  // observeToolCall
  // -------------------------------------------
  describe('observeToolCall', () => {
    test('observes string parameters', () => {
      const learner = new PreferenceLearner(3);
      learner.observeToolCall('bash', { command: 'ls -la' });

      const patterns = learner.getPatterns();
      expect(patterns.some(p => p.key === 'tool_param:bash.command:ls -la')).toBe(true);
    });

    test('observes boolean parameters', () => {
      const learner = new PreferenceLearner(3);
      learner.observeToolCall('bash', { verbose: true });

      const patterns = learner.getPatterns();
      expect(patterns.some(p => p.key === 'tool_param:bash.verbose:true')).toBe(true);
    });

    test('observes number parameters', () => {
      const learner = new PreferenceLearner(3);
      learner.observeToolCall('bash', { timeout: 30000 });

      const patterns = learner.getPatterns();
      expect(patterns.some(p => p.key === 'tool_param:bash.timeout:30000')).toBe(true);
    });

    test('skips object parameters', () => {
      const learner = new PreferenceLearner(3);
      learner.observeToolCall('tool', { config: { nested: true } });

      const patterns = learner.getPatterns();
      expect(patterns.length).toBe(0);
    });

    test('skips array parameters', () => {
      const learner = new PreferenceLearner(3);
      learner.observeToolCall('tool', { items: [1, 2, 3] });

      const patterns = learner.getPatterns();
      expect(patterns.length).toBe(0);
    });

    test('handles empty params', () => {
      const learner = new PreferenceLearner(3);
      learner.observeToolCall('tool', {});

      const patterns = learner.getPatterns();
      expect(patterns.length).toBe(0);
    });
  });

  // -------------------------------------------
  // observeFileCreation
  // -------------------------------------------
  describe('observeFileCreation', () => {
    test('extracts file extension', () => {
      const learner = new PreferenceLearner(3);
      learner.observeFileCreation('src/component.tsx');

      const patterns = learner.getPatterns();
      expect(patterns.length).toBe(1);
      expect(patterns[0].value).toBe('tsx');
    });

    test('file with no dot uses filename as extension (pop returns filename)', () => {
      const learner = new PreferenceLearner(3);
      learner.observeFileCreation('Makefile');

      // 'Makefile'.split('.').pop() returns 'Makefile' (truthy), so it gets observed
      const patterns = learner.getPatterns();
      expect(patterns.length).toBe(1);
      expect(patterns[0].value).toBe('makefile');
    });

    test('uses last part after dot for files with multiple dots', () => {
      const learner = new PreferenceLearner(3);
      learner.observeFileCreation('src/component.test.tsx');

      const patterns = learner.getPatterns();
      expect(patterns.length).toBe(1);
      expect(patterns[0].value).toBe('tsx');
    });
  });

  // -------------------------------------------
  // observeCorrection
  // -------------------------------------------
  describe('observeCorrection', () => {
    test('stores original and corrected values', () => {
      const learner = new PreferenceLearner(3);
      learner.observeCorrection('colour', 'color');

      const patterns = learner.getPatterns();
      expect(patterns.length).toBe(1);
      expect(patterns[0].key).toContain('colour');
      expect(patterns[0].value).toBe('color');
    });

    test('truncates long original to 50 chars and corrected to 200 chars', () => {
      const learner = new PreferenceLearner(3);
      const longOriginal = 'x'.repeat(100);
      const longCorrected = 'y'.repeat(400);
      learner.observeCorrection(longOriginal, longCorrected);

      const patterns = learner.getPatterns();
      expect(patterns.length).toBe(1);
      // The key is "correction:<truncated original>:<truncated corrected>"
      // original is sliced to 50 chars in the key
      expect(patterns[0].key).toContain('x'.repeat(50));
      expect(patterns[0].key).not.toContain('x'.repeat(51));
      // value is sliced to 200 chars
      expect(patterns[0].value).toBe('y'.repeat(200));
    });
  });

  // -------------------------------------------
  // flush
  // -------------------------------------------
  describe('flush', () => {
    test('does not save patterns below threshold', async () => {
      const conn = createInMemoryDb();
      const memory = new GlobalMemoryManager({ db: conn, defaultScope: 'global' });
      const learner = new PreferenceLearner(3);

      learner.observe({ type: 'file_type', key: 'preferred_extension', value: 'ts' });
      learner.observe({ type: 'file_type', key: 'preferred_extension', value: 'ts' });

      const saved = await learner.flush(memory);
      expect(saved).toBe(0);
    });

    test('saves patterns at threshold', async () => {
      const conn = createInMemoryDb();
      const memory = new GlobalMemoryManager({ db: conn, defaultScope: 'global' });
      const learner = new PreferenceLearner(3);

      for (let i = 0; i < 3; i++) {
        learner.observe({ type: 'file_type', key: 'preferred_extension', value: 'ts' });
      }

      const saved = await learner.flush(memory);
      expect(saved).toBe(1);
    });

    test('saves patterns above threshold', async () => {
      const conn = createInMemoryDb();
      const memory = new GlobalMemoryManager({ db: conn, defaultScope: 'global' });
      const learner = new PreferenceLearner(2);

      for (let i = 0; i < 5; i++) {
        learner.observe({ type: 'file_type', key: 'preferred_extension', value: 'ts' });
      }

      const saved = await learner.flush(memory);
      expect(saved).toBe(1);
    });

    test('does not duplicate already-saved patterns on second flush', async () => {
      const conn = createInMemoryDb();
      const memory = new GlobalMemoryManager({ db: conn, defaultScope: 'global' });
      const learner = new PreferenceLearner(2);

      for (let i = 0; i < 3; i++) {
        learner.observe({ type: 'file_type', key: 'preferred_extension', value: 'ts' });
      }

      const saved1 = await learner.flush(memory);
      expect(saved1).toBe(1);

      // Observe more but same key - already saved
      learner.observe({ type: 'file_type', key: 'preferred_extension', value: 'ts' });
      const saved2 = await learner.flush(memory);
      expect(saved2).toBe(0);
    });

    test('catches and skips save failures gracefully', async () => {
      // Create a mock memory manager that throws on set
      const brokenMemory = {
        set: async () => {
          throw new Error('Database write failed');
        },
      } as any;

      const learner = new PreferenceLearner(1);
      learner.observe({ type: 'file_type', key: 'ext', value: 'ts' });

      // Should not throw
      const saved = await learner.flush(brokenMemory);
      expect(saved).toBe(0);
    });
  });

  // -------------------------------------------
  // describePreference (tested indirectly via flush)
  // -------------------------------------------
  describe('describePreference', () => {
    test('tool_param description format', async () => {
      const conn = createInMemoryDb();
      const memory = new GlobalMemoryManager({ db: conn, defaultScope: 'global' });
      const learner = new PreferenceLearner(1);

      learner.observe({ type: 'tool_param', key: 'bash.verbose', value: 'true' });
      await learner.flush(memory);

      const result = await memory.query({ category: 'preference' });
      expect(result.memories.length).toBe(1);
      expect(result.memories[0].summary).toContain('User tends to use');
      expect(result.memories[0].summary).toContain('bash.verbose');
    });

    test('file_type description format', async () => {
      const conn = createInMemoryDb();
      const memory = new GlobalMemoryManager({ db: conn, defaultScope: 'global' });
      const learner = new PreferenceLearner(1);

      learner.observe({ type: 'file_type', key: 'preferred_extension', value: 'tsx' });
      await learner.flush(memory);

      const result = await memory.query({ category: 'preference' });
      expect(result.memories.length).toBe(1);
      expect(result.memories[0].summary).toContain('User prefers .tsx files');
    });

    test('correction description format', async () => {
      const conn = createInMemoryDb();
      const memory = new GlobalMemoryManager({ db: conn, defaultScope: 'global' });
      const learner = new PreferenceLearner(1);

      learner.observe({ type: 'correction', key: 'colour', value: 'color' });
      await learner.flush(memory);

      const result = await memory.query({ category: 'preference' });
      expect(result.memories.length).toBe(1);
      expect(result.memories[0].summary).toContain('User prefers:');
      expect(result.memories[0].summary).toContain('color');
    });

    test('style description format', async () => {
      const conn = createInMemoryDb();
      const memory = new GlobalMemoryManager({ db: conn, defaultScope: 'global' });
      const learner = new PreferenceLearner(1);

      learner.observe({ type: 'style', key: 'indent', value: 'tabs' });
      await learner.flush(memory);

      const result = await memory.query({ category: 'preference' });
      expect(result.memories.length).toBe(1);
      expect(result.memories[0].summary).toContain('User style preference');
    });

    test('unknown type returns null and is not saved', async () => {
      const conn = createInMemoryDb();
      const memory = new GlobalMemoryManager({ db: conn, defaultScope: 'global' });
      const learner = new PreferenceLearner(1);

      learner.observe({ type: 'unknown_type' as any, key: 'foo', value: 'bar' });
      const saved = await learner.flush(memory);

      expect(saved).toBe(0);
    });
  });

  // -------------------------------------------
  // getPatterns
  // -------------------------------------------
  describe('getPatterns', () => {
    test('returns all patterns as an array', () => {
      const learner = new PreferenceLearner(3);

      learner.observe({ type: 'style', key: 'indent', value: 'tabs' });
      learner.observe({ type: 'file_type', key: 'ext', value: 'ts' });
      learner.observe({ type: 'tool_param', key: 'bash.v', value: 'true' });

      const patterns = learner.getPatterns();
      expect(patterns.length).toBe(3);
      expect(patterns.every(p => typeof p.key === 'string')).toBe(true);
      expect(patterns.every(p => typeof p.value === 'string')).toBe(true);
      expect(patterns.every(p => typeof p.count === 'number')).toBe(true);
    });

    test('returns empty array when no patterns observed', () => {
      const learner = new PreferenceLearner(3);
      expect(learner.getPatterns()).toEqual([]);
    });
  });

  // -------------------------------------------
  // clear
  // -------------------------------------------
  describe('clear', () => {
    test('empties all patterns', () => {
      const learner = new PreferenceLearner(3);

      learner.observe({ type: 'style', key: 'indent', value: 'tabs' });
      learner.observe({ type: 'file_type', key: 'ext', value: 'ts' });
      expect(learner.getPatterns().length).toBe(2);

      learner.clear();
      expect(learner.getPatterns().length).toBe(0);
    });
  });
});

// ============================================
// GlobalMemoryManager (session scope)
// ============================================

describe('GlobalMemoryManager - Session Scope', () => {
  // -------------------------------------------
  // isScopeEnabled (tested indirectly)
  // -------------------------------------------
  describe('isScopeEnabled', () => {
    test('session scope is always enabled (operations succeed)', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({
        db: conn,
        defaultScope: 'global',
        sessionId: 'sess-1',
      });

      // If session scope were disabled, this would throw
      const mem = await manager.set('test-key', 'test-val', {
        scope: 'session',
        category: 'context',
      });
      expect(mem.scope).toBe('session');
    });
  });

  // -------------------------------------------
  // set with session scope
  // -------------------------------------------
  describe('set with session scope', () => {
    test('works when sessionId is provided', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({
        db: conn,
        defaultScope: 'global',
        sessionId: 'sess-abc',
      });

      const mem = await manager.set('note', 'session note', {
        scope: 'session',
        category: 'context',
      });

      expect(mem.scope).toBe('session');
      expect(mem.scopeId).toBe('sess-abc');
      expect(mem.value).toBe('session note');
    });

    test('throws when no sessionId is provided', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({
        db: conn,
        defaultScope: 'global',
        // no sessionId
      });

      try {
        await manager.set('note', 'session note', {
          scope: 'session',
          category: 'context',
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toContain('sessionId');
      }
    });
  });

  // -------------------------------------------
  // clearSessionMemories
  // -------------------------------------------
  describe('clearSessionMemories', () => {
    test('clears only session-scoped memories, leaves global/shared/private intact', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({
        db: conn,
        defaultScope: 'global',
        sessionId: 'sess-clear',
        scopeId: 'assistant-1',
      });

      // Session memories
      await manager.set('s1', 'session 1', { scope: 'session', category: 'context' });
      await manager.set('s2', 'session 2', { scope: 'session', category: 'context' });

      // Global memory
      await manager.set('g1', 'global data', { scope: 'global', category: 'fact' });

      // Shared memory
      await manager.set('sh1', 'shared data', { scope: 'shared', category: 'fact' });

      // Private memory (needs scopeId)
      await manager.set('p1', 'private data', { scope: 'private', category: 'fact' });

      const cleared = await manager.clearSessionMemories('sess-clear');
      expect(cleared).toBe(2);

      // Global memory should still exist
      const globalMem = await manager.get('g1', 'global');
      expect(globalMem).not.toBeNull();

      // Shared memory should still exist
      const sharedMem = await manager.get('sh1', 'shared');
      expect(sharedMem).not.toBeNull();

      // Private memory should still exist
      const privateMem = await manager.get('p1', 'private');
      expect(privateMem).not.toBeNull();
    });

    test('returns 0 for nonexistent sessionId', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({
        db: conn,
        defaultScope: 'global',
      });

      const cleared = await manager.clearSessionMemories('nonexistent-session');
      expect(cleared).toBe(0);
    });
  });

  // -------------------------------------------
  // getStats
  // -------------------------------------------
  describe('getStats', () => {
    test('includes session scope in scopeMap with default value of 0', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({
        db: conn,
        defaultScope: 'global',
      });

      const stats = await manager.getStats();
      expect(stats.byScope).toHaveProperty('session');
      expect(stats.byScope.session).toBe(0);
    });

    test('counts session memories in stats', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({
        db: conn,
        defaultScope: 'global',
        sessionId: 'sess-stats',
      });

      await manager.set('s1', 'val', { scope: 'session', category: 'context' });
      await manager.set('s2', 'val2', { scope: 'session', category: 'context' });
      await manager.set('g1', 'val', { scope: 'global', category: 'fact' });

      const stats = await manager.getStats();
      expect(stats.byScope.session).toBe(2);
      expect(stats.byScope.global).toBe(1);
      expect(stats.totalCount).toBe(3);
    });
  });
});

// ============================================
// MemoryInjector (modified prepareInjection)
// ============================================

describe('MemoryInjector', () => {
  // -------------------------------------------
  // Disabled injection
  // -------------------------------------------
  describe('disabled injection', () => {
    test('returns empty result when disabled', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'global' });
      const injector = new MemoryInjector(manager, { enabled: false });

      const result = await injector.prepareInjection('anything');
      expect(result.content).toBe('');
      expect(result.memoryIds).toEqual([]);
      expect(result.tokenEstimate).toBe(0);
    });
  });

  // -------------------------------------------
  // Preferences always fetched
  // -------------------------------------------
  describe('preferences always fetched', () => {
    test('fetches preferences regardless of context keywords', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'global' });

      await manager.set('pref-indent', 'User prefers tabs', {
        scope: 'global',
        category: 'preference',
        importance: 8,
        summary: 'Prefers tabs for indentation',
      });

      const injector = new MemoryInjector(manager, {
        enabled: true,
        maxTokens: 1000,
        minImportance: 5,
        categories: ['preference', 'fact'],
        refreshInterval: 5,
      });

      // Use context that has no keyword overlap with the preference
      const result = await injector.prepareInjection('What is quantum entanglement?');

      // Preference should appear because preferences are always fetched
      expect(result.content).toContain('User Preferences');
      expect(result.content).toContain('Prefers tabs');
    });
  });

  // -------------------------------------------
  // Context memories with keyword matching
  // -------------------------------------------
  describe('context memories with keyword matching', () => {
    test('fetches context memories that match keywords', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'global' });

      await manager.set('react-stack', 'The project uses React 18', {
        scope: 'global',
        category: 'fact',
        importance: 7,
        summary: 'Project uses React 18',
      });

      const injector = new MemoryInjector(manager, {
        enabled: true,
        maxTokens: 1000,
        minImportance: 5,
        categories: ['preference', 'fact'],
        refreshInterval: 5,
      });

      const result = await injector.prepareInjection('Tell me about the React components');
      expect(result.content).toContain('React');
    });
  });

  // -------------------------------------------
  // Deduplication: same memory in both lists
  // -------------------------------------------
  describe('deduplication', () => {
    test('same memory in both preference and context lists appears only once', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'global' });

      // A preference that also matches a context keyword
      await manager.set('pref-ts', 'User prefers TypeScript strict mode', {
        scope: 'global',
        category: 'preference',
        importance: 8,
        summary: 'Prefers TypeScript strict mode',
      });

      const injector = new MemoryInjector(manager, {
        enabled: true,
        maxTokens: 1000,
        minImportance: 5,
        categories: ['preference', 'fact'],
        refreshInterval: 5,
      });

      const result = await injector.prepareInjection('Tell me about TypeScript');
      // Count occurrences of the summary in the content - should appear once
      const occurrences = result.content.split('TypeScript strict mode').length - 1;
      expect(occurrences).toBe(1);
      // memoryIds should be unique
      const uniqueIds = new Set(result.memoryIds);
      expect(uniqueIds.size).toBe(result.memoryIds.length);
    });
  });

  // -------------------------------------------
  // All memories recently injected returns empty
  // -------------------------------------------
  describe('recently injected deduplication', () => {
    test('returns empty when all memories were recently injected', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'global' });

      await manager.set('pref-tabs', 'User prefers tabs', {
        scope: 'global',
        category: 'preference',
        importance: 8,
        summary: 'Prefers tabs',
      });

      const injector = new MemoryInjector(manager, {
        enabled: true,
        maxTokens: 1000,
        minImportance: 5,
        categories: ['preference', 'fact'],
        refreshInterval: 100, // High refresh interval so dedupe persists
      });

      // First injection should have content
      const first = await injector.prepareInjection('anything');
      expect(first.content.length).toBeGreaterThan(0);

      // Second injection should be empty since all memories are deduped
      const second = await injector.prepareInjection('anything');
      expect(second.content).toBe('');
      expect(second.memoryIds).toEqual([]);
    });
  });

  // -------------------------------------------
  // Refresh interval clears dedupe set
  // -------------------------------------------
  describe('refresh interval', () => {
    test('clears dedupe set after refreshInterval turns', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'global' });

      await manager.set('pref-x', 'User prefers x', {
        scope: 'global',
        category: 'preference',
        importance: 8,
        summary: 'Prefers x',
      });

      const injector = new MemoryInjector(manager, {
        enabled: true,
        maxTokens: 1000,
        minImportance: 5,
        categories: ['preference', 'fact'],
        refreshInterval: 3,
      });

      // Turn 1: inject (turnsSinceRefresh goes from 0 to 1)
      const r1 = await injector.prepareInjection('context');
      expect(r1.memoryIds.length).toBeGreaterThan(0);

      // Turn 2: deduped (turnsSinceRefresh = 2)
      const r2 = await injector.prepareInjection('context');
      expect(r2.content).toBe('');

      // Turn 3: turnsSinceRefresh = 3 >= refreshInterval (3), so refresh happens
      const r3 = await injector.prepareInjection('context');
      expect(r3.memoryIds.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------
  // Token budget limits output
  // -------------------------------------------
  describe('token budget', () => {
    test('limits formatted output based on maxTokens', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'global' });

      // Create many memories that would exceed a small token budget
      for (let i = 0; i < 20; i++) {
        await manager.set(`fact-${i}`, `This is fact number ${i} with extra text`, {
          scope: 'global',
          category: 'fact',
          importance: 7,
          summary: `Fact ${i}: ${'x'.repeat(50)}`,
        });
      }

      // Very small token budget
      const injector = new MemoryInjector(manager, {
        enabled: true,
        maxTokens: 50,
        minImportance: 5,
        categories: ['fact'],
        refreshInterval: 100,
      });

      const result = await injector.prepareInjection('fact');
      // Should have content but not all 20 memories
      expect(result.memoryIds.length).toBeLessThan(20);
      expect(result.tokenEstimate).toBeLessThanOrEqual(50);
    });
  });

  // -------------------------------------------
  // Category formatting for all types
  // -------------------------------------------
  describe('category formatting', () => {
    test('formats preference category as "User Preferences"', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'global' });

      await manager.set('p1', 'val', {
        scope: 'global',
        category: 'preference',
        importance: 8,
        summary: 'Test preference',
      });

      const injector = new MemoryInjector(manager, {
        enabled: true,
        maxTokens: 1000,
        minImportance: 5,
        categories: ['preference'],
        refreshInterval: 100,
      });

      const result = await injector.prepareInjection('anything');
      expect(result.content).toContain('### User Preferences');
    });

    test('formats fact category as "Known Facts"', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'global' });

      await manager.set('f1', 'val', {
        scope: 'global',
        category: 'fact',
        importance: 8,
        summary: 'A known fact',
      });

      const injector = new MemoryInjector(manager, {
        enabled: true,
        maxTokens: 1000,
        minImportance: 5,
        categories: ['fact'],
        refreshInterval: 100,
      });

      const result = await injector.prepareInjection('known fact');
      expect(result.content).toContain('### Known Facts');
    });

    test('formats knowledge category as "Knowledge Base"', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'global' });

      await manager.set('k1', 'val', {
        scope: 'global',
        category: 'knowledge',
        importance: 8,
        summary: 'Knowledge item',
      });

      const injector = new MemoryInjector(manager, {
        enabled: true,
        maxTokens: 1000,
        minImportance: 5,
        categories: ['knowledge'],
        refreshInterval: 100,
      });

      const result = await injector.prepareInjection('knowledge item');
      expect(result.content).toContain('### Knowledge Base');
    });

    test('formats history category as "Recent Context"', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'global' });

      await manager.set('h1', 'val', {
        scope: 'global',
        category: 'history',
        importance: 8,
        summary: 'History entry',
      });

      const injector = new MemoryInjector(manager, {
        enabled: true,
        maxTokens: 1000,
        minImportance: 5,
        categories: ['history'],
        refreshInterval: 100,
      });

      const result = await injector.prepareInjection('history entry');
      expect(result.content).toContain('### Recent Context');
    });

    test('formats context category as "Session Context"', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'global' });

      await manager.set('c1', 'val', {
        scope: 'global',
        category: 'context',
        importance: 8,
        summary: 'Context entry item',
      });

      const injector = new MemoryInjector(manager, {
        enabled: true,
        maxTokens: 1000,
        minImportance: 5,
        categories: ['context'],
        refreshInterval: 100,
      });

      const result = await injector.prepareInjection('context entry item');
      expect(result.content).toContain('### Session Context');
    });

    test('marks high-importance memories (>=8) with "(important)"', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'global' });

      await manager.set('important-pref', 'Very important', {
        scope: 'global',
        category: 'preference',
        importance: 9,
        summary: 'Critical preference',
      });

      const injector = new MemoryInjector(manager, {
        enabled: true,
        maxTokens: 1000,
        minImportance: 5,
        categories: ['preference'],
        refreshInterval: 100,
      });

      const result = await injector.prepareInjection('anything');
      expect(result.content).toContain('(important)');
    });

    test('does not mark low-importance memories (<8) with "(important)"', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'global' });

      await manager.set('normal-pref', 'Normal pref', {
        scope: 'global',
        category: 'preference',
        importance: 6,
        summary: 'Normal preference',
      });

      const injector = new MemoryInjector(manager, {
        enabled: true,
        maxTokens: 1000,
        minImportance: 5,
        categories: ['preference'],
        refreshInterval: 100,
      });

      const result = await injector.prepareInjection('anything');
      expect(result.content).not.toContain('(important)');
    });
  });

  // -------------------------------------------
  // Refresh and reset helpers
  // -------------------------------------------
  describe('refresh and reset', () => {
    test('refresh() forces re-injection on next turn', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'global' });

      await manager.set('pref-y', 'User prefers y', {
        scope: 'global',
        category: 'preference',
        importance: 8,
        summary: 'Prefers y',
      });

      const injector = new MemoryInjector(manager, {
        enabled: true,
        maxTokens: 1000,
        minImportance: 5,
        categories: ['preference'],
        refreshInterval: 100,
      });

      // First call
      const r1 = await injector.prepareInjection('ctx');
      expect(r1.memoryIds.length).toBeGreaterThan(0);

      // Second call (deduped)
      const r2 = await injector.prepareInjection('ctx');
      expect(r2.content).toBe('');

      // Force refresh
      injector.refresh();

      // Third call (should inject again)
      const r3 = await injector.prepareInjection('ctx');
      expect(r3.memoryIds.length).toBeGreaterThan(0);
    });

    test('reset() clears state completely', async () => {
      const conn = createInMemoryDb();
      const manager = new GlobalMemoryManager({ db: conn, defaultScope: 'global' });

      await manager.set('pref-z', 'User prefers z', {
        scope: 'global',
        category: 'preference',
        importance: 8,
        summary: 'Prefers z',
      });

      const injector = new MemoryInjector(manager, {
        enabled: true,
        maxTokens: 1000,
        minImportance: 5,
        categories: ['preference'],
        refreshInterval: 100,
      });

      // First call
      await injector.prepareInjection('ctx');
      expect(injector.getLastInjectedIds().length).toBeGreaterThan(0);

      // Reset
      injector.reset();
      expect(injector.getLastInjectedIds().length).toBe(0);
    });
  });
});
