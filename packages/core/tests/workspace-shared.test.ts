import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { setRuntime, hasRuntime } from '../src/runtime';
import { bunRuntime } from '../../runtime-bun/src';
import { closeDatabase, resetDatabaseSingleton, getDatabase } from '../src/database';
import { SharedWorkspaceManager } from '../src/workspace/shared';

if (!hasRuntime()) setRuntime(bunRuntime);

let tempDir: string;
let manager: SharedWorkspaceManager;
let origAssistantsDir: string | undefined;

beforeEach(() => {
  origAssistantsDir = process.env.ASSISTANTS_DIR;
  tempDir = mkdtempSync(join(tmpdir(), 'workspace-test-'));
  process.env.ASSISTANTS_DIR = tempDir;
  closeDatabase();
  resetDatabaseSingleton();
  const db = getDatabase();
  const workspacesDir = join(tempDir, 'workspaces');
  manager = new SharedWorkspaceManager(workspacesDir, db);
});

afterEach(() => {
  closeDatabase();
  resetDatabaseSingleton();
  if (origAssistantsDir === undefined) delete process.env.ASSISTANTS_DIR;
  else process.env.ASSISTANTS_DIR = origAssistantsDir;
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── create / get ─────────────────────────────────────────────────────────────

describe('SharedWorkspaceManager create / get', () => {
  test('creates a workspace', () => {
    const ws = manager.create('Test Workspace', 'agent-1', []);
    expect(ws.id).toBeDefined();
    expect(ws.name).toBe('Test Workspace');
  });

  test('get returns created workspace', () => {
    const ws = manager.create('My Workspace', 'agent-1', []);
    const found = manager.get(ws.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('My Workspace');
  });

  test('get returns null for unknown ID', () => {
    expect(manager.get('no-such-workspace')).toBeNull();
  });

  test('create creates workspace directory', () => {
    const ws = manager.create('DirTest', 'agent-1', []);
    expect(existsSync(manager.getPath(ws.id))).toBe(true);
  });

  test('getPath returns a valid path', () => {
    const ws = manager.create('PathTest', 'agent-1', []);
    const path = manager.getPath(ws.id);
    expect(typeof path).toBe('string');
    expect(path.length).toBeGreaterThan(0);
  });

  test('getSharedPath returns shared subdirectory', () => {
    const ws = manager.create('Shared', 'agent-1', []);
    const sharedPath = manager.getSharedPath(ws.id);
    expect(sharedPath).toContain('shared');
  });

  test('getAssistantPath includes assistantId', () => {
    const ws = manager.create('AgentPath', 'agent-1', []);
    const agentPath = manager.getAssistantPath(ws.id, 'agent-1');
    expect(agentPath).toContain('agent-1');
  });
});

// ─── list ─────────────────────────────────────────────────────────────────────

describe('SharedWorkspaceManager list', () => {
  test('returns empty initially', () => {
    expect(manager.list()).toHaveLength(0);
  });

  test('returns all active workspaces', () => {
    manager.create('WS1', 'a', []);
    manager.create('WS2', 'b', []);
    expect(manager.list()).toHaveLength(2);
  });

  test('excludes archived workspaces by default', () => {
    const ws = manager.create('Active', 'a', []);
    manager.create('ToArchive', 'b', []);
    manager.archive(ws.id);
    expect(manager.list()).toHaveLength(1); // only the non-archived one
  });

  test('includes archived when requested', () => {
    const ws = manager.create('ToArchive', 'a', []);
    manager.archive(ws.id);
    const all = manager.list(true);
    expect(all.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── join / listForAgent ──────────────────────────────────────────────────────

describe('join / listForAgent', () => {
  test('join adds agent to workspace', () => {
    const ws = manager.create('Shared WS', 'agent-1', []);
    manager.join(ws.id, 'agent-2');
    const agentWorkspaces = manager.listForAgent('agent-2');
    expect(agentWorkspaces.some(w => w.id === ws.id)).toBe(true);
  });

  test('listForAgent returns workspaces for an agent', () => {
    const ws1 = manager.create('WS A', 'agent-x', []);
    const ws2 = manager.create('WS B', 'agent-y', []);
    const result = manager.listForAgent('agent-x');
    expect(result.some(w => w.id === ws1.id)).toBe(true);
  });

  test('listForAgent returns empty for unknown agent', () => {
    expect(manager.listForAgent('nobody')).toHaveLength(0);
  });
});

// ─── archive / delete ─────────────────────────────────────────────────────────

describe('archive / delete', () => {
  test('archive marks workspace as archived', () => {
    const ws = manager.create('Archive Me', 'a', []);
    manager.archive(ws.id);
    const found = manager.get(ws.id);
    expect(found?.status).toBe('archived');
  });

  test('delete removes workspace from list', () => {
    const ws = manager.create('Delete Me', 'a', []);
    manager.delete(ws.id);
    expect(manager.get(ws.id)).toBeNull();
    expect(manager.list()).toHaveLength(0);
  });

  test('archive does not delete workspace', () => {
    const ws = manager.create('Keep', 'a', []);
    manager.archive(ws.id);
    expect(manager.get(ws.id)).not.toBeNull(); // still exists
  });
});
