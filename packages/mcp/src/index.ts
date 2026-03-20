#!/usr/bin/env bun

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { setRuntime, hasRuntime } from '@hasna/assistants-core';
import { bunRuntime } from '@hasna/runtime-bun';
import { setProjectRole, removeProjectRole, getEffectiveSystemPrompt, loadAgentDefinitions } from '@hasna/assistants-core';
import { EmbeddedClient, SessionStorage } from '@hasna/assistants-core';
import type { StreamChunk, Message } from '@hasna/assistants-shared';

// Initialize Bun runtime
if (!hasRuntime()) {
  setRuntime(bunRuntime);
}

// Read version from package.json at startup (never hardcode)
const pkgJson = await import('../package.json', { with: { type: 'json' } });
const MCP_VERSION: string = pkgJson.default?.version ?? '0.0.0';

// ─── Tool documentation (returned only via describe_tools) ───────────────────

const TOOL_DOCS: Record<string, { description: string; params: string }> = {
  chat: {
    description: 'Send a message to the AI assistant and get a response. The assistant can use tools like bash, file read/write, web search, etc. Supports multi-turn sessions via session_id.',
    params: 'message: string — message to send\ncwd?: string — working directory (default: cwd)\nsystem_prompt?: string — custom system prompt\nallowed_tools?: string[] — tools to auto-approve (e.g. ["Read","Write","Bash"])\nsession_id?: string — resume an existing session',
  },
  run_prompt: {
    description: 'Run a one-shot prompt against the assistant and return the result as text. No interactive session is created.',
    params: 'prompt: string — prompt to run\ncwd?: string — working directory\nsystem_prompt?: string — custom system prompt\nallowed_tools?: string[] — tools to auto-approve\ntimeout_ms?: number — timeout in milliseconds',
  },
  list_sessions: {
    description: 'List previous assistant sessions that can be resumed with the chat tool.',
    params: 'limit?: number — max sessions to return (default 20)',
  },
  list_skills: {
    description: 'List available assistant skills (SKILL.md files) from built-in and project-level skill directories.',
    params: 'cwd?: string — working directory to search for project-level skills',
  },
  execute_skill: {
    description: 'Execute a named skill with arguments. The skill prompt is expanded and sent to the assistant.',
    params: 'skill_name: string — name of the skill to execute\narguments?: string — space-separated arguments\ncwd?: string — working directory\nallowed_tools?: string[] — tools to auto-approve',
  },
  get_session: {
    description: 'Get the messages and details of a specific session by ID.',
    params: 'session_id: string — the session ID to retrieve',
  },
  describe_tools: {
    description: 'Get full documentation for one or more tools. Call with no arguments to document all tools.',
    params: 'names?: string[] — tool names to describe (omit for all)',
  },
  search_tools: {
    description: 'Search for tools by keyword across names and descriptions.',
    params: 'query: string — keyword to search for',
  },
};

// ─── MCP Profile (token optimization) ────────────────────────────────────────
// Set ASSISTANTS_MCP_PROFILE=minimal|standard|full to control tool surface.
//
// minimal  (3 tools): describe_tools, search_tools, run_prompt
// standard (5 tools): + chat, list_sessions
// full     (8 tools, default): all tools
//
// Use minimal when you just need to run prompts. Use describe_tools to load
// full documentation on demand without paying for all tool schemas.

const MCP_PROFILE = (process.env.ASSISTANTS_MCP_PROFILE || 'full').toLowerCase();

const PROFILE_TOOLS: Record<string, Set<string>> = {
  minimal:  new Set(['describe_tools', 'search_tools', 'run_prompt']),
  standard: new Set(['describe_tools', 'search_tools', 'run_prompt', 'chat', 'list_sessions']),
  full:     new Set(Object.keys(TOOL_DOCS)),
};

const activeTools = PROFILE_TOOLS[MCP_PROFILE] ?? PROFILE_TOOLS.full;

function registerTool(name: string, description: string, schema: object, handler: (args: any) => Promise<any>) {
  if (!activeTools.has(name)) return;
  (server.tool as any)(name, description, schema, handler);
}

const server = new McpServer({
  name: 'assistants',
  version: MCP_VERSION,
});

// ─── describe_tools ───────────────────────────────────────────────────────────

server.tool(
  'describe_tools',
  'Get full docs for tools. No args = all tools.',
  { names: z.array(z.string()).optional() },
  async ({ names }) => {
    const keys = names?.length ? names : Object.keys(TOOL_DOCS);
    const lines = keys.flatMap((k) => {
      const doc = TOOL_DOCS[k];
      if (!doc) return [`**${k}**: not found`];
      return [`## ${k}\n${doc.description}\n\n**Params:**\n${doc.params}`];
    });
    return { content: [{ type: 'text' as const, text: lines.join('\n\n---\n\n') }] };
  }
);

// ─── search_tools ─────────────────────────────────────────────────────────────

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
    const lines = matches.map(([name, doc]) => `**${name}**: ${doc.description.split('.')[0]}.`);
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  }
);

