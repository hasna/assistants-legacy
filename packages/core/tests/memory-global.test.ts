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
