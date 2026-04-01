import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test';
import { CommandLoader } from '../src/commands/loader';
import { CommandExecutor } from '../src/commands/executor';
import { BuiltinCommands } from '../src/commands/builtin';
import { TelephonyManager } from '../src/telephony/manager';
import { listProjects, readProject } from '../src/projects/store';
import type { CommandContext, CommandResult } from '../src/commands/types';
import { IdentityManager } from '../src/identity/identity-manager';
import { mkdirSync, writeFileSync, rmSync, existsSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { appendHeartbeatHistory } from '../src/heartbeat/history';
import { listSchedules, saveSchedule, computeNextRun } from '../src/scheduler/store';
import { generateId } from '@hasna/assistants-shared';
import { getRuntime } from '../src/runtime';
import { SessionStorage } from '../src/logger';
import { closeDatabase, resetDatabaseSingleton } from '../src/database';

describe('BuiltinCommands', () => {
  let builtins: BuiltinCommands;
  let loader: CommandLoader;
  let mockContext: CommandContext;
  let emittedContent: string[];
  let messagesCleared: boolean;
  let tempDir: string;
  let originalAssistantsDir: string | undefined;
  let activeProjectId: string | null;
  let projectContextContent: string | null;
  const heartbeatState = {
    enabled: true,
    state: 'idle' as const,
    lastActivity: new Date().toISOString(),
    uptimeSeconds: 42,
    isStale: false,
  };

  beforeEach(() => {
    builtins = new BuiltinCommands();
    loader = new CommandLoader();
    emittedContent = [];
    messagesCleared = false;
    activeProjectId = null;
    projectContextContent = null;
    tempDir = mkdtempSync(join(tmpdir(), 'assistants-cmd-'));
    originalAssistantsDir = process.env.ASSISTANTS_DIR;
    process.env.ASSISTANTS_DIR = tempDir;
    resetDatabaseSingleton();

    mockContext = {
      cwd: tempDir,
      sessionId: 'session-123',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ],
      tools: [
        { name: 'bash', description: 'Run commands', parameters: { type: 'object', properties: {} } },
        { name: 'read', description: 'Read files', parameters: { type: 'object', properties: {} } },
      ],
      skills: [
        { name: 'alpha', description: 'Alpha skill', argumentHint: '[arg]' },
      ],
      connectors: [],
      getHeartbeatState: () => heartbeatState,
      getHeartbeatConfig: () => ({
        historyPath: join(tempDir, 'heartbeats', 'runs', '{sessionId}.jsonl'),
      }),
      getActiveProjectId: () => activeProjectId,
      setActiveProjectId: (id) => { activeProjectId = id; },
      setProjectContext: (content) => { projectContextContent = content; },
      clearMessages: () => { messagesCleared = true; },
      addSystemMessage: () => {},
      emit: (type, content) => {
        if (type === 'text' && content) {
          emittedContent.push(content);
        }
      },
    };

    builtins.registerAll(loader);
  });

  afterEach(() => {
    closeDatabase();
    resetDatabaseSingleton();
    process.env.ASSISTANTS_DIR = originalAssistantsDir;
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('/status command', () => {
    test('should show session status', async () => {
      builtins.updateTokenUsage({
        inputTokens: 5000,
        outputTokens: 2000,
        totalTokens: 7000,
        maxContextTokens: 200000,
      });

      const cmd = loader.getCommand('status');
      expect(cmd).toBeDefined();

      if (cmd?.handler) {
        const result = await cmd.handler('', mockContext);
        expect(result.handled).toBe(true);
        expect(emittedContent.some(c => c.includes('Session Status'))).toBe(true);
        expect(emittedContent.some(c => c.includes(tempDir))).toBe(true);
        expect(emittedContent.some(c => c.includes('session-123'))).toBe(true);
      }
    });

    test('should include cache token usage when available', async () => {
      builtins.updateTokenUsage({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        maxContextTokens: 200000,
        cacheReadTokens: 25,
        cacheWriteTokens: 10,
      });

      const cmd = loader.getCommand('status');
      expect(cmd).toBeDefined();

      if (cmd?.handler) {
        const result = await cmd.handler('', mockContext);
        expect(result.handled).toBe(true);
        const output = emittedContent.join('\n');
        expect(output).toContain('Cache Read');
        expect(output).toContain('Cache Write');
      }
    });
  });

  describe('/cost command', () => {
    test('should show cost estimate', async () => {
      builtins.updateTokenUsage({
        inputTokens: 10000,
        outputTokens: 5000,
        totalTokens: 15000,
        maxContextTokens: 200000,
      });

      const cmd = loader.getCommand('cost');
      expect(cmd).toBeDefined();

      if (cmd?.handler) {
        const result = await cmd.handler('', mockContext);
        expect(result.handled).toBe(true);
        expect(emittedContent.some(c => c.includes('Estimated Session Cost'))).toBe(true);
        expect(emittedContent.some(c => c.includes('$'))).toBe(true);
      }
    });

    test('should include cache savings when cache tokens exist', async () => {
      builtins.updateTokenUsage({
        inputTokens: 10000,
        outputTokens: 5000,
        totalTokens: 15000,
        maxContextTokens: 200000,
        cacheReadTokens: 5000,
      });

      const cmd = loader.getCommand('cost');
      expect(cmd).toBeDefined();

      if (cmd?.handler) {
        const result = await cmd.handler('', mockContext);
        expect(result.handled).toBe(true);
        expect(emittedContent.some(c => c.includes('Cache savings'))).toBe(true);
      }
    });
  });

  describe('/model command', () => {
    test('should open model selector panel with no args', async () => {
      const cmd = loader.getCommand('model');
      expect(cmd).toBeDefined();

      if (cmd?.handler) {
        const result = await cmd.handler('', mockContext);
        expect(result.handled).toBe(true);
        expect(result.showPanel).toBe('model');
      }
    });

    test('should show model information for status', async () => {
      const cmd = loader.getCommand('model');
      expect(cmd).toBeDefined();

      if (cmd?.handler) {
        const result = await cmd.handler('status', mockContext);
        expect(result.handled).toBe(true);
        expect(emittedContent.some(c => c.includes('Current Model'))).toBe(true);
      }
    });
  });

  describe('/config command', () => {
    test('should show configuration', async () => {
      const cmd = loader.getCommand('config');
      expect(cmd).toBeDefined();

      if (cmd?.handler) {
        const result = await cmd.handler('', mockContext);
        expect(result.handled).toBe(true);
        expect(result.showPanel).toBe('config');
      }
    });
  });

  describe('/budgets command', () => {
    test('project set preserves original casing', async () => {
      const cmd = loader.getCommand('budgets');
      expect(cmd).toBeDefined();

      let selectedProject: string | null = null;
      const context: CommandContext = {
        ...mockContext,
        setActiveProjectId: (projectId: string | null) => {
          selectedProject = projectId;
        },
      };

      if (cmd?.handler) {
        const result = await cmd.handler('project Revenue Team Q1', context);
        expect(result.handled).toBe(true);
        expect(selectedProject).toBe('Revenue Team Q1');
        expect(emittedContent.join('\n')).toContain('Revenue Team Q1');
      }
    });

    test('reset with invalid scope does not reset all budgets', async () => {
      const cmd = loader.getCommand('budgets');
      expect(cmd).toBeDefined();

      const resetCalls: Array<'session' | 'assistant' | 'swarm' | 'project' | undefined> = [];
      const context: CommandContext = {
        ...mockContext,
        resetBudget: (scope) => {
          resetCalls.push(scope);
        },
      };

      if (cmd?.handler) {
        const result = await cmd.handler('reset invalid', context);
        expect(result.handled).toBe(true);
        expect(resetCalls).toEqual([]);
        expect(emittedContent.join('\n')).toContain('Invalid scope');
      }
    });

    test('status uses runtime budget summary when available', async () => {
      const cmd = loader.getCommand('budgets');
      expect(cmd).toBeDefined();

      const nowIso = new Date(0).toISOString();
      const context: CommandContext = {
        ...mockContext,
        getBudgetSummary: () => ({
          enabled: true,
          session: {
            scope: 'session',
            limits: { maxTotalTokens: 2000, maxLlmCalls: 10 },
            usage: {
              inputTokens: 600,
              outputTokens: 634,
              totalTokens: 1234,
              llmCalls: 3,
              toolCalls: 0,
              durationMs: 0,
              periodStartedAt: nowIso,
              lastUpdatedAt: nowIso,
            },
            checks: {},
            overallExceeded: false,
            warningsCount: 0,
          },
          swarm: {
            scope: 'swarm',
            limits: {},
            usage: {
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              llmCalls: 0,
              toolCalls: 0,
              durationMs: 0,
              periodStartedAt: nowIso,
              lastUpdatedAt: nowIso,
            },
            checks: {},
            overallExceeded: false,
            warningsCount: 0,
          },
          project: null,
          assistantCount: 0,
          anyExceeded: false,
          totalWarnings: 0,
        }),
      };

      if (cmd?.handler) {
        const result = await cmd.handler('status', context);
        expect(result.handled).toBe(true);
        const output = emittedContent.join('\n');
        expect(output).toContain('Enforcement: **enabled**');
        expect(output).toContain('Tokens: 1,234 / 2,000');
      }
    });

    test('extend updates runtime budget config', async () => {
      const cmd = loader.getCommand('budgets');
      expect(cmd).toBeDefined();

      let updatedConfig: any = null;
      const context: CommandContext = {
        ...mockContext,
        budgetConfig: {
          enabled: true,
          session: { maxTotalTokens: 1000 },
          assistant: {},
          swarm: {},
          project: {},
          onExceeded: 'warn',
          persist: false,
        },
        setBudgetConfig: (config) => {
          updatedConfig = config;
        },
      };

      if (cmd?.handler) {
        const result = await cmd.handler('extend 500', context);
        expect(result.handled).toBe(true);
        expect(updatedConfig).toBeTruthy();
        expect(updatedConfig.session?.maxTotalTokens).toBe(1500);
        expect(emittedContent.join('\n')).toContain('new limit: 1,500');
      }
    });
  });

  describe('/wallet command', () => {
    test('add opens wallet panel in add mode', async () => {
      const cmd = loader.getCommand('wallet');
      expect(cmd).toBeDefined();

      const manager = {
        list: async () => [],
        remove: async () => ({ success: true, message: 'ok' }),
        getRateLimitStatus: () => ({ readsUsed: 0, maxReads: 10, windowResetMinutes: 60 }),
        checkCredentials: async () => ({ valid: true }),
        getStorageMode: () => 'local',
      };

      const context: CommandContext = {
        ...mockContext,
        getWalletManager: () => manager as any,
      };

      if (cmd?.handler) {
        const result = await cmd.handler('add', context);
        expect(result.handled).toBe(true);
        expect(result.showPanel).toBe('wallet');
        expect(result.panelValue).toBe('add');
      }
    });
  });

  describe('/secrets command', () => {
    test('add opens secrets panel in add mode', async () => {
      const cmd = loader.getCommand('secrets');
      expect(cmd).toBeDefined();

      const context: CommandContext = {
        ...mockContext,
        getSecretsManager: () => ({}) as any,
      };

      if (cmd?.handler) {
        const result = await cmd.handler('add', context);
        expect(result.handled).toBe(true);
        expect(result.showPanel).toBe('secrets');
        expect(result.panelValue).toBe('add');
      }
    });
  });

  describe('non-self-handled commands', () => {
    test('/compact should return LLM prompt', () => {
      const cmd = loader.getCommand('compact');
      expect(cmd).toBeDefined();
      expect(cmd?.selfHandled).toBe(false);
      expect(cmd?.content).toContain('summarize');
    });

    test('/memory should return LLM prompt', () => {
      const cmd = loader.getCommand('memory');
      expect(cmd).toBeDefined();
      expect(cmd?.selfHandled).toBe(true);
    });
  });

  describe('/tokens command', () => {
    test('should show token usage', async () => {
      builtins.updateTokenUsage({
        inputTokens: 1,
        outputTokens: 2,
        totalTokens: 3,
        maxContextTokens: 10,
      });

      const cmd = loader.getCommand('tokens');
      expect(cmd).toBeDefined();

      if (cmd?.handler) {
        const result = await cmd.handler('', mockContext);
        expect(result.handled).toBe(true);
        expect(emittedContent.some(c => c.includes('Token Usage'))).toBe(true);
      }
    });
  });

  describe('/skills command', () => {
    test('should list available skills', async () => {
      const cmd = loader.getCommand('skills');
      expect(cmd).toBeDefined();

      if (cmd?.handler) {
        const result = await cmd.handler('', mockContext);
        expect(result.handled).toBe(true);
        expect(result.showPanel).toBe('skills');
      }
    });

    test('should handle no skills', async () => {
      const cmd = loader.getCommand('skills');
      expect(cmd).toBeDefined();

      const contextNoSkills = { ...mockContext, skills: [] };
      if (cmd?.handler) {
        const result = await cmd.handler('', contextNoSkills);
        expect(result.handled).toBe(true);
        expect(result.showPanel).toBe('skills');
      }
    });
  });

  describe('/session command', () => {
    test('should return list action when no args', async () => {
      const cmd = loader.getCommand('session');
      expect(cmd).toBeDefined();
      if (cmd?.handler) {
        const result = await cmd.handler('', mockContext);
        expect(result.handled).toBe(true);
        expect(result.sessionAction).toBe('list');
      }
    });

    test('should return new action', async () => {
      const cmd = loader.getCommand('session');
      expect(cmd).toBeDefined();
      if (cmd?.handler) {
        const result = await cmd.handler('new', mockContext);
        expect(result.sessionAction).toBe('new');
      }
    });

    test('should return switch action for numeric arg', async () => {
      const cmd = loader.getCommand('session');
      expect(cmd).toBeDefined();
      if (cmd?.handler) {
        const result = await cmd.handler('2', mockContext);
        expect(result.sessionAction).toBe('switch');
        expect(result.sessionNumber).toBe(2);
      }
    });
  });

  describe('/exit and /new commands', () => {
    test('exit should signal exit', async () => {
      const cmd = loader.getCommand('exit');
      expect(cmd).toBeDefined();
      if (cmd?.handler) {
        const result = await cmd.handler('', mockContext);
        expect(result.exit).toBe(true);
      }
    });

    test('new should clear conversation', async () => {
      const cmd = loader.getCommand('new');
      expect(cmd).toBeDefined();
      if (cmd?.handler) {
        const result = await cmd.handler('', mockContext);
        expect(result.clearConversation).toBe(true);
        expect(messagesCleared).toBe(true);
      }
    });
  });

  describe('/init command', () => {
    test('should create commands directory and example', async () => {
      const cmd = loader.getCommand('init');
      expect(cmd).toBeDefined();
      if (cmd?.handler) {
        const result = await cmd.handler('', mockContext);
        expect(result.handled).toBe(true);
        expect(emittedContent.some(c => c.includes('Initialized assistants'))).toBe(true);
        expect(existsSync(join(tempDir, '.assistants', 'commands', 'reflect.md'))).toBe(true);
      }
    });
  });

  describe('/connectors command', () => {
    test('should show empty state when no connectors', async () => {
      const cmd = loader.getCommand('connectors');
      expect(cmd).toBeDefined();
      if (cmd?.handler) {
        const result = await cmd.handler('--list', mockContext);
        expect(result.handled).toBe(true);
        expect(emittedContent.some(c => c.includes('No connectors found'))).toBe(true);
      }
    });

    test('should report unknown connector when name not found', async () => {
      const cmd = loader.getCommand('connectors');
      expect(cmd).toBeDefined();

      const contextWithConnector = {
        ...mockContext,
        connectors: [
          { name: 'demo', description: 'Demo connector', cli: 'connect-demo', commands: [] },
        ],
      };

      if (cmd?.handler) {
        const result = await cmd.handler('--list missing', contextWithConnector);
        expect(result.handled).toBe(true);
        expect(emittedContent.some(c => c.includes('not found'))).toBe(true);
      }
    });

    test('should show connector details when name provided', async () => {
      const cmd = loader.getCommand('connectors');
      expect(cmd).toBeDefined();

      const runtime = getRuntime();
      const originalSpawn = runtime.spawn;
      runtime.spawn = () =>
        ({
          stdout: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(JSON.stringify({ authenticated: true, user: 'test' })));
              controller.close();
            },
          }),
          stderr: null,
          stdin: null,
          pid: 1,
          exited: Promise.resolve(0),
          kill: () => {},
        }) as any;

      const contextWithConnector = {
        ...mockContext,
        connectors: [
          {
            name: 'demo',
            description: 'Demo connector',
            cli: 'connect-demo',
            commands: [{ name: 'list', description: 'List items' }],
          },
        ],
      };

      try {
        if (cmd?.handler) {
          const result = await cmd.handler('--list demo', contextWithConnector);
          expect(result.handled).toBe(true);
          expect(emittedContent.some(c => c.includes('Demo'))).toBe(true);
        }
      } finally {
        runtime.spawn = originalSpawn;
      }
    });

    test('should list connectors with status', async () => {
      const cmd = loader.getCommand('connectors');
      expect(cmd).toBeDefined();

      const runtime = getRuntime();
      const originalSpawn = runtime.spawn;
      runtime.spawn = () =>
        ({
          stdout: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(JSON.stringify({ authenticated: true })));
              controller.close();
            },
          }),
          stderr: null,
          stdin: null,
          pid: 1,
          exited: Promise.resolve(0),
          kill: () => {},
        }) as any;

      const contextWithConnector = {
        ...mockContext,
        connectors: [
          {
            name: 'demo',
            description: 'Demo connector',
            cli: 'connect-demo',
            commands: [{ name: 'list', description: 'List items' }],
          },
        ],
      };

      try {
        if (cmd?.handler) {
          const result = await cmd.handler('--list', contextWithConnector);
          expect(result.handled).toBe(true);
          expect(emittedContent.some(c => c.includes('Available Connectors'))).toBe(true);
          expect(emittedContent.some(c => c.includes('demo'))).toBe(true);
        }
      } finally {
        runtime.spawn = originalSpawn;
      }
    });

    test('should fall back to timeout status when auth check hangs', async () => {
      const cmd = loader.getCommand('connectors');
      expect(cmd).toBeDefined();

      const runtime = getRuntime();
      const originalSpawn = runtime.spawn;
      const originalSetTimeout = globalThis.setTimeout;

      runtime.spawn = () =>
        ({
          stdout: new ReadableStream<Uint8Array>({
            start() {},
          }),
          stderr: null,
          stdin: null,
          pid: 1,
          exited: new Promise(() => {}),
          kill: () => {},
        }) as any;
      globalThis.setTimeout = ((fn: (...args: any[]) => void, _ms?: number, ...args: any[]) => {
        fn(...args);
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout;

      const contextWithConnector = {
        ...mockContext,
        connectors: [
          {
            name: 'demo',
            description: 'Demo connector',
            cli: 'connect-demo',
            commands: [{ name: 'list', description: 'List items' }],
          },
        ],
      };

      try {
        if (cmd?.handler) {
          const result = await cmd.handler('--list', contextWithConnector);
          expect(result.handled).toBe(true);
          expect(emittedContent.some(c => c.includes('Available Connectors'))).toBe(true);
          expect(emittedContent.some(c => c.includes('| ○ |'))).toBe(true);
        }
      } finally {
        globalThis.setTimeout = originalSetTimeout;
        runtime.spawn = originalSpawn;
      }
    });
  });

  describe('/schedules command', () => {
    test('should list schedules', async () => {
      const cmd = loader.getCommand('schedules');
      expect(cmd).toBeDefined();

      if (cmd?.handler) {
        const future = new Date(Date.now() + 60_000).toISOString();
        const scheduleId = generateId();
        const schedule = {
          id: scheduleId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          createdBy: 'user' as const,
          sessionId: mockContext.sessionId,
          command: '/status',
          status: 'active' as const,
          schedule: { kind: 'once' as const, at: future },
        };
        schedule.nextRunAt = computeNextRun(schedule, Date.now());
        await saveSchedule(tempDir, schedule);
        const result = await cmd.handler('list', mockContext);
        expect(result.handled).toBe(true);
        expect(emittedContent.some(c => c.includes('| ID |'))).toBe(true);
      }
    });

    test('should show help on unknown action', async () => {
      const cmd = loader.getCommand('schedules');
      expect(cmd).toBeDefined();

      if (cmd?.handler) {
        const result = await cmd.handler('resume', mockContext);
        expect(result.handled).toBe(true);
        const output = emittedContent.join('\n');
        expect(output).toContain('Schedules');
        expect(output).toContain('Usage');
      }
    });
  });

  describe('/heartbeat command', () => {
    test('should list heartbeat runs', async () => {
      const cmd = loader.getCommand('heartbeat');
      expect(cmd).toBeDefined();

      const historyPath = join(tempDir, 'heartbeats', 'runs', `${mockContext.sessionId}.jsonl`);
      const heartbeatRun = {
        sessionId: mockContext.sessionId,
        timestamp: new Date(Date.now() - 10_000).toISOString(),
        state: 'idle' as const,
        lastActivity: new Date(Date.now() - 5_000).toISOString(),
        stats: { messagesProcessed: 1, toolCallsExecuted: 2, errorsEncountered: 0, uptimeSeconds: 10 },
      };
      await appendHeartbeatHistory(historyPath, heartbeatRun);

      if (cmd?.handler) {
        const result = await cmd.handler('list', mockContext);
        expect(result.handled).toBe(true);
        const output = emittedContent.join('\n');
        expect(output).toContain('Heartbeat Status');
        expect(output).toContain('| Time | State |');
      }
    });

    test('should show status', async () => {
      const cmd = loader.getCommand('heartbeat');
      expect(cmd).toBeDefined();

      if (cmd?.handler) {
        const result = await cmd.handler('status', mockContext);
        expect(result.handled).toBe(true);
        const output = emittedContent.join('\n');
        expect(output).toContain('Heartbeat Status');
        expect(output).toContain('State: idle');
      }
    });
  });

  describe('/resume command', () => {
    test('should open resume panel by default', async () => {
      const cmd = loader.getCommand('resume');
      expect(cmd).toBeDefined();

      if (cmd?.handler) {
        const result = await cmd.handler('', mockContext);
        expect(result.handled).toBe(true);
        expect(result.showPanel).toBe('resume');
      }
    });

    test('should list sessions scoped to cwd', async () => {
      const cmd = loader.getCommand('resume');
      expect(cmd).toBeDefined();

      const rootId = 'resume-root';
      const otherId = 'resume-other';
      const rootSession = new SessionStorage(rootId);
      rootSession.save({
        messages: [],
        startedAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:01.000Z',
        cwd: tempDir,
      });

      const otherSession = new SessionStorage(otherId);
      otherSession.save({
        messages: [],
        startedAt: '2024-01-02T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:01.000Z',
        cwd: '/tmp/other',
      });

      if (cmd?.handler) {
        const result = await cmd.handler('list', mockContext);
        expect(result.handled).toBe(true);
        const output = emittedContent.join('\n');
        expect(output).toContain(rootId.slice(0, 8));
        expect(output).not.toContain(otherId.slice(0, 8));
      }
    });

    test('should list sessions across assistants with --all', async () => {
      const cmd = loader.getCommand('resume');
      expect(cmd).toBeDefined();

      const rootId = 'resume-all-root';
      const assistantSessionId = 'resume-all-assistant';
      const rootSession = new SessionStorage(rootId);
      rootSession.save({
        messages: [],
        startedAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:01.000Z',
        cwd: tempDir,
      });

      const assistantId = 'assistant-test';
      const assistantSession = new SessionStorage(assistantSessionId, undefined, assistantId);
      assistantSession.save({
        messages: [],
        startedAt: '2024-01-02T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:01.000Z',
        cwd: tempDir,
      });

      if (cmd?.handler) {
        const result = await cmd.handler('list --all', mockContext);
        expect(result.handled).toBe(true);
        const output = emittedContent.join('\n');
        expect(output).toContain(rootId.slice(0, 8));
        expect(output).toContain(assistantSessionId.slice(0, 8));
      }
    });
  });

  describe('/projects and /plans commands', () => {
    test('should create and switch to a project', async () => {
      const cmd = loader.getCommand('projects');
      expect(cmd).toBeDefined();

      if (cmd?.handler) {
        const result = await cmd.handler('new Alpha', mockContext);
        expect(result.handled).toBe(true);
        expect(activeProjectId).toBeTruthy();
        expect(projectContextContent).toContain('Project: Alpha');

        const projects = await listProjects(tempDir);
        expect(projects.length).toBe(1);
        const saved = await readProject(tempDir, projects[0].id);
        expect(saved?.name).toBe('Alpha');
      }
    });

    test('should add a plan and step', async () => {
      const projectsCmd = loader.getCommand('projects');
      const plansCmd = loader.getCommand('plans');
      expect(projectsCmd).toBeDefined();
      expect(plansCmd).toBeDefined();

      if (projectsCmd?.handler && plansCmd?.handler) {
        await projectsCmd.handler('new Beta', mockContext);
        const createResult = await plansCmd.handler('new Launch Plan', mockContext);
        expect(createResult.handled).toBe(true);

        const activeId = activeProjectId as string;
        const project = await readProject(tempDir, activeId);
        expect(project?.plans.length).toBe(1);
        const planId = project?.plans[0].id as string;

        const addResult = await plansCmd.handler(`add ${planId} Define requirements`, mockContext);
        expect(addResult.handled).toBe(true);
        const updated = await readProject(tempDir, activeId);
        expect(updated?.plans[0].steps.length).toBe(1);
      }
    });
  });

  describe('/feedback command', () => {
    test('should emit success message without opening browser', async () => {
      const cmd = loader.getCommand('feedback');
      expect(cmd).toBeDefined();

      const runtime = getRuntime();
      const originalShell = runtime.shell;
      const quietMock = mock(async () => {});
      runtime.shell = (() => ({ quiet: quietMock })) as any;

      try {
        if (cmd?.handler) {
          const result = await cmd.handler('', mockContext);
          expect(result.handled).toBe(true);
          expect(emittedContent.some(c => c.includes('Opening GitHub'))).toBe(true);
          // Verify shell was called via mock (headless — no real browser opened)
          expect(quietMock).toHaveBeenCalled();
        }
      } finally {
        runtime.shell = originalShell;
      }
    });

    test('should render fallback when shell command fails', async () => {
      const cmd = loader.getCommand('feedback');
      expect(cmd).toBeDefined();

      const runtime = getRuntime();
      const originalShell = runtime.shell;
      const quietMock = mock(async () => { throw new Error('headless: no browser'); });
      runtime.shell = (() => ({ quiet: quietMock })) as any;

      try {
        if (cmd?.handler) {
          const result = await cmd.handler('', mockContext);
          expect(result.handled).toBe(true);
          expect(emittedContent.some(c => c.includes('Submit Feedback'))).toBe(true);
          expect(quietMock).toHaveBeenCalled();
        }
      } finally {
        runtime.shell = originalShell;
      }
    });

    test('should label bug feedback appropriately without opening browser', async () => {
      const cmd = loader.getCommand('feedback');
      expect(cmd).toBeDefined();

      const runtime = getRuntime();
      const originalShell = runtime.shell;
      const quietMock = mock(async () => {});
      runtime.shell = (() => ({ quiet: quietMock })) as any;

      try {
        if (cmd?.handler) {
          const result = await cmd.handler('bug', mockContext);
          expect(result.handled).toBe(true);
          expect(emittedContent.some(c => c.includes('Opening GitHub'))).toBe(true);
          expect(quietMock).toHaveBeenCalled();
        }
      } finally {
        runtime.shell = originalShell;
      }
    });
  });
});
