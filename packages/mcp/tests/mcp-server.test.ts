import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  createServer,
  isAdminAuthorized,
  matchesGlob,
  loadHooksFile,
  loadDynamicTools,
  saveDynamicTools,
  loadCommandsDir,
  validateToolSchema,
  createRateLimiter,
  createAuditLog,
  TOOL_DOCS,
  PROFILE_TOOLS,
  MCP_VERSION,
  type HooksFile,
  type DynamicToolDef,
} from '../src/index';

// ─── Helper: build a connected client/server pair ────────────────────────────

async function buildClient(opts: Parameters<typeof createServer>[0] = {}) {
  const server = await createServer(opts);
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
  await client.connect(clientTransport);
  return { client, server };
}

// ─── isAdminAuthorized ───────────────────────────────────────────────────────

describe('isAdminAuthorized', () => {
  test('returns true when no token is configured', () => {
    expect(isAdminAuthorized(undefined, null)).toBe(true);
    expect(isAdminAuthorized('anything', null)).toBe(true);
  });

  test('returns false when token is configured and no token provided', () => {
    expect(isAdminAuthorized(undefined, 'secret')).toBe(false);
  });

  test('returns false when wrong token provided', () => {
    expect(isAdminAuthorized('wrong', 'secret')).toBe(false);
  });

  test('returns true when correct token provided', () => {
    expect(isAdminAuthorized('secret', 'secret')).toBe(true);
  });
});

// ─── matchesGlob ─────────────────────────────────────────────────────────────

describe('matchesGlob', () => {
  test('* matches everything', () => {
    expect(matchesGlob('*', 'chat')).toBe(true);
    expect(matchesGlob('*', 'anything')).toBe(true);
  });

  test('exact match', () => {
    expect(matchesGlob('chat', 'chat')).toBe(true);
    expect(matchesGlob('chat', 'run_prompt')).toBe(false);
  });

  test('prefix wildcard', () => {
    expect(matchesGlob('list_*', 'list_sessions')).toBe(true);
    expect(matchesGlob('list_*', 'list_skills')).toBe(true);
    expect(matchesGlob('list_*', 'chat')).toBe(false);
  });
});

// ─── loadHooksFile ────────────────────────────────────────────────────────────

describe('loadHooksFile', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mcp-hooks-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test('returns empty object when no file found', () => {
    const result = loadHooksFile([join(tempDir, 'nonexistent.json')]);
    expect(result).toEqual({});
  });

  test('loads hooks from file', async () => {
    const hooksPath = join(tempDir, 'hooks.json');
    const content: HooksFile = {
      hooks: {
        McpPreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo hello' }] }],
      },
    };
    await writeFile(hooksPath, JSON.stringify(content));
    const result = loadHooksFile([hooksPath]);
    expect(result.hooks?.McpPreToolUse).toHaveLength(1);
    expect(result.hooks?.McpPreToolUse?.[0].matcher).toBe('*');
  });

  test('returns empty object on malformed JSON', async () => {
    const hooksPath = join(tempDir, 'hooks.json');
    await writeFile(hooksPath, 'not json');
    const result = loadHooksFile([hooksPath]);
    expect(result).toEqual({});
  });
});

// ─── loadDynamicTools / saveDynamicTools ──────────────────────────────────────

describe('loadDynamicTools / saveDynamicTools', () => {
  let tempDir: string;
  let toolsFile: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mcp-dyntools-test-'));
    toolsFile = join(tempDir, 'mcp-tools.json');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test('returns empty array when file does not exist', () => {
    expect(loadDynamicTools(toolsFile)).toEqual([]);
  });

  test('saves and loads tools', () => {
    const tools: DynamicToolDef[] = [
      { name: 'my_tool', description: 'does stuff', command: 'echo $TOOL_ARGS', version: '1.0' },
    ];
    saveDynamicTools(tools, toolsFile);
    const loaded = loadDynamicTools(toolsFile);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('my_tool');
    expect(loaded[0].command).toBe('echo $TOOL_ARGS');
  });
});

// ─── loadCommandsDir ──────────────────────────────────────────────────────────

