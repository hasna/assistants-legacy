/**
 * Subassistant Manager
 *
 * Manages the lifecycle of spawned subassistants including:
 * - Recursion depth limiting
 * - Concurrent assistant limiting
 * - Resource budgeting
 * - Async job tracking
 */

import { generateId } from '@hasna/assistants-shared';
import type { StreamChunk, Tool, HookInput, HookOutput } from '@hasna/assistants-shared';
import type { LLMClient } from '../llm/client';
import { createLLMClient } from '../llm/client';
import type { SessionStore } from '../sessions/store';
import { SubagentAuditLog, type SubagentLogEntry, type SubagentToolCallEntry } from '../agents/audit-log';

// ============================================
// Types
// ============================================

export interface SubassistantConfig {
  /** The task/instruction for the subassistant to complete */
  task: string;
  /** List of tool names the subassistant can use */
  tools?: string[];
  /** Additional context to pass to the subassistant */
  context?: string;
  /** Maximum turns the subassistant can take (default: 25, max: 50) */
  maxTurns?: number;
  /** Minimum turns before the subassistant can return (default: 3) */
  minTurns?: number;
  /** If true, subassistant keeps going until it explicitly signals completion (default: false) */
  workUntilDone?: boolean;
  /** Model to use for subassistant (default: inherit from parent) */
  model?: string;
  /** Run asynchronously and return job ID (default: false) */
  async?: boolean;
  /** Parent session ID */
  parentSessionId: string;
  /** Current depth level (0 = root assistant) */
  depth: number;
  /** Working directory */
  cwd: string;
  /** Timeout in ms (default: uses SubassistantManagerConfig.defaultTimeoutMs) */
  timeoutMs?: number;
}

export interface SubassistantResult {
  /** Whether the subassistant completed successfully */
  success: boolean;
  /** The result content from the subassistant */
  result?: string;
  /** Error message if failed */
  error?: string;
  /** Number of turns the subassistant took */
  turns: number;
  /** Number of tool calls made */
  toolCalls: number;
  /** Total tokens used (input + output) */
  tokensUsed?: number;
  /** The unique ID of the subassistant that produced this result */
  subassistantId?: string;
}

export interface SubassistantInfo {
  id: string;
  task: string;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  startedAt: number;
  completedAt?: number;
  result?: SubassistantResult;
  depth: number;
}

export type SubassistantJobStatus = 'running' | 'completed' | 'failed' | 'timeout';

export interface SubassistantJob {
  id: string;
  status: SubassistantJobStatus;
  config: SubassistantConfig;
  startedAt: number;
  completedAt?: number;
  result?: SubassistantResult;
}

export interface SubassistantManagerConfig {
  /** Maximum recursion depth (default: 3) */
  maxDepth?: number;
  /** Maximum concurrent subassistants per parent (default: 5) */
  maxConcurrent?: number;
  /** Maximum turns per subassistant (default: 25) */
  maxTurns?: number;
  /** Minimum turns before a subassistant can return (default: 3) */
  minTurns?: number;
  /** Default timeout in ms (default: 120000 = 2 minutes) */
  defaultTimeoutMs?: number;
  /** Default tools for subassistants */
  defaultTools?: string[];
  /** Tools that subassistants cannot use */
  forbiddenTools?: string[];
}

export interface SubassistantManagerContext {
  /** Function to create a subassistant loop */
  createSubassistantLoop: (config: SubassistantLoopConfig) => Promise<SubassistantRunner>;
  /** Get available tools */
  getTools: () => Tool[];
  /** Get parent's allowed tools (null = all allowed) */
  getParentAllowedTools: () => Set<string> | null;
  /** Get LLM client (for reference only - subassistants should create their own) */
  getLLMClient: () => LLMClient | null;
  /** Get LLM config to create a new client for subassistants (avoids sharing client) */
  getLLMConfig?: () => import('@hasna/assistants-shared').LLMConfig | null;
  /** Fire a hook and return the result (optional - for SubassistantStart/Stop hooks) */
  fireHook?: (input: HookInput) => Promise<HookOutput | null>;
  /** Session store for persisting subagent sessions (optional) */
  sessionStore?: SessionStore;
}

