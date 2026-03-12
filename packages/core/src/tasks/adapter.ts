/**
 * Tasks adapter for @hasna/todos
 * Wraps the @hasna/todos library behind the same function signatures
 * as the native store.ts, enabling drop-in replacement.
 *
 * Priority mapping:  native 'normal' ↔ SDK 'medium'
 * Status mapping:    SDK 'cancelled' → native 'failed' (backward compat)
 * Project scoping:   via ensureProject(cwd) + project.id
 */

import {
  createTask as sdkCreateTask,
  getTask as sdkGetTask,
  listTasks as sdkListTasks,
  updateTask as sdkUpdateTask,
  deleteTask as sdkDeleteTask,
  startTask as sdkStartTask,
  completeTask as sdkCompleteTask,
  ensureProject,
  getDatabase,
  type Task as SdkTask,
  type CreateTaskInput,
  type UpdateTaskInput,
} from '@hasna/todos';

import type { Task, TaskStatus, TaskPriority, TaskCreateOptions, TaskRecurrence, TaskStoreData } from './types';
import { PRIORITY_ORDER } from './types';
import { generateId } from '@hasna/assistants-shared';

// ─── Priority / Status Mapping ────────────────────────────────────────────────

type SdkPriority = 'low' | 'medium' | 'high' | 'critical';
type SdkStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

function toSdkPriority(p: TaskPriority): SdkPriority {
  return p === 'normal' ? 'medium' : p as SdkPriority;
}

function fromSdkPriority(p: SdkPriority): TaskPriority {
  return p === 'medium' ? 'normal' : p === 'critical' ? 'high' : p as TaskPriority;
}

function fromSdkStatus(s: SdkStatus): TaskStatus {
  return s === 'cancelled' ? 'failed' : s as TaskStatus;
}

// ─── Project Scope Cache ──────────────────────────────────────────────────────

const projectIdCache = new Map<string, string>();

async function getProjectId(cwd: string): Promise<string> {
  if (projectIdCache.has(cwd)) return projectIdCache.get(cwd)!;
  const db = getDatabase();
  const name = cwd.split('/').filter(Boolean).pop() || 'default';
  const project = ensureProject(name, cwd, db);
  projectIdCache.set(cwd, project.id);
  return project.id;
}

// ─── Type Conversion ──────────────────────────────────────────────────────────

function fromSdkTask(t: SdkTask): Task {
  return {
    id: t.id,
    description: t.title || t.description || '',
    status: fromSdkStatus(t.status as SdkStatus),
    priority: fromSdkPriority((t.priority as SdkPriority) || 'medium'),
    createdAt: new Date(t.created_at).getTime(),
    startedAt: t.status === 'in_progress' ? new Date(t.updated_at).getTime() : undefined,
    completedAt: t.completed_at ? new Date(t.completed_at).getTime() : undefined,
    result: t.metadata ? (t.metadata as Record<string, unknown>).result as string | undefined : undefined,
    error: t.metadata ? (t.metadata as Record<string, unknown>).error as string | undefined : undefined,
    projectId: t.project_id ?? undefined,
    assignee: t.assigned_to ?? undefined,
    blockedBy: [],
    blocks: [],
  };
}

// ─── Queue Pause State (local, since SDK doesn't have queue pause) ────────────

const pauseState = new Map<string, boolean>();
const autoRunState = new Map<string, boolean>();

// ─── Recurring Tasks (local, since SDK doesn't have recurrence) ───────────────

const recurringTasks = new Map<string, Task>();

// ─── Public API (mirrors store.ts exports) ────────────────────────────────────

export async function getTasks(cwd: string): Promise<Task[]> {
  const projectId = await getProjectId(cwd);
  const db = getDatabase();
  const tasks = sdkListTasks({ project_id: projectId }, db);
  return tasks.map(fromSdkTask);
}

export async function getTask(cwd: string, id: string): Promise<Task | null> {
  const db = getDatabase();
  const task = sdkGetTask(id, db);
  if (!task) return null;
  return fromSdkTask(task);
}

export async function addTask(
  cwd: string,
  options: TaskCreateOptions | string,
  priority: TaskPriority = 'normal',
  projectId?: string,
): Promise<Task> {
  const opts: TaskCreateOptions =
    typeof options === 'string'
      ? { description: options, priority, projectId }
      : options;

  const resolvedProjectId = opts.projectId || projectId || (await getProjectId(cwd));
  const db = getDatabase();

  const input: CreateTaskInput = {
    title: opts.description,
    description: opts.description,
    status: 'pending',
    priority: toSdkPriority(opts.priority || priority || 'normal'),
    project_id: resolvedProjectId,
    assigned_to: opts.assignee ?? undefined,
  };

  const created = sdkCreateTask(input, db);
  return fromSdkTask(created);
}

export async function updateTask(
  cwd: string,
  id: string,
  updates: Partial<Pick<Task, 'status' | 'priority' | 'assignee' | 'result' | 'error' | 'blockedBy' | 'blocks'>>,
): Promise<Task | null> {
  const db = getDatabase();
  const existing = sdkGetTask(id, db);
  if (!existing) return null;

  const input: UpdateTaskInput = {
    version: existing.version,
  };

  if (updates.status !== undefined) {
    input.status = updates.status as SdkStatus;
  }
  if (updates.priority !== undefined) {
    input.priority = toSdkPriority(updates.priority);
  }
  if (updates.assignee !== undefined) {
    input.assigned_to = updates.assignee;
  }

  const updated = sdkUpdateTask(id, input, db);
  return fromSdkTask(updated);
}

