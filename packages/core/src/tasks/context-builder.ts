/**
 * Task Context Builder
 *
 * Fetches pending/in-progress tasks from the @hasna/todos REST API and
 * formats them as a system prompt addition so the AI assistant is aware
 * of what work is queued before the user even asks.
 *
 * Triggered when TODOS_URL is set in the environment.
 */

export interface TaskContextOptions {
  /** Base URL of the todos REST API (default: TODOS_URL env var or http://localhost:19427) */
  todosUrl?: string;
  /** Max tasks to show (default: 10) */
  maxTasks?: number;
  /** Timeout in ms (default: 3000) */
  timeoutMs?: number;
}

interface TodoTask {
  id: string;
  subject: string;
  status: string;
  priority?: string;
  due_date?: string | null;
  assigned_to?: string | null;
  project_id?: string | null;
}

/**
 * Fetch pending/in-progress tasks from the todos REST API.
 * Returns null if todos is not configured, unreachable, or has no relevant tasks.
 * Never throws — failures are silently ignored.
 */
export async function buildTasksContextPrompt(options: TaskContextOptions = {}): Promise<string | null> {
  const todosUrl = options.todosUrl
    ?? process.env.TODOS_URL
    ?? 'http://localhost:19427';

  const maxTasks = options.maxTasks ?? 10;
  const timeoutMs = options.timeoutMs ?? 3000;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let tasks: TodoTask[] = [];

    try {
      // Fetch pending and in-progress tasks
      const [pendingRes, activeRes] = await Promise.all([
        fetch(`${todosUrl}/api/tasks?status=pending&limit=${maxTasks}`, { signal: controller.signal }),
        fetch(`${todosUrl}/api/tasks?status=in_progress&limit=5`, { signal: controller.signal }),
      ]);

      const pendingData = pendingRes.ok ? await pendingRes.json() as { tasks?: TodoTask[] } : { tasks: [] };
      const activeData = activeRes.ok ? await activeRes.json() as { tasks?: TodoTask[] } : { tasks: [] };

      // Active tasks first, then pending
      const active = activeData.tasks ?? [];
      const pending = (pendingData.tasks ?? []).slice(0, maxTasks - active.length);
      tasks = [...active, ...pending];
    } finally {
      clearTimeout(timer);
    }

    if (tasks.length === 0) return null;

    // Format as concise prompt addition
    const lines: string[] = ['## Pending Tasks'];

    for (const task of tasks) {
      const badge = task.status === 'in_progress' ? '🔵' : '⬜';
      const priority = task.priority && task.priority !== 'normal' ? ` [${task.priority}]` : '';
      const due = task.due_date ? ` (due ${task.due_date.slice(0, 10)})` : '';
      const assignee = task.assigned_to ? ` — assigned to ${task.assigned_to}` : '';
      lines.push(`${badge} ${task.id}: ${task.subject}${priority}${due}${assignee}`);
    }

    lines.push('');
    lines.push('Use the todos tools (tasks_list, tasks_start, tasks_complete) to manage these.');

    return lines.join('\n');
  } catch {
    // todos not running, not configured, or timed out — silently skip
    return null;
  }
}

/**
 * Check if tasks context injection is enabled.
 * Enabled when TODOS_URL is explicitly set OR when the local todos server responds.
 */
export function isTasksContextEnabled(): boolean {
  return !!process.env.TODOS_URL;
}