export interface SubassistantLoopConfig {
  task: string;
  tools: string[];
  context?: string;
  maxTurns: number;
  minTurns: number;
  workUntilDone: boolean;
  cwd: string;
  sessionId: string;
  depth: number;
  llmClient?: LLMClient;
  onChunk?: (chunk: StreamChunk) => void;
}

export interface SubassistantRunner {
  run(): Promise<SubassistantResult>;
  stop(): void;
}

// ============================================
// Constants
// ============================================

const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_MAX_CONCURRENT = 5;
const DEFAULT_MAX_TURNS = 25;
const DEFAULT_MIN_TURNS = 3;
const MAX_ALLOWED_TURNS = 50;
const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes

const DEFAULT_SUBASSISTANT_TOOLS = [
  'read',
  'glob',
  'grep',
  'bash',
  'web_search',
  'web_fetch',
];

const FORBIDDEN_SUBASSISTANT_TOOLS = [
  'assistant_spawn',      // Prevent recursive spawning at max depth
  'assistant_delegate',   // Prevent delegation at max depth
  'wallet_get',       // No wallet access
  'wallet_list',
  'secrets_get',      // No secrets access
  'secrets_list',
  'schedule_create',  // No scheduling
  'schedule_update',
  'schedule_delete',
];

// ============================================
// SubassistantManager Class
// ============================================

export class SubassistantManager {
  private config: Required<SubassistantManagerConfig>;
  private activeSubassistants: Map<string, SubassistantInfo> = new Map();
  private activeRunners: Map<string, SubassistantRunner> = new Map();
  private activeTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private asyncJobs: Map<string, SubassistantJob> = new Map();
  private context: SubassistantManagerContext;
  private auditLog: SubagentAuditLog;
  /** Accumulates tool calls per subagent during execution */
  private pendingToolCalls: Map<string, SubagentToolCallEntry[]> = new Map();

