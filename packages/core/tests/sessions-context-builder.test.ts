import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { buildSessionsContextPrompt, isSessionsContextEnabled } from '../src/sessions/context-builder';

describe('isSessionsContextEnabled', () => {
  let orig: string | undefined;
  beforeEach(() => { orig = process.env.SESSIONS_URL; });
  afterEach(() => {
    if (orig === undefined) delete process.env.SESSIONS_URL;
    else process.env.SESSIONS_URL = orig;
  });

  test('false when SESSIONS_URL not set', () => {
    delete process.env.SESSIONS_URL;
    expect(isSessionsContextEnabled()).toBe(false);
  });

  test('true when SESSIONS_URL is set', () => {
    process.env.SESSIONS_URL = 'http://localhost:3458';
    expect(isSessionsContextEnabled()).toBe(true);
  });
});

describe('buildSessionsContextPrompt', () => {
  test('returns null when sessions server is unreachable', async () => {
    const result = await buildSessionsContextPrompt({
      sessionsUrl: 'http://127.0.0.1:59997',
      timeoutMs: 100,
    });
    expect(result).toBeNull();
  });

  test('returns null for empty sessions list', async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response(JSON.stringify({ sessions: [] }), {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });
    try {
      const result = await buildSessionsContextPrompt({
        sessionsUrl: `http://127.0.0.1:${server.port}`,
        timeoutMs: 1000,
      });
      expect(result).toBeNull();
    } finally {
      server.stop();
    }
  });

  test('returns formatted context with sessions', async () => {
    const mockSessions = [
      { id: 'abc123', title: 'Fix auth bug', project: 'platform', message_count: 23, started_at: '2026-03-14T10:00:00Z' },
      { id: 'def456', title: 'Add OAuth flow', project: 'platform', message_count: 47, started_at: '2026-03-13T15:00:00Z' },
    ];

    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response(JSON.stringify({ sessions: mockSessions }), {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });
    try {
      const result = await buildSessionsContextPrompt({
        sessionsUrl: `http://127.0.0.1:${server.port}`,
        timeoutMs: 1000,
      });
      expect(result).not.toBeNull();
      expect(result).toContain('Recent Sessions');
      expect(result).toContain('Fix auth bug');
      expect(result).toContain('platform');
    } finally {
      server.stop();
    }
  });

  test('returns null when server returns non-OK status', async () => {
    const server = Bun.serve({
      port: 0,
      fetch() { return new Response('Error', { status: 500 }); },
    });
    try {
      expect(await buildSessionsContextPrompt({
        sessionsUrl: `http://127.0.0.1:${server.port}`,
        timeoutMs: 1000,
      })).toBeNull();
    } finally {
      server.stop();
    }
  });
});
