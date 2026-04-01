#!/usr/bin/env bun

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { setRuntime, hasRuntime } from '@hasna/assistants-core';
import { bunRuntime } from '@hasna/runtime-bun';
import { registerCloudTools } from '@hasna/cloud';
import { setProjectRole, removeProjectRole, getEffectiveSystemPrompt, loadAgentDefinitions, setAgentModelConfig, syncToClaudeAgents, syncFromClaudeAgents } from '@hasna/assistants-core';
import { EmbeddedClient, SessionStorage } from '@hasna/assistants-core';
import type { StreamChunk, Message } from '@hasna/assistants-shared';

// Initialize Bun runtime
if (!hasRuntime()) {
  setRuntime(bunRuntime);
}

// Read version from package.json at startup (never hardcode)
const pkgJson = await import('../package.json', { with: { type: 'json' } });
export const MCP_VERSION: string = pkgJson.default?.version ?? '0.0.0';

// ─── Auth ─────────────────────────────────────────────────────────────────────
// Set ASSISTANTS_MCP_TOKEN to require a token for admin-only tools
// (register_tool, list_mcp_servers). Unset = admin tools freely accessible.

export function isAdminAuthorized(token: string | undefined, envToken: string | null): boolean {
  if (!envToken) return true;
  return token === envToken;
}

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Set ASSISTANTS_MCP_RATE_LIMIT=N to cap tool calls per minute per server.
// Default: 0 (unlimited). Uses a sliding window counter per server instance.

export function createRateLimiter(limitPerMinute: number): (toolName: string) => boolean {
  if (limitPerMinute <= 0) return () => true; // unlimited
  const calls: number[] = [];
  return (_toolName: string): boolean => {
    const now = Date.now();
    const windowStart = now - 60_000;
    // Evict calls older than 1 minute
    while (calls.length > 0 && calls[0] < windowStart) calls.shift();
    if (calls.length >= limitPerMinute) return false;
    calls.push(now);
    return true;
  };
}

// ─── Lifecycle hooks ──────────────────────────────────────────────────────────
// McpPreToolUse / McpPostToolUse hooks read from hooks.json.
// Format: { "hooks": { "McpPreToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "..." }] }] } }
// Env vars passed to commands: MCP_TOOL_NAME, MCP_TOOL_ARGS (pre), MCP_TOOL_RESULT (post).

interface HookEntry { type: 'command'; command: string }
interface HookMatcher { matcher: string; hooks: HookEntry[] }
export interface HooksFile { hooks?: Record<string, HookMatcher[]> }

export function loadHooksFile(overridePaths?: string[]): HooksFile {
  const candidates = overridePaths ?? [
    join(homedir(), '.assistants', 'config', 'hooks.json'),
    join(dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'config', 'hooks.json'),
  ];
  for (const p of candidates) {
    try {
      if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf-8')) as HooksFile;
    } catch {}
  }
  return {};
}

export function matchesGlob(pattern: string, value: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('*')) return value.startsWith(pattern.slice(0, -1));
  return pattern === value;
}

export async function runLifecycleHooks(
  hooksConfig: HooksFile,
  event: 'McpPreToolUse' | 'McpPostToolUse',
  toolName: string,
  payload: unknown,
): Promise<void> {
  const matchers = hooksConfig.hooks?.[event] ?? [];
  for (const { matcher, hooks } of matchers) {
    if (!matchesGlob(matcher, toolName)) continue;
    for (const hook of hooks) {
      if (hook.type !== 'command') continue;
      try {
        const env: Record<string, string> = {
          ...(process.env as Record<string, string>),
          MCP_TOOL_NAME: toolName,
          [event === 'McpPreToolUse' ? 'MCP_TOOL_ARGS' : 'MCP_TOOL_RESULT']: JSON.stringify(payload),
        };
        const proc = Bun.spawn(['sh', '-c', hook.command], { env, stdout: 'ignore', stderr: 'ignore' });
        await proc.exited;
      } catch {}
    }
  }
}

// ─── Audit log ────────────────────────────────────────────────────────────────
// In-memory audit log (last N entries). Exposed via get_audit_log admin tool.

export interface AuditEntry {
  id: number;
  tool_name: string;
  args: unknown;
  result: unknown;
  duration_ms: number;
  error: boolean;
  timestamp: string;
}

