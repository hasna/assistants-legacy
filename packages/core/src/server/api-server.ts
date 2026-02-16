/**
 * Local API Server
 *
 * Lightweight HTTP server using Bun.serve that binds to localhost only.
 * Provides API endpoints for the menu bar app and external integrations.
 */

export interface LocalAPIServerOptions {
  port?: number;
  onChat?: (message: string) => Promise<AsyncIterable<string>>;
  onStatus?: () => Promise<ServerStatus>;
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
  private notifications: Array<{ id: string; message: string; timestamp: number; type: string }> = [];

  constructor(options: LocalAPIServerOptions = {}) {
    this.port = options.port || 3456;
    this.onChat = options.onChat;
    this.onStatus = options.onStatus;
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

    // 404
    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: jsonHeaders }
    );
  }
}
