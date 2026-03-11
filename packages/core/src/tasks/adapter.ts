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

import type { Task, TaskStatus, TaskPriority, TaskCreateOptions, TaskRecurrence } from './types';
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
    startedAt: t.started_at ? new Date(t.started_at).getTime() : undefined,
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
  options: TaskCreateOptions,
  priority?: TaskPriority,
  projectId?: string,
): Promise<Task> {
  const resolvedProjectId = projectId || (await getProjectId(cwd));
  const db = getDatabase();

  const input: CreateTaskInput = {
    title: options.description,
    description: options.description,
    status: 'pending',
    priority: toSdkPriority(priority || options.priority || 'normal'),
    project_id: resolvedProjectId,
    assigned_to: options.assignee ?? undefined,
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

export async function clearPendingTasks(cwd: string): Promise<void> {
  const tasks = await getTasks(cwd);
  const db = getDatabase();
  for (const t of tasks) {
    if (t.status === 'pending') {
      sdkDeleteTask(t.id, db);
    }
  }
}

export async function clearCompletedTasks(cwd: string): Promise<void> {
  const tasks = await getTasks(cwd);
  const db = getDatabase();
  for (const t of tasks) {
    if (t.status === 'completed' || t.status === 'failed') {
      sdkDeleteTask(t.id, db);
    }
  }
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

export async function cancelRecurringTask(cwd: string, id: string): Promise<boolean> {
  if (recurringTasks.has(id)) {
    recurringTasks.delete(id);
    return true;
  }
  return false;
}

export async function resolveTaskId(
  cwd: string,
  idOrPrefix: string,
  filter?: (task: Task) => boolean,
): Promise<Task | null> {
  const tasks = await getTasks(cwd);
  const normalized = idOrPrefix.toLowerCase().trim();
  const matches = tasks.filter((t) => {
    const matchesId = t.id.toLowerCase().startsWith(normalized) || t.id.toLowerCase() === normalized;
    return matchesId && (!filter || filter(t));
  });
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return null; // ambiguous
  return null;
}
