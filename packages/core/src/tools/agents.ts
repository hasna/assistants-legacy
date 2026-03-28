/**
 * Assistant Spawning and Management Tools
 *
 * Tools that enable assistants to spawn subassistants, delegate tasks to named assistants,
 * and manage async assistant jobs.
 */

import type { Tool, Assistant } from '@hasna/assistants-shared';
import type { ToolExecutor, ToolRegistry } from './registry';
import type { SubassistantManager, SubassistantConfig, SubassistantJob, SubassistantInfo } from '../agent/subagent-manager';
import type { AssistantManager } from '../identity';
import { getAgentDefinition, loadAgentDefinitions, type AgentDefinition } from '../agents';

// ============================================
// Types
// ============================================

export interface AssistantToolContext {
  /** Get the subassistant manager */
  getSubassistantManager: () => SubassistantManager | null;
  /** Get the assistant manager */
  getAssistantManager: () => AssistantManager | null;
  /** Get current recursion depth */
  getDepth: () => number;
  /** Get working directory */
  getCwd: () => string;
  /** Get session ID */
  getSessionId: () => string;
}

// ============================================
// Tool Definitions
// ============================================

export const assistantSpawnTool: Tool = {
  name: 'assistant_spawn',
  description: `Spawn a subassistant to handle a specific task. The subassistant runs with limited context and tools.

Use this to delegate discrete tasks like:
- Searching and analyzing files
- Running a specific operation
- Gathering information

The subassistant has no memory of the parent conversation - provide all needed context in the task and context parameters.`,
  parameters: {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description: 'The task/instruction for the subassistant to complete. Be specific and include all necessary context.',
      },
      tools: {
        type: 'array',
        description: 'List of tool names the subassistant can use. Default: read, glob, grep, bash, web_search, web_fetch',
        items: { type: 'string', description: 'Tool name' },
      },
      context: {
        type: 'string',
        description: 'Additional context to pass to the subassistant (file contents, previous findings, etc.)',
      },
      maxTurns: {
        type: 'number',
        description: 'Maximum turns the subassistant can take (default: 25, max: 50)',
      },
      minTurns: {
        type: 'number',
        description: 'Minimum turns the subassistant must take before returning (default: 3). Prevents superficial results.',
      },
      workUntilDone: {
        type: 'boolean',
        description: 'If true, subassistant keeps working until the task is fully complete instead of returning early (default: false)',
      },
      async: {
        type: 'boolean',
        description: 'Run asynchronously and return job ID for later retrieval (default: false)',
      },
    },
    required: ['task'],
  },
};

export const assistantListTool: Tool = {
  name: 'assistant_list',
  description: 'List available assistants and currently running subassistants.',
  parameters: {
    type: 'object',
    properties: {
      includeActive: {
        type: 'boolean',
        description: 'Include currently running subassistants (default: true)',
      },
      includeJobs: {
        type: 'boolean',
        description: 'Include async subassistant jobs (default: true)',
      },
    },
    required: [],
  },
};

export const assistantDelegateTool: Tool = {
  name: 'assistant_delegate',
  description: `Delegate a task to a specific named assistant. The assistant runs with its configured tools and system prompt.

Use this when you want to leverage a specialized assistant's capabilities.`,
  parameters: {
    type: 'object',
    properties: {
      assistant: {
        type: 'string',
        description: 'Name or ID of the assistant to delegate to',
      },
      task: {
        type: 'string',
        description: 'The task/instruction for the assistant',
      },
      context: {
        type: 'string',
        description: 'Additional context to include',
      },
      async: {
        type: 'boolean',
        description: 'Run asynchronously (default: false)',
      },
    },
    required: ['assistant', 'task'],
  },
};

export const assistantJobStatusTool: Tool = {
  name: 'assistant_job_status',
  description: 'Check status of an async assistant job or wait for it to complete.',
  parameters: {
    type: 'object',
    properties: {
      jobId: {
        type: 'string',
        description: 'The job ID returned from assistant_spawn or assistant_delegate with async=true',
      },
      wait: {
        type: 'boolean',
        description: 'Wait for job to complete (default: false)',
      },
      timeout: {
        type: 'number',
        description: 'Max wait time in milliseconds (default: 30000)',
      },
    },
    required: ['jobId'],
  },
};

export const subagentHistoryTool: Tool = {
  name: 'subagent_history',
  description: 'Query the audit trail of past subagent executions. Returns recent subagent activity including task, tool calls, result, duration, and status.',
  parameters: {
    type: 'object',
    properties: {
      parentSessionId: {
        type: 'string',
        description: 'Filter by parent session ID (default: current session)',
      },
      since: {
        type: 'string',
        description: 'Only entries after this ISO date (e.g. "2026-03-13T00:00:00Z")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of entries to return (default: 20, max: 100)',
      },
      status: {
        type: 'string',
        description: 'Filter by status: "completed", "failed", or "timeout"',
        enum: ['completed', 'failed', 'timeout'],
      },
      id: {
        type: 'string',
        description: 'Get a specific subagent entry by ID (ignores other filters)',
      },
    },
    required: [],
  },
};

