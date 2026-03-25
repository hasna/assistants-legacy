/**
 * Subagent Audit Log
 *
 * Persistent JSONL-based log of all subagent activity.
 * Each line is a self-contained JSON object representing one subagent execution.
 *
 * Default storage: ~/.hasna/assistants/subagent-logs/
 */

import { join } from 'path';
import { homedir } from 'os';
import {
  existsSync,
  mkdirSync,
  appendFileSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'fs';
import { getConfigDir } from '../config';

// ============================================
// Types
// ============================================

export interface SubagentToolCallEntry {
  name: string;
  input: Record<string, unknown>;
  output?: string;
}

export interface SubagentLogEntry {
  /** Unique ID for this log entry (matches the subagent ID) */
  id: string;
  /** Session ID of the parent that spawned this subagent */
  parentSessionId: string;
  /** The task/instruction given to the subagent */
  task: string;
  /** Tool calls made by the subagent during execution */
  toolCalls: SubagentToolCallEntry[];
  /** Number of LLM turns the subagent took */
  turns: number;
  /** Final result text (truncated if very large) */
  result?: string;
  /** Error messages if the subagent failed */
  errors?: string[];
  /** Duration in milliseconds */
  duration: number;
  /** ISO timestamp when the subagent started */
  startedAt: string;
  /** ISO timestamp when the subagent completed */
  completedAt: string;
  /** Final status */
  status: 'completed' | 'failed' | 'timeout';
}

export interface SubagentLogFilter {
  /** Filter by parent session ID */
  parentSessionId?: string;
  /** Only entries after this ISO date */
  since?: string;
  /** Maximum number of entries to return */
  limit?: number;
  /** Only entries with this status */
  status?: 'completed' | 'failed' | 'timeout';
}

// ============================================
// Constants
// ============================================

const DEFAULT_LOG_DIR = 'subagent-logs';
const LOG_FILE_PREFIX = 'subagent-log-';
const MAX_RESULT_LENGTH = 4000;

/**
 * Get the current date string in YYYY-MM-DD format for log file naming.
 */
function getDateString(date?: Date): string {
  const d = date ?? new Date();
  return d.toISOString().slice(0, 10);
}

// ============================================
// SubagentAuditLog Class
// ============================================

export class SubagentAuditLog {
  private logDir: string;

  constructor(logDir?: string) {
    this.logDir = logDir ?? join(getConfigDir(), DEFAULT_LOG_DIR);
  }

  /**
   * Ensure the log directory exists.
   */
  private ensureDir(): void {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Get the log file path for a given date.
   * Files are rotated daily: subagent-log-2026-03-13.jsonl
   */
  private getLogFilePath(date?: Date): string {
    return join(this.logDir, `${LOG_FILE_PREFIX}${getDateString(date)}.jsonl`);
  }

  /**
   * Append a log entry to the current day's JSONL file.
   */
  log(entry: SubagentLogEntry): void {
    this.ensureDir();

    // Truncate result if too large
    const truncated = { ...entry };
    if (truncated.result && truncated.result.length > MAX_RESULT_LENGTH) {
      truncated.result =
        truncated.result.slice(0, MAX_RESULT_LENGTH) + '... [truncated]';
    }

    // Truncate tool call outputs to keep log manageable
    if (truncated.toolCalls) {
      truncated.toolCalls = truncated.toolCalls.map((tc) => {
        if (tc.output && tc.output.length > 2000) {
          return { ...tc, output: tc.output.slice(0, 2000) + '... [truncated]' };
        }
        return tc;
      });
    }

    const line = JSON.stringify(truncated) + '\n';
    const filePath = this.getLogFilePath(new Date(entry.startedAt));

    try {
      appendFileSync(filePath, line, 'utf-8');
    } catch {
      // Best-effort logging — don't crash the assistant
    }
  }

  /**
   * Query log entries with optional filters.
   * Reads from JSONL files in reverse chronological order.
   */
  query(filter?: SubagentLogFilter): SubagentLogEntry[] {
    if (!existsSync(this.logDir)) return [];

    const limit = filter?.limit ?? 50;
    const sinceDate = filter?.since ? new Date(filter.since) : undefined;
    const results: SubagentLogEntry[] = [];

    // List all log files, sorted newest first
    let files: string[];
    try {
      files = readdirSync(this.logDir)
        .filter((f) => f.startsWith(LOG_FILE_PREFIX) && f.endsWith('.jsonl'))
        .sort()
        .reverse();
    } catch {
      return [];
    }

    for (const file of files) {
      // Early exit: if we have a since filter, skip files from before that date
      if (sinceDate) {
        const fileDate = file.replace(LOG_FILE_PREFIX, '').replace('.jsonl', '');
        if (fileDate < getDateString(sinceDate)) break;
      }

      const filePath = join(this.logDir, file);
      let content: string;
      try {
        content = readFileSync(filePath, 'utf-8');
      } catch {
        continue;
      }

      const lines = content.trim().split('\n').filter(Boolean).reverse();

      for (const line of lines) {
        if (results.length >= limit) break;

        let entry: SubagentLogEntry;
        try {
          entry = JSON.parse(line) as SubagentLogEntry;
        } catch {
          continue;
        }

        // Apply filters
        if (filter?.parentSessionId && entry.parentSessionId !== filter.parentSessionId) {
          continue;
        }
        if (filter?.status && entry.status !== filter.status) {
          continue;
        }
        if (sinceDate && new Date(entry.startedAt) < sinceDate) {
          continue;
        }

        results.push(entry);
      }

      if (results.length >= limit) break;
    }

    return results;
  }

  /**
   * Get a specific log entry by ID.
   * Searches through all log files (newest first).
   */
  getEntry(id: string): SubagentLogEntry | null {
    if (!existsSync(this.logDir)) return null;

    let files: string[];
    try {
      files = readdirSync(this.logDir)
        .filter((f) => f.startsWith(LOG_FILE_PREFIX) && f.endsWith('.jsonl'))
        .sort()
        .reverse();
    } catch {
      return null;
    }

    for (const file of files) {
      const filePath = join(this.logDir, file);
      let content: string;
      try {
        content = readFileSync(filePath, 'utf-8');
      } catch {
        continue;
      }

      const lines = content.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as SubagentLogEntry;
          if (entry.id === id) return entry;
        } catch {
          continue;
        }
      }
    }

    return null;
  }

  /**
   * Get the storage directory path.
   */
  getLogDir(): string {
    return this.logDir;
  }
}
