#!/usr/bin/env bun

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { setRuntime, hasRuntime } from '@hasna/assistants-core';
import { bunRuntime } from '@hasna/runtime-bun';
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

export async function createServer(opts: ServerOptions = {}): Promise<McpServer> {
  const profile = (opts.profile ?? process.env.ASSISTANTS_MCP_PROFILE ?? 'full').toLowerCase();
  const envToken = opts.token !== undefined ? opts.token : (process.env.ASSISTANTS_MCP_TOKEN ?? null);
  const rateLimit = opts.rateLimitPerMinute ?? parseInt(process.env.ASSISTANTS_MCP_RATE_LIMIT ?? '0', 10);
  const hooksConfig = loadHooksFile(opts.hooksFilePaths);
  const auditLog = createAuditLog();
  const checkRate = createRateLimiter(rateLimit);
  const activeTools = PROFILE_TOOLS[profile] ?? PROFILE_TOOLS.full;

  const server = new McpServer({ name: 'assistants', version: MCP_VERSION });

  // Wraps a handler with: rate limiting → pre-hooks → execution → post-hooks → audit
  function registerTool(
    name: string,
    description: string,
    schema: object,
    handler: (args: any) => Promise<any>,
  ): void {
    if (!activeTools.has(name)) return;
    (server.tool as any)(name, description, schema, async (args: any) => {
      if (!checkRate(name)) {
        return { content: [{ type: 'text' as const, text: `Rate limit exceeded. Max ${rateLimit} calls/min.` }], isError: true };
      }
      await runLifecycleHooks(hooksConfig, 'McpPreToolUse', name, args);
      const start = Date.now();
      let result: any;
      let isErr = false;
      try {
        result = await handler(args);
        isErr = result?.isError === true;
      } catch (e) {
        result = { content: [{ type: 'text' as const, text: String(e) }], isError: true };
        isErr = true;
      }
      auditLog.record({
        tool_name: name,
        args,
        result,
        duration_ms: Date.now() - start,
        error: isErr,
        timestamp: new Date().toISOString(),
      });
      await runLifecycleHooks(hooksConfig, 'McpPostToolUse', name, result);
      return result;
    });
  }

  // ─── describe_tools ─────────────────────────────────────────────────────────

  server.tool(
    'describe_tools',
    'Get full docs for tools. No args = all tools.',
    { names: z.array(z.string()).optional() },
    async ({ names }) => {
      const keys = names?.length ? names : Object.keys(TOOL_DOCS);
      const lines = keys.flatMap((k) => {
        const doc = TOOL_DOCS[k];
        if (!doc) return [`**${k}**: not found`];
        return [`## ${k} (v${doc.version})\n${doc.description}\n\n**Params:**\n${doc.params}`];
      });
      return { content: [{ type: 'text' as const, text: lines.join('\n\n---\n\n') }] };
    }
  );

  // ─── search_tools ───────────────────────────────────────────────────────────

  server.tool(
    'search_tools',
    'Search tools by keyword.',
    { query: z.string() },
    async ({ query }) => {
      const q = query.toLowerCase();
      const matches = Object.entries(TOOL_DOCS).filter(([name, doc]) =>
        name.includes(q) || doc.description.toLowerCase().includes(q) || doc.params.toLowerCase().includes(q)
      );
      if (matches.length === 0) {
        return { content: [{ type: 'text' as const, text: `No tools matched "${query}".` }] };
      }
      const lines = matches.map(([name, doc]) => `**${name}** (v${doc.version}): ${doc.description.split('.')[0]}.`);
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  // ─── chat ───────────────────────────────────────────────────────────────────

  registerTool(
    'chat',
    'Send a message to the assistant. Use describe_tools("chat") for full docs.',
    {
      message: z.string(),
      cwd: z.string().optional(),
      system_prompt: z.string().optional(),
      allowed_tools: z.array(z.string()).optional(),
      session_id: z.string().optional(),
    },
    async ({ message, cwd, system_prompt, allowed_tools, session_id }) => {
      const workingDir = cwd || process.cwd();

      let initialMessages: Message[] | undefined;
      if (session_id) {
        const data = SessionStorage.loadSession(session_id);
        if (data?.messages) initialMessages = data.messages as Message[];
      }

      const client = new EmbeddedClient(workingDir, {
        sessionId: session_id,
        initialMessages,
        systemPrompt: system_prompt,
        allowedTools: allowed_tools,
      });

      let result = '';
      const toolCalls: Array<{ name: string; input: Record<string, unknown> }> = [];
      let errorMsg = '';

      client.onChunk((chunk: StreamChunk) => {
        if (chunk.type === 'text' && chunk.content) result += chunk.content;
        if (chunk.type === 'tool_use' && chunk.toolCall) toolCalls.push({ name: chunk.toolCall.name, input: chunk.toolCall.input });
        if (chunk.type === 'error' && chunk.error) errorMsg += chunk.error + '\n';
      });
      client.onError((error: Error) => { errorMsg += error.message + '\n'; });

      await client.initialize();
      try {
        await client.send(message);
      } catch (e) {
        errorMsg += e instanceof Error ? e.message : String(e);
      } finally {
        client.disconnect();
      }

      const sessionId = client.getSessionId();
      const usage = client.getTokenUsage();
      const parts: string[] = [];
      if (result.trim()) parts.push(result.trim());
      if (toolCalls.length > 0) parts.push(`\n---\nTools used: ${toolCalls.map(t => t.name).join(', ')}`);
      if (usage) parts.push(`Session: ${sessionId} | Tokens: ${usage.inputTokens ?? 0} in / ${usage.outputTokens ?? 0} out`);

      if (errorMsg) return { content: [{ type: 'text' as const, text: errorMsg.trim() }], isError: true };
      return { content: [{ type: 'text' as const, text: parts.join('\n') }] };
    }
  );

  // ─── run_prompt ─────────────────────────────────────────────────────────────

  registerTool(
    'run_prompt',
    'Run a one-shot prompt. Use describe_tools("run_prompt") for full docs.',
    {
      prompt: z.string(),
      cwd: z.string().optional(),
      system_prompt: z.string().optional(),
      allowed_tools: z.array(z.string()).optional(),
      timeout_ms: z.number().optional(),
    },
    async ({ prompt, cwd, system_prompt, allowed_tools, timeout_ms }) => {
      const workingDir = cwd || process.cwd();
      const client = new EmbeddedClient(workingDir, { systemPrompt: system_prompt, allowedTools: allowed_tools });
      let result = '';
      let errorMsg = '';
      client.onChunk((chunk: StreamChunk) => {
        if (chunk.type === 'text' && chunk.content) result += chunk.content;
        if (chunk.type === 'error' && chunk.error) errorMsg += chunk.error;
      });
      client.onError((error: Error) => { errorMsg += error.message; });
      await client.initialize();
      try {
        if (timeout_ms && timeout_ms > 0) {
          await Promise.race([
            client.send(prompt),
            new Promise<void>((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${timeout_ms}ms`)), timeout_ms)),
          ]);
        } else {
          await client.send(prompt);
        }
      } catch (e) {
        errorMsg += e instanceof Error ? e.message : String(e);
      } finally {
        client.disconnect();
      }
      if (errorMsg) return { content: [{ type: 'text' as const, text: errorMsg.trim() }], isError: true };
      return { content: [{ type: 'text' as const, text: result.trim() }] };
    }
  );

  // ─── list_sessions ──────────────────────────────────────────────────────────

  registerTool(
    'list_sessions',
    'List resumable assistant sessions.',
    { limit: z.number().optional() },
    async ({ limit }) => {
      const sessions = SessionStorage.listAllSessions();
      const recent = sessions.slice(0, limit || 20);
      if (recent.length === 0) return { content: [{ type: 'text' as const, text: 'No sessions found.' }] };
      const lines = recent.map((s) => {
        const date = s.startedAt ? new Date(s.startedAt).toLocaleString() : 'unknown';
        return `- **${s.id}** (${date}, ${s.messageCount ?? 0} messages)${s.assistantId ? ` [${s.assistantId}]` : ''}`;
      });
      return { content: [{ type: 'text' as const, text: `## Sessions (${recent.length})\n\n${lines.join('\n')}` }] };
    }
  );

  // ─── list_skills ────────────────────────────────────────────────────────────

  registerTool(
    'list_skills',
    'List available assistant skills.',
    { cwd: z.string().optional() },
    async ({ cwd }) => {
      const { SkillLoader } = await import('@hasna/assistants-core');
      const loader = new SkillLoader();
      await loadSkillsWithSdk(loader, cwd || process.cwd());
      const skills = loader.getSkills();
      if (skills.length === 0) return { content: [{ type: 'text' as const, text: 'No skills found.' }] };
      const lines = skills.map(s => `- **${s.name}**: ${s.description || 'No description'}${s.argumentHint ? ` (args: ${s.argumentHint})` : ''}`);
      return { content: [{ type: 'text' as const, text: `## Skills (${skills.length})\n\n${lines.join('\n')}` }] };
    }
  );

  // ─── execute_skill ──────────────────────────────────────────────────────────

  registerTool(
    'execute_skill',
    'Execute a named skill with arguments.',
    {
      skill_name: z.string(),
      arguments: z.string().optional(),
      cwd: z.string().optional(),
      allowed_tools: z.array(z.string()).optional(),
    },
    async ({ skill_name, arguments: args, cwd, allowed_tools }) => {
      const { SkillLoader, SkillExecutor } = await import('@hasna/assistants-core');
      const workingDir = cwd || process.cwd();
      const loader = new SkillLoader();
      await loadSkillsWithSdk(loader, workingDir);
      const skill = loader.getSkills().find(s => s.name === skill_name);
      if (!skill) return { content: [{ type: 'text' as const, text: `Skill "${skill_name}" not found.` }], isError: true };
      const executor = new SkillExecutor();
      const expandedPrompt = await executor.prepare(skill, args ? args.split(/\s+/) : []);
      if (!expandedPrompt) return { content: [{ type: 'text' as const, text: `Skill "${skill_name}" not found.` }], isError: true };
      const client = new EmbeddedClient(workingDir, { allowedTools: allowed_tools });
      let result = '';
      let errorMsg = '';
      client.onChunk((chunk: StreamChunk) => {
        if (chunk.type === 'text' && chunk.content) result += chunk.content;
        if (chunk.type === 'error' && chunk.error) errorMsg += chunk.error;
      });
      client.onError((error: Error) => { errorMsg += error.message; });
      await client.initialize();
      try { await client.send(expandedPrompt); } catch (e) { errorMsg += e instanceof Error ? e.message : String(e); } finally { client.disconnect(); }
      if (errorMsg) return { content: [{ type: 'text' as const, text: errorMsg.trim() }], isError: true };
      return { content: [{ type: 'text' as const, text: result.trim() }] };
    }
  );

  // ─── get_session ────────────────────────────────────────────────────────────

  registerTool(
    'get_session',
    'Get messages and details of a session by ID.',
    { session_id: z.string() },
    async ({ session_id }) => {
      const data = SessionStorage.loadSession(session_id);
      if (!data) return { content: [{ type: 'text' as const, text: `Session "${session_id}" not found.` }], isError: true };
      const messages = (data.messages || []) as Message[];
      const lines = messages.map(m => {
        const role = m.role === 'user' ? 'User' : 'Assistant';
        const text = typeof m.content === 'string' ? m.content.slice(0, 500) : JSON.stringify(m.content).slice(0, 500);
        return `**${role}**: ${text}`;
      });
      const header = [`## Session: ${session_id}`, `Started: ${data.startedAt || 'unknown'}`, `Messages: ${messages.length}`, `CWD: ${data.cwd || 'unknown'}`, ''].join('\n');
      return { content: [{ type: 'text' as const, text: header + lines.join('\n\n') }] };
    }
  );

  // ─── register_tool (admin) ──────────────────────────────────────────────────

  const dynamicToolsFile = opts.dynamicToolsFile ?? DYNAMIC_TOOLS_FILE;

  function registerDynamicTool(def: DynamicToolDef): void {
    (server.tool as any)(
      def.name,
      `${def.description}${def.version ? ` (v${def.version})` : ''}`,
      { args: z.string().optional().describe('Arguments as a JSON string or plain text') },
      async ({ args }: { args?: string }) => {
        try {
          const proc = Bun.spawn(['sh', '-c', def.command], {
            env: { ...(process.env as Record<string, string>), TOOL_ARGS: args ?? '' },
            stdout: 'pipe',
            stderr: 'pipe',
          });
          const [stdout, stderr, exitCode] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
            proc.exited,
          ]);
          const output = stdout.trim() || stderr.trim();
          if (exitCode !== 0) return { content: [{ type: 'text' as const, text: `Error (exit ${exitCode}): ${output}` }], isError: true };
          return { content: [{ type: 'text' as const, text: output || '(no output)' }] };
        } catch (e) {
          return { content: [{ type: 'text' as const, text: String(e) }], isError: true };
        }
      }
    );
  }

  for (const def of loadDynamicTools(dynamicToolsFile)) {
    registerDynamicTool(def);
  }

  registerTool(
    'register_tool',
    'Dynamically register a shell command as a new MCP tool. Persisted across restarts.',
    {
      name: z.string().regex(/^[a-z][a-z0-9_]*$/, 'Must be snake_case'),
      description: z.string(),
      command: z.string(),
      auth_token: z.string().optional(),
    },
    async ({ name, description, command, auth_token }) => {
      if (!isAdminAuthorized(auth_token, envToken)) {
        return { content: [{ type: 'text' as const, text: 'Unauthorized: invalid or missing auth_token.' }], isError: true };
      }
      const existing = loadDynamicTools(dynamicToolsFile);
      const updated = [...existing.filter(t => t.name !== name), { name, description, command, version: '1.0' }];
      saveDynamicTools(updated, dynamicToolsFile);
      registerDynamicTool({ name, description, command, version: '1.0' });
      return { content: [{ type: 'text' as const, text: `Tool "${name}" registered successfully.` }] };
    }
  );

  // ─── list_mcp_servers (admin) ────────────────────────────────────────────────

  registerTool(
    'list_mcp_servers',
    'List all MCP servers installed on the system (Claude Code, Codex).',
    { auth_token: z.string().optional() },
    async ({ auth_token }) => {
      if (!isAdminAuthorized(auth_token, envToken)) {
        return { content: [{ type: 'text' as const, text: 'Unauthorized: invalid or missing auth_token.' }], isError: true };
      }
      const results: string[] = [];
      try {
        const claudeCfgPath = join(homedir(), '.claude.json');
        if (existsSync(claudeCfgPath)) {
          const cfg = JSON.parse(readFileSync(claudeCfgPath, 'utf-8'));
          const servers = cfg?.mcpServers ?? {};
          const entries = Object.entries(servers) as Array<[string, { command?: string; args?: string[] }]>;
          if (entries.length > 0) {
            results.push('## Claude Code (~/.claude.json)');
            for (const [n, srv] of entries) {
              results.push(`- **${n}**: \`${[srv.command, ...(srv.args ?? [])].join(' ')}\``);
            }
          }
        }
      } catch {}
      try {
        const codexCfgPath = join(homedir(), '.codex', 'config.toml');
        if (existsSync(codexCfgPath)) {
          const raw = readFileSync(codexCfgPath, 'utf-8');
          const serverNames = [...raw.matchAll(/^\[mcp_servers\.(.+)\]/gm)].map(m => m[1]);
          if (serverNames.length > 0) {
            results.push('## Codex (~/.codex/config.toml)');
            for (const n of serverNames) {
              const cmdMatch = raw.match(new RegExp(`\\[mcp_servers\\.${n}\\][^[]*command\\s*=\\s*"([^"]+)"`));
              results.push(`- **${n}**${cmdMatch ? `: \`${cmdMatch[1]}\`` : ''}`);
            }
          }
        }
      } catch {}
      if (results.length === 0) return { content: [{ type: 'text' as const, text: 'No MCP servers found in known config locations.' }] };
      return { content: [{ type: 'text' as const, text: results.join('\n') }] };
    }
  );

  // ─── get_audit_log (admin) ───────────────────────────────────────────────────

  registerTool(
    'get_audit_log',
    'Get the in-memory audit log of recent tool calls.',
    { limit: z.number().optional(), auth_token: z.string().optional() },
    async ({ limit, auth_token }) => {
      if (!isAdminAuthorized(auth_token, envToken)) {
        return { content: [{ type: 'text' as const, text: 'Unauthorized: invalid or missing auth_token.' }], isError: true };
      }
      const entries = auditLog.list(limit);
      if (entries.length === 0) return { content: [{ type: 'text' as const, text: 'Audit log is empty.' }] };
      const lines = entries.map(e =>
        `[${e.timestamp}] ${e.tool_name} (${e.duration_ms}ms)${e.error ? ' ERROR' : ''}`
      );
      return { content: [{ type: 'text' as const, text: `## Audit Log (${entries.length} entries)\n\n${lines.join('\n')}` }] };
    }
  );

  // ─── validate_schema ────────────────────────────────────────────────────────

  registerTool(
    'validate_schema',
    'Validate a tool name and JSON schema for common issues.',
    {
      tool_name: z.string(),
      schema: z.record(z.unknown()),
    },
    async ({ tool_name, schema }) => {
      const result = validateToolSchema(tool_name, schema);
      if (result.valid) {
        return { content: [{ type: 'text' as const, text: `✓ Schema for "${tool_name}" is valid.` }] };
      }
      return {
        content: [{
          type: 'text' as const,
          text: `Schema warnings for "${tool_name}":\n${result.warnings.map(w => `- ${w}`).join('\n')}`,
        }],
        isError: !result.valid,
      };
    }
  );

  // ─── Resources ──────────────────────────────────────────────────────────────

  server.resource(
    'sessions',
    'assistants://sessions',
    { description: 'List of all assistant sessions', mimeType: 'text/plain' },
    async (_uri) => {
      const sessions = SessionStorage.listAllSessions().slice(0, 50);
      const lines = sessions.map(s => {
        const date = s.startedAt ? new Date(s.startedAt).toLocaleString() : 'unknown';
        return `${s.id}  ${date}  ${s.messageCount ?? 0} messages`;
      });
      return { contents: [{ uri: 'assistants://sessions', mimeType: 'text/plain', text: lines.length ? lines.join('\n') : '(no sessions)' }] };
    }
  );

  server.resource(
    'session',
    new ResourceTemplate('assistants://sessions/{id}', { list: undefined }),
    { description: 'Full message history for a session', mimeType: 'text/plain' },
    async (uri, { id }) => {
      const sessionId = Array.isArray(id) ? id[0] : id;
      const data = SessionStorage.loadSession(sessionId);
      if (!data) return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: `Session "${sessionId}" not found.` }] };
      const messages = (data.messages || []) as Message[];
      const lines = messages.map(m => {
        const role = m.role === 'user' ? 'User' : 'Assistant';
        return `[${role}]\n${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`;
      });
      return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: `Session: ${sessionId}\nStarted: ${data.startedAt}\nCWD: ${data.cwd}\n\n${lines.join('\n\n---\n\n')}` }] };
    }
  );

  server.resource(
    'skills',
    'assistants://skills',
    { description: 'List of all available assistant skills', mimeType: 'text/plain' },
    async (_uri) => {
      const { SkillLoader } = await import('@hasna/assistants-core');
      const loader = new SkillLoader();
      await loadSkillsWithSdk(loader, process.cwd());
      const skills = loader.getSkills();
      const lines = skills.map(s => `${s.name}  ${s.description || ''}${s.argumentHint ? `  (args: ${s.argumentHint})` : ''}`);
      return { contents: [{ uri: 'assistants://skills', mimeType: 'text/plain', text: lines.length ? lines.join('\n') : '(no skills)' }] };
    }
  );

  server.resource(
    'skill',
    new ResourceTemplate('assistants://skills/{name}', { list: undefined }),
    { description: 'Raw content of a named skill (SKILL.md)', mimeType: 'text/markdown' },
    async (uri, { name }) => {
      const skillName = Array.isArray(name) ? name[0] : name;
      const { SkillLoader } = await import('@hasna/assistants-core');
      const loader = new SkillLoader();
      await loadSkillsWithSdk(loader, process.cwd());
      const skill = loader.getSkills().find(s => s.name === skillName);
      if (!skill) return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: `Skill "${skillName}" not found.` }] };
      let text = skill.content;
      if (!text && skill.filePath && existsSync(skill.filePath)) text = readFileSync(skill.filePath, 'utf-8');
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: text || '(empty)' }] };
    }
  );

  server.resource(
    'config-settings',
    'assistants://config/settings',
    { description: 'Assistant settings.json configuration', mimeType: 'application/json' },
    async (_uri) => {
      const candidates = [
        join(homedir(), '.assistants', 'config', 'settings.json'),
        join(dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'config', 'settings.json'),
      ];
      for (const p of candidates) {
        if (existsSync(p)) return { contents: [{ uri: 'assistants://config/settings', mimeType: 'application/json', text: readFileSync(p, 'utf-8') }] };
      }
      return { contents: [{ uri: 'assistants://config/settings', mimeType: 'application/json', text: '{}' }] };
    }
  );

  server.resource(
    'config-hooks',
    'assistants://config/hooks',
    { description: 'Assistant hooks.json configuration', mimeType: 'application/json' },
    async (_uri) => {
      const candidates = [
        join(homedir(), '.assistants', 'config', 'hooks.json'),
        join(dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'config', 'hooks.json'),
      ];
      for (const p of candidates) {
        if (existsSync(p)) return { contents: [{ uri: 'assistants://config/hooks', mimeType: 'application/json', text: readFileSync(p, 'utf-8') }] };
      }
      return { contents: [{ uri: 'assistants://config/hooks', mimeType: 'application/json', text: '{"hooks":{}}' }] };
    }
  );

  // ─── Prompts ────────────────────────────────────────────────────────────────

  const { SkillLoader: SL, SkillExecutor: SE } = await import('@hasna/assistants-core');
  const startupLoader = new SL();
  await loadSkillsWithSdk(startupLoader, process.cwd());

  for (const skill of startupLoader.getSkills()) {
    server.prompt(
      `skill/${skill.name}`,
      skill.description || `Execute the "${skill.name}" skill`,
      { arguments: z.string().optional().describe(skill.argumentHint ? `Arguments: ${skill.argumentHint}` : 'Optional arguments') },
      async ({ arguments: args }) => {
        const executor = new SE();
        const expanded = await executor.prepare(skill, args ? args.split(/\s+/) : []);
        return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text: expanded || skill.content || '' } }] };
      }
    );
  }

  const commandsDirs = [
    join(dirname(new URL(import.meta.url).pathname), '..', '..', '..', '.assistants', 'commands'),
    join(homedir(), '.assistants', 'commands'),
  ];
  for (const dir of commandsDirs) {
    for (const cmd of loadCommandsDir(dir)) {
      server.prompt(
        `command/${cmd.name}`,
        cmd.description || `Run the "${cmd.name}" command`,
        {},
        () => ({ messages: [{ role: 'user' as const, content: { type: 'text' as const, text: cmd.text } }] })
      );
    }
  }

  return server;
}

