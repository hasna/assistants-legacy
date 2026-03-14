import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SessionStorage } from '../src/logger';
import type { SessionData } from '../src/logger';

let tempDir: string;
let origAssistantsDir: string | undefined;

beforeEach(() => {
  origAssistantsDir = process.env.ASSISTANTS_DIR;
  tempDir = mkdtempSync(join(tmpdir(), 'session-storage-test-'));
  process.env.ASSISTANTS_DIR = tempDir;
});

afterEach(() => {
  if (origAssistantsDir === undefined) delete process.env.ASSISTANTS_DIR;
  else process.env.ASSISTANTS_DIR = origAssistantsDir;
  rmSync(tempDir, { recursive: true, force: true });
});

// Sample session data
function makeSessionData(overrides: Partial<SessionData> = {}): SessionData {
  return {
    messages: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ],
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cwd: '/some/project',
    ...overrides,
  };
}

// ─── Constructor validation ───────────────────────────────────────────────────

describe('SessionStorage constructor', () => {
  test('creates instance with valid sessionId', () => {
    expect(() => new SessionStorage('session-abc123', tempDir)).not.toThrow();
  });

  test('throws on invalid sessionId with path traversal', () => {
    expect(() => new SessionStorage('../evil', tempDir)).toThrow(/invalid/i);
  });

  test('throws on sessionId with slashes', () => {
    expect(() => new SessionStorage('a/b', tempDir)).toThrow(/invalid/i);
  });

  test('throws on empty sessionId', () => {
    expect(() => new SessionStorage('', tempDir)).toThrow(/invalid/i);
  });

  test('accepts alphanumeric + hyphens + underscores', () => {
    expect(() => new SessionStorage('valid-session_123', tempDir)).not.toThrow();
  });

  test('getSessionId returns correct id', () => {
    const s = new SessionStorage('my-session', tempDir);
    expect(s.getSessionId()).toBe('my-session');
  });
});

// ─── save + load ──────────────────────────────────────────────────────────────

describe('SessionStorage save/load', () => {
  test('load returns null when no session saved', () => {
    const s = new SessionStorage('new-session', tempDir);
    expect(s.load()).toBeNull();
  });

  test('save + load round-trip', () => {
    const s = new SessionStorage('test-session', tempDir);
    const data = makeSessionData();
    s.save(data);
    const loaded = s.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.cwd).toBe('/some/project');
    expect(loaded!.messages).toHaveLength(2);
  });

  test('load returns correct message content', () => {
    const s = new SessionStorage('msg-session', tempDir);
    s.save(makeSessionData());
    const loaded = s.load();
    const msgs = loaded!.messages as Array<{ role: string; content: string }>;
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].content).toBe('Hello');
    expect(msgs[1].role).toBe('assistant');
    expect(msgs[1].content).toBe('Hi there!');
  });

  test('save overwrites previous data', () => {
    const s = new SessionStorage('overwrite-session', tempDir);
    s.save(makeSessionData({ cwd: '/old/path' }));
    s.save(makeSessionData({ cwd: '/new/path' }));
    expect(s.load()!.cwd).toBe('/new/path');
  });
});

// ─── static listAllSessions ───────────────────────────────────────────────────

describe('SessionStorage.listAllSessions', () => {
  test('returns empty array when no sessions', () => {
    const sessions = SessionStorage.listAllSessions(tempDir);
    expect(sessions).toHaveLength(0);
  });

  test('returns saved sessions', () => {
    new SessionStorage('sess-001', tempDir).save(makeSessionData());
    new SessionStorage('sess-002', tempDir).save(makeSessionData());

    const sessions = SessionStorage.listAllSessions(tempDir);
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    const ids = sessions.map(s => s.id);
    expect(ids).toContain('sess-001');
    expect(ids).toContain('sess-002');
  });

  test('sessions include required fields', () => {
    new SessionStorage('sess-fields', tempDir).save(makeSessionData());
    const sessions = SessionStorage.listAllSessions(tempDir);
    const s = sessions.find(x => x.id === 'sess-fields');
    expect(s).toBeDefined();
    expect(s!.cwd).toBe('/some/project');
    expect(s!.messageCount).toBe(2);
    expect(s!.startedAt).toBeDefined();
    expect(s!.updatedAt).toBeDefined();
  });
});

// ─── static loadSession ───────────────────────────────────────────────────────

describe('SessionStorage.loadSession', () => {
  test('returns null for non-existent session', () => {
    expect(SessionStorage.loadSession('no-such', null, tempDir)).toBeNull();
  });

  test('loads session by ID', () => {
    new SessionStorage('load-by-id', tempDir).save(makeSessionData({ cwd: '/my/cwd' }));
    const data = SessionStorage.loadSession('load-by-id', null, tempDir);
    expect(data).not.toBeNull();
    expect(data!.cwd).toBe('/my/cwd');
  });

  test('returns null for invalid (path-traversal) ID', () => {
    expect(SessionStorage.loadSession('../hack', null, tempDir)).toBeNull();
  });
});

// ─── static getLatestSession ──────────────────────────────────────────────────

describe('SessionStorage.getLatestSession', () => {
  test('returns null when no sessions', () => {
    expect(SessionStorage.getLatestSession(null, tempDir)).toBeNull();
  });

  test('returns the most recently updated session', async () => {
    new SessionStorage('older', tempDir).save(makeSessionData({
      updatedAt: '2026-01-01T00:00:00Z',
    }));
    // Small delay to ensure different timestamps
    await new Promise(r => setTimeout(r, 10));
    new SessionStorage('newer', tempDir).save(makeSessionData({
      updatedAt: '2026-06-01T00:00:00Z',
    }));

    const latest = SessionStorage.getLatestSession(null, tempDir);
    expect(latest).not.toBeNull();
    expect(latest!.id).toBe('newer');
  });
});