export function createAuditLog(maxEntries = 500): {
  record: (entry: Omit<AuditEntry, 'id'>) => void;
  list: (limit?: number) => AuditEntry[];
} {
  const log: AuditEntry[] = [];
  let seq = 0;
  return {
    record(entry) {
      log.push({ id: ++seq, ...entry });
      if (log.length > maxEntries) log.shift();
    },
    list(limit = 50) {
      return log.slice(-Math.min(limit, log.length)).reverse();
    },
  };
}

// ─── Dynamic tools storage ────────────────────────────────────────────────────

export const DYNAMIC_TOOLS_FILE = join(homedir(), '.assistants', 'mcp-tools.json');

export interface DynamicToolDef { name: string; description: string; command: string; version?: string }

export function loadDynamicTools(filePath = DYNAMIC_TOOLS_FILE): DynamicToolDef[] {
  try {
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, 'utf-8')) as DynamicToolDef[];
    }
  } catch {}
  return [];
}

export function saveDynamicTools(tools: DynamicToolDef[], filePath = DYNAMIC_TOOLS_FILE): void {
  const dirPath = dirname(filePath);
  if (!existsSync(dirPath)) {
    Bun.spawnSync(['mkdir', '-p', dirPath]);
  }
  Bun.write(filePath, JSON.stringify(tools, null, 2));
}

// ─── Commands loader ──────────────────────────────────────────────────────────

export interface CommandDef { name: string; description: string; text: string }

export function loadCommandsDir(dir: string): CommandDef[] {
  const commands: CommandDef[] = [];
  if (!existsSync(dir)) return commands;
  try {
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith('.md')) continue;
      const raw = readFileSync(join(dir, entry), 'utf-8');
      const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      let name = entry.replace(/\.md$/, '');
      let description = '';
      let text = raw;
      if (fmMatch) {
        const fm = fmMatch[1];
        text = fmMatch[2].trim();
        const nameM = fm.match(/^name:\s*(.+)$/m);
        const descM = fm.match(/^description:\s*(.+)$/m);
        if (nameM) name = nameM[1].trim();
        if (descM) description = descM[1].trim();
      }
      commands.push({ name, description, text });
    }
  } catch {}
  return commands;
}

// ─── Schema validation ────────────────────────────────────────────────────────
// Validates a Zod-derived JSON Schema object for common issues.

export interface SchemaValidationResult { valid: boolean; warnings: string[] }

export function validateToolSchema(name: string, schema: Record<string, unknown>): SchemaValidationResult {
  const warnings: string[] = [];
  if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) {
    warnings.push(`Tool name "${name}" should be snake_case (a-z, 0-9, _)`);
  }
  if (typeof schema !== 'object' || schema === null) {
    warnings.push('Schema must be an object');
    return { valid: false, warnings };
  }
  // Check each property has a description
  const props = (schema.properties ?? {}) as Record<string, { description?: string; type?: string }>;
  for (const [prop, def] of Object.entries(props)) {
    if (!def.description) warnings.push(`Property "${prop}" is missing a description`);
    if (!def.type) warnings.push(`Property "${prop}" is missing a type`);
  }
  return { valid: warnings.length === 0, warnings };
}

// ─── Skills loader helper (uses @hasna/skills SDK agent dirs) ────────────────
// Loads skills from both legacy .skill/ dirs and SDK-installed ~/.claude/skills/.

async function loadSkillsWithSdk(loader: any, cwd: string): Promise<void> {
  await loader.loadAll(cwd);
  try {
    // Also load from SDK-installed dirs: ~/.claude/skills/ and .claude/skills/
    const { getAgentSkillsDirs } = await import('@hasna/assistants-core') as any;
    if (typeof getAgentSkillsDirs === 'function') {
      const dirs: string[] = await getAgentSkillsDirs('both', cwd);
      await Promise.all(dirs.map((d: string) => loader.loadFromDirectory(d)));
    }
  } catch {
    // SDK helper unavailable — legacy dirs only
  }
}

// ─── Tool documentation (returned only via describe_tools) ───────────────────