// ─── Agent lifecycle ──────────────────────────────────────────────────────────

// In-memory agent registry for assistants MCP
const mcpAgentRegistry = new Map<string, { id: string; name: string; last_seen_at: string; project_id?: string }>();

registerTool(
  'register_agent',
  'Register an agent session for attribution. Returns agent_id.',
  {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Agent name' },
      session_id: { type: 'string', description: 'Session identifier' },
    },
    required: ['name'],
  },
  async (args: { name: string; session_id?: string }) => {
    const existing = [...mcpAgentRegistry.values()].find(a => a.name === args.name);
    if (existing) {
      existing.last_seen_at = new Date().toISOString();
      return { content: [{ type: 'text' as const, text: JSON.stringify({ agent_id: existing.id, name: existing.name, last_seen_at: existing.last_seen_at }) }] };
    }
    const id = Math.random().toString(36).slice(2, 10);
    const agent = { id, name: args.name, last_seen_at: new Date().toISOString() };
    mcpAgentRegistry.set(id, agent);
    return { content: [{ type: 'text' as const, text: JSON.stringify(agent) }] };
  }
);

registerTool(
  'heartbeat',
  'Update agent last_seen_at to signal active session.',
  {
    type: 'object',
    properties: { agent_id: { type: 'string' } },
    required: ['agent_id'],
  },
  async (args: { agent_id: string }) => {
    const agent = mcpAgentRegistry.get(args.agent_id);
    if (!agent) return { content: [{ type: 'text' as const, text: `Agent not found: ${args.agent_id}` }], isError: true };
    agent.last_seen_at = new Date().toISOString();
    return { content: [{ type: 'text' as const, text: `♥ ${agent.name} — active at ${agent.last_seen_at}` }] };
  }
);