// ============================================
// Tool array for convenience
// ============================================

export const assistantTools: Tool[] = [
  assistantSpawnTool,
  assistantListTool,
  assistantDelegateTool,
  assistantJobStatusTool,
  subagentHistoryTool,
];

// ============================================
// Response Types
// ============================================

interface AssistantSpawnResponse {
  success: boolean;
  result?: string;
  error?: string;
  turns?: number;
  toolCalls?: number;
  jobId?: string;
}

interface AssistantListResponse {
  assistants: Array<{
    id: string;
    name: string;
    description?: string;
    isActive: boolean;
  }>;
  agentDefinitions?: Array<{
    name: string;
    description: string;
    scope?: string;
    tools?: string[];
  }>;
  activeSubassistants: Array<{
    id: string;
    task: string;
    status: string;
    depth: number;
    runningForMs: number;
  }>;
  asyncJobs: Array<{
    id: string;
    task: string;
    status: string;
    startedAt: number;
    completedAt?: number;
  }>;
}

interface AssistantDelegateResponse {
  success: boolean;
  result?: string;
  error?: string;
  assistant?: string;
  jobId?: string;
}

interface AssistantJobStatusResponse {
  found: boolean;
  jobId: string;
  status?: string;
  result?: string;
  error?: string;
  turns?: number;
  toolCalls?: number;
  startedAt?: number;
  completedAt?: number;
}

// ============================================
// Tool Executors Factory
// ============================================

