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

describe('CommandLoader', () => {
  let loader: CommandLoader;
  let testDir: string;
  let commandsDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `assistants-test-${Date.now()}`);
    commandsDir = join(testDir, '.assistants', 'commands');
    mkdirSync(commandsDir, { recursive: true });
    loader = new CommandLoader(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('loadAll', () => {
    test('should load commands from directory', async () => {
      // Create a test command file
      writeFileSync(join(commandsDir, 'test.md'), `---
name: test
description: A test command
---

Test content here.
`);

      await loader.loadAll();
      const commands = loader.getCommands();
      expect(commands.length).toBeGreaterThan(0);

      const testCmd = loader.getCommand('test');
      expect(testCmd).toBeDefined();
      expect(testCmd?.description).toBe('A test command');
      expect(testCmd?.content).toBe('Test content here.');
    });

    test('should load global commands from HOME', async () => {
      const originalHome = process.env.HOME;
      const homeDir = join(testDir, 'home');
      const globalDir = join(homeDir, '.hasna', 'assistants', 'commands');
      mkdirSync(globalDir, { recursive: true });
      writeFileSync(join(globalDir, 'global.md'), `---
name: global
description: Global command
---
Global content`);

      process.env.HOME = homeDir;
      const homeLoader = new CommandLoader(testDir);
      await homeLoader.loadAll();

      expect(homeLoader.hasCommand('global')).toBe(true);

      process.env.HOME = originalHome;
    });

    test('should handle missing directory', async () => {
      const emptyLoader = new CommandLoader('/nonexistent/path');
      await emptyLoader.loadAll();
      expect(emptyLoader.getCommands()).toEqual([]);
    });

    test('should derive name from filename if not in frontmatter', async () => {
      writeFileSync(join(commandsDir, 'mycommand.md'), `---
description: Command without name
---

Content.
`);

      await loader.loadAll();
      expect(loader.hasCommand('mycommand')).toBe(true);
    });

    test('should parse tags from frontmatter', async () => {
      writeFileSync(join(commandsDir, 'tagged.md'), `---
name: tagged
description: A tagged command
tags: [git, automation]
---

Content.
`);

      await loader.loadAll();
      const cmd = loader.getCommand('tagged');
      expect(cmd?.tags).toEqual(['git', 'automation']);
    });

    test('should parse frontmatter with CRLF newlines', async () => {
      writeFileSync(join(commandsDir, 'crlf.md'), `---\r\nname: crlf\r\ndescription: CRLF\r\n---\r\n\r\nContent.`);

      await loader.loadAll();
      const cmd = loader.getCommand('crlf');
      expect(cmd?.description).toBe('CRLF');
      expect(cmd?.content).toBe('Content.');
    });

    test('should parse allowed-tools from frontmatter', async () => {
      writeFileSync(join(commandsDir, 'restricted.md'), `---
name: restricted
description: Restricted tools
allowed-tools: bash, read
---

Content.
`);

      await loader.loadAll();
      const cmd = loader.getCommand('restricted');
      expect(cmd?.allowedTools).toEqual(['bash', 'read']);
    });

    test('should parse allowed-tools array from frontmatter', async () => {
      writeFileSync(join(commandsDir, 'restricted-array.md'), `---
name: restricted-array
description: Restricted tools array
allowed-tools: [bash, read]
---

Content.
`);

      await loader.loadAll();
      const cmd = loader.getCommand('restricted-array');
      expect(cmd?.allowedTools).toEqual(['bash', 'read']);
    });

    test('should handle nested directories with namespacing', async () => {
      const gitDir = join(commandsDir, 'git');
      mkdirSync(gitDir, { recursive: true });
      writeFileSync(join(gitDir, 'commit.md'), `---
description: Git commit command
---

Commit changes.
`);

      await loader.loadAll();
      expect(loader.hasCommand('git:commit')).toBe(true);
    });

    test('should handle file without frontmatter', async () => {
      writeFileSync(join(commandsDir, 'plain.md'), 'Just plain content.');

      await loader.loadAll();
      const cmd = loader.getCommand('plain');
      expect(cmd).toBeDefined();
      expect(cmd?.content).toBe('Just plain content.');
    });
  });

  describe('register', () => {
    test('should register a command programmatically', () => {
      loader.register({
        name: 'programmatic',
        description: 'A programmatic command',
        content: 'Content here',
        builtin: true,
      });

      expect(loader.hasCommand('programmatic')).toBe(true);
      const cmd = loader.getCommand('programmatic');
      expect(cmd?.builtin).toBe(true);
    });
  });

  describe('getCommand', () => {
    test('should return undefined for non-existent command', () => {
      expect(loader.getCommand('nonexistent')).toBeUndefined();
    });
  });

  describe('findMatching', () => {
    test('should find commands by partial name', async () => {
      loader.register({ name: 'commit', description: 'Commit changes', content: '' });
      loader.register({ name: 'config', description: 'Configuration', content: '' });
      loader.register({ name: 'help', description: 'Show help', content: '' });

      const matches = loader.findMatching('co');
      expect(matches.length).toBe(2);
      expect(matches.map(c => c.name)).toContain('commit');
      expect(matches.map(c => c.name)).toContain('config');
    });

    test('should find commands by description', async () => {
      loader.register({ name: 'commit', description: 'Commit changes', content: '' });

      const matches = loader.findMatching('changes');
      expect(matches.length).toBe(1);
      expect(matches[0].name).toBe('commit');
    });
  });
});

