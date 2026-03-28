/**
 * Logs SDK adapter — lazy loader for @hasna/logs
 *
 * @hasna/logs exports a LogsClient class (from sdk/ subpath).
 * The main module exports DB/lib functions for the CLI/server.
 * For the assistant, we use the client-side SDK.
 */

let _client: any | null = null;

async function client(): Promise<any> {
  if (!_client) {
    // @hasna/logs main module re-exports everything; the SDK client lives in sdk/
    // but isn't a separate npm package — import from main and use LogsClient if available,
    // otherwise fall back to direct DB functions.
    const mod = await import('@hasna/logs' as any);
    if (mod.LogsClient) {
      _client = new mod.LogsClient();
    } else {
      // Fallback: wrap raw DB functions into a client-like interface
      _client = {
        push: mod.createLog ?? (async () => null),
        search: mod.listLogs ?? mod.searchLogs ?? (async () => []),
        summary: mod.getStats ?? mod.getSummary ?? (async () => null),
        _raw: mod,
      };
    }
  }
  return _client;
}

export async function createLog(message: string, level = 'info'): Promise<any> {
  try {
    const c = await client();
    if (c.push) return await c.push({ message, level, source: 'assistant' });
    return null;
  } catch {
    return null;
  }
}

export async function listLogs(limit = 20, level?: string): Promise<any[]> {
  try {
    const c = await client();
    if (c.search) return await c.search({ limit, level: level || undefined });
    if (c.tail) return await c.tail(undefined, limit);
    return [];
  } catch {
    return [];
  }
}

export async function clearLogs(): Promise<any> {
  try {
    const c = await client();
    if (c._raw?.clearLogs) return await c._raw.clearLogs();
    return null;
  } catch {
    return null;
  }
}

export async function getStats(): Promise<any> {
  try {
    const c = await client();
    if (c.summary) return await c.summary();
    return null;
  } catch {
    return null;
  }
}