describe('loadCommandsDir', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mcp-cmds-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test('returns empty array for nonexistent dir', () => {
    expect(loadCommandsDir(join(tempDir, 'nope'))).toEqual([]);
  });

  test('loads command with frontmatter', async () => {
    await writeFile(join(tempDir, 'reflect.md'), `---\nname: reflect\ndescription: Reflect on the conversation\n---\n\nPlease summarize.`);
    const cmds = loadCommandsDir(tempDir);
    expect(cmds).toHaveLength(1);
    expect(cmds[0].name).toBe('reflect');
    expect(cmds[0].description).toBe('Reflect on the conversation');
    expect(cmds[0].text).toBe('Please summarize.');
  });

  test('loads command without frontmatter (uses filename as name)', async () => {
    await writeFile(join(tempDir, 'help.md'), `# Help\n\nThis is a help command.`);
    const cmds = loadCommandsDir(tempDir);
    expect(cmds).toHaveLength(1);
    expect(cmds[0].name).toBe('help');
  });

  test('ignores non-.md files', async () => {
    await writeFile(join(tempDir, 'notes.txt'), 'not markdown');
    const cmds = loadCommandsDir(tempDir);
    expect(cmds).toHaveLength(0);
  });
});

// ─── validateToolSchema ───────────────────────────────────────────────────────

