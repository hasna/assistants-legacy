import { describe, test, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { resolve } from 'path';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { WorkflowLoader } from '../src/workflows/loader';
import { WorkflowStore } from '../src/workflows/store';
import { WorkflowExecutor } from '../src/workflows/executor';
import { WorkflowTools } from '../src/tools/workflows';
import { ToolRegistry } from '../src/tools/registry';
import type { WorkflowDefinition, WorkflowExecution } from '../src/workflows/types';
import type { DatabaseConnection } from '../src/runtime';
import { setRuntime } from '../src/runtime';
import { bunRuntime } from '@hasna/runtime-bun';

// Ensure the Bun runtime is available for file operations in WorkflowLoader
setRuntime(bunRuntime);

const WORKFLOW_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS workflow_executions (
    id TEXT PRIMARY KEY,
    workflow_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    current_step INTEGER NOT NULL DEFAULT 0,
    variables TEXT NOT NULL DEFAULT '{}',
    step_results TEXT NOT NULL DEFAULT '{}',
    started_at TEXT NOT NULL,
    completed_at TEXT
  )
`;

/**
 * Create an in-memory SQLite database wrapped in a DatabaseConnection adapter.
 */
function createTestDB(): { db: InstanceType<typeof Database>; adapter: DatabaseConnection } {
  const db = new Database(':memory:');
  db.exec(WORKFLOW_TABLE_SQL);

  const adapter = {
    exec: (sql: string) => db.exec(sql),
    prepare: (sql: string) => {
      const stmt = db.prepare(sql);
      return {
        run: (...args: unknown[]) => stmt.run(...(args as [Record<string, unknown>])),
        get: (...args: unknown[]) => stmt.get(...(args as [Record<string, unknown>])) || undefined,
        all: (...args: unknown[]) => stmt.all(...(args as [Record<string, unknown>])),
      };
    },
    query: (sql: string) => ({
      get: (...args: unknown[]) => (db.prepare(sql).get(...(args as [Record<string, unknown>]))) || null,
      all: (...args: unknown[]) => db.prepare(sql).all(...(args as [Record<string, unknown>])),
      run: (...args: unknown[]) => db.prepare(sql).run(...(args as [Record<string, unknown>])),
    }),
    close: () => db.close(),
    transaction: <T>(fn: () => T) => db.transaction(fn)(),
  } as unknown as DatabaseConnection;

  return { db, adapter };
}

// ============================================
// WorkflowLoader (parseWorkflowYaml)
// ============================================
describe('WorkflowLoader', () => {
  const TEST_DIR = resolve(import.meta.dir, '.tmp-workflow-loader-test');

  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  function writeYaml(filename: string, content: string): string {
    const filePath = resolve(TEST_DIR, filename);
    writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  // --- parseWorkflowYaml edge cases ---

  test('empty content returns null', async () => {
    const filePath = writeYaml('empty.yml', '');
    const loader = new WorkflowLoader();
    const result = await loader.loadFile(filePath);
    expect(result).toBeNull();
  });

  test('content with no steps returns null', async () => {
    const filePath = writeYaml('no-steps.yml', 'name: no-steps\ndescription: Missing steps\n');
    const loader = new WorkflowLoader();
    const result = await loader.loadFile(filePath);
    expect(result).toBeNull();
  });

  test('content with only comments returns null', async () => {
    const filePath = writeYaml('comments.yml', '# This is a comment\n# Another comment\n');
    const loader = new WorkflowLoader();
    const result = await loader.loadFile(filePath);
    expect(result).toBeNull();
  });

  // --- Tags parsing ---

  test('tags: empty [] parses to empty array', async () => {
    const filePath = writeYaml('tags-empty.yml', 'name: tags-empty\ndescription: test\ntags: []\n\nsteps:\n  - name: step1\n    prompt: do it\n');
    const loader = new WorkflowLoader();
    const result = await loader.loadFile(filePath);
    expect(result).not.toBeNull();
    expect(result!.tags).toEqual([]);
  });

  test('tags: single tag', async () => {
    const filePath = writeYaml('tags-single.yml', 'name: tags-single\ndescription: test\ntags: [build]\n\nsteps:\n  - name: step1\n    prompt: do it\n');
    const loader = new WorkflowLoader();
    const result = await loader.loadFile(filePath);
    expect(result!.tags).toEqual(['build']);
  });

  test('tags: multiple tags', async () => {
    const filePath = writeYaml('tags-multi.yml', 'name: tags-multi\ndescription: test\ntags: [build, test, deploy]\n\nsteps:\n  - name: step1\n    prompt: do it\n');
    const loader = new WorkflowLoader();
    const result = await loader.loadFile(filePath);
    expect(result!.tags).toEqual(['build', 'test', 'deploy']);
  });

  // --- Step properties ---

  test('requiresApproval: true is parsed as boolean true', async () => {
    const filePath = writeYaml('approval-true.yml', 'name: approval-true\ndescription: test\n\nsteps:\n  - name: step1\n    prompt: do it\n    requires_approval: true\n');
    const loader = new WorkflowLoader();
    const result = await loader.loadFile(filePath);
    expect(result!.steps[0].requiresApproval).toBe(true);
  });

  test('requiresApproval: non-true value is parsed as false', async () => {
    const filePath = writeYaml('approval-false.yml', 'name: approval-false\ndescription: test\n\nsteps:\n  - name: step1\n    prompt: do it\n    requires_approval: false\n');
    const loader = new WorkflowLoader();
    const result = await loader.loadFile(filePath);
    expect(result!.steps[0].requiresApproval).toBe(false);
  });

  test('timeout: numeric value is parsed as number', async () => {
    const filePath = writeYaml('timeout-num.yml', 'name: timeout-num\ndescription: test\n\nsteps:\n  - name: step1\n    prompt: do it\n    timeout: 5000\n');
    const loader = new WorkflowLoader();
    const result = await loader.loadFile(filePath);
    expect(result!.steps[0].timeout).toBe(5000);
  });

  test('timeout: NaN value is parsed as undefined', async () => {
    const filePath = writeYaml('timeout-nan.yml', 'name: timeout-nan\ndescription: test\n\nsteps:\n  - name: step1\n    prompt: do it\n    timeout: notanumber\n');
    const loader = new WorkflowLoader();
    const result = await loader.loadFile(filePath);
    expect(result!.steps[0].timeout).toBeUndefined();
  });

  test('allowedTools parsing', async () => {
    const filePath = writeYaml('tools.yml', 'name: tools-test\ndescription: test\n\nsteps:\n  - name: step1\n    prompt: do it\n    allowed_tools: [bash, read, write]\n');
    const loader = new WorkflowLoader();
    const result = await loader.loadFile(filePath);
    expect(result!.steps[0].allowedTools).toEqual(['bash', 'read', 'write']);
  });

  test('step with only name and no other properties', async () => {
    const filePath = writeYaml('step-name-only.yml', 'name: name-only\ndescription: test\n\nsteps:\n  - name: Just a step\n');
    const loader = new WorkflowLoader();
    const result = await loader.loadFile(filePath);
    expect(result).not.toBeNull();
    expect(result!.steps[0].name).toBe('Just a step');
    // Prompt should default to the step name per finalizeStep
    expect(result!.steps[0].prompt).toBe('Just a step');
  });

  // --- unquote ---

  test('unquote: double-quoted string', async () => {
    const filePath = writeYaml('dquote.yml', 'name: "double-quoted"\ndescription: "a description"\n\nsteps:\n  - name: "Step 1"\n    prompt: "do it"\n');
    const loader = new WorkflowLoader();
    const result = await loader.loadFile(filePath);
    expect(result!.name).toBe('double-quoted');
    expect(result!.description).toBe('a description');
  });

  test('unquote: single-quoted string', async () => {
    const filePath = writeYaml('squote.yml', "name: 'single-quoted'\ndescription: 'a description'\n\nsteps:\n  - name: 'Step 1'\n    prompt: 'do it'\n");
    const loader = new WorkflowLoader();
    const result = await loader.loadFile(filePath);
    expect(result!.name).toBe('single-quoted');
  });

  test('unquote: mismatched quotes are left as-is', async () => {
    const filePath = writeYaml('mismatch.yml', "name: \"mismatched'\ndescription: test\n\nsteps:\n  - name: step1\n    prompt: do it\n");
    const loader = new WorkflowLoader();
    const result = await loader.loadFile(filePath);
    // Mismatched quotes: starts with " but ends with ' - not stripped
    expect(result!.name).toBe("\"mismatched'");
  });

  test('unquote: no quotes are left as-is', async () => {
    const filePath = writeYaml('noquote.yml', 'name: plain-name\ndescription: test\n\nsteps:\n  - name: step1\n    prompt: do it\n');
    const loader = new WorkflowLoader();
    const result = await loader.loadFile(filePath);
    expect(result!.name).toBe('plain-name');
  });

  // --- loadFile: nonexistent file ---

  test('loadFile returns null for nonexistent file', async () => {
    const loader = new WorkflowLoader();
    const result = await loader.loadFile('/nonexistent/path/to/workflow.yml');
    expect(result).toBeNull();
  });

  // --- has / get / list with empty and populated ---

  test('has/get/list with empty loader', () => {
    const loader = new WorkflowLoader();
    expect(loader.has('anything')).toBe(false);
    expect(loader.get('anything')).toBeUndefined();
    expect(loader.list()).toEqual([]);
  });

  test('has/get/list with populated loader', async () => {
    const filePath = writeYaml('populated.yml', 'name: my-workflow\ndescription: test\n\nsteps:\n  - name: step1\n    prompt: do it\n');
    const loader = new WorkflowLoader();
    await loader.loadFile(filePath);

    expect(loader.has('my-workflow')).toBe(true);
    expect(loader.has('nonexistent')).toBe(false);
    expect(loader.get('my-workflow')).toBeDefined();
    expect(loader.get('my-workflow')!.name).toBe('my-workflow');
    expect(loader.get('nonexistent')).toBeUndefined();
    expect(loader.list().length).toBe(1);
    expect(loader.list()[0].name).toBe('my-workflow');
  });

  // --- Version and author parsing ---

  test('parses version and author', async () => {
    const filePath = writeYaml('meta.yml', 'name: meta-test\ndescription: test\nversion: 2.0\nauthor: Alice\n\nsteps:\n  - name: step1\n    prompt: do it\n');
    const loader = new WorkflowLoader();
    const result = await loader.loadFile(filePath);
    expect(result!.version).toBe('2.0');
    expect(result!.author).toBe('Alice');
  });

  // --- filePath is set on load ---

  test('filePath is set after loadFile', async () => {
    const filePath = writeYaml('fp.yml', 'name: fp-test\ndescription: test\n\nsteps:\n  - name: step1\n    prompt: do it\n');
    const loader = new WorkflowLoader();
    const result = await loader.loadFile(filePath);
    expect(result!.filePath).toBe(filePath);
  });

  // --- Multiple steps with mixed properties ---

  test('parses multiple steps with various properties', async () => {
    const content = [
      'name: multi-step',
      'description: test',
      '',
      'steps:',
      '  - name: Step A',
      '    prompt: do A',
      '    output_variable: resultA',
      '  - name: Step B',
      '    prompt: do B with ${resultA}',
      '    condition: should_run',
      '    requires_approval: true',
      '    timeout: 10000',
      '    allowed_tools: [bash, read]',
      '  - name: Step C',
      '    prompt: finalize',
    ].join('\n');
    const filePath = writeYaml('multi.yml', content);
    const loader = new WorkflowLoader();
    const result = await loader.loadFile(filePath);

    expect(result!.steps.length).toBe(3);

    expect(result!.steps[0].id).toBe('step-0');
    expect(result!.steps[0].outputVariable).toBe('resultA');

    expect(result!.steps[1].id).toBe('step-1');
    expect(result!.steps[1].condition).toBe('should_run');
    expect(result!.steps[1].requiresApproval).toBe(true);
    expect(result!.steps[1].timeout).toBe(10000);
    expect(result!.steps[1].allowedTools).toEqual(['bash', 'read']);

    expect(result!.steps[2].id).toBe('step-2');
    expect(result!.steps[2].prompt).toBe('finalize');
  });
});


// ============================================
// WorkflowStore
// ============================================

describe('WorkflowStore', () => {
  let store: WorkflowStore;

  beforeEach(() => {
    const { adapter } = createTestDB();
    store = new WorkflowStore(adapter);
  });

  function makeExecution(overrides?: Partial<WorkflowExecution>): WorkflowExecution {
    return {
      id: 'exec-1',
      workflowName: 'test-workflow',
      status: 'running',
      currentStep: 0,
      variables: { input: 'hello' },
      stepResults: {},
      startedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  test('save and get', () => {
    const execution = makeExecution();
    store.save(execution);
    const retrieved = store.get('exec-1');

    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe('exec-1');
    expect(retrieved!.workflowName).toBe('test-workflow');
    expect(retrieved!.status).toBe('running');
    expect(retrieved!.currentStep).toBe(0);
    expect(retrieved!.variables).toEqual({ input: 'hello' });
    expect(retrieved!.stepResults).toEqual({});
    expect(retrieved!.startedAt).toBe(execution.startedAt);
    expect(retrieved!.completedAt).toBeUndefined();
  });

  test('update with only status', () => {
    store.save(makeExecution());
    store.update('exec-1', { status: 'paused' });

    const retrieved = store.get('exec-1');
    expect(retrieved!.status).toBe('paused');
    expect(retrieved!.currentStep).toBe(0); // unchanged
  });

  test('update with only currentStep', () => {
    store.save(makeExecution());
    store.update('exec-1', { currentStep: 3 });

    const retrieved = store.get('exec-1');
    expect(retrieved!.currentStep).toBe(3);
    expect(retrieved!.status).toBe('running'); // unchanged
  });

  test('update with no fields is a no-op (early return)', () => {
    store.save(makeExecution());
    // This should not throw
    store.update('exec-1', {});
    const retrieved = store.get('exec-1');
    expect(retrieved!.status).toBe('running');
  });

  test('update nonexistent ID does not throw', () => {
    // Update should just run an UPDATE that matches 0 rows - no error
    expect(() => store.update('nonexistent', { status: 'completed' })).not.toThrow();
  });

  test('get nonexistent ID returns null', () => {
    const result = store.get('nonexistent');
    expect(result).toBeNull();
  });

  test('list with no options returns up to default limit (50)', () => {
    // Insert 3 executions
    store.save(makeExecution({ id: 'a1', startedAt: '2026-01-01T00:00:00Z' }));
    store.save(makeExecution({ id: 'a2', startedAt: '2026-01-02T00:00:00Z' }));
    store.save(makeExecution({ id: 'a3', startedAt: '2026-01-03T00:00:00Z' }));

    const all = store.list();
    expect(all.length).toBe(3);
    // Ordered by started_at DESC
    expect(all[0].id).toBe('a3');
    expect(all[1].id).toBe('a2');
    expect(all[2].id).toBe('a1');
  });

  test('list with status filter', () => {
    store.save(makeExecution({ id: 'r1', status: 'running' }));
    store.save(makeExecution({ id: 'c1', status: 'completed' }));
    store.save(makeExecution({ id: 'r2', status: 'running' }));

    const running = store.list({ status: 'running' });
    expect(running.length).toBe(2);
    expect(running.every(e => e.status === 'running')).toBe(true);

    const completed = store.list({ status: 'completed' });
    expect(completed.length).toBe(1);
    expect(completed[0].id).toBe('c1');
  });

  test('list with limit', () => {
    store.save(makeExecution({ id: 'l1', startedAt: '2026-01-01T00:00:00Z' }));
    store.save(makeExecution({ id: 'l2', startedAt: '2026-01-02T00:00:00Z' }));
    store.save(makeExecution({ id: 'l3', startedAt: '2026-01-03T00:00:00Z' }));

    const limited = store.list({ limit: 2 });
    expect(limited.length).toBe(2);
  });

  test('delete existing execution', () => {
    store.save(makeExecution({ id: 'del1' }));
    expect(store.get('del1')).not.toBeNull();

    store.delete('del1');
    expect(store.get('del1')).toBeNull();
  });

  test('delete nonexistent execution does not throw', () => {
    expect(() => store.delete('nonexistent')).not.toThrow();
  });

  test('update with variables and stepResults', () => {
    store.save(makeExecution());
    store.update('exec-1', {
      variables: { input: 'hello', result: 'world' },
      stepResults: { 'step-0': 'done step 0' },
    });

    const retrieved = store.get('exec-1');
    expect(retrieved!.variables).toEqual({ input: 'hello', result: 'world' });
    expect(retrieved!.stepResults).toEqual({ 'step-0': 'done step 0' });
  });

  test('update with completedAt', () => {
    store.save(makeExecution());
    const now = new Date().toISOString();
    store.update('exec-1', { completedAt: now });

    const retrieved = store.get('exec-1');
    expect(retrieved!.completedAt).toBe(now);
  });

  test('save with completedAt already set', () => {
    const now = new Date().toISOString();
    store.save(makeExecution({ completedAt: now, status: 'completed' }));

    const retrieved = store.get('exec-1');
    expect(retrieved!.completedAt).toBe(now);
    expect(retrieved!.status).toBe('completed');
  });
});


// ============================================
// WorkflowExecutor
// ============================================