export const TOOL_DOCS: Record<string, { description: string; params: string; version: string }> = {
  chat: {
    description: 'Send a message to the AI assistant and get a response. The assistant can use tools like bash, file read/write, web search, etc. Supports multi-turn sessions via session_id.',
    params: 'message: string — message to send\ncwd?: string — working directory (default: cwd)\nsystem_prompt?: string — custom system prompt\nallowed_tools?: string[] — tools to auto-approve (e.g. ["Read","Write","Bash"])\nsession_id?: string — resume an existing session',
    version: '1.0',
  },
  run_prompt: {
    description: 'Run a one-shot prompt against the assistant and return the result as text. No interactive session is created.',
    params: 'prompt: string — prompt to run\ncwd?: string — working directory\nsystem_prompt?: string — custom system prompt\nallowed_tools?: string[] — tools to auto-approve\ntimeout_ms?: number — timeout in milliseconds',
    version: '1.0',
  },
  list_sessions: {
    description: 'List previous assistant sessions that can be resumed with the chat tool.',
    params: 'limit?: number — max sessions to return (default 20)',
    version: '1.0',
  },
  list_skills: {
    description: 'List available assistant skills (SKILL.md files) from built-in and project-level skill directories.',
    params: 'cwd?: string — working directory to search for project-level skills',
    version: '1.0',
  },
  execute_skill: {
    description: 'Execute a named skill with arguments. The skill prompt is expanded and sent to the assistant.',
    params: 'skill_name: string — name of the skill to execute\narguments?: string — space-separated arguments\ncwd?: string — working directory\nallowed_tools?: string[] — tools to auto-approve',
    version: '1.0',
  },
  get_session: {
    description: 'Get the messages and details of a specific session by ID.',
    params: 'session_id: string — the session ID to retrieve',
    version: '1.0',
  },
  describe_tools: {
    description: 'Get full documentation for one or more tools. Call with no arguments to document all tools.',
    params: 'names?: string[] — tool names to describe (omit for all)',
    version: '1.0',
  },
  search_tools: {
    description: 'Search for tools by keyword across names and descriptions.',
    params: 'query: string — keyword to search for',
    version: '1.0',
  },
  register_tool: {
    description: 'Dynamically register a shell command as a new MCP tool. Persisted across restarts. Admin only when ASSISTANTS_MCP_TOKEN is set.',
    params: 'name: string — tool name (snake_case)\ndescription: string — what the tool does\ncommand: string — shell command (receives TOOL_ARGS env var)\nauth_token?: string — required if ASSISTANTS_MCP_TOKEN is set',
    version: '1.0',
  },
  list_mcp_servers: {
    description: 'List all MCP servers installed on the system (reads ~/.claude.json and ~/.codex/config.toml). Admin only when ASSISTANTS_MCP_TOKEN is set.',
    params: 'auth_token?: string — required if ASSISTANTS_MCP_TOKEN is set',
    version: '1.0',
  },
  get_audit_log: {
    description: 'Retrieve the in-memory audit log of recent tool calls (last 50 by default). Admin only when ASSISTANTS_MCP_TOKEN is set.',
    params: 'limit?: number — max entries to return (default 50)\nauth_token?: string — required if ASSISTANTS_MCP_TOKEN is set',
    version: '1.0',
  },
  validate_schema: {
    description: 'Validate a tool name and JSON schema for correctness. Useful during development.',
    params: 'tool_name: string — tool name to validate\nschema: object — JSON schema object to validate',
    version: '1.0',
  },
};

// ─── MCP Profile (token optimization) ────────────────────────────────────────
// minimal  (3 tools): describe_tools, search_tools, run_prompt
// standard (5 tools): + chat, list_sessions
// full     (default): all tools

export const PROFILE_TOOLS: Record<string, Set<string>> = {
  minimal:  new Set(['describe_tools', 'search_tools', 'run_prompt']),
  standard: new Set(['describe_tools', 'search_tools', 'run_prompt', 'chat', 'list_sessions']),
  full:     new Set(Object.keys(TOOL_DOCS)),
};

// ─── createServer ─────────────────────────────────────────────────────────────
// All server setup is in this exported function so tests can import and use it
// with an InMemoryTransport without side effects.

export interface ServerOptions {
  profile?: string;
  token?: string | null;
  rateLimitPerMinute?: number;
  hooksFilePaths?: string[];
  dynamicToolsFile?: string;
}