export async function deleteTask(cwd: string, id: string): Promise<boolean> {
  const db = getDatabase();
  sdkDeleteTask(id, db);
  return true;
}

export async function clearPendingTasks(cwd: string): Promise<number> {
  const tasks = await getTasks(cwd);
  const db = getDatabase();
  let count = 0;
  for (const t of tasks) {
    if (t.status === 'pending') {
      sdkDeleteTask(t.id, db);
      count++;
    }
  }
  return count;
}

export async function clearCompletedTasks(cwd: string): Promise<number> {
  const tasks = await getTasks(cwd);
  const db = getDatabase();
  let count = 0;
  for (const t of tasks) {
    if (t.status === 'completed' || t.status === 'failed') {
      sdkDeleteTask(t.id, db);
      count++;
    }
  }
  return count;
}

export async function getNextTask(cwd: string): Promise<Task | null> {
  const tasks = await getTasks(cwd);
  const pending = tasks
    .filter((t) => t.status === 'pending')
    .sort((a, b) => {
      const p = { high: 0, normal: 1, low: 2 };
      return (p[a.priority] ?? 1) - (p[b.priority] ?? 1);
    });
  return pending[0] ?? null;
}

export async function isPaused(cwd: string): Promise<boolean> {
  return pauseState.get(cwd) ?? false;
}

export async function setPaused(cwd: string, paused: boolean): Promise<void> {
  pauseState.set(cwd, paused);
}

export async function startTask(cwd: string, id: string): Promise<Task | null> {
  const db = getDatabase();
  const existing = sdkGetTask(id, db);
  if (!existing) return null;
  const updated = sdkStartTask(id, '', db);
  return fromSdkTask(updated);
}

export async function completeTask(cwd: string, id: string, result?: string): Promise<Task | null> {
  const db = getDatabase();
  const existing = sdkGetTask(id, db);
  if (!existing) return null;
  const updated = sdkCompleteTask(id, undefined, db);
  return fromSdkTask(updated);
}

export async function failTask(cwd: string, id: string, error?: string): Promise<Task | null> {
  const db = getDatabase();
  const existing = sdkGetTask(id, db);
  if (!existing) return null;
  const updated = sdkUpdateTask(id, { version: existing.version, status: 'failed' }, db);
  return fromSdkTask(updated);
}

export async function getTaskCounts(cwd: string): Promise<Record<TaskStatus, number>> {
  const tasks = await getTasks(cwd);
  const counts: Record<TaskStatus, number> = { pending: 0, in_progress: 0, completed: 0, failed: 0 };
  for (const t of tasks) {
    if (counts[t.status] !== undefined) counts[t.status]++;
  }
  return counts;
}

// Recurring tasks are kept in-memory for now (SDK doesn't support recurrence)
export async function getRecurringTasks(cwd: string): Promise<Task[]> {
  return Array.from(recurringTasks.values()).filter((t) => {
    return true; // all recurring tasks belong to this cwd conceptually
  });
}

export async function getDueRecurringTasks(cwd: string): Promise<Task[]> {
  const now = Date.now();
  return Array.from(recurringTasks.values()).filter((t) => {
    return t.isRecurringTemplate && t.nextRunAt && t.nextRunAt <= now;
  });
}

export async function processDueRecurringTasks(cwd: string): Promise<Task[]> {
  const due = await getDueRecurringTasks(cwd);
  const created: Task[] = [];
  for (const template of due) {
    const instance = await createRecurringInstance(cwd, template.id);
    if (instance) created.push(instance);
  }
  return created;
}

export async function createRecurringInstance(cwd: string, templateId: string): Promise<Task | null> {
  const template = recurringTasks.get(templateId);
  if (!template || !template.recurrence) return null;

  const instance = await addTask(cwd, {
    description: template.description,
    priority: template.priority,
    assignee: template.assignee,
  });

  // Update next run time
  const rec = template.recurrence;
  const intervalMs = rec.intervalMs ?? 60000;
  recurringTasks.set(templateId, { ...template, nextRunAt: Date.now() + intervalMs });

  return instance;
}

export async function cancelRecurringTask(cwd: string, id: string): Promise<Task | null> {
  const task = recurringTasks.get(id);
  if (task) {
    recurringTasks.delete(id);
    return task;
  }
  return null;
}

export async function resolveTaskId(
  cwd: string,
  idOrPrefix: string,
  filter?: (task: Task) => boolean,
): Promise<{ task: Task | null; matches: Task[] }> {
  const tasks = await getTasks(cwd);
  const candidates = filter ? tasks.filter(filter) : tasks;
  const exact = candidates.find((t) => t.id === idOrPrefix);
  if (exact) return { task: exact, matches: [exact] };
  const matches = candidates.filter((t) => t.id.toLowerCase().startsWith(idOrPrefix.toLowerCase()));
  return { task: matches.length === 1 ? matches[0] : null, matches };
}

// ─── Store-level helpers (for compatibility with store.ts API) ───────────────

export async function loadTaskStore(cwd: string): Promise<TaskStoreData> {
  const tasks = await getTasks(cwd);
  const paused = await isPaused(cwd);
  const autoRun = await isAutoRun(cwd);
  return { tasks, paused, autoRun };
}

export async function saveTaskStore(_cwd: string, _data: TaskStoreData): Promise<void> {
  // No-op: individual operations write directly via the SDK
}

export async function isAutoRun(cwd: string): Promise<boolean> {
  return autoRunState.get(cwd) ?? true;
}

export async function setAutoRun(cwd: string, autoRun: boolean): Promise<void> {
  autoRunState.set(cwd, autoRun);
}
