import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { AssistantsClient, createClient, fromEnv } from '../src/index';

// ─── Mock server ─────────────────────────────────────────────────────────────

const TEST_PORT = 54321;
let server: ReturnType<typeof Bun.serve> | null = null;

const mockStatus = {
  running: true,
  uptime: 12345,
  sessionId: 'test-session-1',
  version: '0.1.0',
};

const mockNotifications = [
  { id: 'n1', message: 'Hello from agent', timestamp: Date.now(), type: 'info' },
];

const mockSessions = [
  { id: 'sess-abc', startedAt: '2026-03-14T06:00:00.000Z', messageCount: 5, cwd: '/project' },
  { id: 'sess-xyz', startedAt: '2026-03-14T07:00:00.000Z', messageCount: 12, cwd: '/other' },
];

beforeAll(() => {
  server = Bun.serve({
    port: TEST_PORT,
    hostname: '127.0.0.1',
    fetch: async (req) => {
      const url = new URL(req.url);
      const headers = { 'Content-Type': 'application/json' };

      if (url.pathname === '/api/status') {
        return new Response(JSON.stringify(mockStatus), { headers });
      }

      if (url.pathname === '/api/notifications') {
        return new Response(JSON.stringify({ notifications: mockNotifications }), { headers });
      }

      if (url.pathname === '/api/sessions' && req.method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);
        const slice = mockSessions.slice(0, limit);
        return new Response(JSON.stringify({ sessions: slice, total: slice.length }), { headers });
      }

      const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (sessionMatch && req.method === 'GET') {
        const sess = mockSessions.find(s => s.id === sessionMatch[1]);
        if (!sess) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers });
        return new Response(JSON.stringify({ ...sess, messages: [] }), { headers });
      }

      if (url.pathname === '/api/notifications' && req.method === 'POST') {
        const body = await req.json() as { message?: string; type?: string };
        if (!body.message) return new Response(JSON.stringify({ error: 'message required' }), { status: 400, headers });
        return new Response(JSON.stringify({ ok: true, id: 'n-test-1' }), { headers });
      }

      if (url.pathname === '/api/chat' && req.method === 'POST') {
        const body = await req.json() as { message?: string };
        if (!body.message) {
          return new Response(JSON.stringify({ error: 'Message required' }), { status: 400, headers });
        }
        // Respond with SSE
        const encoder = new TextEncoder();
        const msg = body.message as string;
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', text: 'Echo: ' })}\n\n`));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', text: msg })}\n\n`));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
            controller.close();
          },
        });
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
          },
        });
      }

      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers });
    },
  });
});

afterAll(() => {
  server?.stop();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

const client = () => new AssistantsClient({ port: TEST_PORT });

describe('AssistantsClient', () => {
  test('getStatus returns server status', async () => {
    const status = await client().getStatus();
    expect(status.running).toBe(true);
    expect(status.uptime).toBe(12345);
    expect(status.sessionId).toBe('test-session-1');
    expect(status.version).toBe('0.1.0');
  });

  test('isAlive returns true when server is running', async () => {
    expect(await client().isAlive()).toBe(true);
  });

  test('isAlive returns false when server is unreachable', async () => {
    const dead = new AssistantsClient({ port: 59999 });
    expect(await dead.isAlive()).toBe(false);
  });

  test('getNotifications returns notification list', async () => {
    const notifications = await client().getNotifications();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].id).toBe('n1');
    expect(notifications[0].type).toBe('info');
  });

  test('chat streams response chunks', async () => {
    const chunks: string[] = [];
    const result = await client().chat('hello', {
      onChunk: (c) => chunks.push(c),
    });

    expect(result.error).toBeUndefined();
    expect(result.text).toBe('Echo: hello');
    expect(chunks).toEqual(['Echo: ', 'hello']);
  });

  test('chat calls onDone when complete', async () => {
    let doneCalled = false;
    await client().chat('test', { onDone: () => { doneCalled = true; } });
    expect(doneCalled).toBe(true);
  });

  test('ask returns full response text', async () => {
    const text = await client().ask('world');
    expect(text).toBe('Echo: world');
  });

  test('chat returns error on server error', async () => {
    // Create a client pointing to a route that doesn't exist
    const result = await new AssistantsClient({ port: TEST_PORT }).chat('');
    // Empty message triggers 400
    expect(result.error).toBeDefined();
  });
});

describe('sessions', () => {
  test('listSessions returns all sessions', async () => {
    const sessions = await client().listSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).toBe('sess-abc');
    expect(sessions[1].messageCount).toBe(12);
  });

  test('listSessions respects limit', async () => {
    const sessions = await client().listSessions(1);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('sess-abc');
  });

  test('getSession returns session data', async () => {
    const sess = await client().getSession('sess-abc');
    expect((sess as { id: string }).id).toBe('sess-abc');
    expect(Array.isArray((sess as { messages: unknown[] }).messages)).toBe(true);
  });

  test('getSession throws on missing session', async () => {
    await expect(client().getSession('no-such-session')).rejects.toThrow('not found');
  });
});

describe('notify', () => {
  test('pushes a notification without error', async () => {
    await expect(client().notify('test message')).resolves.toBeUndefined();
  });

  test('accepts custom notification type', async () => {
    await expect(client().notify('warning message', 'warning')).resolves.toBeUndefined();
  });
});

describe('createClient factory', () => {
  test('creates AssistantsClient with default options', () => {
    const c = createClient({ port: TEST_PORT });
    expect(c).toBeInstanceOf(AssistantsClient);
  });

  test('isAlive works from factory-created client', async () => {
    const c = createClient({ port: TEST_PORT });
    expect(await c.isAlive()).toBe(true);
  });
});

describe('fromEnv', () => {
  const origPort = process.env.ASSISTANTS_PORT;
  const origHost = process.env.ASSISTANTS_HOST;

  afterAll(() => {
    if (origPort === undefined) delete process.env.ASSISTANTS_PORT;
    else process.env.ASSISTANTS_PORT = origPort;
    if (origHost === undefined) delete process.env.ASSISTANTS_HOST;
    else process.env.ASSISTANTS_HOST = origHost;
  });

  test('reads ASSISTANTS_PORT from env', async () => {
    process.env.ASSISTANTS_PORT = String(TEST_PORT);
    delete process.env.ASSISTANTS_HOST;
    const c = fromEnv();
    expect(await c.isAlive()).toBe(true);
  });

  test('uses defaults when env vars are unset', () => {
    delete process.env.ASSISTANTS_PORT;
    delete process.env.ASSISTANTS_HOST;
    const c = fromEnv();
    expect(c).toBeInstanceOf(AssistantsClient);
  });
});