// ─── chat ─────────────────────────────────────────────────────────────────────

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
      if (data?.messages) {
        initialMessages = data.messages as Message[];
      }
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
      if (chunk.type === 'text' && chunk.content) {
        result += chunk.content;
      }
      if (chunk.type === 'tool_use' && chunk.toolCall) {
        toolCalls.push({ name: chunk.toolCall.name, input: chunk.toolCall.input });
      }
      if (chunk.type === 'error' && chunk.error) {
        errorMsg += chunk.error + '\n';
      }
    });

    client.onError((error: Error) => {
      errorMsg += error.message + '\n';
    });

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
    if (toolCalls.length > 0) {
      parts.push(`\n---\nTools used: ${toolCalls.map(t => t.name).join(', ')}`);
    }
    if (usage) {
      parts.push(`Session: ${sessionId} | Tokens: ${usage.inputTokens ?? 0} in / ${usage.outputTokens ?? 0} out`);
    }

    if (errorMsg) {
      return { content: [{ type: 'text' as const, text: errorMsg.trim() }], isError: true };
    }

    return { content: [{ type: 'text' as const, text: parts.join('\n') }] };
  }
);

// ─── run_prompt ───────────────────────────────────────────────────────────────

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

    const client = new EmbeddedClient(workingDir, {
      systemPrompt: system_prompt,
      allowedTools: allowed_tools,
    });

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
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error(`Timed out after ${timeout_ms}ms`)), timeout_ms)
          ),
        ]);
      } else {
        await client.send(prompt);
      }
    } catch (e) {
      errorMsg += e instanceof Error ? e.message : String(e);
    } finally {
      client.disconnect();
    }

    if (errorMsg) {
      return { content: [{ type: 'text' as const, text: errorMsg.trim() }], isError: true };
    }

    return { content: [{ type: 'text' as const, text: result.trim() }] };
  }
);

// ─── list_sessions ────────────────────────────────────────────────────────────

registerTool(
  'list_sessions',
  'List resumable assistant sessions.',
  { limit: z.number().optional() },
  async ({ limit }) => {
    const sessions = SessionStorage.listAllSessions();
    const maxResults = limit || 20;
    const recent = sessions.slice(0, maxResults);

    if (recent.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No sessions found.' }] };
    }

    const lines = recent.map((s) => {
      const date = s.startedAt ? new Date(s.startedAt).toLocaleString() : 'unknown';
      const msgs = s.messageCount ?? 0;
      return `- **${s.id}** (${date}, ${msgs} messages)${s.assistantId ? ` [${s.assistantId}]` : ''}`;
    });

    return {
      content: [{ type: 'text' as const, text: `## Sessions (${recent.length})\n\n${lines.join('\n')}` }],
    };
  }
);

// ─── list_skills ──────────────────────────────────────────────────────────────

registerTool(
  'list_skills',
  'List available assistant skills.',
  { cwd: z.string().optional() },
  async ({ cwd }) => {
    const { SkillLoader } = await import('@hasna/assistants-core');
    const workingDir = cwd || process.cwd();

    const loader = new SkillLoader();
    await loader.loadAll(workingDir);
    const skills = loader.getSkills();

    if (skills.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No skills found.' }] };
    }

    const lines = skills.map((s) => {
      return `- **${s.name}**: ${s.description || 'No description'}${s.argumentHint ? ` (args: ${s.argumentHint})` : ''}`;
    });

    return {
      content: [{ type: 'text' as const, text: `## Skills (${skills.length})\n\n${lines.join('\n')}` }],
    };
  }
);

// ─── execute_skill ────────────────────────────────────────────────────────────

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
    await loader.loadAll(workingDir);

    const skill = loader.getSkills().find(s => s.name === skill_name);
    if (!skill) {
      return { content: [{ type: 'text' as const, text: `Skill "${skill_name}" not found.` }], isError: true };
    }

    const executor = new SkillExecutor();
    const expandedPrompt = await executor.prepare(skill, args ? args.split(/\s+/) : []);

    if (!expandedPrompt) {
      return { content: [{ type: 'text' as const, text: `Skill "${skill_name}" not found.` }], isError: true };
    }

    const client = new EmbeddedClient(workingDir, {
      allowedTools: allowed_tools,
    });

    let result = '';
    let errorMsg = '';

    client.onChunk((chunk: StreamChunk) => {
      if (chunk.type === 'text' && chunk.content) result += chunk.content;
      if (chunk.type === 'error' && chunk.error) errorMsg += chunk.error;
    });

    client.onError((error: Error) => { errorMsg += error.message; });

    await client.initialize();

    try {
      await client.send(expandedPrompt);
    } catch (e) {
      errorMsg += e instanceof Error ? e.message : String(e);
    } finally {
      client.disconnect();
    }

    if (errorMsg) {
      return { content: [{ type: 'text' as const, text: errorMsg.trim() }], isError: true };
    }

    return { content: [{ type: 'text' as const, text: result.trim() }] };
  }
);

// ─── get_session ──────────────────────────────────────────────────────────────

registerTool(
  'get_session',
  'Get messages and details of a session by ID.',
  { session_id: z.string() },
  async ({ session_id }) => {
    const data = SessionStorage.loadSession(session_id);

    if (!data) {
      return { content: [{ type: 'text' as const, text: `Session "${session_id}" not found.` }], isError: true };
    }

    const messages = (data.messages || []) as Message[];
    const lines = messages.map((m) => {
      const role = m.role === 'user' ? 'User' : 'Assistant';
      const text = typeof m.content === 'string'
        ? m.content.slice(0, 500)
        : JSON.stringify(m.content).slice(0, 500);
      return `**${role}**: ${text}`;
    });

    const header = [
      `## Session: ${session_id}`,
      `Started: ${data.startedAt || 'unknown'}`,
      `Messages: ${messages.length}`,
      `CWD: ${data.cwd || 'unknown'}`,
      '',
    ].join('\n');

    return {
      content: [{ type: 'text' as const, text: header + lines.join('\n\n') }],
    };
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

// ─── Start server ─────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('MCP server error:', error);
  process.exit(1);
});