registerTool(
  'set_focus',
  'Set the active project context for this agent session.',
  {
    type: 'object',
    properties: {
      agent_id: { type: 'string' },
      project_id: { type: 'string', description: 'Project to focus on (omit to clear)' },
    },
    required: ['agent_id'],
  },
  async (args: { agent_id: string; project_id?: string }) => {
    const agent = mcpAgentRegistry.get(args.agent_id);
    if (!agent) return { content: [{ type: 'text' as const, text: `Agent not found: ${args.agent_id}` }], isError: true };
    agent.project_id = args.project_id;
    const msg = args.project_id ? `Focus set: ${args.project_id}` : 'Focus cleared';
    return { content: [{ type: 'text' as const, text: msg }] };
  }
);

// ─── Per-assistant roles ──────────────────────────────────────────────────────

registerTool(
  'set_project_role',
  'Set a per-project role for an assistant. Appended to globalRole, never replaces it.',
  {
    type: 'object',
    properties: {
      agent_name: { type: 'string', description: 'Assistant/agent name' },
      project_id: { type: 'string', description: 'Project ID or name' },
      role: { type: 'string', description: 'Role text to append for this project' },
    },
    required: ['agent_name', 'project_id', 'role'],
  },
  async (args: { agent_name: string; project_id: string; role: string }) => {
    const cwd = process.cwd();
    const filePath = setProjectRole(args.agent_name, args.project_id, args.role, cwd);
    return { content: [{ type: 'text' as const, text: `Project role set for ${args.agent_name} on ${args.project_id}: ${filePath}` }] };
  }
);

