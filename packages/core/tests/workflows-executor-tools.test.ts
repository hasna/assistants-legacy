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
describe('WorkflowExecutor', () => {
  function createExecutorEnv(
    stepFn: (prompt: string, allowedTools?: string[]) => Promise<string>,
    approvalHandler?: (stepName: string, description?: string) => Promise<boolean>,
  ) {
    const { adapter } = createTestDB();
    const store = new WorkflowStore(adapter);
    const executor = new WorkflowExecutor(store, stepFn, approvalHandler);
    return { store, executor };
  }

  // --- Execute all steps successfully ---

  test('execute all steps successfully', async () => {
    const prompts: string[] = [];
    const { executor } = createExecutorEnv(async (prompt) => {
      prompts.push(prompt);
      return `Result: ${prompt}`;
    });

    const workflow: WorkflowDefinition = {
      name: 'test',
      description: 'test workflow',
      steps: [
        { id: 'step-0', name: 'Step 1', prompt: 'Do A' },
        { id: 'step-1', name: 'Step 2', prompt: 'Do B' },
        { id: 'step-2', name: 'Step 3', prompt: 'Do C' },
      ],
    };

    const result = await executor.start(workflow);
    expect(result.status).toBe('completed');
    expect(result.currentStep).toBe(3);
    expect(prompts).toEqual(['Do A', 'Do B', 'Do C']);
    expect(result.completedAt).toBeDefined();
  });

  // --- Skip steps with unmet conditions ---

  test('skip step with falsy condition', async () => {
    const prompts: string[] = [];
    const { executor } = createExecutorEnv(async (prompt) => {
      prompts.push(prompt);
      return 'done';
    });

    const workflow: WorkflowDefinition = {
      name: 'cond-test',
      description: '',
      steps: [
        { id: 'step-0', name: 'Always', prompt: 'A' },
        { id: 'step-1', name: 'Conditional', prompt: 'B', condition: 'shouldRun' },
        { id: 'step-2', name: 'Always2', prompt: 'C' },
      ],
    };

    // shouldRun is not in variables, so it is falsy
    const result = await executor.start(workflow, {});
    expect(result.status).toBe('completed');
    expect(prompts).toEqual(['A', 'C']);
    expect(result.stepResults['step-1']).toBe('Skipped (condition not met)');
  });

  test('skip step with == false condition (value mismatch)', async () => {
    const prompts: string[] = [];
    const { executor } = createExecutorEnv(async (prompt) => {
      prompts.push(prompt);
      return 'done';
    });

    const workflow: WorkflowDefinition = {
      name: 'eq-false',
      description: '',
      steps: [
        { id: 'step-0', name: 'Check', prompt: 'X', condition: 'mode == deploy' },
      ],
    };

    // mode is 'test', not 'deploy'
    const result = await executor.start(workflow, { mode: 'test' });
    expect(result.status).toBe('completed');
    expect(prompts).toEqual([]);
    expect(result.stepResults['step-0']).toBe('Skipped (condition not met)');
  });

  test('run step with == match condition', async () => {
    const prompts: string[] = [];
    const { executor } = createExecutorEnv(async (prompt) => {
      prompts.push(prompt);
      return 'done';
    });

    const workflow: WorkflowDefinition = {
      name: 'eq-match',
      description: '',
      steps: [
        { id: 'step-0', name: 'Check', prompt: 'X', condition: 'mode == deploy' },
      ],
    };

    const result = await executor.start(workflow, { mode: 'deploy' });
    expect(result.status).toBe('completed');
    expect(prompts).toEqual(['X']);
  });

  test('skip step with != mismatch condition (values equal)', async () => {
    const prompts: string[] = [];
    const { executor } = createExecutorEnv(async (prompt) => {
      prompts.push(prompt);
      return 'done';
    });

    const workflow: WorkflowDefinition = {
      name: 'neq-test',
      description: '',
      steps: [
        { id: 'step-0', name: 'Check', prompt: 'X', condition: 'env != production' },
      ],
    };

    // env == production, so env != production is false => skip
    const result = await executor.start(workflow, { env: 'production' });
    expect(result.status).toBe('completed');
    expect(prompts).toEqual([]);
  });

  test('run step with != match condition (values differ)', async () => {
    const prompts: string[] = [];
    const { executor } = createExecutorEnv(async (prompt) => {
      prompts.push(prompt);
      return 'done';
    });

    const workflow: WorkflowDefinition = {
      name: 'neq-pass',
      description: '',
      steps: [
        { id: 'step-0', name: 'Check', prompt: 'X', condition: 'env != production' },
      ],
    };

    // env == staging, != production => condition met
    const result = await executor.start(workflow, { env: 'staging' });
    expect(result.status).toBe('completed');
    expect(prompts).toEqual(['X']);
  });

  // --- evaluateCondition truthy/falsy ---

  test('truthy condition with existing variable', async () => {
    const prompts: string[] = [];
    const { executor } = createExecutorEnv(async (prompt) => {
      prompts.push(prompt);
      return 'done';
    });

    const workflow: WorkflowDefinition = {
      name: 'truthy',
      description: '',
      steps: [
        { id: 'step-0', name: 'Check', prompt: 'X', condition: 'myFlag' },
      ],
    };

    const result = await executor.start(workflow, { myFlag: 'yes' });
    expect(prompts).toEqual(['X']);
    expect(result.status).toBe('completed');
  });

  test('falsy condition with undefined variable', async () => {
    const prompts: string[] = [];
    const { executor } = createExecutorEnv(async (prompt) => {
      prompts.push(prompt);
      return 'done';
    });

    const workflow: WorkflowDefinition = {
      name: 'falsy',
      description: '',
      steps: [
        { id: 'step-0', name: 'Check', prompt: 'X', condition: 'myFlag' },
      ],
    };

    // myFlag is not set
    const result = await executor.start(workflow, {});
    expect(prompts).toEqual([]);
    expect(result.stepResults['step-0']).toBe('Skipped (condition not met)');
  });

  // --- substituteVariables ---

  test('substitute known variable', async () => {
    const prompts: string[] = [];
    const { executor } = createExecutorEnv(async (prompt) => {
      prompts.push(prompt);
      return 'done';
    });

    const workflow: WorkflowDefinition = {
      name: 'sub-test',
      description: '',
      steps: [
        { id: 'step-0', name: 'S', prompt: 'Hello ${name}!' },
      ],
    };

    await executor.start(workflow, { name: 'World' });
    expect(prompts[0]).toBe('Hello World!');
  });

  test('unknown variable stays as ${var}', async () => {
    const prompts: string[] = [];
    const { executor } = createExecutorEnv(async (prompt) => {
      prompts.push(prompt);
      return 'done';
    });

    const workflow: WorkflowDefinition = {
      name: 'sub-unknown',
      description: '',
      steps: [
        { id: 'step-0', name: 'S', prompt: 'Hello ${unknown}!' },
      ],
    };

    await executor.start(workflow, {});
    expect(prompts[0]).toBe('Hello ${unknown}!');
  });

  test('multiple variable substitutions', async () => {
    const prompts: string[] = [];
    const { executor } = createExecutorEnv(async (prompt) => {
      prompts.push(prompt);
      return 'done';
    });

    const workflow: WorkflowDefinition = {
      name: 'sub-multi',
      description: '',
      steps: [
        { id: 'step-0', name: 'S', prompt: '${greeting} ${name}, your age is ${age}' },
      ],
    };

    await executor.start(workflow, { greeting: 'Hi', name: 'Alice', age: 30 });
    expect(prompts[0]).toBe('Hi Alice, your age is 30');
  });

  test('empty prompt stays empty', async () => {
    const prompts: string[] = [];
    const { executor } = createExecutorEnv(async (prompt) => {
      prompts.push(prompt);
      return 'done';
    });

    const workflow: WorkflowDefinition = {
      name: 'sub-empty',
      description: '',
      steps: [
        { id: 'step-0', name: 'S', prompt: '' },
      ],
    };

    await executor.start(workflow, { x: 'val' });
    expect(prompts[0]).toBe('');
  });

  // --- outputVariable passed through to next step ---

  test('outputVariable is passed to next step prompt', async () => {
    const prompts: string[] = [];
    const { executor } = createExecutorEnv(async (prompt) => {
      prompts.push(prompt);
      return `output-of-${prompt}`;
    });

    const workflow: WorkflowDefinition = {
      name: 'output-var',
      description: '',
      steps: [
        { id: 'step-0', name: 'S1', prompt: 'step1', outputVariable: 'result1' },
        { id: 'step-1', name: 'S2', prompt: 'use ${result1}' },
      ],
    };

    const result = await executor.start(workflow);
    expect(prompts[0]).toBe('step1');
    expect(prompts[1]).toBe('use output-of-step1');
    expect(result.variables.result1).toBe('output-of-step1');
  });

  // --- Step execution failure ---

  test('step failure sets status to failed', async () => {
    let callCount = 0;
    const { executor } = createExecutorEnv(async () => {
      callCount++;
      if (callCount === 2) {
        throw new Error('Something went wrong');
      }
      return 'ok';
    });

    const workflow: WorkflowDefinition = {
      name: 'fail-test',
      description: '',
      steps: [
        { id: 'step-0', name: 'Step 1', prompt: 'A' },
        { id: 'step-1', name: 'Step 2', prompt: 'B' },
        { id: 'step-2', name: 'Step 3', prompt: 'C' },
      ],
    };

    const result = await executor.start(workflow);
    expect(result.status).toBe('failed');
    expect(result.error).toBe('Something went wrong');
    // Step 3 should not have been reached
    expect(callCount).toBe(2);
  });

  test('step failure with non-Error throw', async () => {
    const { executor } = createExecutorEnv(async () => {
      throw 'string error';
    });

    const workflow: WorkflowDefinition = {
      name: 'fail-str',
      description: '',
      steps: [
        { id: 'step-0', name: 'S1', prompt: 'X' },
      ],
    };

    const result = await executor.start(workflow);
    expect(result.status).toBe('failed');
    expect(result.error).toBe('string error');
  });

  // --- Empty workflow (0 steps) ---

  test('empty workflow with 0 steps completes immediately', async () => {
    const prompts: string[] = [];
    const { executor } = createExecutorEnv(async (prompt) => {
      prompts.push(prompt);
      return 'done';
    });

    const workflow: WorkflowDefinition = {
      name: 'empty',
      description: '',
      steps: [],
    };

    const result = await executor.start(workflow);
    expect(result.status).toBe('completed');
    expect(result.currentStep).toBe(0);
    expect(prompts.length).toBe(0);
    expect(result.completedAt).toBeDefined();
  });

  // --- getDefaultVariables with and without workflow.variables ---

  test('getDefaultVariables with workflow.variables having defaults', async () => {
    const prompts: string[] = [];
    const { executor } = createExecutorEnv(async (prompt) => {
      prompts.push(prompt);
      return 'done';
    });

    const workflow: WorkflowDefinition = {
      name: 'defaults',
      description: '',
      variables: [
        { name: 'color', type: 'string', default: 'blue' },
        { name: 'count', type: 'number', default: 5 },
        { name: 'noDefault', type: 'string' },
      ],
      steps: [
        { id: 'step-0', name: 'S1', prompt: '${color} ${count} ${noDefault}' },
      ],
    };

    await executor.start(workflow);
    expect(prompts[0]).toBe('blue 5 ${noDefault}');
  });

  test('getDefaultVariables without workflow.variables', async () => {
    const prompts: string[] = [];
    const { executor } = createExecutorEnv(async (prompt) => {
      prompts.push(prompt);
      return 'done';
    });

    const workflow: WorkflowDefinition = {
      name: 'no-vars',
      description: '',
      steps: [
        { id: 'step-0', name: 'S1', prompt: '${anything}' },
      ],
    };

    await executor.start(workflow);
    expect(prompts[0]).toBe('${anything}');
  });

  test('user-provided variables override defaults', async () => {
    const prompts: string[] = [];
    const { executor } = createExecutorEnv(async (prompt) => {
      prompts.push(prompt);
      return 'done';
    });

    const workflow: WorkflowDefinition = {
      name: 'override',
      description: '',
      variables: [
        { name: 'color', type: 'string', default: 'blue' },
      ],
      steps: [
        { id: 'step-0', name: 'S1', prompt: '${color}' },
      ],
    };

    await executor.start(workflow, { color: 'red' });
    expect(prompts[0]).toBe('red');
  });

  // --- Approval handler denies ---

  test('approval handler denies step => paused', async () => {
    const prompts: string[] = [];
    const { executor } = createExecutorEnv(
      async (prompt) => {
        prompts.push(prompt);
        return 'done';
      },
      async (_stepName, _description) => false, // deny
    );

    const workflow: WorkflowDefinition = {
      name: 'approval-deny',
      description: '',
      steps: [
        { id: 'step-0', name: 'Step 1', prompt: 'A' },
        { id: 'step-1', name: 'Needs Approval', prompt: 'B', requiresApproval: true },
        { id: 'step-2', name: 'Step 3', prompt: 'C' },
      ],
    };

    const result = await executor.start(workflow);
    expect(result.status).toBe('paused');
    // Step 1 executed, step 2 was denied
    expect(prompts).toEqual(['A']);
  });

  test('approval handler approves step => continues', async () => {
    const prompts: string[] = [];
    const { executor } = createExecutorEnv(
      async (prompt) => {
        prompts.push(prompt);
        return 'done';
      },
      async (_stepName, _description) => true, // approve
    );

    const workflow: WorkflowDefinition = {
      name: 'approval-allow',
      description: '',
      steps: [
        { id: 'step-0', name: 'Step 1', prompt: 'A' },
        { id: 'step-1', name: 'Needs Approval', prompt: 'B', requiresApproval: true },
        { id: 'step-2', name: 'Step 3', prompt: 'C' },
      ],
    };

    const result = await executor.start(workflow);
    expect(result.status).toBe('completed');
    expect(prompts).toEqual(['A', 'B', 'C']);
  });

  test('approval handler not set => approval skipped, step runs', async () => {
    const prompts: string[] = [];
    // No approval handler provided
    const { executor } = createExecutorEnv(async (prompt) => {
      prompts.push(prompt);
      return 'done';
    });

    const workflow: WorkflowDefinition = {
      name: 'no-handler',
      description: '',
      steps: [
        { id: 'step-0', name: 'Step 1', prompt: 'A', requiresApproval: true },
      ],
    };

    const result = await executor.start(workflow);
    expect(result.status).toBe('completed');
    expect(prompts).toEqual(['A']);
  });

  // --- allowedTools are passed to stepExecutor ---

  test('allowedTools are passed to step executor', async () => {
    const receivedTools: (string[] | undefined)[] = [];
    const { executor } = createExecutorEnv(async (_prompt, allowedTools) => {
      receivedTools.push(allowedTools);
      return 'done';
    });

    const workflow: WorkflowDefinition = {
      name: 'tools-test',
      description: '',
      steps: [
        { id: 'step-0', name: 'S1', prompt: 'A', allowedTools: ['bash', 'read'] },
        { id: 'step-1', name: 'S2', prompt: 'B' },
      ],
    };

    await executor.start(workflow);
    expect(receivedTools[0]).toEqual(['bash', 'read']);
    expect(receivedTools[1]).toBeUndefined();
  });

  // --- stepResults stored in store ---

  test('step results are persisted in the store', async () => {
    const { executor, store } = createExecutorEnv(async (prompt) => {
      return `result-${prompt}`;
    });

    const workflow: WorkflowDefinition = {
      name: 'persist-test',
      description: '',
      steps: [
        { id: 'step-0', name: 'S1', prompt: 'A' },
        { id: 'step-1', name: 'S2', prompt: 'B' },
      ],
    };

    const result = await executor.start(workflow);
    const stored = store.get(result.id);

    expect(stored).not.toBeNull();
    expect(stored!.status).toBe('completed');
    expect(stored!.stepResults['step-0']).toBe('result-A');
    expect(stored!.stepResults['step-1']).toBe('result-B');
    expect(stored!.currentStep).toBe(2);
  });

  // --- Resume ---

  test('resume a paused workflow', async () => {
    const prompts: string[] = [];
    const { executor, store } = createExecutorEnv(
      async (prompt) => {
        prompts.push(prompt);
        return `done-${prompt}`;
      },
      async () => false, // deny approval on first pass
    );

    const workflow: WorkflowDefinition = {
      name: 'resume-test',
      description: '',
      steps: [
        { id: 'step-0', name: 'S1', prompt: 'A' },
        { id: 'step-1', name: 'S2', prompt: 'B', requiresApproval: true },
        { id: 'step-2', name: 'S3', prompt: 'C' },
      ],
    };

    const result = await executor.start(workflow);
    expect(result.status).toBe('paused');
    expect(prompts).toEqual(['A']);

    // Create a new executor that approves to resume
    const executor2 = new WorkflowExecutor(
      store,
      async (prompt) => {
        prompts.push(prompt);
        return 'resumed-done';
      },
      async () => true, // approve now
    );

    const resumed = await executor2.resume(result.id, workflow);
    expect(resumed.status).toBe('completed');
    expect(prompts).toEqual(['A', 'B', 'C']);
  });

  test('resume throws for nonexistent execution', async () => {
    const { executor } = createExecutorEnv(async () => 'ok');
    const workflow: WorkflowDefinition = { name: 'w', description: '', steps: [] };

    await expect(executor.resume('nonexistent', workflow)).rejects.toThrow('Workflow execution not found');
  });

  test('resume throws for non-paused execution', async () => {
    const { executor } = createExecutorEnv(async () => 'ok');
    const workflow: WorkflowDefinition = {
      name: 'w',
      description: '',
      steps: [{ id: 'step-0', name: 'S1', prompt: 'A' }],
    };

    const result = await executor.start(workflow);
    expect(result.status).toBe('completed');

    await expect(executor.resume(result.id, workflow)).rejects.toThrow('Cannot resume workflow in status');
  });

  // --- Pause ---

  test('pause a running workflow', async () => {
    const { executor, store } = createExecutorEnv(async () => 'ok');

    // Manually save a running execution
    const exec: WorkflowExecution = {
      id: 'pause-test',
      workflowName: 'test',
      status: 'running',
      currentStep: 1,
      variables: {},
      stepResults: {},
      startedAt: new Date().toISOString(),
    };
    store.save(exec);

    executor.pause('pause-test');
    const retrieved = store.get('pause-test');
    expect(retrieved!.status).toBe('paused');
  });

  test('pause a non-running workflow is a no-op', async () => {
    const { executor, store } = createExecutorEnv(async () => 'ok');

    const exec: WorkflowExecution = {
      id: 'pause-noop',
      workflowName: 'test',
      status: 'completed',
      currentStep: 2,
      variables: {},
      stepResults: {},
      startedAt: new Date().toISOString(),
    };
    store.save(exec);

    executor.pause('pause-noop');
    const retrieved = store.get('pause-noop');
    expect(retrieved!.status).toBe('completed'); // unchanged
  });

  // --- Cancel ---

  test('cancel a running workflow', async () => {
    const { executor, store } = createExecutorEnv(async () => 'ok');

    const exec: WorkflowExecution = {
      id: 'cancel-test',
      workflowName: 'test',
      status: 'running',
      currentStep: 0,
      variables: {},
      stepResults: {},
      startedAt: new Date().toISOString(),
    };
    store.save(exec);

    executor.cancel('cancel-test');
    const retrieved = store.get('cancel-test');
    expect(retrieved!.status).toBe('cancelled');
    expect(retrieved!.completedAt).toBeDefined();
  });

  test('cancel a paused workflow', async () => {
    const { executor, store } = createExecutorEnv(async () => 'ok');

    const exec: WorkflowExecution = {
      id: 'cancel-paused',
      workflowName: 'test',
      status: 'paused',
      currentStep: 1,
      variables: {},
      stepResults: {},
      startedAt: new Date().toISOString(),
    };
    store.save(exec);

    executor.cancel('cancel-paused');
    const retrieved = store.get('cancel-paused');
    expect(retrieved!.status).toBe('cancelled');
  });

  test('cancel a completed workflow is a no-op', async () => {
    const { executor, store } = createExecutorEnv(async () => 'ok');

    const exec: WorkflowExecution = {
      id: 'cancel-done',
      workflowName: 'test',
      status: 'completed',
      currentStep: 2,
      variables: {},
      stepResults: {},
      startedAt: new Date().toISOString(),
    };
    store.save(exec);

    executor.cancel('cancel-done');
    const retrieved = store.get('cancel-done');
    expect(retrieved!.status).toBe('completed'); // unchanged
  });
});