  constructor(config: SubassistantManagerConfig, context: SubassistantManagerContext) {
    this.config = {
      maxDepth: config.maxDepth ?? DEFAULT_MAX_DEPTH,
      maxConcurrent: config.maxConcurrent ?? DEFAULT_MAX_CONCURRENT,
      maxTurns: config.maxTurns ?? DEFAULT_MAX_TURNS,
      minTurns: config.minTurns ?? DEFAULT_MIN_TURNS,
      defaultTimeoutMs: config.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      defaultTools: config.defaultTools ?? DEFAULT_SUBASSISTANT_TOOLS,
      forbiddenTools: config.forbiddenTools ?? FORBIDDEN_SUBASSISTANT_TOOLS,
    };
    this.context = context;
    this.auditLog = new SubagentAuditLog();
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<SubassistantManagerConfig> {
    return { ...this.config };
  }

  /**
   * Check if we can spawn a new subassistant at the given depth
   */
  canSpawn(depth: number): { allowed: boolean; reason?: string } {
    // Check depth limit
    if (depth >= this.config.maxDepth) {
      return {
        allowed: false,
        reason: `Maximum subassistant depth (${this.config.maxDepth}) exceeded`,
      };
    }

    // Check concurrent limit
    const activeCount = this.activeSubassistants.size;
    if (activeCount >= this.config.maxConcurrent) {
      return {
        allowed: false,
        reason: `Maximum concurrent subassistants (${this.config.maxConcurrent}) reached`,
      };
    }

    return { allowed: true };
  }

  /**
   * Filter tools for subassistant based on depth, configuration, and parent restrictions
   */
  filterToolsForSubassistant(requestedTools: string[] | undefined, depth: number): string[] {
    // Start with requested tools or defaults
    let tools = requestedTools ?? this.config.defaultTools;
    tools = tools
      .map((tool) => tool.trim().toLowerCase())
      .filter((tool) => tool.length > 0);

    const aliases: Record<string, string[]> = {
      read: ['read'],
      edit: ['write'],
      write: ['write'],
      bash: ['bash'],
      search: ['web_search'],
      web_search: ['web_search'],
      fetch: ['web_fetch', 'curl'],
      web_fetch: ['web_fetch'],
      curl: ['curl'],
      image: ['display_image'],
      display_image: ['display_image'],
    };

    const expanded: string[] = [];
    for (const tool of tools) {
      const mapped = aliases[tool];
      if (mapped) {
        expanded.push(...mapped);
      } else {
        expanded.push(tool);
      }
    }
    tools = Array.from(new Set(expanded));

    // At max depth - 1, also forbid spawning tools to prevent depth violation
    const forbiddenSet = new Set(this.config.forbiddenTools.map((tool) => tool.toLowerCase()));
    if (depth >= this.config.maxDepth - 1) {
      forbiddenSet.add('assistant_spawn');
      forbiddenSet.add('assistant_delegate');
    }

    // Filter out forbidden tools
    tools = tools.filter((tool) => !forbiddenSet.has(tool));

    // Validate against available tools
    const availableTools = new Set(this.context.getTools().map((t) => t.name));
    tools = tools.filter((tool) => availableTools.has(tool));

    // SECURITY: Intersect with parent's allowed tools to prevent privilege escalation
    // A subassistant should never have access to tools its parent doesn't have
    const parentAllowed = this.context.getParentAllowedTools();
    if (parentAllowed) {
      tools = tools.filter((tool) => parentAllowed.has(tool.toLowerCase()));
    }

    return tools;
  }

  /**
   * Spawn a subassistant synchronously
   */
  async spawn(config: SubassistantConfig): Promise<SubassistantResult> {
    const subassistantId = generateId();

    // Check limits
    const canSpawnResult = this.canSpawn(config.depth);
    if (!canSpawnResult.allowed) {
      return {
        success: false,
        error: canSpawnResult.reason,
        turns: 0,
        toolCalls: 0,
        subassistantId,
      };
    }

    const info: SubassistantInfo = {
      id: subassistantId,
      task: config.task,
      status: 'running',
      startedAt: Date.now(),
      depth: config.depth + 1,
    };

    // Reserve slot immediately to avoid race with concurrent spawns
    this.activeSubassistants.set(subassistantId, info);

    // Initialize tool call accumulator for audit logging
    this.pendingToolCalls.set(subassistantId, []);

    // Persist subagent session to the store
    this.persistSubagentSession(subassistantId, config, 'active');

    // Fire SubassistantStart hook if available
    if (this.context.fireHook) {
      const hookInput: HookInput = {
        session_id: config.parentSessionId,
        hook_event_name: 'SubassistantStart',
        cwd: config.cwd,
        subassistant_id: subassistantId,
        parent_session_id: config.parentSessionId,
        task: config.task,
        allowed_tools: config.tools ?? this.config.defaultTools,
        max_turns: config.maxTurns ?? this.config.maxTurns,
        depth: info.depth,
      };

      const hookResult = await this.context.fireHook(hookInput);

      // Hook can block subassistant creation
      if (hookResult && hookResult.continue === false) {
        this.activeSubassistants.delete(subassistantId);
        return {
          success: false,
          error: hookResult.stopReason || 'Blocked by SubassistantStart hook',
          turns: 0,
          toolCalls: 0,
          subassistantId,
        };
      }

      // Hook can modify allowed_tools via updatedInput
      if (hookResult?.updatedInput?.allowed_tools) {
        config = {
          ...config,
          tools: hookResult.updatedInput.allowed_tools as string[],
        };
      }

      // Hook can add context via additionalContext
      if (hookResult?.additionalContext) {
        config = {
          ...config,
          context: config.context
            ? `${config.context}\n\n${hookResult.additionalContext}`
            : hookResult.additionalContext,
        };
      }
    }

    info.task = config.task;

    try {
      // Filter tools
      const tools = this.filterToolsForSubassistant(config.tools, config.depth);

      // Clamp max turns
      const maxTurns = Math.min(
        config.maxTurns ?? this.config.maxTurns,
        MAX_ALLOWED_TURNS
      );

      // Resolve minTurns (config-level override > manager default)
      const minTurns = Math.min(
        config.minTurns ?? this.config.minTurns,
        maxTurns
      );

      // workUntilDone: subagent keeps going until it explicitly signals completion
      const workUntilDone = config.workUntilDone ?? false;

      // Start the timeout BEFORE createSubassistantLoop so that initialization
      // time (LLM client creation, config loading, tool registration, etc.)
      // is included in the timeout budget. Previously the timeout only covered
      // runner.run(), so a slow initialize() could cause the subagent to appear
      // to "never start" — it would time out with 0 turns, 0 tool calls.
      const timeoutMs = config.timeoutMs ?? this.config.defaultTimeoutMs;
      let runner: SubassistantRunner | null = null;
      const timeoutPromise = this.createTimeout(timeoutMs, () => runner, subassistantId);

      // Create a dedicated LLM client for this subassistant from the parent's
      // config. This avoids each subassistant running the full initialize() →
      // loadConfig() → createLLMClient() pipeline, which is a major source of
      // latency for async subagents. Each subassistant still gets its own client
      // instance to avoid concurrency issues when multiple subassistants stream
      // in parallel.
      let subagentLLMClient: LLMClient | undefined;
      const llmConfig = this.context.getLLMConfig?.();
      if (llmConfig) {
        try {
          subagentLLMClient = await createLLMClient(llmConfig);
        } catch {
          // Fall back to letting the subassistant create its own client
          // inside initialize() — this is slower but still works.
        }
      }

      const runPromise = (async (): Promise<SubassistantResult> => {
        const r = await this.context.createSubassistantLoop({
          task: config.task,
          tools,
          context: config.context,
          maxTurns,
          minTurns,
          workUntilDone,
          cwd: config.cwd,
          sessionId: `subassistant-${subassistantId}`,
          depth: config.depth + 1,
          llmClient: subagentLLMClient,
        });
        runner = r;
        // Track the runner so we can stop it if needed
        this.activeRunners.set(subassistantId, r);
        return r.run();
      })();

      // Race initialization + execution against the timeout
      const result = await Promise.race([
        runPromise,
        timeoutPromise,
      ]);

      // Update info - detect timeout from error message
      if (result.success) {
        info.status = 'completed';
      } else if (result.error?.includes('timed out')) {
        info.status = 'timeout';
      } else {
        info.status = 'failed';
      }
      info.completedAt = Date.now();
      info.result = result;

      // Fire SubassistantStop hook
      const finalResult = await this.fireSubassistantStopHook(
        subassistantId,
        config,
        info,
        result
      );

      return finalResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      info.status = 'failed';
      info.completedAt = Date.now();
      info.result = {
        success: false,
        error: errorMessage,
        turns: 0,
        toolCalls: 0,
        subassistantId,
      };

      // Fire SubassistantStop hook for error case too
      const finalResult = await this.fireSubassistantStopHook(
        subassistantId,
        config,
        info,
        info.result
      );
      return finalResult;
    } finally {
      // Write audit log entry before cleanup
      this.writeAuditEntry(subassistantId, config, info);

      // Clean up all tracking for this subassistant
      this.cancelTimeout(subassistantId);
      this.activeSubassistants.delete(subassistantId);
      this.activeRunners.delete(subassistantId);
      this.pendingToolCalls.delete(subassistantId);

      // Persist completed subagent session
      const finalStatus = info.status === 'completed' ? 'completed' : 'closed';
      this.persistSubagentSession(subassistantId, config, finalStatus as any);
    }
  }

  /**
   * Stop a specific subassistant by ID
   */
  stopSubassistant(subassistantId: string): boolean {
    const runner = this.activeRunners.get(subassistantId);
    if (runner) {
      this.cancelTimeout(subassistantId);
      runner.stop();
      return true;
    }
    return false;
  }

  /**
   * Stop all active subassistants
   */
  stopAll(): number {
    let stopped = 0;
    for (const [id, runner] of this.activeRunners) {
      this.cancelTimeout(id);
      runner.stop();
      stopped++;
    }
    return stopped;
  }

  /**
   * Spawn a subassistant asynchronously and return job ID
   */
  async spawnAsync(config: SubassistantConfig): Promise<string> {
    // Check limits
    const canSpawnResult = this.canSpawn(config.depth);
    if (!canSpawnResult.allowed) {
      throw new Error(canSpawnResult.reason);
    }

    // Trim old jobs before adding a new one
    this.cleanupJobs();

    const jobId = generateId();
    const job: SubassistantJob = {
      id: jobId,
      status: 'running',
      config,
      startedAt: Date.now(),
    };

    this.asyncJobs.set(jobId, job);

    // Schedule the async job in a new macrotask via setTimeout(fn, 0).
    // This prevents microtask starvation: if we just called
    // this.runAsyncJob(job) directly, the async function would start
    // executing synchronously (up to its first await) within the current
    // microtask queue. The parent's continuation (tool result handling,
    // next LLM call, etc.) also runs as microtasks and can monopolize
    // the queue, starving the async job's continuations. By deferring to
    // a macrotask, the event loop guarantees the job gets its own turn.
    setTimeout(() => {
      this.runAsyncJob(job).catch(() => {
        // Error is captured in job status inside runAsyncJob
      });
    }, 0);

    return jobId;
  }

  /**
   * Get status of an async job
   */
  getJobStatus(jobId: string): SubassistantJob | null {
    return this.asyncJobs.get(jobId) ?? null;
  }

  /**
   * Wait for an async job to complete
   */
  async waitForJob(jobId: string, timeoutMs?: number): Promise<SubassistantResult | null> {
    const job = this.asyncJobs.get(jobId);
    if (!job) return null;

    // If already done, return immediately
    if (job.status !== 'running') {
      return job.result ?? null;
    }

    const timeout = timeoutMs ?? 30000;
    const pollInterval = 500;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      await this.sleep(pollInterval);

      const currentJob = this.asyncJobs.get(jobId);
      if (!currentJob) return null;

      if (currentJob.status !== 'running') {
        return currentJob.result ?? null;
      }
    }

    // Timeout waiting for job
    return null;
  }