registerTool(
  'remove_project_role',
  'Remove a per-project role from an assistant.',
  {
    type: 'object',
    properties: {
      agent_name: { type: 'string' },
      project_id: { type: 'string' },
    },
    required: ['agent_name', 'project_id'],
  },
  async (args: { agent_name: string; project_id: string }) => {
    const cwd = process.cwd();
    const filePath = removeProjectRole(args.agent_name, args.project_id, cwd);
    return { content: [{ type: 'text' as const, text: `Project role removed for ${args.agent_name} on ${args.project_id}: ${filePath}` }] };
  }
);

registerTool(
  'get_effective_prompt',
  'Get the effective system prompt for an assistant (globalRole + projectRole + systemPrompt).',
  {
    type: 'object',
    properties: {
      agent_name: { type: 'string' },
      project_id: { type: 'string', description: 'Optional project context' },
    },
    required: ['agent_name'],
  },
  async (args: { agent_name: string; project_id?: string }) => {
    const cwd = process.cwd();
    const def = loadAgentDefinitions(cwd).find(d => d.name === args.agent_name);
    if (!def) return { content: [{ type: 'text' as const, text: `Agent not found: ${args.agent_name}` }], isError: true };
    const prompt = getEffectiveSystemPrompt(def, args.project_id);
    return { content: [{ type: 'text' as const, text: prompt || '(no prompt set)' }] };
  }
);