// ============================================
// WorkflowTools (tools/workflows.ts)
// ============================================

describe('WorkflowTools', () => {
  test('registerAll registers all 4 tools', () => {
    const registry = new ToolRegistry();

    // Before registration
    expect(registry.hasTool('workflow_list')).toBe(false);
    expect(registry.hasTool('workflow_run')).toBe(false);
    expect(registry.hasTool('workflow_status')).toBe(false);
    expect(registry.hasTool('workflow_update')).toBe(false);

    WorkflowTools.registerAll(registry);

    // After registration
    expect(registry.hasTool('workflow_list')).toBe(true);
    expect(registry.hasTool('workflow_run')).toBe(true);
    expect(registry.hasTool('workflow_status')).toBe(true);
    expect(registry.hasTool('workflow_update')).toBe(true);

    // Verify we have exactly 4 workflow tools registered
    const tools = registry.getTools();
    const workflowToolNames = tools
      .filter(t => t.name.startsWith('workflow_'))
      .map(t => t.name)
      .sort();
    expect(workflowToolNames).toEqual([
      'workflow_list',
      'workflow_run',
      'workflow_status',
      'workflow_update',
    ]);
  });

  test('registered tools have proper descriptions', () => {
    const registry = new ToolRegistry();
    WorkflowTools.registerAll(registry);

    const listTool = registry.getTool('workflow_list');
    expect(listTool).toBeDefined();
    expect(listTool!.description).toContain('List');

    const runTool = registry.getTool('workflow_run');
    expect(runTool).toBeDefined();
    expect(runTool!.description).toContain('Start');

    const statusTool = registry.getTool('workflow_status');
    expect(statusTool).toBeDefined();
    expect(statusTool!.description).toContain('status');

    const updateTool = registry.getTool('workflow_update');
    expect(updateTool).toBeDefined();
    expect(updateTool!.description).toContain('Update');
  });

  test('workflow_run tool has required name parameter', () => {
    const registry = new ToolRegistry();
    WorkflowTools.registerAll(registry);

    const runTool = registry.getTool('workflow_run');
    expect(runTool!.parameters.required).toContain('name');
  });

  test('workflow_update tool has required executionId and action parameters', () => {
    const registry = new ToolRegistry();
    WorkflowTools.registerAll(registry);

    const updateTool = registry.getTool('workflow_update');
    expect(updateTool!.parameters.required).toContain('executionId');
    expect(updateTool!.parameters.required).toContain('action');
  });
});
