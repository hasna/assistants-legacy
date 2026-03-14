/**
 * @hasna/assistants-sdk
 *
 * Zero-dependency TypeScript SDK for connecting to a local @hasna/assistants
 * API server (started by `assistants serve` or the terminal app).
 *
 * Usage:
 *   import { AssistantsClient } from '@hasna/assistants-sdk';
 *   const client = new AssistantsClient({ port: 3456 });
 *   const status = await client.getStatus();
 *   await client.chat('Hello!', chunk => process.stdout.write(chunk));
 */

export interface AssistantsClientOptions {
  /** Port the assistant API server is listening on (default: 3456) */
  port?: number;
  /** Host (default: 127.0.0.1) */
  host?: string;
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
}

export interface ServerStatus {
  running: boolean;
  sessionId?: string;
  uptime: number;
  version?: string;
}

export interface Notification {
  id: string;
  message: string;
  timestamp: number;
  type: string;
}

export interface MemoryEntry {
  key: string;
  value: unknown;
  scope?: string;
  category?: string;
  importance?: number;
}

export interface SessionInfo {
  id: string;
  startedAt?: string;
  messageCount?: number;
  assistantId?: string;
  cwd?: string;
}

export interface ChatOptions {
  /** Called for each streamed text chunk */
  onChunk?: (chunk: string) => void;
  /** Called when streaming is complete */
  onDone?: () => void;
  /** Called on error */
  onError?: (error: string) => void;
}

export interface ChatResult {
  text: string;
  error?: string;
}

export class AssistantsClient {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(options: AssistantsClientOptions = {}) {
    const host = options.host ?? '127.0.0.1';
    const port = options.port ?? 3456;
    this.baseUrl = `http://${host}:${port}`;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  /**
   * Get the current server status.
   */
  async getStatus(): Promise<ServerStatus> {
    const res = await this.fetch('/api/status');
    if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
    return res.json() as Promise<ServerStatus>;
  }

  /**
   * Check if the assistant API server is reachable.
   */
  async isAlive(): Promise<boolean> {
    try {
      await this.getStatus();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get recent notifications from the assistant.
   */
  async getNotifications(): Promise<Notification[]> {
    const res = await this.fetch('/api/notifications');
    if (!res.ok) throw new Error(`Notifications failed: ${res.status}`);
    const data = await res.json() as { notifications: Notification[] };
    return data.notifications;
  }

  /**
   * Get memories from the running assistant's memory store.
   * @param query - Optional keyword to filter memories
   * @param limit - Max results (default 20)
   */
  async getMemories(query?: string, limit = 20): Promise<MemoryEntry[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (query) params.set('q', query);
    const res = await this.fetch(`/api/memories?${params}`);
    if (!res.ok) throw new Error(`Get memories failed: ${res.status}`);
    const data = await res.json() as { memories: MemoryEntry[] };
    return data.memories;
  }

  /**
   * List recent sessions (up to `limit`, default 20).
   */
  async listSessions(limit = 20): Promise<SessionInfo[]> {
    const res = await this.fetch(`/api/sessions?limit=${limit}`);
    if (!res.ok) throw new Error(`List sessions failed: ${res.status}`);
    const data = await res.json() as { sessions: SessionInfo[] };
    return data.sessions;
  }

  /**
   * Get the messages and metadata for a specific session.
   */
  async getSession(sessionId: string): Promise<Record<string, unknown>> {
    const res = await this.fetch(`/api/sessions/${encodeURIComponent(sessionId)}`);
    if (res.status === 404) throw new Error(`Session "${sessionId}" not found`);
    if (!res.ok) throw new Error(`Get session failed: ${res.status}`);
    return res.json() as Promise<Record<string, unknown>>;
  }

  /**
   * Push a notification to the running assistant.
   * The notification will appear in `getNotifications()` results.
   */
  async notify(message: string, type: string = 'info'): Promise<void> {
    const res = await this.fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, type }),
    });
    if (!res.ok) throw new Error(`Notify failed: ${res.status}`);
  }

  /**
   * Send a message to the assistant and stream the response.
   *
   * @param message - The message to send
   * @param options - Streaming callbacks
   * @returns The full response text once streaming completes
   */
  async chat(message: string, options: ChatOptions = {}): Promise<ChatResult> {
    const res = await this.fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      const errText = await res.text();
      const errMsg = `Chat request failed (${res.status}): ${errText}`;
      options.onError?.(errMsg);
      return { text: '', error: errMsg };
    }

    return this.consumeSSE(res, options);
  }

  /**
   * Send a message and collect the full response (no streaming).
   */
  async ask(message: string): Promise<string> {
    const result = await this.chat(message);
    if (result.error) throw new Error(result.error);
    return result.text;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private fetch(path: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    return fetch(`${this.baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  }

  private async consumeSSE(res: Response, options: ChatOptions): Promise<ChatResult> {
    const reader = res.body?.getReader();
    if (!reader) return { text: '', error: 'No response body' };

    const decoder = new TextDecoder();
    let fullText = '';
    let errorMsg = '';
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const payload = JSON.parse(line.slice(6)) as {
              type: string;
              text?: string;
              error?: string;
            };
            if (payload.type === 'text' && payload.text) {
              fullText += payload.text;
              options.onChunk?.(payload.text);
            } else if (payload.type === 'done') {
              options.onDone?.();
            } else if (payload.type === 'error' && payload.error) {
              errorMsg = payload.error;
              options.onError?.(payload.error);
            }
          } catch {
            // skip malformed SSE line
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return errorMsg ? { text: fullText, error: errorMsg } : { text: fullText };
  }
}

// ─── Convenience factories ──────────────────────────────────────────────────

/**
 * Create an AssistantsClient connected to the default local port.
 */
export function createClient(options?: AssistantsClientOptions): AssistantsClient {
  return new AssistantsClient(options);
}

/**
 * Create an AssistantsClient from environment variables.
 *
 * Reads:
 *   ASSISTANTS_PORT  — port (default: 3456)
 *   ASSISTANTS_HOST  — host (default: 127.0.0.1)
 */
export function fromEnv(): AssistantsClient {
  const port = process.env.ASSISTANTS_PORT ? parseInt(process.env.ASSISTANTS_PORT, 10) : undefined;
  const host = process.env.ASSISTANTS_HOST ?? undefined;
  return new AssistantsClient({ port, host });
}
