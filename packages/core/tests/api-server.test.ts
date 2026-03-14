import { describe, test, expect, afterEach } from 'bun:test';
import { LocalAPIServer } from '../src/server/api-server';
import type { ServerStatus } from '../src/server/api-server';

// Use a high port to avoid conflicts
let nextPort = 19000;
function getPort() {
  return nextPort++;
}

describe('LocalAPIServer', () => {
  let server: LocalAPIServer | null = null;

  afterEach(() => {
    if (server) {
      server.stop();
      server = null;
    }
  });

  describe('constructor', () => {
    test('uses default port 3456', () => {
      server = new LocalAPIServer();
      expect(server.isRunning()).toBe(false);
    });

    test('accepts custom port', () => {
      const port = getPort();
      server = new LocalAPIServer({ port });
      expect(server.isRunning()).toBe(false);
    });
  });

  describe('start/stop lifecycle', () => {
    test('starts server and sets isRunning to true', () => {
      const port = getPort();
      server = new LocalAPIServer({ port });
      server.start();
      expect(server.isRunning()).toBe(true);
    });

    test('stops server and sets isRunning to false', () => {
      const port = getPort();
      server = new LocalAPIServer({ port });
      server.start();
      expect(server.isRunning()).toBe(true);
      server.stop();
      expect(server.isRunning()).toBe(false);
    });

    test('start is idempotent (calling twice does not crash)', () => {
      const port = getPort();
      server = new LocalAPIServer({ port });
      server.start();
      server.start(); // second call should be no-op
      expect(server.isRunning()).toBe(true);
    });

    test('stop is idempotent (calling on stopped server is fine)', () => {
      const port = getPort();
      server = new LocalAPIServer({ port });
      server.stop(); // not started
      expect(server.isRunning()).toBe(false);
    });
  });

  describe('addNotification', () => {
    test('adds notification with default type info', () => {
      server = new LocalAPIServer();
      server.addNotification('Test message');
      // Can't directly access private notifications but can test via API
    });

    test('adds notification with custom type', () => {
      server = new LocalAPIServer();
      server.addNotification('Error occurred', 'error');
    });

    test('trims notifications to last 50', () => {
      server = new LocalAPIServer();
      for (let i = 0; i < 60; i++) {
        server.addNotification(`Notification ${i}`);
      }
      // Notifications should be trimmed - tested via API
    });
  });

  describe('GET /api/status', () => {
    test('returns default status without onStatus handler', async () => {
      const port = getPort();
      server = new LocalAPIServer({ port });
      server.start();

      const res = await fetch(`http://127.0.0.1:${port}/api/status`);
      expect(res.status).toBe(200);

      const data = await res.json() as ServerStatus;
      expect(data.running).toBe(true);
      expect(typeof data.uptime).toBe('number');
      expect(data.uptime).toBeGreaterThanOrEqual(0);
    });

    test('returns custom status with onStatus handler', async () => {
      const port = getPort();
      server = new LocalAPIServer({
        port,
        onStatus: async () => ({
          running: true,
          sessionId: 'test-session',
          uptime: 12345,
          version: '1.0.0',
        }),
      });
      server.start();

      const res = await fetch(`http://127.0.0.1:${port}/api/status`);
      const data = await res.json() as ServerStatus;
      expect(data.sessionId).toBe('test-session');
      expect(data.uptime).toBe(12345);
      expect(data.version).toBe('1.0.0');
    });

    test('includes CORS headers', async () => {
      const port = getPort();
      server = new LocalAPIServer({ port });
      server.start();

      const res = await fetch(`http://127.0.0.1:${port}/api/status`);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('OPTIONS (CORS preflight)', () => {
    test('returns 204 with CORS headers', async () => {
      const port = getPort();
      server = new LocalAPIServer({ port });
      server.start();

      const res = await fetch(`http://127.0.0.1:${port}/api/status`, {
        method: 'OPTIONS',
      });
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });
  });

  describe('GET /api/notifications', () => {
    test('returns empty notifications initially', async () => {
      const port = getPort();
      server = new LocalAPIServer({ port });
      server.start();

      const res = await fetch(`http://127.0.0.1:${port}/api/notifications`);
      expect(res.status).toBe(200);

      const data = await res.json() as { notifications: unknown[] };
      expect(data.notifications).toEqual([]);
    });

    test('returns added notifications', async () => {
      const port = getPort();
      server = new LocalAPIServer({ port });
      server.start();

      server.addNotification('First notification');
      server.addNotification('Second notification', 'warning');

      const res = await fetch(`http://127.0.0.1:${port}/api/notifications`);
      const data = await res.json() as { notifications: Array<{ message: string; type: string }> };
      expect(data.notifications.length).toBe(2);
      expect(data.notifications[0].message).toBe('First notification');
      expect(data.notifications[0].type).toBe('info');
      expect(data.notifications[1].message).toBe('Second notification');
      expect(data.notifications[1].type).toBe('warning');
    });

    test('returns at most 20 notifications', async () => {
      const port = getPort();
      server = new LocalAPIServer({ port });
      server.start();

      for (let i = 0; i < 30; i++) {
        server.addNotification(`Notification ${i}`);
      }

      const res = await fetch(`http://127.0.0.1:${port}/api/notifications`);
      const data = await res.json() as { notifications: unknown[] };
      expect(data.notifications.length).toBe(20);
    });

    test('notification overflow trims to 50', async () => {
      const port = getPort();
      server = new LocalAPIServer({ port });
      server.start();

      for (let i = 0; i < 60; i++) {
        server.addNotification(`Notif ${i}`);
      }

      const res = await fetch(`http://127.0.0.1:${port}/api/notifications`);
      const data = await res.json() as { notifications: Array<{ message: string }> };
      // Shows last 20 of 50 kept (60 added, trimmed to 50, sliced to 20)
      expect(data.notifications.length).toBe(20);
      // The last notification should be #59
      expect(data.notifications[data.notifications.length - 1].message).toBe('Notif 59');
    });
  });

  describe('POST /api/chat', () => {
    test('returns 503 when no chat handler configured', async () => {
      const port = getPort();
      server = new LocalAPIServer({ port });
      server.start();

      const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello' }),
      });
      expect(res.status).toBe(503);

      const data = await res.json() as { error: string };
      expect(data.error).toContain('not configured');
    });

    test('returns 400 when message is missing', async () => {
      const port = getPort();
      server = new LocalAPIServer({
        port,
        onChat: async () => (async function* () { yield 'hi'; })(),
      });
      server.start();

      const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);

      const data = await res.json() as { error: string };
      expect(data.error).toContain('required');
    });

    test('returns 400 when message is not a string', async () => {
      const port = getPort();
      server = new LocalAPIServer({
        port,
        onChat: async () => (async function* () { yield 'hi'; })(),
      });
      server.start();

      const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 123 }),
      });
      expect(res.status).toBe(400);
    });

    test('streams SSE response with chat handler', async () => {
      const port = getPort();
      server = new LocalAPIServer({
        port,
        onChat: async (message: string) => {
          return (async function* () {
            yield 'Hello ';
            yield 'world!';
          })();
        },
      });
      server.start();

      const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hi there' }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/event-stream');
      expect(res.headers.get('Cache-Control')).toBe('no-cache');

      const text = await res.text();
      expect(text).toContain('"type":"text"');
      expect(text).toContain('"text":"Hello "');
      expect(text).toContain('"text":"world!"');
      expect(text).toContain('"type":"done"');
    });

    test('handles chat handler errors in stream', async () => {
      const port = getPort();
      server = new LocalAPIServer({
        port,
        onChat: async () => {
          return (async function* () {
            yield 'partial';
            throw new Error('Stream broke');
          })();
        },
      });
      server.start();

      const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'test' }),
      });

      const text = await res.text();
      expect(text).toContain('"type":"text"');
      expect(text).toContain('"type":"error"');
      expect(text).toContain('Stream broke');
    });

    test('handles non-Error thrown in stream', async () => {
      const port = getPort();
      server = new LocalAPIServer({
        port,
        onChat: async () => {
          return (async function* () {
            throw 'string error';
          })();
        },
      });
      server.start();

      const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'test' }),
      });

      const text = await res.text();
      expect(text).toContain('"type":"error"');
      expect(text).toContain('Stream error');
    });
  });

  describe('404 handling', () => {
    test('returns 404 for unknown paths', async () => {
      const port = getPort();
      server = new LocalAPIServer({ port });
      server.start();

      const res = await fetch(`http://127.0.0.1:${port}/api/unknown`);
      expect(res.status).toBe(404);

      const data = await res.json() as { error: string };
      expect(data.error).toBe('Not found');
    });

    test('returns 404 for wrong methods', async () => {
      const port = getPort();
      server = new LocalAPIServer({ port });
      server.start();

      // POST to /api/status (should be GET)
      const res = await fetch(`http://127.0.0.1:${port}/api/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect(res.status).toBe(404);
    });

    test('returns 404 for GET /api/chat (should be POST)', async () => {
      const port = getPort();
      server = new LocalAPIServer({ port });
      server.start();

      const res = await fetch(`http://127.0.0.1:${port}/api/chat`);
      expect(res.status).toBe(404);
    });
  });

  describe('error handling', () => {
    test('returns 500 when onStatus throws', async () => {
      const port = getPort();
      server = new LocalAPIServer({
        port,
        onStatus: async () => {
          throw new Error('Status handler failed');
        },
      });
      server.start();

      const res = await fetch(`http://127.0.0.1:${port}/api/status`);
      expect(res.status).toBe(500);

      const data = await res.json() as { error: string };
      expect(data.error).toBe('Status handler failed');
    });

    test('returns 500 with generic message for non-Error throws', async () => {
      const port = getPort();
      server = new LocalAPIServer({
        port,
        onStatus: async () => {
          throw 'not an error object';
        },
      });
      server.start();

      const res = await fetch(`http://127.0.0.1:${port}/api/status`);
      expect(res.status).toBe(500);

      const data = await res.json() as { error: string };
      expect(data.error).toBe('Internal error');
    });
  });

  describe('POST /api/notifications', () => {
    test('adds notification and returns ok + id', async () => {
      const port = getPort();
      server = new LocalAPIServer({ port });
      server.start();

      const res = await fetch(`http://127.0.0.1:${port}/api/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'test notification', type: 'success' }),
      });
      expect(res.status).toBe(200);
      const data = await res.json() as { ok: boolean; id: string };
      expect(data.ok).toBe(true);
      expect(data.id).toMatch(/^n-/);
    });

    test('returns 400 when message is missing', async () => {
      const port = getPort();
      server = new LocalAPIServer({ port });
      server.start();

      const res = await fetch(`http://127.0.0.1:${port}/api/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'info' }),
      });
      expect(res.status).toBe(400);
    });

    test('pushed notification appears in GET /api/notifications', async () => {
      const port = getPort();
      server = new LocalAPIServer({ port });
      server.start();

      await fetch(`http://127.0.0.1:${port}/api/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'hello from outside', type: 'info' }),
      });

      const res = await fetch(`http://127.0.0.1:${port}/api/notifications`);
      const data = await res.json() as { notifications: Array<{ message: string }> };
      expect(data.notifications.some(n => n.message === 'hello from outside')).toBe(true);
    });

    test('defaults type to info when not provided', async () => {
      const port = getPort();
      server = new LocalAPIServer({ port });
      server.start();

      await fetch(`http://127.0.0.1:${port}/api/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'no type' }),
      });

      const res = await fetch(`http://127.0.0.1:${port}/api/notifications`);
      const data = await res.json() as { notifications: Array<{ type: string; message: string }> };
      const n = data.notifications.find(x => x.message === 'no type');
      expect(n?.type).toBe('info');
    });
  });

  describe('GET /api/memories', () => {
    test('returns empty memories when no onMemories handler', async () => {
      const port = getPort();
      server = new LocalAPIServer({ port });
      server.start();

      const res = await fetch(`http://127.0.0.1:${port}/api/memories`);
      expect(res.status).toBe(200);
      const data = await res.json() as { memories: unknown[] };
      expect(Array.isArray(data.memories)).toBe(true);
      expect(data.memories).toHaveLength(0);
    });

    test('calls onMemories handler and returns results', async () => {
      const port = getPort();
      let capturedQuery: string | undefined;
      let capturedLimit: number | undefined;

      server = new LocalAPIServer({
        port,
        onMemories: async (q, limit) => {
          capturedQuery = q;
          capturedLimit = limit;
          return [{ key: 'foo', value: 'bar' }];
        },
      });
      server.start();

      const res = await fetch(`http://127.0.0.1:${port}/api/memories?q=foo&limit=5`);
      expect(res.status).toBe(200);
      const data = await res.json() as { memories: Array<{ key: string }>; total: number };
      expect(data.memories).toHaveLength(1);
      expect(data.memories[0].key).toBe('foo');
      expect(data.total).toBe(1);
      expect(capturedQuery).toBe('foo');
      expect(capturedLimit).toBe(5);
    });

    test('clamps limit to 100', async () => {
      const port = getPort();
      let capturedLimit: number | undefined;

      server = new LocalAPIServer({
        port,
        onMemories: async (_, limit) => {
          capturedLimit = limit;
          return [];
        },
      });
      server.start();

      await fetch(`http://127.0.0.1:${port}/api/memories?limit=999`);
      expect(capturedLimit).toBe(100);
    });
  });

  describe('GET /api/sessions + /api/sessions/:id', () => {
    test('returns sessions array', async () => {
      const port = getPort();
      server = new LocalAPIServer({ port });
      server.start();

      const res = await fetch(`http://127.0.0.1:${port}/api/sessions`);
      expect(res.status).toBe(200);
      const data = await res.json() as { sessions: unknown[]; total: number };
      expect(Array.isArray(data.sessions)).toBe(true);
      expect(typeof data.total).toBe('number');
    });

    test('respects limit query param', async () => {
      const port = getPort();
      server = new LocalAPIServer({ port });
      server.start();

      const res = await fetch(`http://127.0.0.1:${port}/api/sessions?limit=1`);
      expect(res.status).toBe(200);
      const data = await res.json() as { sessions: unknown[] };
      expect(data.sessions.length).toBeLessThanOrEqual(1);
    });

    test('GET /api/sessions/:id returns 404 for unknown session', async () => {
      const port = getPort();
      server = new LocalAPIServer({ port });
      server.start();

      const res = await fetch(`http://127.0.0.1:${port}/api/sessions/no-such-session-xyz`);
      expect(res.status).toBe(404);
      const data = await res.json() as { error: string };
      expect(data.error).toContain('no-such-session-xyz');
    });
  });
});
