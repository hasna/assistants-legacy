/**
 * Web chat tools — mirrors the core terminal tools using Node.js APIs.
 * Provides the same tool interface the AI expects from the terminal app.
 */

import { execSync, spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'fs';
import { join, resolve, isAbsolute } from 'path';

// ============================================
// Types
// ============================================

interface ToolDef {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

type ToolExecutor = (input: Record<string, string>) => Promise<string>;

// ============================================
// Tool definitions
// ============================================

const CWD = process.cwd();
const MEMORY_CATEGORIES = new Set(['preference', 'fact', 'knowledge', 'history', 'context']);
const MEMORY_SCOPES = new Set(['global', 'shared', 'private', 'session']);

function normalizeString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  return String(value);
}

function resolveProjectPath(input: Record<string, string>): string {
  const data = input as Record<string, unknown>;
  const candidate =
    normalizeString(data.project_path) ||
    normalizeString(data.projectPath) ||
    normalizeString(data.cwd);
  return candidate ? resolvePath(candidate) : CWD;
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeString(item).trim())
      .filter((item) => item.length > 0)
      .slice(0, 20);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, 20);
  }
  return [];
}

function serializeMemoryValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.stringify(JSON.parse(trimmed));
      } catch {
        return JSON.stringify(trimmed);
      }
    }
    return JSON.stringify(trimmed);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function parseStoredJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export const TOOLS: ToolDef[] = [
  {
    name: 'bash',
    description:
      'Execute a shell command. Use this to run terminal commands, install packages, run scripts, check git status, etc.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute' },
        cwd: { type: 'string', description: 'Working directory (default: project root)' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
      },
      required: ['command'],
    },
  },
  {
    name: 'read',
    description:
      'Read the contents of a file. Returns text content with line numbers. Works with any text file.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The file path to read' },
        offset: { type: 'number', description: 'Line number to start reading from (1-indexed)' },
        limit: { type: 'number', description: 'Maximum number of lines to read' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write',
    description: 'Write content to a file. Creates the file if it does not exist, overwrites if it does.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to write to' },
        content: { type: 'string', description: 'File content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'glob',
    description:
      'Find files matching a glob pattern (e.g., **/*.js, src/**/*.ts). Returns matching file paths.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern to match' },
        cwd: { type: 'string', description: 'Base directory for the search' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'grep',
    description:
      'Search for text patterns in files using regex. Returns matching lines with file paths and line numbers.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regular expression pattern to search for' },
        path: { type: 'string', description: 'Directory to search in (default: project root)' },
        glob: { type: 'string', description: 'Glob pattern to filter files (e.g., "*.ts")' },
        include: { type: 'string', description: 'File extension filter (e.g., "ts", "js")' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'web_search',
    description:
      'Search the web for current information. Use for recent events, current data, or up-to-date information.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'web_fetch',
    description: 'Fetch and read the contents of a URL. Returns the text content of the page.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch content from' },
      },
      required: ['url'],
    },
  },
  {
    name: 'tasks_list',
    description: 'List all tasks in the task queue.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by status: pending, in_progress, completed, failed, or all',
        },
      },
    },
  },
  {
    name: 'tasks_add',
    description: 'Add a new task to the task queue.',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Task description' },
        priority: { type: 'string', description: 'Priority: high, normal, or low (default: normal)' },
      },
      required: ['description'],
    },
  },
  {
    name: 'tasks_complete',
    description: 'Mark a task as completed.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The task ID to complete' },
      },
      required: ['id'],
    },
  },
  {
    name: 'memory_save',
    description: 'Save information to persistent memory for future recall across sessions.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Unique identifier for this memory' },
        value: { type: ['string', 'number', 'boolean', 'object'], description: 'The information to remember' },
        category: {
          type: 'string',
          description: 'Category: preference, fact, knowledge, history, or context',
        },
        scope: {
          type: 'string',
          description: 'Scope: global, shared, private, or session (default: global)',
        },
        scopeId: {
          type: 'string',
          description: 'Optional scope identifier (required for private/session)',
        },
        importance: {
          type: 'number',
          description: 'Importance level 1-10 (default: 5)',
        },
        summary: {
          type: 'string',
          description: 'Optional short summary',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags for categorization',
        },
      },
      required: ['key', 'value', 'category'],
    },
  },
  {
    name: 'memory_recall',
    description: 'Recall information from persistent memory by key or search.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Specific key to recall' },
        search: { type: 'string', description: 'Search term to find relevant memories' },
        category: { type: 'string', description: 'Filter by category' },
        scope: { type: 'string', description: 'Filter by scope' },
        scopeId: { type: 'string', description: 'Scope identifier (if needed)' },
        limit: { type: 'number', description: 'Maximum number of memories to return' },
      },
    },
  },
];

