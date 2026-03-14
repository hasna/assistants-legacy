import { describe, test, expect, beforeAll, afterAll, mock } from 'bun:test';
import { AssistantsClient, createClient } from '../src/index';

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
