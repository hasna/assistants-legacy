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

  describe('token usage tracking', () => {
    test('should track and return token usage', () => {
      builtins.updateTokenUsage({
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      });

      const usage = builtins.getTokenUsage();
      expect(usage.inputTokens).toBe(1000);
      expect(usage.outputTokens).toBe(500);
      expect(usage.totalTokens).toBe(1500);
    });
  });

  describe('/help command', () => {
    test('should list all commands', async () => {
      const cmd = loader.getCommand('help');
      expect(cmd).toBeDefined();
      expect(cmd?.selfHandled).toBe(true);

      if (cmd?.handler) {
        const result = await cmd.handler('', mockContext);
        expect(result.handled).toBe(true);
        expect(emittedContent.some(c => c.includes('Available Slash Commands'))).toBe(true);
      }
    });

    test('should include and sort custom commands', async () => {
      loader.register({ name: 'zeta', description: 'Zeta cmd', content: 'z', builtin: false });
      loader.register({ name: 'alpha', description: 'Alpha cmd', content: 'a', builtin: false });

      const cmd = loader.getCommand('help');
      expect(cmd).toBeDefined();

      if (cmd?.handler) {
        const result = await cmd.handler('', mockContext);
        expect(result.handled).toBe(true);

        const output = emittedContent.join('\n');
        const alphaIndex = output.indexOf('/alpha - Alpha cmd');
        const zetaIndex = output.indexOf('/zeta - Zeta cmd');
        expect(alphaIndex).toBeGreaterThanOrEqual(0);
        expect(zetaIndex).toBeGreaterThanOrEqual(0);
        expect(alphaIndex).toBeLessThan(zetaIndex);
      }
    });
  });

  describe('/communication command', () => {
    let telephonyManager: TelephonyManager;

    beforeEach(() => {
      telephonyManager = new TelephonyManager({
        assistantId: 'assistant-1',
        assistantName: 'Tester',
        config: { enabled: true },
      });
      mockContext.getTelephonyManager = () => telephonyManager;
    });

    afterEach(() => {
      telephonyManager.close();
    });

    test('sets default number via /communication default', async () => {
      const cmd = loader.getCommand('communication');
      expect(cmd).toBeDefined();

      if (cmd?.handler) {
        const result = await cmd.handler('default +15550001111', mockContext);
        expect(result.handled).toBe(true);
        const status = telephonyManager.getStatus();
        expect(status.defaultPhoneNumber).toBe('+15550001111');
        expect(emittedContent.join('\n')).toContain('Default phone number set');
      }
    });

    test('reports default number in /communication status', async () => {
      telephonyManager.setDefaultPhoneNumber('+15550002222');
      const cmd = loader.getCommand('communication');
      expect(cmd).toBeDefined();

      if (cmd?.handler) {
        await cmd.handler('status', mockContext);
        const output = emittedContent.join('\n');
        expect(output).toContain('Default #:' );
        expect(output).toContain('+15550002222');
      }
    });

    test('registers /phone alias for communication', () => {
      expect(loader.hasCommand('phone')).toBe(true);
      expect(loader.getCommand('phone')?.name).toBe('communication');
    });
  });

  describe('/about command', () => {
    test('prints about summary', async () => {
      const cmd = loader.getCommand('about');
      expect(cmd).toBeDefined();

      if (cmd?.handler) {
        const result = await cmd.handler('', mockContext);
        expect(result.handled).toBe(true);
        const output = emittedContent.join('\n');
        expect(output).toContain('About Hasna');
        expect(output).toContain('About Hasna Assistants');
      }
    });
  });

  describe('/docs command', () => {
    test('includes communication and voice commands without listen', async () => {
      const cmd = loader.getCommand('docs');
      expect(cmd).toBeDefined();

      if (cmd?.handler) {
        const result = await cmd.handler('', mockContext);
        expect(result.handled).toBe(true);
        const output = emittedContent.join('\n');
        expect(output).toContain('/communication');
        expect(output).toContain('/talk');
        expect(output).not.toContain('/listen');
      }
    });
  });

  describe('/whoami command', () => {
    test('prints fallback when identity is unavailable', async () => {
      const cmd = loader.getCommand('whoami');
      expect(cmd).toBeDefined();

      if (cmd?.handler) {
        const result = await cmd.handler('', mockContext);
        expect(result.handled).toBe(true);
        const output = emittedContent.join('\n');
        expect(output).toContain('No active assistant or identity');
      }
    });

    test('prints assistant without identity when identity missing', async () => {
      const cmd = loader.getCommand('whoami');
      expect(cmd).toBeDefined();

      const assistantManager = {
        getActive: () => ({ id: 'assistant-1', name: 'Assistant One' }),
      };
      const contextWithAssistant: CommandContext = {
        ...mockContext,
        getAssistantManager: () => assistantManager as any,
        getIdentityManager: () => null,
        getModel: () => 'claude-opus-4-5',
      };

      if (cmd?.handler) {
        const result = await cmd.handler('', contextWithAssistant);
        expect(result.handled).toBe(true);
        const output = emittedContent.join('\n');
        expect(output).toContain('Assistant: Assistant One');
        expect(output).toContain('Identity: (not configured)');
        expect(output).toContain('Model: claude-opus-4-5');
      }
    });
  });

  describe('/clear command', () => {
    test('should clear conversation', async () => {
      const cmd = loader.getCommand('clear');
      expect(cmd).toBeDefined();

      if (cmd?.handler) {
        const result = await cmd.handler('', mockContext);
        expect(result.handled).toBe(true);
        expect(result.clearConversation).toBe(true);
        expect(messagesCleared).toBe(true);
      }
    });
  });

  describe('/identity command', () => {
    test('edit opens identity panel with target id', async () => {
      const cmd = loader.getCommand('identity');
      expect(cmd).toBeDefined();

      const identityManager = new IdentityManager('assistant-test', tempDir);
      await identityManager.initialize();
      const identity = await identityManager.createIdentity({ name: 'Primary' });

      const contextWithIdentity: CommandContext = {
        ...mockContext,
        getIdentityManager: () => identityManager,
      };

      if (cmd?.handler) {
        const result = await cmd.handler(`edit ${identity.id}`, contextWithIdentity);
        expect(result.handled).toBe(true);
        expect(result.showPanel).toBe('identity');
        expect(result.panelValue).toBe(`edit:${identity.id}`);
      }
    });
  });

  describe('/assistants command', () => {
    const createAssistant = (id: string, name: string) => ({
      id,
      name,
      description: undefined,
      avatar: undefined,
      settings: { model: 'claude-opus-4-5' },
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    });

    test('switch falls back to manager.switchAssistant when context hook is unavailable', async () => {
      const cmd = loader.getCommand('assistants');
      expect(cmd).toBeDefined();

      const assistants = [createAssistant('a1', 'One'), createAssistant('a2', 'Two')];
      let activeId: string | null = 'a1';
      const switchCalls: string[] = [];
      const manager = {
        getActive: () => assistants.find((assistant) => assistant.id === activeId) ?? null,
        getActiveId: () => activeId,
        listAssistants: () => assistants,
        createAssistant: async () => assistants[0],
        updateAssistant: async () => assistants[0],
        deleteAssistant: async () => {},
        switchAssistant: async (id: string) => {
          switchCalls.push(id);
          activeId = id;
          return assistants.find((assistant) => assistant.id === id) ?? null;
        },
      };

      const context: CommandContext = {
        ...mockContext,
        getAssistantManager: () => manager as any,
      };

      if (cmd?.handler) {
        const result = await cmd.handler('switch Two', context);
        expect(result.handled).toBe(true);
        expect(switchCalls).toEqual(['a2']);
        expect(activeId).toBe('a2');
      }
    });

    test('create syncs with context switch hook', async () => {
      const cmd = loader.getCommand('assistants');
      expect(cmd).toBeDefined();

      const assistants = [createAssistant('a1', 'One')];
      let activeId: string | null = 'a1';
      const contextSwitchCalls: string[] = [];
      const manager = {
        getActive: () => assistants.find((assistant) => assistant.id === activeId) ?? null,
        getActiveId: () => activeId,
        listAssistants: () => assistants,
        createAssistant: async ({ name }: { name: string }) => {
          const created = createAssistant('a2', name);
          assistants.push(created);
          activeId = created.id;
          return created;
        },
        updateAssistant: async () => assistants[0],
        deleteAssistant: async () => {},
        switchAssistant: async (id: string) => {
          activeId = id;
          return assistants.find((assistant) => assistant.id === id) ?? null;
        },
      };

      const context: CommandContext = {
        ...mockContext,
        getAssistantManager: () => manager as any,
        switchAssistant: async (assistantId: string) => {
          contextSwitchCalls.push(assistantId);
          activeId = assistantId;
        },
      };

      if (cmd?.handler) {
        const result = await cmd.handler('create Planner', context);
        expect(result.handled).toBe(true);
        expect(contextSwitchCalls).toEqual(['a2']);
      }
    });

    test('delete blocks deleting the last remaining assistant', async () => {
      const cmd = loader.getCommand('assistants');
      expect(cmd).toBeDefined();

      const assistants = [createAssistant('a1', 'Only')];
      let deleteCalls = 0;
      const manager = {
        getActive: () => assistants[0],
        getActiveId: () => assistants[0].id,
        listAssistants: () => assistants,
        createAssistant: async () => assistants[0],
        updateAssistant: async () => assistants[0],
        deleteAssistant: async () => { deleteCalls += 1; },
        switchAssistant: async () => assistants[0],
      };

      const context: CommandContext = {
        ...mockContext,
        getAssistantManager: () => manager as any,
      };

      if (cmd?.handler) {
        const result = await cmd.handler('delete Only', context);
        expect(result.handled).toBe(true);
        expect(deleteCalls).toBe(0);
        expect(emittedContent.join('\n')).toContain('Cannot delete the last remaining assistant.');
      }
    });

    test('delete of active assistant syncs switch hook to next active assistant', async () => {
      const cmd = loader.getCommand('assistants');
      expect(cmd).toBeDefined();

      const assistants = [createAssistant('a1', 'One'), createAssistant('a2', 'Two')];
      let activeId: string | null = 'a1';
      const contextSwitchCalls: string[] = [];
      const manager = {
        getActive: () => assistants.find((assistant) => assistant.id === activeId) ?? null,
        getActiveId: () => activeId,
        listAssistants: () => assistants,
        createAssistant: async () => assistants[0],
        updateAssistant: async () => assistants[0],
        deleteAssistant: async (id: string) => {
          const index = assistants.findIndex((assistant) => assistant.id === id);
          if (index >= 0) {
            assistants.splice(index, 1);
          }
          if (activeId === id) {
            activeId = assistants[0]?.id ?? null;
          }
        },
        switchAssistant: async (id: string) => {
          activeId = id;
          return assistants.find((assistant) => assistant.id === id) ?? null;
        },
      };

      const context: CommandContext = {
        ...mockContext,
        getAssistantManager: () => manager as any,
        switchAssistant: async (assistantId: string) => {
          contextSwitchCalls.push(assistantId);
          activeId = assistantId;
        },
      };

      if (cmd?.handler) {
        const result = await cmd.handler('delete One', context);
        expect(result.handled).toBe(true);
        expect(contextSwitchCalls).toEqual(['a2']);
      }
    });
  });

});