  /**
   * List active subassistants
   */
  listActive(): SubassistantInfo[] {
    return Array.from(this.activeSubassistants.values());
  }

  /**
   * List async jobs
   */
  listJobs(): SubassistantJob[] {
    this.cleanupJobs();
    return Array.from(this.asyncJobs.values());
  }

  /**
   * Clean up old completed jobs
   */
  cleanupJobs(maxAgeMs: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, job] of this.asyncJobs) {
      if (job.status !== 'running' && job.completedAt) {
        if (now - job.completedAt > maxAgeMs) {
          this.asyncJobs.delete(id);
          cleaned++;
        }
      }
    }

    return cleaned;
  }

  /**
   * Record a tool call made by a subagent (called from the subagent loop).
   */
  recordToolCall(subassistantId: string, toolCall: SubagentToolCallEntry): void {
    const calls = this.pendingToolCalls.get(subassistantId);
    if (calls) {
      calls.push(toolCall);
    }
  }

  /**
   * Get the audit log instance for querying history.
   */
  getAuditLog(): SubagentAuditLog {
    return this.auditLog;
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Write an audit log entry for a completed subagent.
   */
  private writeAuditEntry(
    subassistantId: string,
    config: SubassistantConfig,
    info: SubassistantInfo,
  ): void {
    try {
      const completedAt = info.completedAt ?? Date.now();
      const startedAt = info.startedAt;
      const toolCalls = this.pendingToolCalls.get(subassistantId) ?? [];

      const logEntry: SubagentLogEntry = {
        id: subassistantId,
        parentSessionId: config.parentSessionId,
        task: config.task,
        toolCalls,
        turns: info.result?.turns ?? 0,
        result: info.result?.result,
        errors: info.result?.error ? [info.result.error] : undefined,
        duration: completedAt - startedAt,
        startedAt: new Date(startedAt).toISOString(),
        completedAt: new Date(completedAt).toISOString(),
        status: info.status === 'completed'
          ? 'completed'
          : info.status === 'timeout'
            ? 'timeout'
            : 'failed',
      };

      this.auditLog.log(logEntry);
    } catch {
      // Non-critical — audit logging is best-effort
    }
  }

  private async runAsyncJob(job: SubassistantJob): Promise<void> {
    try {
      const result = await this.spawn(job.config);
      // Detect timeout from error message
      if (result.success) {
        job.status = 'completed';
      } else if (result.error?.includes('timed out')) {
        job.status = 'timeout';
      } else {
        job.status = 'failed';
      }
      job.completedAt = Date.now();
      job.result = result;
    } catch (error) {
      job.status = 'failed';
      job.completedAt = Date.now();
      job.result = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        turns: 0,
        toolCalls: 0,
      };
    }
  }

  /**
   * Fire SubassistantStop hook and return potentially modified result
   */
  private async fireSubassistantStopHook(
    subassistantId: string,
    config: SubassistantConfig,
    info: SubassistantInfo,
    result: SubassistantResult
  ): Promise<SubassistantResult> {
    // Always ensure subassistantId is included
    const resultWithId = { ...result, subassistantId };

    if (!this.context.fireHook) {
      return resultWithId;
    }

    const hookInput: HookInput = {
      session_id: config.parentSessionId,
      hook_event_name: 'SubassistantStop',
      cwd: config.cwd,
      subassistant_id: subassistantId,
      parent_session_id: config.parentSessionId,
      status: info.status,
      result: result.result,
      error: result.error,
      turns_used: result.turns,
      tool_calls: result.toolCalls,
      duration_ms: (info.completedAt ?? Date.now()) - info.startedAt,
      task: config.task,
    };

    const hookResult = await this.context.fireHook(hookInput);

    // Hook can block result from being used
    if (hookResult && hookResult.continue === false) {
      return {
        success: false,
        error: hookResult.stopReason || 'Result blocked by SubassistantStop hook',
        turns: result.turns,
        toolCalls: result.toolCalls,
        subassistantId,
      };
    }

    // Hook can modify the result via updatedInput
    if (hookResult?.updatedInput?.result !== undefined) {
      return {
        ...resultWithId,
        result: String(hookResult.updatedInput.result),
      };
    }

    return resultWithId;
  }

  /**
   * Persist a subagent session to the session store
   */
  private persistSubagentSession(
    subassistantId: string,
    config: SubassistantConfig,
    status: 'active' | 'background' | 'closed' | 'completed'
  ): void {
    const store = this.context.sessionStore;
    if (!store) return;

    try {
      // Truncate task to 50 chars for the label
      const label = config.task.length > 50
        ? config.task.slice(0, 47) + '...'
        : config.task;

      store.save({
        id: `subassistant-${subassistantId}`,
        cwd: config.cwd,
        startedAt: Date.now(),
        updatedAt: Date.now(),
        assistantId: null,
        label,
        status,
        parentSessionId: config.parentSessionId,
      });
    } catch {
      // Non-critical — persistence is best-effort
    }
  }

  private createTimeout(
    ms: number,
    runnerOrGetter: SubassistantRunner | (() => SubassistantRunner | null),
    subassistantId: string
  ): Promise<SubassistantResult> {
    return new Promise((resolve) => {
      const timerId = setTimeout(() => {
        // Clean up the timer reference and runner
        this.activeTimeouts.delete(subassistantId);
        this.activeRunners.delete(subassistantId);
        // Resolve the runner — may be a direct ref or a getter (for cases
        // where the runner isn't created yet when the timeout starts)
        const runner = typeof runnerOrGetter === 'function'
          ? runnerOrGetter()
          : runnerOrGetter;
        if (runner) {
          runner.stop();
        }
        resolve({
          success: false,
          error: `Subassistant timed out after ${Math.round(ms / 1000)} seconds`,
          turns: 0,
          toolCalls: 0,
          subassistantId,
        });
      }, ms);
      // Track the timer so we can cancel it if the runner completes first
      this.activeTimeouts.set(subassistantId, timerId);
    });
  }

  /**
   * Cancel a timeout timer for a subassistant
   */
  private cancelTimeout(subassistantId: string): void {
    const timerId = this.activeTimeouts.get(subassistantId);
    if (timerId) {
      clearTimeout(timerId);
      this.activeTimeouts.delete(subassistantId);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
