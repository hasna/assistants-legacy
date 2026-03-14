/**
 * Sessions Context Builder
 *
 * Fetches recent sessions from the @hasna/sessions REST API and formats
 * them as a system prompt addition so the AI assistant knows what was
 * recently worked on.
 *
 * Triggered when SESSIONS_URL is set in the environment.
 */

export interface SessionsContextOptions {
  /** Base URL of the sessions REST API (default: SESSIONS_URL env var or http://localhost:3458) */
  sessionsUrl?: string;
  /** Max sessions to show (default: 5) */
  maxSessions?: number;
  /** Timeout in ms (default: 3000) */
  timeoutMs?: number;
}

interface SessionSummary {
  id: string;
  title?: string;
  project?: string;
  model?: string;
  source?: string;
  started_at?: string;
  message_count?: number;
  cost_estimate?: number;
}

/**
 * Fetch recent sessions from the sessions REST API.
 * Returns null if sessions is not configured, unreachable, or has no sessions.
 * Never throws — failures are silently ignored.
 */
export async function buildSessionsContextPrompt(options: SessionsContextOptions = {}): Promise<string | null> {
  const sessionsUrl = options.sessionsUrl
    ?? process.env.SESSIONS_URL
    ?? 'http://localhost:3458';

  const maxSessions = options.maxSessions ?? 5;
  const timeoutMs = options.timeoutMs ?? 3000;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let sessions: SessionSummary[] = [];

    try {
      const res = await fetch(`${sessionsUrl}/api/sessions?limit=${maxSessions}&sort=recent`, {
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const data = await res.json() as { sessions?: SessionSummary[] };
      sessions = data.sessions ?? [];
    } finally {
      clearTimeout(timer);
    }

    if (sessions.length === 0) return null;

    const lines: string[] = ['## Recent Sessions'];

    for (const s of sessions) {
      const title = s.title || s.id.slice(0, 8);
      const project = s.project ? ` [${s.project}]` : '';
      const msgs = s.message_count ? ` (${s.message_count} msgs)` : '';
      const date = s.started_at ? ` — ${new Date(s.started_at).toLocaleDateString()}` : '';
      lines.push(`• ${title}${project}${msgs}${date}`);
    }

    lines.push('');
    lines.push('Use sessions tools to search or resume any of these conversations.');

    return lines.join('\n');
  } catch {
    // sessions not running, not configured, or timed out — silently skip
    return null;
  }
}

/**
 * Check if sessions context injection is enabled.
 */
export function isSessionsContextEnabled(): boolean {
  return !!process.env.SESSIONS_URL;
}