registerTool(
  'set_agent_model',
  'Set provider, model ID, and reasoning level for an assistant.',
  {
    type: 'object',
    properties: {
      agent_name: { type: 'string', description: 'Assistant/agent name' },
      provider: { type: 'string', description: 'LLM provider: anthropic, openai, google, etc.' },
      model: { type: 'string', description: 'Model ID e.g. claude-opus-4-6, gpt-5.2' },
      reasoning_level: { type: 'string', enum: ['max', 'high', 'medium', 'low'], description: 'Reasoning level for extended thinking' },
    },
    required: ['agent_name'],
  },
  async (args: { agent_name: string; provider?: string; model?: string; reasoning_level?: string }) => {
    const cwd = process.cwd();
    const filePath = setAgentModelConfig(args.agent_name, {
      provider: args.provider,
      model: args.model,
      reasoningLevel: args.reasoning_level as 'max' | 'high' | 'medium' | 'low' | undefined,
    }, cwd);
    return { content: [{ type: 'text' as const, text: `Model config updated for ${args.agent_name}: ${filePath}` }] };
  }
);

registerTool(
  'sync_to_claude_agents',
  'Sync all assistant definitions to .claude/agents/ directory as Claude Code markdown files with YAML frontmatter. Push direction: assistants MCP → .claude/agents.',
  {
    type: 'object',
    properties: {
      target_dir: { type: 'string', description: 'Target directory (default: .claude/agents in cwd)' },
    },
  },
  async (args: { target_dir?: string }) => {
    const cwd = process.cwd();
    const result = syncToClaudeAgents(cwd, args.target_dir);
    const lines = [
      `Synced ${result.synced.length} agent(s) to ${args.target_dir ?? '.claude/agents/'}`,
      ...result.synced.map(p => `  ✓ ${p}`),
      ...result.errors.map(e => `  ✗ ${e}`),
    ];
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  }
);

