import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadAgentDefinitions,
  getAgentDefinition,
  saveAgentDefinition,
  deleteAgentDefinition,
  type AgentDefinition,
} from '../src/agents/definitions';

let tempDir: string;
let origAssistantsDir: string | undefined;
let origHome: string | undefined;

beforeEach(() => {
  origAssistantsDir = process.env.ASSISTANTS_DIR;
  origHome = process.env.HOME;
  tempDir = mkdtempSync(join(tmpdir(), 'agent-defs-test-'));
  // Set both ASSISTANTS_DIR (for global) and HOME to tempDir
  process.env.ASSISTANTS_DIR = join(tempDir, 'global-assistants');
  process.env.HOME = tempDir;
});

afterEach(() => {
  if (origAssistantsDir === undefined) delete process.env.ASSISTANTS_DIR;
  else process.env.ASSISTANTS_DIR = origAssistantsDir;
  if (origHome === undefined) delete process.env.HOME;
  else process.env.HOME = origHome;
  rmSync(tempDir, { recursive: true, force: true });
});

const projectDir = () => join(tempDir, 'project');

// ─── loadAgentDefinitions ─────────────────────────────────────────────────────

describe('loadAgentDefinitions', () => {
  test('returns empty array when no definitions exist', () => {
    expect(loadAgentDefinitions(projectDir())).toHaveLength(0);
  });

  test('loads global agent definitions', () => {
    saveAgentDefinition({ name: 'my-agent', description: 'A helper agent' }, 'global', projectDir());
    const defs = loadAgentDefinitions(projectDir());
    expect(defs.some(d => d.name === 'my-agent')).toBe(true);
  });

  test('loads project agent definitions', () => {
    saveAgentDefinition({ name: 'project-agent', description: 'Project specific' }, 'project', projectDir());
    const defs = loadAgentDefinitions(projectDir());
    expect(defs.some(d => d.name === 'project-agent')).toBe(true);
  });

  test('project definitions override global same-named definitions', () => {
    saveAgentDefinition({ name: 'shared', description: 'global version' }, 'global', projectDir());
    saveAgentDefinition({ name: 'shared', description: 'project version' }, 'project', projectDir());
    const defs = loadAgentDefinitions(projectDir());
    const shared = defs.find(d => d.name === 'shared');
    expect(shared?.description).toBe('project version');
    expect(shared?.scope).toBe('project');
  });

  test('returns definitions sorted alphabetically', () => {
    saveAgentDefinition({ name: 'zebra', description: 'Z agent' }, 'global', projectDir());
    saveAgentDefinition({ name: 'alpha', description: 'A agent' }, 'global', projectDir());
    saveAgentDefinition({ name: 'middle', description: 'M agent' }, 'global', projectDir());
    const defs = loadAgentDefinitions(projectDir());
    const names = defs.map(d => d.name);
    expect(names).toEqual([...names].sort());
  });

  test('sets scope field on loaded definitions', () => {
    saveAgentDefinition({ name: 'scoped', description: 'test' }, 'global', projectDir());
    const defs = loadAgentDefinitions(projectDir());
    const def = defs.find(d => d.name === 'scoped');
    expect(def?.scope).toBe('global');
  });

  test('sets filePath field on loaded definitions', () => {
    saveAgentDefinition({ name: 'with-path', description: 'test' }, 'global', projectDir());
    const defs = loadAgentDefinitions(projectDir());
    const def = defs.find(d => d.name === 'with-path');
    expect(def?.filePath).toBeDefined();
    expect(def?.filePath).toMatch(/with-path\.json$/);
  });
});

// ─── getAgentDefinition ───────────────────────────────────────────────────────

describe('getAgentDefinition', () => {
  test('finds definition by name (exact)', () => {
    saveAgentDefinition({ name: 'finder', description: 'Find me' }, 'global', projectDir());
    const def = getAgentDefinition('finder', projectDir());
    expect(def?.name).toBe('finder');
  });

  test('finds definition case-insensitively', () => {
    saveAgentDefinition({ name: 'CaseSensitive', description: 'test' }, 'global', projectDir());
    expect(getAgentDefinition('casesensitive', projectDir())).not.toBeNull();
    expect(getAgentDefinition('CASESENSITIVE', projectDir())).not.toBeNull();
  });

  test('returns null for unknown name', () => {
    expect(getAgentDefinition('does-not-exist', projectDir())).toBeNull();
  });
});

// ─── saveAgentDefinition ──────────────────────────────────────────────────────

describe('saveAgentDefinition', () => {
  test('creates a JSON file and returns its path', () => {
    const path = saveAgentDefinition({ name: 'save-test', description: 'Test' }, 'global', projectDir());
    expect(typeof path).toBe('string');
    expect(path).toMatch(/save-test\.json$/);
    expect(existsSync(path)).toBe(true);
  });

  test('persists all fields', () => {
    const def: AgentDefinition = {
      name: 'full-def',
      description: 'Full definition',
      tools: ['Read', 'Write'],
      systemPrompt: 'Be helpful',
      maxTurns: 30,
      minTurns: 2,
      workUntilDone: true,
    };
    saveAgentDefinition(def, 'global', projectDir());
    const loaded = getAgentDefinition('full-def', projectDir());
    expect(loaded?.description).toBe('Full definition');
    expect(loaded?.tools).toEqual(['Read', 'Write']);
    expect(loaded?.systemPrompt).toBe('Be helpful');
    expect(loaded?.maxTurns).toBe(30);
    expect(loaded?.minTurns).toBe(2);
    expect(loaded?.workUntilDone).toBe(true);
  });

  test('overwrites existing definition', () => {
    saveAgentDefinition({ name: 'overwrite', description: 'v1' }, 'global', projectDir());
    saveAgentDefinition({ name: 'overwrite', description: 'v2' }, 'global', projectDir());
    expect(getAgentDefinition('overwrite', projectDir())?.description).toBe('v2');
  });

  test('creates directory if it does not exist', () => {
    const { existsSync } = require('fs');
    const agentsDir = join(tempDir, 'global-assistants', 'agents');
    expect(existsSync(agentsDir)).toBe(false);
    saveAgentDefinition({ name: 'dir-create', description: 'test' }, 'global', projectDir());
    expect(existsSync(agentsDir)).toBe(true);
  });
});

// ─── deleteAgentDefinition ────────────────────────────────────────────────────

describe('deleteAgentDefinition', () => {
  test('deletes a global definition and returns path', () => {
    saveAgentDefinition({ name: 'to-delete', description: 'Delete me' }, 'global', projectDir());
    const path = deleteAgentDefinition('to-delete', projectDir());
    expect(path).not.toBeNull();
    expect(existsSync(path!)).toBe(false);
    expect(getAgentDefinition('to-delete', projectDir())).toBeNull();
  });

  test('deletes a project definition', () => {
    saveAgentDefinition({ name: 'proj-del', description: 'Del' }, 'project', projectDir());
    const path = deleteAgentDefinition('proj-del', projectDir());
    expect(path).not.toBeNull();
    expect(getAgentDefinition('proj-del', projectDir())).toBeNull();
  });

  test('returns null for non-existent definition', () => {
    expect(deleteAgentDefinition('ghost', projectDir())).toBeNull();
  });
});
