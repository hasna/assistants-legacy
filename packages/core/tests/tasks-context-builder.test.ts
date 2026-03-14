import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { buildTasksContextPrompt, isTasksContextEnabled } from '../src/tasks/context-builder';

// ─── isTasksContextEnabled ────────────────────────────────────────────────────

describe('isTasksContextEnabled', () => {
  let orig: string | undefined;

  beforeEach(() => { orig = process.env.TODOS_URL; });
  afterEach(() => {
    if (orig === undefined) delete process.env.TODOS_URL;
    else process.env.TODOS_URL = orig;
  });

  test('returns false when TODOS_URL not set', () => {
    delete process.env.TODOS_URL;
    expect(isTasksContextEnabled()).toBe(false);
  });

  test('returns true when TODOS_URL is set', () => {
    process.env.TODOS_URL = 'http://localhost:19427';
    expect(isTasksContextEnabled()).toBe(true);
  });
});

// ─── buildTasksContextPrompt ──────────────────────────────────────────────────

describe('buildTasksContextPrompt', () => {
  test('returns null when todos server is unreachable', async () => {
    // Use a port that is definitely not listening
    const result = await buildTasksContextPrompt({
      todosUrl: 'http://127.0.0.1:59999',
      timeoutMs: 100,
    });
    expect(result).toBeNull();
  });

  test('returns null for non-existent server (connection refused)', async () => {
    const result = await buildTasksContextPrompt({
      todosUrl: 'http://localhost:59998',
      timeoutMs: 100,
    });
    expect(result).toBeNull();
  });

  test('returns null when todos responds with empty task list', async () => {
    // Mock a server that returns empty tasks
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === '/api/tasks') {
          return new Response(JSON.stringify({ tasks: [] }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
      },
    });

    try {
      const result = await buildTasksContextPrompt({
        todosUrl: `http://127.0.0.1:${server.port}`,
        timeoutMs: 1000,
      });
      expect(result).toBeNull();
    } finally {
      server.stop();
    }
  });

  test('returns formatted context when tasks are available', async () => {
    const mockTasks = [
      { id: 'TSK-001', subject: 'Fix the auth bug', status: 'in_progress', priority: 'high' },
      { id: 'TSK-002', subject: 'Write tests for login', status: 'pending', priority: 'normal' },
    ];

    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === '/api/tasks') {
          const status = url.searchParams.get('status');
          const tasks = status ? mockTasks.filter(t => t.status === status) : mockTasks;
          return new Response(JSON.stringify({ tasks }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('{}');
      },
    });

    try {
      const result = await buildTasksContextPrompt({
        todosUrl: `http://127.0.0.1:${server.port}`,
        timeoutMs: 1000,
      });
      expect(result).not.toBeNull();
      expect(result).toContain('Pending Tasks');
      expect(result).toContain('TSK-001');
      expect(result).toContain('Fix the auth bug');
      expect(result).toContain('🔵'); // in_progress badge
      expect(result).toContain('TSK-002');
    } finally {
      server.stop();
    }
  });

  test('respects maxTasks option', async () => {
    const mockTasks = Array.from({ length: 20 }, (_, i) => ({
      id: `TSK-${String(i).padStart(3, '0')}`,
      subject: `Task ${i}`,
      status: 'pending',
      priority: 'normal',
    }));

    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === '/api/tasks') {
          const limit = parseInt(url.searchParams.get('limit') ?? '10', 10);
          return new Response(JSON.stringify({ tasks: mockTasks.slice(0, limit) }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('{}');
      },
    });

    try {
      const result = await buildTasksContextPrompt({
        todosUrl: `http://127.0.0.1:${server.port}`,
        timeoutMs: 1000,
        maxTasks: 3,
      });
      expect(result).not.toBeNull();
      // Should contain tasks and the header
      expect(result).toContain('Pending Tasks');
      expect(result).toContain('TSK-');
    } finally {
      server.stop();
    }
  });
});
