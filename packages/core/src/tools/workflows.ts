/**
 * Workflow Tools
 *
 * Tools for listing, running, and managing workflow executions.
 */

import type { Tool } from '@hasna/assistants-shared';
import type { ToolExecutor, ToolRegistry } from './registry';
import { ErrorCodes, ToolExecutionError } from '../errors';
import { WorkflowLoader, WorkflowStore, WorkflowExecutor } from '../workflows';
import type { StepExecutor } from '../workflows';
import { DEFAULT_COMPACT_LIMIT, MAX_COMPACT_LIMIT, pageItems, truncateText } from '../commands/helpers';

let workflowLoader: WorkflowLoader | null = null;
let workflowStore: WorkflowStore | null = null;

function getLoader(): WorkflowLoader {
  if (!workflowLoader) {
    workflowLoader = new WorkflowLoader();
  }
  return workflowLoader;
}

function getStore(): WorkflowStore {
  if (!workflowStore) {
    workflowStore = new WorkflowStore();
  }
  return workflowStore;
}

// ============================================
// workflow_list
// ============================================

const workflowListTool: Tool = {
  name: 'workflow_list',
  description: 'List all available workflow templates and their descriptions.',
  parameters: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Maximum workflows to return (default 20, max 100)' },
      cursor: { type: 'number', description: 'Zero-based offset for pagination' },
      verbose: { type: 'boolean', description: 'Include longer descriptions and source paths' },
      full: { type: 'boolean', description: 'Return all workflows without compact truncation' },
    },
  },
};

const workflowListExecutor: ToolExecutor = async (input) => {
  const loader = getLoader();
  await loader.loadAll();
  const workflows = loader.list();

  if (workflows.length === 0) {
    return 'No workflows found. Create workflow YAML files in ~/.hasna/assistants/workflows/ or .assistants/workflows/';
  }

  const full = input.full === true;
  const verbose = full || input.verbose === true;
  const limitInput = typeof input.limit === 'number' ? input.limit : DEFAULT_COMPACT_LIMIT;
  const cursorInput = typeof input.cursor === 'number' ? input.cursor : 0;
  const limit = full ? Math.max(workflows.length, 1) : Math.min(Math.max(Math.floor(limitInput), 1), MAX_COMPACT_LIMIT);
  const cursor = Math.max(Math.floor(cursorInput), 0);
  const page = pageItems(workflows, { limit, cursor });

  const list = page.items.map(w => ({
    name: truncateText(w.name, verbose ? 120 : 56),
    description: truncateText(w.description, verbose ? 240 : 96),
    steps: w.steps.length,
    tags: w.tags || [],
    source: verbose ? w.filePath : undefined,
  }));

  return JSON.stringify({
    workflows: list,
    count: list.length,
    total: workflows.length,
    limit,
    cursor,
    nextCursor: page.nextCursor,
    hint: page.nextCursor !== null
      ? `Pass cursor=${page.nextCursor} for more. Pass full=true for all workflows.`
      : 'Pass verbose=true for source paths, or full=true for all workflows.',
  });
};

// ============================================
// workflow_run
// ============================================

const workflowRunTool: Tool = {
  name: 'workflow_run',
  description:
    'Start a workflow execution. The workflow will execute step by step, ' +
    'with each step being a prompt sent to the assistant.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name of the workflow to run',
      },
      variables: {
        type: 'object',
        description: 'Variables to pass to the workflow (key-value pairs)',
      },
    },
    required: ['name'],
  },
};

const workflowRunExecutor: ToolExecutor = async (input) => {
  const workflowName = input.name as string;
  const variables = (input.variables as Record<string, unknown>) || {};

  const loader = getLoader();
  await loader.loadAll();
  const workflow = loader.get(workflowName);

  if (!workflow) {
    const available = loader.list().map(w => w.name);
    throw new ToolExecutionError(
      `Workflow "${workflowName}" not found. Available: ${available.join(', ') || 'none'}`,
      {
        toolName: 'workflow_run',
        toolInput: input,
        code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
        recoverable: true,
        retryable: false,
      }
    );
  }

  // Return the workflow steps as instructions for the assistant to follow
  const steps = workflow.steps.map((step, i) => ({
    step: i + 1,
    name: step.name,
    description: step.description,
    prompt: step.prompt,
    allowedTools: step.allowedTools,
    requiresApproval: step.requiresApproval,
  }));

  // Create an execution record
  const store = getStore();
  const execution = {
    id: `wf-${Date.now()}`,
    workflowName: workflow.name,
    status: 'running' as const,
    currentStep: 0,
    variables,
    stepResults: {},
    startedAt: new Date().toISOString(),
  };
  store.save(execution);

  return JSON.stringify({
    executionId: execution.id,
    workflow: workflow.name,
    description: workflow.description,
    totalSteps: steps.length,
    variables,
    steps,
    instructions: 'Execute each step in order. After completing each step, proceed to the next. Report the results at the end.',
  });
};

