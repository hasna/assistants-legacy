import { getDatabase } from '../database';
import type { DatabaseConnection } from '../runtime';
import type { Heartbeat, PersistedState } from './types';

/**
 * Information about a session that can be recovered
 */
export interface RecoverableSession {
  sessionId: string;
  heartbeat: Heartbeat;
  state: PersistedState;
  sessionPath: string;
  cwd: string;
  lastActivity: Date;
  messageCount: number;
  /** Last user message text (truncated to 80 chars) */
  lastMessage: string | null;
  /** Model used in session */
  model: string | null;
  /** Human-readable session label (auto-generated or user-set) */
  label: string | null;
}

/**
 * Find sessions that crashed or were terminated unexpectedly and can be recovered.
 */
export function findRecoverableSessions(
  staleThresholdMs = 120000,
  maxAgeMs = 24 * 60 * 60 * 1000,
  baseDir?: string,
  /** Cap the number of sessions returned (most-recent first). Keeps the recovery UI usable. */
  maxResults = 25
): RecoverableSession[] {
  const recoverableSessions: RecoverableSession[] = [];

  let db: DatabaseConnection;
  try {
    db = getDatabase();
  } catch {
    return recoverableSessions;
  }

  const now = Date.now();
  const cutoffIso = new Date(now - maxAgeMs).toISOString();

  // Query heartbeat_state table for stale sessions
  const rows = db
    .query<{ session_id: string; heartbeat: string; context: string; timestamp: string }>(
      'SELECT session_id, heartbeat, context, timestamp FROM heartbeat_state WHERE timestamp > ?'
    )
    .all(cutoffIso);

  for (const row of rows) {
    try {
      const heartbeat = JSON.parse(row.heartbeat) as Heartbeat;
      const context = JSON.parse(row.context) as { cwd: string; lastMessage?: string; lastTool?: string };
      const heartbeatAge = now - new Date(heartbeat.timestamp).getTime();

      // Skip if heartbeat is recent (session is still active)
      if (heartbeatAge < staleThresholdMs) {
        continue;
      }

      const state: PersistedState = {
        sessionId: row.session_id,
        heartbeat,
        context,
        timestamp: row.timestamp,
      };

      // Try to get label, model, and message count from persisted_sessions + related tables
      let messageCount = 0;
      let lastMessage: string | null = null;
      let model: string | null = null;
      let label: string | null = null;
      const cwd = context.cwd || process.cwd();

      try {
        const persisted = db
          .query<{ label: string | null; assistant_id: string | null }>('SELECT label, assistant_id FROM persisted_sessions WHERE id = ?')
          .get(row.session_id);
        if (persisted?.label) {
          label = persisted.label;
        }
        // Try to get model from assistant config
        if (persisted?.assistant_id) {
          try {
            const assistant = db
              .query<{ model: string | null }>('SELECT model FROM assistants_config WHERE id = ?')
              .get(persisted.assistant_id);
            if (assistant?.model) {
              model = assistant.model;
            }
          } catch {
            // Non-critical
          }
        }
      } catch {
        // Non-critical
      }

      // Get message count and last user message from session_messages
      try {
        const countRow = db
          .query<{ cnt: number }>('SELECT COUNT(*) as cnt FROM session_messages WHERE session_id = ?')
          .get(row.session_id);
        if (countRow) {
          messageCount = countRow.cnt;
        }

        const lastMsgRow = db
          .query<{ content: string }>('SELECT content FROM session_messages WHERE session_id = ? AND role = ? ORDER BY timestamp DESC LIMIT 1')
          .get(row.session_id, 'user');
        if (lastMsgRow?.content) {
          const text = lastMsgRow.content.trim();
          lastMessage = text.length > 80 ? text.slice(0, 77) + '...' : text;
        }
      } catch {
        // Non-critical — session_messages table may not exist or session has no messages
      }

      // An empty session has nothing worth recovering — skip it so the recovery
      // list isn't flooded with abandoned/never-used launches.
      if (messageCount === 0) {
        continue;
      }

      recoverableSessions.push({
        sessionId: row.session_id,
        heartbeat,
        state,
        sessionPath: '',
        cwd,
        lastActivity: new Date(heartbeat.lastActivity || heartbeat.timestamp),
        messageCount,
        lastMessage,
        model,
        label,
      });
    } catch {
      continue;
    }
  }

  recoverableSessions.sort(
    (a, b) => b.lastActivity.getTime() - a.lastActivity.getTime()
  );

  return maxResults > 0 ? recoverableSessions.slice(0, maxResults) : recoverableSessions;
}

/**
 * Clean up heartbeat state for a recovered or discarded session
 */
export function clearRecoveryState(sessionId: string, baseDir?: string): void {
  try {
    const db = getDatabase();
    db.prepare('DELETE FROM heartbeat_state WHERE session_id = ?').run(sessionId);
  } catch {
    // Ignore
  }
}
