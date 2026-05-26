/**
 * Local API Server
 *
 * Lightweight HTTP server using Bun.serve that binds to localhost only.
 * Provides API endpoints for the menu bar app and external integrations.
 */

import { SessionStorage } from '../logger';
import { freemem, totalmem } from 'os';
import { statfs } from 'fs';
import { LLM_PROVIDERS } from '@hasna/assistants-shared';

export interface MemoryEntry {
  key: string;
  value: unknown;
  scope?: string;
  category?: string;
  importance?: number;
  summary?: string | null;
  tags?: string[];
  source?: string;
  id?: string;
}

export interface ToolInfo {
  name: string;
  description: string;
  parameters?: unknown;
}

export interface LocalAPIServerOptions {
  port?: number;
  onChat?: (message: string) => Promise<AsyncIterable<string>>;
  onStatus?: () => Promise<ServerStatus>;
  onMemories?: (query?: string, limit?: number) => Promise<MemoryEntry[]>;
  /** Return list of available tools with their schemas */
  onListTools?: () => Promise<ToolInfo[]>;
  /** Execute a named tool with the given args, return result string */
  onExecuteTool?: (name: string, args: Record<string, unknown>) => Promise<string>;
  /** Execute a named skill, return SSE stream */
  onExecuteSkill?: (name: string, args: string) => Promise<AsyncIterable<string>>;
}

export interface ServerStatus {
  running: boolean;
  sessionId?: string;
  uptime: number;
  version?: string;
}

export class LocalAPIServer {
  private server: ReturnType<typeof Bun.serve> | null = null;
  private port: number;
  private startTime: number = Date.now();
  private onChat?: LocalAPIServerOptions['onChat'];
  private onStatus?: LocalAPIServerOptions['onStatus'];
  private onMemories?: LocalAPIServerOptions['onMemories'];
  private onListTools?: LocalAPIServerOptions['onListTools'];
  private onExecuteTool?: LocalAPIServerOptions['onExecuteTool'];
  private onExecuteSkill?: LocalAPIServerOptions['onExecuteSkill'];
  private notifications: Array<{ id: string; message: string; timestamp: number; type: string }> = [];

  constructor(options: LocalAPIServerOptions = {}) {
    this.port = options.port || 3456;
    this.onChat = options.onChat;
    this.onStatus = options.onStatus;
    this.onMemories = options.onMemories;
    this.onListTools = options.onListTools;
    this.onExecuteTool = options.onExecuteTool;
    this.onExecuteSkill = options.onExecuteSkill;
  }