describe('validateToolSchema', () => {
  test('valid schema passes', () => {
    const result = validateToolSchema('my_tool', {
      properties: {
        name: { type: 'string', description: 'The name' },
      },
    });
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  test('invalid tool name produces warning', () => {
    const result = validateToolSchema('My-Tool', {});
    expect(result.valid).toBe(false);
    expect(result.warnings.some(w => w.includes('snake_case'))).toBe(true);
  });

  test('property missing description produces warning', () => {
    const result = validateToolSchema('my_tool', {
      properties: {
        name: { type: 'string' },
      },
    });
    expect(result.warnings.some(w => w.includes('description'))).toBe(true);
  });

  test('property missing type produces warning', () => {
    const result = validateToolSchema('my_tool', {
      properties: {
        name: { description: 'something' },
      },
    });
    expect(result.warnings.some(w => w.includes('type'))).toBe(true);
  });
});

// ─── createRateLimiter ────────────────────────────────────────────────────────

describe('createRateLimiter', () => {
  test('unlimited (0) always returns true', () => {
    const check = createRateLimiter(0);
    for (let i = 0; i < 200; i++) expect(check('chat')).toBe(true);
  });

  test('enforces limit', () => {
    const check = createRateLimiter(3);
    expect(check('chat')).toBe(true);
    expect(check('chat')).toBe(true);
    expect(check('chat')).toBe(true);
    expect(check('chat')).toBe(false); // 4th call exceeds limit
  });
});

// ─── createAuditLog ───────────────────────────────────────────────────────────

describe('createAuditLog', () => {
  test('records and lists entries', () => {
    const log = createAuditLog(10);
    log.record({ tool_name: 'chat', args: {}, result: {}, duration_ms: 50, error: false, timestamp: new Date().toISOString() });
    log.record({ tool_name: 'list_sessions', args: {}, result: {}, duration_ms: 10, error: false, timestamp: new Date().toISOString() });
    const entries = log.list();
    expect(entries).toHaveLength(2);
    expect(entries[0].tool_name).toBe('list_sessions'); // reversed order (most recent first)
  });

  test('caps at maxEntries', () => {
    const log = createAuditLog(3);
    for (let i = 0; i < 10; i++) {
      log.record({ tool_name: `tool_${i}`, args: {}, result: {}, duration_ms: 1, error: false, timestamp: new Date().toISOString() });
    }
    expect(log.list(100)).toHaveLength(3);
  });

  test('limit parameter works', () => {
    const log = createAuditLog(100);
    for (let i = 0; i < 10; i++) {
      log.record({ tool_name: 'chat', args: {}, result: {}, duration_ms: 1, error: false, timestamp: new Date().toISOString() });
    }
    expect(log.list(3)).toHaveLength(3);
  });
});

// ─── TOOL_DOCS and PROFILE_TOOLS ─────────────────────────────────────────────

describe('TOOL_DOCS', () => {
  test('all tools have description, params, and version', () => {
    for (const [name, doc] of Object.entries(TOOL_DOCS)) {
      expect(doc.description, `${name} missing description`).toBeTruthy();
      expect(doc.params, `${name} missing params`).toBeTruthy();
      expect(doc.version, `${name} missing version`).toBeTruthy();
    }
  });
});

describe('PROFILE_TOOLS', () => {
  test('minimal has 3 tools', () => {
    expect(PROFILE_TOOLS.minimal.size).toBe(3);
    expect(PROFILE_TOOLS.minimal.has('describe_tools')).toBe(true);
    expect(PROFILE_TOOLS.minimal.has('search_tools')).toBe(true);
    expect(PROFILE_TOOLS.minimal.has('run_prompt')).toBe(true);
  });

  test('standard is a superset of minimal', () => {
    for (const t of PROFILE_TOOLS.minimal) {
      expect(PROFILE_TOOLS.standard.has(t)).toBe(true);
    }
    expect(PROFILE_TOOLS.standard.size).toBeGreaterThan(PROFILE_TOOLS.minimal.size);
  });

  test('full is a superset of standard', () => {
    for (const t of PROFILE_TOOLS.standard) {
      expect(PROFILE_TOOLS.full.has(t)).toBe(true);
    }
  });
});

// ─── Integration: tool listing ────────────────────────────────────────────────

describe('MCP server integration — full profile', () => {
  let client: Client;

  beforeEach(async () => {
    ({ client } = await buildClient({ profile: 'full', token: null }));
  });

  test('listTools returns all expected tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map(t => t.name);
    expect(names).toContain('describe_tools');
    expect(names).toContain('search_tools');
    expect(names).toContain('chat');
    expect(names).toContain('run_prompt');
    expect(names).toContain('list_sessions');
    expect(names).toContain('list_skills');
    expect(names).toContain('execute_skill');
    expect(names).toContain('get_session');
    expect(names).toContain('register_tool');
    expect(names).toContain('list_mcp_servers');
    expect(names).toContain('get_audit_log');
    expect(names).toContain('validate_schema');
  });

  test('MCP_VERSION is set', () => {
    expect(MCP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// ─── Integration: profile switching ──────────────────────────────────────────

describe('MCP server integration — profile switching', () => {
  test('minimal profile exposes only 3 tools', async () => {
    const { client } = await buildClient({ profile: 'minimal' });
    const { tools } = await client.listTools();
    // describe_tools and search_tools are registered directly (not via registerTool),
    // plus run_prompt via registerTool
    const names = tools.map(t => t.name);
    expect(names).toContain('describe_tools');
    expect(names).toContain('search_tools');
    expect(names).toContain('run_prompt');
    expect(names).not.toContain('chat');
    expect(names).not.toContain('list_sessions');
  });

  test('standard profile exposes 5+ tools', async () => {
    const { client } = await buildClient({ profile: 'standard' });
    const { tools } = await client.listTools();
    const names = tools.map(t => t.name);
    expect(names).toContain('chat');
    expect(names).toContain('list_sessions');
    expect(names).not.toContain('list_skills');
  });
});

// ─── Integration: describe_tools ─────────────────────────────────────────────

describe('describe_tools', () => {
  test('returns docs for all tools when called with no args', async () => {
    const { client } = await buildClient({ profile: 'full' });
    const result = await client.callTool({ name: 'describe_tools', arguments: {} });
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('## chat');
    expect(text).toContain('## list_sessions');
  });

  test('returns docs for specific tools', async () => {
    const { client } = await buildClient({ profile: 'full' });
    const result = await client.callTool({ name: 'describe_tools', arguments: { names: ['chat'] } });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('## chat');
    expect(text).not.toContain('## list_sessions');
  });

  test('returns not-found for unknown tool', async () => {
    const { client } = await buildClient({ profile: 'full' });
    const result = await client.callTool({ name: 'describe_tools', arguments: { names: ['no_such_tool'] } });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('not found');
  });

  test('includes version in output', async () => {
    const { client } = await buildClient({ profile: 'full' });
    const result = await client.callTool({ name: 'describe_tools', arguments: { names: ['chat'] } });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('(v1.0)');
  });
});

// ─── Integration: search_tools ────────────────────────────────────────────────

describe('search_tools', () => {
  test('finds tools by keyword', async () => {
    const { client } = await buildClient({ profile: 'full' });
    const result = await client.callTool({ name: 'search_tools', arguments: { query: 'session' } });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('list_sessions');
  });

  test('returns no-match message for unknown keyword', async () => {
    const { client } = await buildClient({ profile: 'full' });
    const result = await client.callTool({ name: 'search_tools', arguments: { query: 'zzznomatch999' } });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('No tools matched');
  });
});

// ─── Integration: list_sessions ───────────────────────────────────────────────

describe('list_sessions', () => {
  test('returns empty message when no sessions exist', async () => {
    const { client } = await buildClient({ profile: 'full' });
    const result = await client.callTool({ name: 'list_sessions', arguments: {} });
    // Either empty message or session list — both are valid outputs
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(typeof text).toBe('string');
  });
});

// ─── Integration: get_session (not found) ────────────────────────────────────

describe('get_session', () => {
  test('returns error for nonexistent session', async () => {
    const { client } = await buildClient({ profile: 'full' });
    const result = await client.callTool({ name: 'get_session', arguments: { session_id: 'nonexistent-session-xyz' } });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('not found');
  });
});

// ─── Integration: list_skills ─────────────────────────────────────────────────

describe('list_skills', () => {
  test('returns skill list or empty message', async () => {
    const { client } = await buildClient({ profile: 'full' });
    const result = await client.callTool({ name: 'list_skills', arguments: {} });
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(typeof text).toBe('string');
  });
});

// ─── Integration: validate_schema ─────────────────────────────────────────────

describe('validate_schema tool', () => {
  test('reports valid schema', async () => {
    const { client } = await buildClient({ profile: 'full' });
    const result = await client.callTool({
      name: 'validate_schema',
      arguments: {
        tool_name: 'my_tool',
        schema: { properties: { name: { type: 'string', description: 'The name' } } },
      },
    });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('valid');
  });

  test('reports warnings for bad schema', async () => {
    const { client } = await buildClient({ profile: 'full' });
    const result = await client.callTool({
      name: 'validate_schema',
      arguments: {
        tool_name: 'Bad-Tool',
        schema: { properties: { name: {} } },
      },
    });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('warnings');
  });
});

// ─── Integration: auth on admin tools ────────────────────────────────────────

describe('admin tool auth', () => {
  test('register_tool rejects without token when token is configured', async () => {
    const { client } = await buildClient({ profile: 'full', token: 'supersecret' });
    const result = await client.callTool({
      name: 'register_tool',
      arguments: { name: 'test_tool', description: 'test', command: 'echo hi' },
    });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('Unauthorized');
  });

  test('register_tool accepts correct token', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'mcp-reg-test-'));
    const toolsFile = join(tempDir, 'mcp-tools.json');
    const { client } = await buildClient({ profile: 'full', token: 'supersecret', dynamicToolsFile: toolsFile });
    const result = await client.callTool({
      name: 'register_tool',
      arguments: { name: 'echo_tool', description: 'echoes', command: 'echo $TOOL_ARGS', auth_token: 'supersecret' },
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('echo_tool');
    await rm(tempDir, { recursive: true, force: true });
  });

  test('list_mcp_servers rejects without token when token is configured', async () => {
    const { client } = await buildClient({ profile: 'full', token: 'supersecret' });
    const result = await client.callTool({ name: 'list_mcp_servers', arguments: {} });
    expect(result.isError).toBe(true);
  });

  test('get_audit_log rejects without token when token is configured', async () => {
    const { client } = await buildClient({ profile: 'full', token: 'supersecret' });
    const result = await client.callTool({ name: 'get_audit_log', arguments: {} });
    expect(result.isError).toBe(true);
  });

  test('admin tools are freely accessible when no token is configured', async () => {
    const { client } = await buildClient({ profile: 'full', token: null });
    const result = await client.callTool({ name: 'list_mcp_servers', arguments: {} });
    expect(result.isError).toBeFalsy();
  });
});

// ─── Integration: rate limiting ────────────────────────────────────────────────

describe('rate limiting', () => {
  test('blocks calls beyond the limit', async () => {
    const { client } = await buildClient({ profile: 'full', rateLimitPerMinute: 3 });
    // First 3 calls succeed
    for (let i = 0; i < 3; i++) {
      const r = await client.callTool({ name: 'list_sessions', arguments: {} });
      expect(r.isError).toBeFalsy();
    }
    // 4th call is rate limited
    const blocked = await client.callTool({ name: 'list_sessions', arguments: {} });
    expect(blocked.isError).toBe(true);
    expect((blocked.content[0] as { text: string }).text).toContain('Rate limit');
  });
});

// ─── Integration: get_audit_log ───────────────────────────────────────────────

describe('get_audit_log', () => {
  test('shows entries after tool calls', async () => {
    const { client } = await buildClient({ profile: 'full', token: null });
    await client.callTool({ name: 'list_sessions', arguments: {} });
    await client.callTool({ name: 'search_tools', arguments: { query: 'chat' } });
    const result = await client.callTool({ name: 'get_audit_log', arguments: {} });
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('list_sessions');
  });
});

// ─── Integration: MCP Resources ──────────────────────────────────────────────

describe('MCP Resources', () => {
  test('listResources returns expected resources', async () => {
    const { client } = await buildClient({ profile: 'full' });
    const { resources } = await client.listResources();
    const uris = resources.map(r => r.uri);
    expect(uris).toContain('assistants://sessions');
    expect(uris).toContain('assistants://skills');
    expect(uris).toContain('assistants://config/settings');
    expect(uris).toContain('assistants://config/hooks');
  });

  test('readResource sessions returns text', async () => {
    const { client } = await buildClient({ profile: 'full' });
    const result = await client.readResource({ uri: 'assistants://sessions' });
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].mimeType).toBe('text/plain');
  });

  test('readResource skills returns text', async () => {
    const { client } = await buildClient({ profile: 'full' });
    const result = await client.readResource({ uri: 'assistants://skills' });
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].mimeType).toBe('text/plain');
  });

  test('readResource config/settings returns JSON', async () => {
    const { client } = await buildClient({ profile: 'full' });
    const result = await client.readResource({ uri: 'assistants://config/settings' });
    expect(result.contents[0].mimeType).toBe('application/json');
    // Content should be parseable JSON
    const text = result.contents[0].text as string;
    expect(() => JSON.parse(text)).not.toThrow();
  });

  test('readResource config/hooks returns JSON', async () => {
    const { client } = await buildClient({ profile: 'full' });
    const result = await client.readResource({ uri: 'assistants://config/hooks' });
    expect(result.contents[0].mimeType).toBe('application/json');
    const text = result.contents[0].text as string;
    expect(() => JSON.parse(text)).not.toThrow();
  });

  test('readResource session by id returns not-found for unknown id', async () => {
    const { client } = await buildClient({ profile: 'full' });
    const result = await client.readResource({ uri: 'assistants://sessions/nonexistent-abc123' });
    expect(result.contents[0].text as string).toContain('not found');
  });

  test('readResource skill by name returns not-found for unknown skill', async () => {
    const { client } = await buildClient({ profile: 'full' });
    const result = await client.readResource({ uri: 'assistants://skills/no-such-skill-xyz' });
    expect(result.contents[0].text as string).toContain('not found');
  });
});

// ─── Integration: MCP Prompts ─────────────────────────────────────────────────

describe('MCP Prompts', () => {
  test('listPrompts returns skill prompts', async () => {
    const { client } = await buildClient({ profile: 'full' });
    const { prompts } = await client.listPrompts();
    // At least one skill prompt should be registered (built-in skills exist)
    const skillPrompts = prompts.filter(p => p.name.startsWith('skill/'));
    expect(skillPrompts.length).toBeGreaterThan(0);
  });

  test('listPrompts includes command prompts', async () => {
    const { client } = await buildClient({ profile: 'full' });
    const { prompts } = await client.listPrompts();
    // The built-in reflect command should be registered
    const commandPrompts = prompts.filter(p => p.name.startsWith('command/'));
    expect(commandPrompts.length).toBeGreaterThan(0);
  });

  test('getPrompt for a skill returns user message', async () => {
    const { client } = await buildClient({ profile: 'full' });
    const { prompts } = await client.listPrompts();
    const skillPrompt = prompts.find(p => p.name.startsWith('skill/'));
    if (!skillPrompt) return; // skip if no skills
    const result = await client.getPrompt({ name: skillPrompt.name, arguments: {} });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].content.type).toBe('text');
  });
});

