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

describe('CommandExecutor', () => {
  let loader: CommandLoader;
  let executor: CommandExecutor;
  let mockContext: CommandContext;
  let emittedChunks: Array<{ type: string; content?: string }>;

  beforeEach(() => {
    loader = new CommandLoader();
    executor = new CommandExecutor(loader);
    emittedChunks = [];

    mockContext = {
      cwd: process.cwd(),
      sessionId: 'test-session',
      messages: [],
      tools: [],
      clearMessages: () => {},
      addSystemMessage: () => {},
      emit: (type, content) => {
        emittedChunks.push({ type, content });
      },
    };
  });

  describe('parseCommand', () => {
    test('should parse command with name only', () => {
      const result = executor.parseCommand('/help');
      expect(result).toEqual({ name: 'help', args: '' });
    });

    test('should parse command with arguments', () => {
      const result = executor.parseCommand('/search hello world');
      expect(result).toEqual({ name: 'search', args: 'hello world' });
    });

    test('should return null for non-command input', () => {
      expect(executor.parseCommand('hello')).toBeNull();
      expect(executor.parseCommand('')).toBeNull();
    });

    test('should handle command with colon namespace', () => {
      const result = executor.parseCommand('/git:commit message');
      expect(result).toEqual({ name: 'git:commit', args: 'message' });
    });
  });

  describe('isCommand', () => {
    test('should return true for slash commands', () => {
      expect(executor.isCommand('/help')).toBe(true);
      expect(executor.isCommand('/search foo')).toBe(true);
    });

    test('should return false for non-commands', () => {
      expect(executor.isCommand('hello')).toBe(false);
      expect(executor.isCommand('')).toBe(false);
    });
  });

  describe('execute', () => {
    test('should handle unknown command', async () => {
      const result = await executor.execute('/unknown', mockContext);

      expect(result.handled).toBe(true);
      expect(emittedChunks.some(c => c.content?.includes('Unknown command'))).toBe(true);
    });

    test('should execute self-handled command', async () => {
      let handlerCalled = false;

      loader.register({
        name: 'test',
        description: 'Test command',
        content: '',
        selfHandled: true,
        handler: async (args, ctx) => {
          handlerCalled = true;
          ctx.emit('text', `Args: ${args}`);
          ctx.emit('done');
          return { handled: true };
        },
      });

      const result = await executor.execute('/test myargs', mockContext);

      expect(result.handled).toBe(true);
      expect(handlerCalled).toBe(true);
      expect(emittedChunks.some(c => c.content === 'Args: myargs')).toBe(true);
    });

    test('should return prompt for non-self-handled command', async () => {
      loader.register({
        name: 'summarize',
        description: 'Summarize topic',
        content: 'Please summarize: $ARGUMENTS',
        selfHandled: false,
      });

      const result = await executor.execute('/summarize main.ts', mockContext);

      expect(result.handled).toBe(false);
      expect(result.prompt).toContain('Please summarize:');
      expect(result.prompt).toContain('main.ts');
    });

    test('should substitute $ARGUMENTS placeholder', async () => {
      loader.register({
        name: 'debug',
        description: 'Debug issue',
        content: 'Debug this: $ARGUMENTS',
        selfHandled: false,
      });

      const result = await executor.execute('/debug error in line 42', mockContext);

      expect(result.prompt).toBe('Debug this: error in line 42');
    });

    test('should handle missing arguments', async () => {
      loader.register({
        name: 'test',
        description: 'Test',
        content: 'Args: $ARGUMENTS',
        selfHandled: false,
      });

      const result = await executor.execute('/test', mockContext);

      expect(result.prompt).toBe('Args: (no arguments provided)');
    });

    test('should execute shell commands in content', async () => {
      loader.register({
        name: 'shell',
        description: 'Shell command',
        content: 'Output:\n!echo hello',
        selfHandled: false,
      });

      const result = await executor.execute('/shell', mockContext);

      expect(result.prompt).toContain('hello');
    });

    test('should preserve indentation for shell command output', async () => {
      loader.register({
        name: 'shell-indent',
        description: 'Shell command with indent',
        content: 'List:\n  !echo indented',
        selfHandled: false,
      });

      const result = await executor.execute('/shell-indent', mockContext);
      expect(result.prompt).toContain('  ```');
      expect(result.prompt).toContain('  indented');
    });

    test('should ignore empty shell command lines', async () => {
      loader.register({
        name: 'shell-empty',
        description: 'Empty shell command',
        content: '!\nNext',
        selfHandled: false,
      });

      const result = await executor.execute('/shell-empty', mockContext);
      expect(result.prompt).toContain('!');
      expect(result.prompt).toContain('Next');
    });

    test('should not execute shell commands inside code blocks', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'assistants-shell-block-'));
      loader.register({
        name: 'block',
        description: 'Shell in code block',
        content: '```bash\n!pwd\n```',
        selfHandled: false,
      });

      mockContext.cwd = tempDir;
      const result = await executor.execute('/block', mockContext);

      expect(result.prompt).toContain('!pwd');
      expect(result.prompt).not.toContain(tempDir);

      rmSync(tempDir, { recursive: true, force: true });
    });

    test('should run shell commands from context cwd', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'assistants-shell-'));
      loader.register({
        name: 'cwd',
        description: 'Shell cwd command',
        content: 'Output:\n!pwd',
        selfHandled: false,
      });

      mockContext.cwd = tempDir;
      const result = await executor.execute('/cwd', mockContext);

      expect(result.prompt).toContain(tempDir);

      rmSync(tempDir, { recursive: true, force: true });
    });
  });

  describe('getSuggestions', () => {
    test('should return matching commands for partial input', () => {
      loader.register({ name: 'help', description: 'Show help', content: '' });
      loader.register({ name: 'history', description: 'Show history', content: '' });

      const suggestions = executor.getSuggestions('/h');
      expect(suggestions.length).toBe(2);
    });

    test('should return empty for non-slash input', () => {
      expect(executor.getSuggestions('hello')).toEqual([]);
    });
  });
});