export function createAssistantToolExecutors(
  context: AssistantToolContext
): Record<string, ToolExecutor> {
  return {
    assistant_spawn: async (input: Record<string, unknown>): Promise<string> => {
      const manager = context.getSubassistantManager();
      if (!manager) {
        const response: AssistantSpawnResponse = {
          success: false,
          error: 'Subassistant spawning is not enabled',
        };
        return JSON.stringify(response, null, 2);
      }

      const task = String(input.task || '');
      if (!task.trim()) {
        const response: AssistantSpawnResponse = {
          success: false,
          error: 'Task is required',
        };
        return JSON.stringify(response, null, 2);
      }

      const tools = Array.isArray(input.tools)
        ? input.tools.map(String)
        : undefined;
      const contextStr = typeof input.context === 'string' ? input.context : undefined;
      const maxTurns = typeof input.maxTurns === 'number' ? input.maxTurns : undefined;
      const minTurns = typeof input.minTurns === 'number' ? input.minTurns : undefined;
      const workUntilDone = input.workUntilDone === true;
      const async = input.async === true;

      const config: SubassistantConfig = {
        task,
        tools,
        context: contextStr,
        maxTurns,
        minTurns,
        workUntilDone,
        async,
        parentSessionId: context.getSessionId(),
        depth: context.getDepth(),
        cwd: context.getCwd(),
      };

      // Check if spawning is allowed
      const canSpawn = manager.canSpawn(config.depth);
      if (!canSpawn.allowed) {
        const response: AssistantSpawnResponse = {
          success: false,
          error: canSpawn.reason,
        };
        return JSON.stringify(response, null, 2);
      }

      if (async) {
        // Spawn asynchronously
        try {
          const jobId = await manager.spawnAsync(config);
          const response: AssistantSpawnResponse = {
            success: true,
            jobId,
            result: `Subassistant job started with ID: ${jobId}. Use assistant_job_status to check progress.`,
          };
          return JSON.stringify(response, null, 2);
        } catch (error) {
          const response: AssistantSpawnResponse = {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
          return JSON.stringify(response, null, 2);
        }
      } else {
        // Spawn synchronously
        const result = await manager.spawn(config);
        const response: AssistantSpawnResponse = {
          success: result.success,
          result: result.result,
          error: result.error,
          turns: result.turns,
          toolCalls: result.toolCalls,
        };
        return JSON.stringify(response, null, 2);
      }
    },

    assistant_list: async (input: Record<string, unknown>): Promise<string> => {
      const manager = context.getSubassistantManager();
      const assistantManager = context.getAssistantManager();

      const includeActive = input.includeActive !== false;
      const includeJobs = input.includeJobs !== false;

      // Get assistants
      const assistants = assistantManager?.listAssistants() ?? [];
      const activeAssistantId = assistantManager?.getActiveId();

      // Also load file-based agent definitions
      const agentDefs = loadAgentDefinitions(context.getCwd());

      const response: AssistantListResponse = {
        assistants: assistants.map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          isActive: a.id === activeAssistantId,
        })),
        agentDefinitions: agentDefs.length > 0
          ? agentDefs.map((d) => ({
              name: d.name,
              description: d.description,
              scope: d.scope,
              tools: d.tools,
            }))
          : undefined,
        activeSubassistants: [],
        asyncJobs: [],
      };

      if (manager) {
        if (includeActive) {
          const now = Date.now();
          response.activeSubassistants = manager.listActive().map((info) => ({
            id: info.id,
            task: info.task.slice(0, 100) + (info.task.length > 100 ? '...' : ''),
            status: info.status,
            depth: info.depth,
            runningForMs: now - info.startedAt,
          }));
        }

        if (includeJobs) {
          response.asyncJobs = manager.listJobs().map((job) => ({
            id: job.id,
            task: job.config.task.slice(0, 100) + (job.config.task.length > 100 ? '...' : ''),
            status: job.status,
            startedAt: job.startedAt,
            completedAt: job.completedAt,
          }));
        }
      }

      return JSON.stringify(response, null, 2);
    },

    assistant_delegate: async (input: Record<string, unknown>): Promise<string> => {
      const manager = context.getSubassistantManager();

      if (!manager) {
        const response: AssistantDelegateResponse = {
          success: false,
          error: 'Assistant delegation is not enabled',
        };
        return JSON.stringify(response, null, 2);
      }

      const assistantQuery = String(input.assistant || '');
      const task = String(input.task || '');
      const contextStr = typeof input.context === 'string' ? input.context : undefined;
      const async = input.async === true;

      if (!assistantQuery.trim()) {
        const response: AssistantDelegateResponse = {
          success: false,
          error: 'Assistant name or ID is required',
        };
        return JSON.stringify(response, null, 2);
      }

      if (!task.trim()) {
        const response: AssistantDelegateResponse = {
          success: false,
          error: 'Task is required',
        };
        return JSON.stringify(response, null, 2);
      }

      // First check DB-backed assistants, then fall back to file-based agent definitions
      const assistantManager = context.getAssistantManager();
      let assistant: Assistant | undefined;
      let agentDef: AgentDefinition | null = null;

      if (assistantManager) {
        const assistants = assistantManager.listAssistants();
        assistant = assistants.find(
          (a) =>
            a.id === assistantQuery ||
            a.name.toLowerCase() === assistantQuery.toLowerCase()
        );
      }

      // Fall back to agent definitions (JSON files in ~/.hasna/assistants/agents/ or .assistants/agents/)
      if (!assistant) {
        agentDef = getAgentDefinition(assistantQuery, context.getCwd());
      }

      if (!assistant && !agentDef) {
        const availableNames: string[] = [];
        if (assistantManager) {
          availableNames.push(...assistantManager.listAssistants().map((a) => a.name));
        }
        const agentDefs = loadAgentDefinitions(context.getCwd());
        availableNames.push(...agentDefs.map((d) => d.name));

        const response: AssistantDelegateResponse = {
          success: false,
          error: `Assistant "${assistantQuery}" not found. Available: ${availableNames.join(', ') || '(none)'}`,
        };
        return JSON.stringify(response, null, 2);
      }

      // Build config for delegation from either source
      let tools: string[] | undefined;
      let enhancedContext: string;
      let delegateName: string;

      if (agentDef) {
        // Using file-based agent definition
        delegateName = agentDef.name;
        tools = agentDef.tools;
        enhancedContext = [
          `Delegated to agent: ${agentDef.name}`,
          agentDef.description ? `Description: ${agentDef.description}` : null,
          agentDef.systemPrompt ? `Instructions: ${agentDef.systemPrompt}` : null,
          contextStr ? `\nAdditional context:\n${contextStr}` : null,
        ]
          .filter(Boolean)
          .join('\n');
      } else {
        // Using DB-backed assistant
        delegateName = assistant!.name;
        tools = assistant!.settings.enabledTools ?? undefined;
        enhancedContext = [
          `Delegated to assistant: ${assistant!.name}`,
          assistant!.description ? `Description: ${assistant!.description}` : null,
          assistant!.settings.systemPromptAddition
            ? `Instructions: ${assistant!.settings.systemPromptAddition}`
            : null,
          contextStr ? `\nAdditional context:\n${contextStr}` : null,
        ]
          .filter(Boolean)
          .join('\n');
      }

      const config: SubassistantConfig = {
        task,
        tools,
        context: enhancedContext,
        maxTurns: agentDef?.maxTurns,
        minTurns: agentDef?.minTurns,
        workUntilDone: agentDef?.workUntilDone,
        parentSessionId: context.getSessionId(),
        depth: context.getDepth(),
        cwd: context.getCwd(),
      };

      // Check if spawning is allowed
      const canSpawn = manager.canSpawn(config.depth);
      if (!canSpawn.allowed) {
        const response: AssistantDelegateResponse = {
          success: false,
          error: canSpawn.reason,
          assistant: delegateName,
        };
        return JSON.stringify(response, null, 2);
      }

      if (async) {
        try {
          const jobId = await manager.spawnAsync(config);
          const response: AssistantDelegateResponse = {
            success: true,
            jobId,
            assistant: delegateName,
            result: `Delegated to ${delegateName}. Job ID: ${jobId}`,
          };
          return JSON.stringify(response, null, 2);
        } catch (error) {
          const response: AssistantDelegateResponse = {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            assistant: delegateName,
          };
          return JSON.stringify(response, null, 2);
        }
      } else {
        const result = await manager.spawn(config);
        const response: AssistantDelegateResponse = {
          success: result.success,
          result: result.result,
          error: result.error,
          assistant: delegateName,
        };
        return JSON.stringify(response, null, 2);
      }
    },

    subagent_history: async (input: Record<string, unknown>): Promise<string> => {
      const manager = context.getSubassistantManager();

      if (!manager) {
        return JSON.stringify({ error: 'Subassistant system not available' }, null, 2);
      }

      const auditLog = manager.getAuditLog();

      // If a specific ID is requested, return just that entry
      if (typeof input.id === 'string' && input.id.trim()) {
        const entry = auditLog.getEntry(input.id.trim());
        if (!entry) {
          return JSON.stringify({ error: `No subagent entry found with ID: ${input.id}` }, null, 2);
        }
        return JSON.stringify(entry, null, 2);
      }

      // Query with filters
      const limit = Math.min(
        typeof input.limit === 'number' ? input.limit : 20,
        100
      );

      const entries = auditLog.query({
        parentSessionId:
          typeof input.parentSessionId === 'string'
            ? input.parentSessionId
            : undefined,
        since: typeof input.since === 'string' ? input.since : undefined,
        limit,
        status: typeof input.status === 'string'
          ? (input.status as 'completed' | 'failed' | 'timeout')
          : undefined,
      });

      // Return a summary view (omit full tool call details for brevity)
      const summary = entries.map((e) => ({
        id: e.id,
        parentSessionId: e.parentSessionId,
        task: e.task.length > 120 ? e.task.slice(0, 117) + '...' : e.task,
        status: e.status,
        turns: e.turns,
        toolCallCount: e.toolCalls.length,
        duration: e.duration,
        startedAt: e.startedAt,
        completedAt: e.completedAt,
        result: e.result
          ? e.result.length > 200
            ? e.result.slice(0, 197) + '...'
            : e.result
          : undefined,
        errors: e.errors,
      }));

      return JSON.stringify({ count: summary.length, entries: summary }, null, 2);
    },

    assistant_job_status: async (input: Record<string, unknown>): Promise<string> => {
      const manager = context.getSubassistantManager();

      if (!manager) {
        const response: AssistantJobStatusResponse = {
          found: false,
          jobId: String(input.jobId || ''),
          error: 'Subassistant system not available',
        };
        return JSON.stringify(response, null, 2);
      }

      const jobId = String(input.jobId || '');
      const wait = input.wait === true;
      const timeout = typeof input.timeout === 'number' ? input.timeout : 30000;

      if (!jobId.trim()) {
        const response: AssistantJobStatusResponse = {
          found: false,
          jobId: '',
          error: 'Job ID is required',
        };
        return JSON.stringify(response, null, 2);
      }

      if (wait) {
        // Wait for job to complete
        const result = await manager.waitForJob(jobId, timeout);
        const job = manager.getJobStatus(jobId);

        if (!job) {
          const response: AssistantJobStatusResponse = {
            found: false,
            jobId,
            error: 'Job not found',
          };
          return JSON.stringify(response, null, 2);
        }

        const response: AssistantJobStatusResponse = {
          found: true,
          jobId,
          status: job.status,
          result: result?.result,
          error: result?.error,
          turns: result?.turns,
          toolCalls: result?.toolCalls,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
        };
        return JSON.stringify(response, null, 2);
      } else {
        // Just check status
        const job = manager.getJobStatus(jobId);

        if (!job) {
          const response: AssistantJobStatusResponse = {
            found: false,
            jobId,
            error: 'Job not found',
          };
          return JSON.stringify(response, null, 2);
        }

        const response: AssistantJobStatusResponse = {
          found: true,
          jobId,
          status: job.status,
          result: job.result?.result,
          error: job.result?.error,
          turns: job.result?.turns,
          toolCalls: job.result?.toolCalls,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
        };
        return JSON.stringify(response, null, 2);
      }
    },
  };
}

// ============================================
// Registration Function
// ============================================

export function registerAssistantTools(
  registry: ToolRegistry,
  context: AssistantToolContext
): void {
  const executors = createAssistantToolExecutors(context);

  for (const tool of assistantTools) {
    registry.register(tool, executors[tool.name]);
  }
}