  /**
   * Start the API server on localhost
   */
  start(): void {
    if (this.server) return;

    this.startTime = Date.now();

    this.server = Bun.serve({
      port: this.port,
      hostname: '127.0.0.1', // localhost only - no external access
      fetch: async (req) => {
        const url = new URL(req.url);

        // CORS headers for local access
        const headers = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        };

        if (req.method === 'OPTIONS') {
          return new Response(null, { status: 204, headers });
        }

        try {
          return await this.handleRequest(url.pathname, req, headers);
        } catch (error) {
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }),
            { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
          );
        }
      },
    });

    console.log(`Local API server running on http://127.0.0.1:${this.port}`);
  }

  /**
   * Stop the server
   */
  stop(): void {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
  }

  /**
   * Add a notification
   */
  addNotification(message: string, type: string = 'info'): void {
    this.notifications.push({
      id: `notif-${Date.now()}`,
      message,
      timestamp: Date.now(),
      type,
    });

    // Keep only last 50 notifications
    if (this.notifications.length > 50) {
      this.notifications = this.notifications.slice(-50);
    }
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server !== null;
  }

  private async handleRequest(
    path: string,
    req: Request,
    headers: Record<string, string>
  ): Promise<Response> {
    const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };

    // GET /api/status
    if (path === '/api/status' && req.method === 'GET') {
      const status: ServerStatus = this.onStatus
        ? await this.onStatus()
        : {
            running: true,
            uptime: Date.now() - this.startTime,
          };
      return new Response(JSON.stringify(status), { headers: jsonHeaders });
    }

    // GET /api/notifications
    if (path === '/api/notifications' && req.method === 'GET') {
      return new Response(
        JSON.stringify({ notifications: this.notifications.slice(-20) }),
        { headers: jsonHeaders }
      );
    }

    // POST /api/notifications
    if (path === '/api/notifications' && req.method === 'POST') {
      const body = await req.json() as { message?: string; type?: string };
      if (!body.message || typeof body.message !== 'string') {
        return new Response(
          JSON.stringify({ error: 'message is required' }),
          { status: 400, headers: jsonHeaders }
        );
      }
      const notification = {
        id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        message: body.message,
        timestamp: Date.now(),
        type: body.type ?? 'info',
      };
      this.notifications.push(notification);
      // Keep last 100 notifications
      if (this.notifications.length > 100) this.notifications.splice(0, this.notifications.length - 100);
      return new Response(JSON.stringify({ ok: true, id: notification.id }), { headers: jsonHeaders });
    }

    // POST /api/chat
    if (path === '/api/chat' && req.method === 'POST') {
      if (!this.onChat) {
        return new Response(
          JSON.stringify({ error: 'Chat handler not configured' }),
          { status: 503, headers: jsonHeaders }
        );
      }

      const body = await req.json() as { message?: string };
      const message = body.message;
      if (!message || typeof message !== 'string') {
        return new Response(
          JSON.stringify({ error: 'Message is required' }),
          { status: 400, headers: jsonHeaders }
        );
      }

      const stream = await this.onChat(message);

      // Return as SSE
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'text', text: chunk })}\n\n`)
              );
            }
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
            );
          } catch (error) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : 'Stream error' })}\n\n`
              )
            );
          } finally {
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          ...headers,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    // GET /api/memories?q=<query>&limit=<n>&scope=<scope>&category=<category>
    if (path === '/api/memories' && req.method === 'GET') {
      if (!this.onMemories) {
        return new Response(JSON.stringify({ memories: [] }), { headers: jsonHeaders });
      }
      const url = new URL(req.url);
      const query = url.searchParams.get('q') ?? url.searchParams.get('search') ?? undefined;
      const scope = url.searchParams.get('scope') ?? undefined;
      const category = url.searchParams.get('category') ?? undefined;
      const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);
      let memories = await this.onMemories(query, Math.min(limit, 100));
      if (scope) memories = memories.filter(m => m.scope === scope);
      if (category) memories = memories.filter(m => m.category === category);
      return new Response(JSON.stringify({ memories, total: memories.length }), { headers: jsonHeaders });
    }

    // GET /api/sessions
    if (path === '/api/sessions' && req.method === 'GET') {
      const url = new URL(req.url);
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100);
      const sessions = SessionStorage.listAllSessions().slice(0, limit);
      return new Response(JSON.stringify({ sessions, total: sessions.length }), { headers: jsonHeaders });
    }

    // GET /api/sessions/:id
    const sessionMatch = path.match(/^\/api\/sessions\/([^/]+)$/);
    if (sessionMatch && req.method === 'GET') {
      const sessionId = sessionMatch[1];
      const data = SessionStorage.loadSession(sessionId);
      if (!data) {
        return new Response(
          JSON.stringify({ error: `Session "${sessionId}" not found` }),
          { status: 404, headers: jsonHeaders }
        );
      }
      return new Response(JSON.stringify(data), { headers: jsonHeaders });
    }

    // GET /api/tools — list all registered tools with schemas
    if (path === '/api/tools' && req.method === 'GET') {
      if (!this.onListTools) {
        return new Response(JSON.stringify({ tools: [], total: 0 }), { headers: jsonHeaders });
      }
      const tools = await this.onListTools();
      return new Response(JSON.stringify({ tools, total: tools.length }), { headers: jsonHeaders });
    }

    // POST /api/tools/:name — execute a tool directly
    const toolExecMatch = path.match(/^\/api\/tools\/([^/]+)$/);
    if (toolExecMatch && req.method === 'POST') {
      const toolName = decodeURIComponent(toolExecMatch[1]);
      if (!this.onExecuteTool) {
        return new Response(
          JSON.stringify({ error: 'Tool execution not configured' }),
          { status: 503, headers: jsonHeaders }
        );
      }
      let args: Record<string, unknown> = {};
      try {
        const body = await req.json();
        if (typeof body === 'object' && body !== null) args = body as Record<string, unknown>;
      } catch { /* empty body is fine */ }
      try {
        const result = await this.onExecuteTool(toolName, args);
        return new Response(JSON.stringify({ result }), { headers: jsonHeaders });
      } catch (e) {
        return new Response(
          JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
          { status: 400, headers: jsonHeaders }
        );
      }
    }

    // GET /api/skills — list available skills (uses @hasna/skills SDK)
    if (path === '/api/skills' && req.method === 'GET') {
      try {
        const { SkillLoader } = await import('../skills/loader');
        const loader = new SkillLoader();
        await loader.loadAll(process.cwd(), { includeContent: false });
        const skills = loader.getSkills().map(s => ({
          name: s.name,
          description: s.description,
          argumentHint: s.argumentHint,
          source: s.source,
        }));
        return new Response(JSON.stringify({ skills, total: skills.length }), { headers: jsonHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ skills: [], total: 0 }), { headers: jsonHeaders });
      }
    }

    // POST /api/skills/:name — execute a skill (streaming SSE)
    const skillExecMatch = path.match(/^\/api\/skills\/([^/]+)$/);
    if (skillExecMatch && req.method === 'POST') {
      const skillName = decodeURIComponent(skillExecMatch[1]);
      if (!this.onExecuteSkill) {
        return new Response(
          JSON.stringify({ error: 'Skill execution not configured' }),
          { status: 503, headers: jsonHeaders }
        );
      }
      let skillArgs = '';
      try {
        const body = await req.json() as { arguments?: string };
        skillArgs = body.arguments ?? '';
      } catch { /* empty body */ }
      const stream = await this.onExecuteSkill(skillName, skillArgs);
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', text: chunk })}\n\n`));
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
          } catch (e) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: String(e) })}\n\n`));
          } finally {
            controller.close();
          }
        },
      });
      return new Response(readable, {
        headers: { ...headers, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      });
    }

    // GET /api/health — detailed health check
    if (path === '/api/health' && req.method === 'GET') {
      const apiKeys = Object.fromEntries(
        LLM_PROVIDERS.map((provider) => [provider.id, !!process.env[provider.apiKeyEnv]])
      );
      const hasLLMKey = Object.values(apiKeys).some(Boolean);
      const freeMemMb = Math.round(freemem() / 1024 / 1024);
      const totalMemMb = Math.round(totalmem() / 1024 / 1024);
      let freeDiskMb: number | null = null;
      try {
        await new Promise<void>((resolve, reject) =>
          statfs(process.cwd(), (err, stats) => {
            if (err) { reject(err); return; }
            freeDiskMb = Math.round((stats.bfree * stats.bsize) / 1024 / 1024);
            resolve();
          })
        );
      } catch { /* statfs unavailable */ }
      const sessionsCount = SessionStorage.listAllSessions().length;
      const health = {
        ok: hasLLMKey,
        api_keys: apiKeys,
        model: process.env.ASSISTANTS_MODEL ?? null,
        memory_free_mb: freeMemMb,
        memory_total_mb: totalMemMb,
        disk_free_mb: freeDiskMb,
        sessions_count: sessionsCount,
        uptime_ms: Date.now() - this.startTime,
        node_version: process.version,
      };
      return new Response(JSON.stringify(health), { headers: jsonHeaders });
    }

    // GET /api/metrics — token and tool usage stats from session history
    if (path === '/api/metrics' && req.method === 'GET') {
      const sessions = SessionStorage.listAllSessions();
      let totalMessages = 0;
      const toolCallCounts: Record<string, number> = {};

      for (const info of sessions.slice(0, 200)) {
        const data = SessionStorage.loadSession(info.id, info.assistantId);
        if (!data?.messages) continue;
        totalMessages += (data.messages as unknown[]).length;
        // Count tool_use blocks in assistant messages
        for (const m of data.messages as Array<{ role: string; content: unknown }>) {
          if (m.role !== 'assistant') continue;
          const content = Array.isArray(m.content) ? m.content : [];
          for (const block of content as Array<{ type?: string; name?: string }>) {
            if (block.type === 'tool_use' && block.name) {
              toolCallCounts[block.name] = (toolCallCounts[block.name] ?? 0) + 1;
            }
          }
        }
      }

      const topTools = Object.entries(toolCallCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));

      return new Response(JSON.stringify({
        total_sessions: sessions.length,
        total_messages: totalMessages,
        top_tools: topTools,
        uptime_ms: Date.now() - this.startTime,
      }), { headers: jsonHeaders });
    }

    // 404
    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: jsonHeaders }
    );
  }
}