// ============================================
// workflow_status
// ============================================

const workflowStatusTool: Tool = {
  name: 'workflow_status',
  description: 'Check the status of a workflow execution or list recent executions.',
  parameters: {
    type: 'object',
    properties: {
      executionId: {
        type: 'string',
        description: 'Execution ID to check (optional, lists recent if omitted)',
      },
    },
  },
};

const workflowStatusExecutor: ToolExecutor = async (input) => {
  const store = getStore();
  const executionId = input.executionId as string | undefined;

  if (executionId) {
    const execution = store.get(executionId);
    if (!execution) {
      throw new ToolExecutionError(`Execution not found: ${executionId}`, {
        toolName: 'workflow_status',
        toolInput: input,
        code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
        recoverable: true,
        retryable: false,
      });
    }
    return JSON.stringify(execution);
  }

  const recent = store.list({ limit: 10 });
  return JSON.stringify({
    executions: recent.map(e => ({
      id: e.id,
      workflow: e.workflowName,
      status: e.status,
      currentStep: e.currentStep,
      startedAt: e.startedAt,
      completedAt: e.completedAt,
    })),
  });
};

// ============================================
// workflow_update
// ============================================

const workflowUpdateTool: Tool = {
  name: 'workflow_update',
  description: 'Update a workflow execution status (pause, resume, cancel, complete).',
  parameters: {
    type: 'object',
    properties: {
      executionId: {
        type: 'string',
        description: 'Execution ID to update',
      },
      action: {
        type: 'string',
        description: 'Action to perform',
        enum: ['pause', 'resume', 'cancel', 'complete'],
      },
      stepResult: {
        type: 'string',
        description: 'Result of the current step (for advancing to next step)',
      },
    },
    required: ['executionId', 'action'],
  },
};

const workflowUpdateExecutor: ToolExecutor = async (input) => {
  const store = getStore();
  const executionId = input.executionId as string;
  const action = input.action as string;
  const stepResult = input.stepResult as string | undefined;

  const execution = store.get(executionId);
  if (!execution) {
    throw new ToolExecutionError(`Execution not found: ${executionId}`, {
      toolName: 'workflow_update',
      toolInput: input,
      code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
      recoverable: true,
      retryable: false,
    });
  }

  switch (action) {
    case 'pause':
      store.update(executionId, { status: 'paused' });
      return JSON.stringify({ id: executionId, status: 'paused' });

    case 'resume':
      store.update(executionId, { status: 'running' });
      return JSON.stringify({ id: executionId, status: 'running' });

    case 'cancel':
      store.update(executionId, {
        status: 'cancelled',
        completedAt: new Date().toISOString(),
      });
      return JSON.stringify({ id: executionId, status: 'cancelled' });

    case 'complete': {
      // Advance step and optionally record result
      const stepResults = { ...execution.stepResults };
      if (stepResult) {
        stepResults[`step-${execution.currentStep}`] = stepResult;
      }
      const nextStep = execution.currentStep + 1;
      store.update(executionId, {
        currentStep: nextStep,
        stepResults,
        ...(nextStep >= Object.keys(stepResults).length + 1
          ? { status: 'completed', completedAt: new Date().toISOString() }
          : {}),
      });
      return JSON.stringify({
        id: executionId,
        currentStep: nextStep,
        status: execution.status,
      });
    }

    default:
      throw new ToolExecutionError(`Unknown action: ${action}`, {
        toolName: 'workflow_update',
        toolInput: input,
        code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
        recoverable: true,
        retryable: false,
      });
  }
};

// ============================================
// Registration
// ============================================

export class WorkflowTools {
  static registerAll(registry: ToolRegistry): void {
    registry.register(workflowListTool, workflowListExecutor);
    registry.register(workflowRunTool, workflowRunExecutor);
    registry.register(workflowStatusTool, workflowStatusExecutor);
    registry.register(workflowUpdateTool, workflowUpdateExecutor);
  }
}