// ============================================
// Tool executors
// ============================================

function resolvePath(p: string): string {
  if (isAbsolute(p)) return p;
  return resolve(CWD, p);
}

const EXECUTORS: Record<string, ToolExecutor> = {
  async bash(input) {
    const command = input.command || '';
    const cwd = input.cwd ? resolvePath(input.cwd) : CWD;
    const timeout = Number(input.timeout) || 30000;

    try {
      const result = execSync(command, {
        cwd,
        timeout,
        maxBuffer: 1024 * 1024,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return result.slice(0, 8000);
    } catch (err: unknown) {
      const e = err as { status?: number; stdout?: string; stderr?: string; message?: string };
      const stdout = e.stdout || '';
      const stderr = e.stderr || '';
      const code = e.status ?? 1;
      return `Exit code ${code}\n${stdout}\n${stderr}`.trim().slice(0, 8000);
    }
  },

  async read(input) {
    const filePath = resolvePath(input.path || '');
    if (!existsSync(filePath)) return `Error: File not found: ${filePath}`;

    const stat = statSync(filePath);
    if (stat.isDirectory()) return `Error: ${filePath} is a directory, not a file.`;

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const offset = Math.max(0, (Number(input.offset) || 1) - 1);
    const limit = Number(input.limit) || lines.length;
    const slice = lines.slice(offset, offset + limit);

    return slice.map((line, i) => `${offset + i + 1}\t${line}`).join('\n').slice(0, 16000);
  },

  async write(input) {
    const filePath = resolvePath(input.path || '');
    const content = input.content || '';
    const dir = join(filePath, '..');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, content, 'utf-8');
    return `File written: ${filePath} (${content.length} chars)`;
  },

  async glob(input) {
    const pattern = input.pattern || '';
    const cwd = input.cwd ? resolvePath(input.cwd) : CWD;
    try {
      const result = execSync(`find ${cwd} -path '*/${pattern}' -o -name '${pattern}' 2>/dev/null | head -100`, {
        encoding: 'utf-8',
        timeout: 10000,
      });
      return result.trim() || 'No matches found.';
    } catch {
      // Fallback to simpler glob via bash
      try {
        const result = execSync(`ls -d ${cwd}/${pattern} 2>/dev/null | head -100`, {
          encoding: 'utf-8',
          timeout: 10000,
        });
        return result.trim() || 'No matches found.';
      } catch {
        return 'No matches found.';
      }
    }
  },

  async grep(input) {
    const pattern = input.pattern || '';
    const path = input.path ? resolvePath(input.path) : CWD;
    const globFilter = input.glob ? `--include='${input.glob}'` : '';
    const includeFilter = input.include ? `--include='*.${input.include}'` : '';

    try {
      const result = execSync(
        `grep -rn ${globFilter} ${includeFilter} '${pattern.replace(/'/g, "'\\''")}' '${path}' 2>/dev/null | head -80`,
        { encoding: 'utf-8', timeout: 15000, maxBuffer: 1024 * 1024 },
      );
      return result.trim().slice(0, 8000) || 'No matches found.';
    } catch {
      return 'No matches found.';
    }
  },

  async web_search(input) {
    const query = input.query || '';
    try {
      // Try Exa if API key is available
      const exaKey = process.env.EXA_API_KEY;
      if (exaKey) {
        const res = await fetch('https://api.exa.ai/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': exaKey },
          body: JSON.stringify({
            query,
            numResults: 8,
            type: 'neural',
            useAutoprompt: true,
            contents: { text: { maxCharacters: 500 } },
          }),
        });
        const data = await res.json();
        if (data.results && Array.isArray(data.results)) {
          return data.results
            .map((r: { title?: string; url?: string; text?: string }, i: number) =>
              `${i + 1}. ${r.title || 'Untitled'}\n   ${r.url || ''}\n   ${r.text || ''}`,
            )
            .join('\n\n')
            .slice(0, 6000);
        }
      }

      // Fallback: DuckDuckGo lite
      const res = await fetch(
        `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AssistantsBot/1.0)' } },
      );
      const html = await res.text();
      const cleaned = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return cleaned.slice(0, 6000) || 'No results found.';
    } catch (err) {
      return `Search failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
    }
  },

  async web_fetch(input) {
    const url = input.url || '';
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AssistantsBot/1.0)' },
        signal: AbortSignal.timeout(15000),
      });
      const text = await res.text();
      const cleaned = text
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return cleaned.slice(0, 8000);
    } catch (err) {
      return `Failed to fetch URL: ${err instanceof Error ? err.message : 'Unknown error'}`;
    }
  },

  async tasks_list(input) {
    try {
      const { getDb } = await import('@/lib/db');
      const db = getDb();
      const status = input.status || 'all';
      const projectPath = resolveProjectPath(input);
      const query =
        status === 'all'
          ? 'SELECT * FROM tasks WHERE project_path = ? ORDER BY created_at DESC LIMIT 50'
          : 'SELECT * FROM tasks WHERE project_path = ? AND status = ? ORDER BY created_at DESC LIMIT 50';
      const rows =
        status === 'all'
          ? db.prepare(query).all(projectPath)
          : db.prepare(query).all(projectPath, status);
      if (!rows || rows.length === 0) return 'No tasks found.';
      return JSON.stringify(rows, null, 2);
    } catch {
      return 'Task storage not available.';
    }
  },

  async tasks_add(input) {
    try {
      const { getDb } = await import('@/lib/db');
      const db = getDb();
      const id = `task-${Date.now()}`;
      const description = input.description || '';
      const priority = input.priority || 'normal';
      const projectPath = resolveProjectPath(input);
      db.prepare(
        'INSERT INTO tasks (id, project_path, description, priority, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(id, projectPath, description, priority, 'pending', Date.now());
      return `Task created: ${id} - ${description}`;
    } catch {
      return 'Failed to create task — task storage not available.';
    }
  },

  async tasks_complete(input) {
    try {
      const { getDb } = await import('@/lib/db');
      const db = getDb();
      const projectPath = resolveProjectPath(input);
      db.prepare(
        "UPDATE tasks SET status = 'completed', completed_at = ? WHERE id = ? AND project_path = ?",
      ).run(Date.now(), input.id || '', projectPath);
      return `Task ${input.id} marked as completed.`;
    } catch {
      return 'Failed to complete task — task storage not available.';
    }
  },

  async memory_save(input) {
    try {
      const { getDb } = await import('@/lib/db');
      const db = getDb();
      const data = input as Record<string, unknown>;
      const key = normalizeString(data.key).trim();
      const category = normalizeString(data.category).trim();
      if (!key) return 'Error: key is required';
      if (!category || !MEMORY_CATEGORIES.has(category)) {
        return `Error: category must be one of: ${[...MEMORY_CATEGORIES].join(', ')}`;
      }

      let scope = normalizeString(data.scope).trim();
      scope = MEMORY_SCOPES.has(scope) ? scope : 'global';
      const scopeId = normalizeString(data.scopeId ?? data.scope_id).trim() || null;
      if ((scope === 'private' || scope === 'session') && !scopeId) {
        scope = 'global';
      }

      const valueJson = serializeMemoryValue(data.value);
      if (!valueJson) return 'Error: value is required';

      const summary = normalizeString(data.summary).trim() || null;
      const rawImportance = Number(normalizeString(data.importance));
      const importance = Number.isFinite(rawImportance)
        ? Math.min(10, Math.max(1, rawImportance))
        : 5;
      const tags = parseTags(data.tags);

      const now = new Date().toISOString();
      const existing = db.prepare(
        'SELECT id FROM memories WHERE key = ? AND scope = ? AND scope_id IS ?',
      ).get(key, scope, scopeId) as { id: string } | undefined;

      if (existing?.id) {
        db.prepare(
          'UPDATE memories SET value = ?, summary = ?, importance = ?, tags = ?, updated_at = ? WHERE id = ?',
        ).run(valueJson, summary, importance, JSON.stringify(tags), now, existing.id);
        return `Memory updated: ${key}`;
      }

      const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      db.prepare(
        `INSERT INTO memories (
          id, scope, scope_id, category, key, value, summary,
          importance, tags, source, created_at, updated_at,
          accessed_at, access_count, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        scope,
        scopeId,
        category,
        key,
        valueJson,
        summary,
        importance,
        JSON.stringify(tags),
        'assistant',
        now,
        now,
        null,
        0,
        null,
      );
      return `Memory saved: ${key}`;
    } catch {
      return 'Memory storage not available.';
    }
  },

  async memory_recall(input) {
    try {
      const { getDb } = await import('@/lib/db');
      const db = getDb();
      const data = input as Record<string, unknown>;
      const key = normalizeString(data.key).trim();
      const search = normalizeString(data.search).trim();
      const category = normalizeString(data.category).trim();
      let scope = normalizeString(data.scope).trim();
      scope = MEMORY_SCOPES.has(scope) ? scope : 'global';
      const scopeId = normalizeString(data.scopeId ?? data.scope_id).trim() || null;
      const rawLimit = Number(normalizeString(data.limit));
      const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, rawLimit)) : 10;

      const formatRow = (row: Record<string, unknown>) => ({
        ...row,
        value: parseStoredJson(row.value as string | null),
        tags: parseStoredJson(row.tags as string | null) || [],
      });

      if (key) {
        const row = db.prepare(
          'SELECT * FROM memories WHERE key = ? AND scope = ? AND scope_id IS ?',
        ).get(key, scope, scopeId) as Record<string, unknown> | undefined;
        return row
          ? JSON.stringify({ found: true, memory: formatRow(row) }, null, 2)
          : JSON.stringify({ found: false, message: `No memory found with key: ${key}` }, null, 2);
      }

      if (!search && !category) {
        return JSON.stringify({
          error: 'Either key, search, or category is required to recall memories',
        });
      }

      const conditions: string[] = ['scope = ?', 'scope_id IS ?'];
      const params: unknown[] = [scope, scopeId];

      if (category) {
        if (!MEMORY_CATEGORIES.has(category)) {
          return JSON.stringify({
            error: `category must be one of: ${[...MEMORY_CATEGORIES].join(', ')}`,
          });
        }
        conditions.push('category = ?');
        params.push(category);
      }

      if (search) {
        conditions.push('(key LIKE ? OR summary LIKE ? OR value LIKE ?)');
        const term = `%${search}%`;
        params.push(term, term, term);
      }

      const rows = db.prepare(
        `SELECT * FROM memories WHERE ${conditions.join(' AND ')} ORDER BY importance DESC, updated_at DESC LIMIT ?`,
      ).all(...params, limit) as Record<string, unknown>[];

      return JSON.stringify(
        {
          found: rows.length > 0,
          count: rows.length,
          memories: rows.map(formatRow),
        },
        null,
        2,
      );
    } catch {
      return 'Memory storage not available.';
    }
  },
};

// ============================================
// Execute a tool by name
// ============================================

export async function executeTool(
  name: string,
  input: Record<string, string>,
): Promise<string> {
  const executor = EXECUTORS[name];
  if (!executor) return `Unknown tool: ${name}`;
  try {
    return await executor(input);
  } catch (err) {
    return `Tool error (${name}): ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}