server.tool(
  'sync_from_claude_agents',
  'Reverse sync: import agent definitions from .claude/agents/*.md files back into assistants MCP. Conflict resolution: last-write-wins by file mtime. Pull direction: .claude/agents → assistants MCP.',
  {
    type: 'object',
    properties: {
      source_dir: { type: 'string', description: 'Source directory (default: .claude/agents in cwd)' },
      scope: { type: 'string', enum: ['global', 'project'], description: 'Where to save imported agents (default: project)' },
    },
  },
  async (args: { source_dir?: string; scope?: 'global' | 'project' }) => {
    const cwd = process.cwd();
    const result = syncFromClaudeAgents(cwd, args.source_dir, args.scope ?? 'project');
    const lines = [
      `Import complete from ${args.source_dir ?? '.claude/agents/'}`,
      `  ${result.imported.length} imported, ${result.skipped.length} skipped (already newer), ${result.errors.length} errors`,
      ...result.imported.map(p => `  ✓ ${p}`),
      ...result.skipped.map(n => `  ↷ ${n} (existing is newer)`),
      ...result.errors.map(e => `  ✗ ${e}`),
    ];
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  }
);

// ─── CLI mode (remove/uninstall/rm) ─────────────────────────────────────────

const firstArg = process.argv[2];
if (firstArg === 'remove' || firstArg === 'rm' || firstArg === 'uninstall' || firstArg === 'delete') {
  const sessionId = process.argv[3];
  if (!sessionId) {
    console.error(`Usage: assistants-mcp ${firstArg} <session_id>`);
    process.exit(1);
  }
  try {
    // Sessions are stored as JSON files in the sessions dir
    const sessionData = SessionStorage.loadSession(sessionId);
    if (!sessionData) {
      console.error(`Session not found: ${sessionId}`);
      process.exit(1);
    }
    // Delete the file
    const { unlinkSync, existsSync } = await import('fs');
    const { join } = await import('path');
    const { homedir } = await import('os');
    const sessionsDir = join(homedir(), '.assistants', 'sessions');
    const sessionFile = join(sessionsDir, `${sessionId}.json`);
    if (existsSync(sessionFile)) {
      unlinkSync(sessionFile);
      console.log(`✓ Session ${sessionId} removed`);
    } else {
      console.error(`Session file not found: ${sessionFile}`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  process.exit(0);
}

// ─── Start server ─────────────────────────────────────────────────────────────

async function main() {
  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('MCP server error:', error);
  process.exit(1);
});