// ─── Integration: register_tool and execute ───────────────────────────────────

describe('register_tool and dynamic execution', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mcp-dynexec-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test('registered tool executes shell command', async () => {
    const toolsFile = join(tempDir, 'mcp-tools.json');
    const { client } = await buildClient({ profile: 'full', token: null, dynamicToolsFile: toolsFile });

    await client.callTool({
      name: 'register_tool',
      arguments: { name: 'greet', description: 'Says hello', command: 'echo "hello world"' },
    });

    const result = await client.callTool({ name: 'greet', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect((result.content[0] as { text: string }).text).toContain('hello world');
  });

  test('registered tool passes TOOL_ARGS env var', async () => {
    const toolsFile = join(tempDir, 'mcp-tools.json');
    const { client } = await buildClient({ profile: 'full', token: null, dynamicToolsFile: toolsFile });

    await client.callTool({
      name: 'register_tool',
      arguments: { name: 'echo_args', description: 'Echoes args', command: 'echo "$TOOL_ARGS"' },
    });

    const result = await client.callTool({ name: 'echo_args', arguments: { args: 'hello' } });
    expect((result.content[0] as { text: string }).text).toContain('hello');
  });

  test('re-registering same tool name overwrites it', async () => {
    const toolsFile = join(tempDir, 'mcp-tools.json');
    const { client } = await buildClient({ profile: 'full', token: null, dynamicToolsFile: toolsFile });

    await client.callTool({
      name: 'register_tool',
      arguments: { name: 'my_cmd', description: 'v1', command: 'echo v1' },
    });
    await client.callTool({
      name: 'register_tool',
      arguments: { name: 'my_cmd', description: 'v2', command: 'echo v2' },
    });

    const tools = loadDynamicTools(toolsFile);
    const matches = tools.filter(t => t.name === 'my_cmd');
    expect(matches).toHaveLength(1); // only one entry, not duplicated
  });
});
