import type { Command } from './types';
import { splitArgs, formatAge } from './helpers';
import { join } from 'path';
import type { Heartbeat } from '../heartbeat/types';
import {
  listJobs,
  listJobsForSession,
  readJob,
  updateJob,
  cleanupSessionJobs,
  type Job,
} from '../jobs';
import {
  saveSchedule,
  listSchedules,
  getSchedule,
  deleteSchedule,
  updateSchedule,
  computeNextRun,
} from '../scheduler/store';
import type { ScheduledCommand } from '@hasna/assistants-shared';
import {
  getTasks,
  resolveTaskId,
  addTask,
  updateTask,
  deleteTask,
  clearPendingTasks,
  clearCompletedTasks,
  getNextTask,
  isPaused,
  setPaused,
  startTask,
  completeTask,
  failTask,
  getTaskCounts,
  type Task,
  type TaskPriority,
  PRIORITY_ORDER,
} from '../tasks';
import {
  listHeartbeatHistorySessions,
  readHeartbeatHistory,
  resolveHeartbeatHistoryPath,
} from '../heartbeat/history';
import { formatRelativeTime } from '../scheduler/format';

/**
 * /jobs - List and manage background jobs
 */
export function jobsCommand(): Command {
  return {
    name: 'jobs',
    description: 'List and manage background jobs',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const parts = args.trim().split(/\s+/);
      const subcommand = parts[0]?.toLowerCase() || 'list';
      const arg = parts[1] || '';

      switch (subcommand) {
        case 'list':
        case '': {
          const jobs = await listJobsForSession(context.sessionId);
          if (jobs.length === 0) {
            context.emit('text', 'No jobs found for this session.\n');
            context.emit('done');
            return { handled: true };
          }

          // Sort by created time, newest first
          jobs.sort((a, b) => b.createdAt - a.createdAt);

          let output = '\n| Status | ID | Connector | Command | Age |\n';
          output += '|--------|----|-----------|---------|----- |\n';

          for (const job of jobs) {
            const age = formatAge(Date.now() - job.createdAt);
            const command = job.command.slice(0, 30);
            output += `| ${job.status.toUpperCase()} | ${job.id} | ${job.connectorName} | ${command} | ${age} |\n`;
          }

          context.emit('text', output);
          context.emit('done');
          return { handled: true };
        }

        case 'all': {
          const jobs = await listJobs();
          if (jobs.length === 0) {
            context.emit('text', 'No jobs found.\n');
            context.emit('done');
            return { handled: true };
          }

          jobs.sort((a, b) => b.createdAt - a.createdAt);

          let output = '\n| Status | ID | Session | Connector | Command | Age |\n';
          output += '|--------|----|---------|-----------|---------|-----|\n';

          for (const job of jobs) {
            const age = formatAge(Date.now() - job.createdAt);
            const command = job.command.slice(0, 20);
            output += `| ${job.status.toUpperCase()} | ${job.id} | ${job.sessionId} | ${job.connectorName} | ${command} | ${age} |\n`;
          }

          context.emit('text', output);
          context.emit('done');
          return { handled: true };
        }

        case 'cancel': {
          if (!arg) {
            context.emit('text', 'Usage: /jobs cancel <job_id>\n');
            context.emit('done');
            return { handled: true };
          }

          // Find job by partial ID
          const jobs = await listJobs();
          const matches = jobs.filter((j) => j.id.startsWith(arg) || j.id === arg);

          if (matches.length === 0) {
            context.emit('text', `Job not found: ${arg}\n`);
            context.emit('done');
            return { handled: true };
          }

          if (matches.length > 1) {
            context.emit('text', `Ambiguous job ID. Matches: ${matches.map((j) => j.id).join(', ')}\n`);
            context.emit('done');
            return { handled: true };
          }

          const job = matches[0];
          if (!['pending', 'running'].includes(job.status)) {
            context.emit('text', `Cannot cancel job ${job.id}: status is ${job.status}\n`);
            context.emit('done');
            return { handled: true };
          }

          const manager = context.getJobManager?.();
          let cancelled = false;
          if (manager && job.sessionId === context.sessionId) {
            cancelled = await manager.cancelJob(job.id);
          }
          if (!cancelled) {
            const updated = await updateJob(job.id, (j) => ({
              ...j,
              status: 'cancelled',
              completedAt: Date.now(),
              error: {
                code: 'JOB_CANCELLED',
                message: 'Job was cancelled by user',
              },
            }));
            cancelled = updated !== null;
          }

          if (cancelled) {
            context.emit('text', `Job ${job.id} cancelled.\n`);
          } else {
            context.emit('text', `Failed to cancel job ${job.id}.\n`);
          }
          context.emit('done');
          return { handled: true };
        }

        case 'clear': {
          const cleaned = await cleanupSessionJobs(context.sessionId);
          context.emit('text', `Cleared ${cleaned} completed job(s).\n`);
          context.emit('done');
          return { handled: true };
        }

        case 'help': {
          const help = `
/jobs               List jobs for current session
/jobs list          List jobs for current session
/jobs all           List all jobs across sessions
/jobs <id>          Show details of a specific job
/jobs cancel <id>   Cancel a running job
/jobs clear         Clear completed jobs for this session
/jobs help          Show this help
`;
          context.emit('text', help);
          context.emit('done');
          return { handled: true };
        }

        default: {
          // Assume it's a job ID
          const jobs = await listJobs();
          const matches = jobs.filter((j) => j.id.startsWith(subcommand) || j.id === subcommand);

          if (matches.length === 0) {
            context.emit('text', `Job not found: ${subcommand}\nUse /jobs help for usage.\n`);
            context.emit('done');
            return { handled: true };
          }

          if (matches.length > 1) {
            context.emit('text', `Ambiguous job ID. Matches: ${matches.map((j) => j.id).join(', ')}\n`);
            context.emit('done');
            return { handled: true };
          }

          const job = matches[0];
          let output = `
Job ID: ${job.id}
Status: ${job.status}
Connector: ${job.connectorName}
Command: ${job.command}
Session: ${job.sessionId}
Created: ${new Date(job.createdAt).toISOString()}
`;

          if (job.startedAt) {
            output += `Started: ${new Date(job.startedAt).toISOString()}\n`;
          }

          if (job.completedAt) {
            output += `Completed: ${new Date(job.completedAt).toISOString()}\n`;
            const duration = job.completedAt - (job.startedAt || job.createdAt);
            output += `Duration: ${(duration / 1000).toFixed(1)}s\n`;
          }

          output += `Timeout: ${job.timeoutMs / 1000}s\n`;

          if (job.result) {
            output += `\nResult:\n${job.result.content}\n`;
          }

          if (job.error) {
            output += `\nError (${job.error.code}): ${job.error.message}\n`;
          }

          context.emit('text', output);
          context.emit('done');
          return { handled: true };
        }
      }
    },
  };
}


/**
 * /tasks - Task queue management
 */
export function tasksCommand(): Command {
  return {
    name: 'tasks',
    description: 'Manage task queue for assistant to execute',
    tags: ['tasks', 'queue', 'automation'],
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const parts = splitArgs(args);
      const sub = parts[0] || '';
      const formatTaskMatch = (task: Task): string => {
        const desc = task.description.length > 60
          ? `${task.description.slice(0, 60)}...`
          : task.description;
        return `${task.id} - ${desc}`;
      };
      const emitResolveError = (id: string, matches: Task[], label: string): void => {
        if (matches.length > 1) {
          const listed = matches.slice(0, 5).map(formatTaskMatch).join('\n');
          const more = matches.length > 5 ? `\n...and ${matches.length - 5} more` : '';
          context.emit('text', `Multiple ${label} match "${id}". Use a longer ID prefix.\n${listed}${more}\n`);
          return;
        }
        context.emit('text', `${label} not found: ${id}\n`);
      };

      // Interactive UI mode - default when no args or explicit 'ui'
      if (!sub || sub === 'ui') {
        context.emit('done');
        return { handled: true, showPanel: 'tasks' as const };
      }

      // Show help with explicit help command
      if (sub === 'help') {
        const tasks = await getTasks(context.cwd);
        const counts = await getTaskCounts(context.cwd);
        const paused = await isPaused(context.cwd);

        let output = '\n📋 **Tasks** - Queue tasks for the assistant to execute\n\n';

        // Show current status
        const pendingCount = counts.pending;
        const inProgressCount = counts.in_progress;
        const completedCount = counts.completed;
        const failedCount = counts.failed;

        if (tasks.length > 0) {
          output += `**Status**: ${pendingCount} pending, ${inProgressCount} in progress, ${completedCount} completed, ${failedCount} failed\n`;
          output += `**Queue**: ${paused ? '⏸ Paused' : '▶ Active'}\n\n`;

          output += '**Recent Tasks:**\n';
          const recent = tasks.slice(0, 5);
          for (const task of recent) {
            const statusIcon = task.status === 'pending' ? '○' :
                               task.status === 'in_progress' ? '◐' :
                               task.status === 'completed' ? '●' : '✗';
            const priorityIcon = task.priority === 'high' ? '↑' :
                                 task.priority === 'low' ? '↓' : '-';
            output += `  ${statusIcon} [${priorityIcon}] ${task.description.slice(0, 50)}${task.description.length > 50 ? '...' : ''}\n`;
          }
          if (tasks.length > 5) {
            output += `  ... and ${tasks.length - 5} more\n`;
          }
          output += '\n';
        } else {
          output += '**Status**: No tasks in queue\n\n';
        }

        output += '**Commands:**\n';
        output += '  /tasks                   Open interactive task panel\n';
        output += '  /tasks list              List all tasks\n';
        output += '  /tasks add <desc>        Add a task (normal priority)\n';
        output += '  /tasks add -p high <desc>  Add high priority task\n';
        output += '  /tasks add -p low <desc>   Add low priority task\n';
        output += '  /tasks show <id>         Show task details\n';
        output += '  /tasks delete <id>       Delete a task\n';
        output += '  /tasks clear             Clear all pending tasks\n';
        output += '  /tasks clear done        Clear completed/failed tasks\n';
        output += '  /tasks priority <id> <high|normal|low>\n';
        output += '  /tasks pause             Pause auto-processing\n';
        output += '  /tasks resume            Resume auto-processing\n';
        output += '  /tasks run               Run next pending task\n';
        output += '  /tasks help              Show this help\n';
        output += '\nNote: You can use a unique ID prefix from /tasks list.\n';

        context.emit('text', output);
        context.emit('done');
        return { handled: true };
      }

      // List all tasks
      if (sub === 'list') {
        const tasks = await getTasks(context.cwd);
        if (tasks.length === 0) {
          context.emit('text', 'No tasks in queue.\n');
          context.emit('done');
          return { handled: true };
        }

        const paused = await isPaused(context.cwd);
        let output = `\n**Task Queue** ${paused ? '(Paused)' : ''}\n\n`;
        output += '| Status | Pri | ID | Description | Created |\n';
        output += '|--------|-----|----|-------------|----------|\n';

        for (const task of tasks) {
          const statusIcon = task.status === 'pending' ? '○' :
                             task.status === 'in_progress' ? '◐' :
                             task.status === 'completed' ? '●' : '✗';
          const priorityIcon = task.priority === 'high' ? '↑' :
                               task.priority === 'low' ? '↓' : '-';
          const desc = task.description.slice(0, 40) + (task.description.length > 40 ? '...' : '');
          const created = new Date(task.createdAt).toLocaleDateString();
          output += `| ${statusIcon} | ${priorityIcon} | ${task.id} | ${desc} | ${created} |\n`;
        }

        context.emit('text', output);
        context.emit('done');
        return { handled: true };
      }

      // Add a task
      if (sub === 'add') {
        let priority: TaskPriority = 'normal';
        let descriptionParts = parts.slice(1);

        // Check for priority flag
        if (descriptionParts[0] === '-p' && descriptionParts[1]) {
          const p = descriptionParts[1].toLowerCase();
          if (p === 'high' || p === 'normal' || p === 'low') {
            priority = p as TaskPriority;
            descriptionParts = descriptionParts.slice(2);
          }
        }

        const description = descriptionParts.join(' ').trim();
        if (!description) {
          context.emit('text', 'Usage: /tasks add [-p high|normal|low] <description>\n');
          context.emit('done');
          return { handled: true };
        }

        const projectId = context.getActiveProjectId?.() || undefined;
        const task = await addTask(context.cwd, description, priority, projectId);
        const priorityLabel = task.priority === 'high' ? ' (high priority)' :
                              task.priority === 'low' ? ' (low priority)' : '';
        context.emit('text', `Task added${priorityLabel}: ${task.description}\n`);
        context.emit('text', `ID: ${task.id}\n`);
        context.emit('done');
        return { handled: true };
      }

      // Show task details
      if (sub === 'show') {
        const id = parts[1];
        if (!id) {
          context.emit('text', 'Usage: /tasks show <id>\n');
          context.emit('done');
          return { handled: true };
        }

        const { task, matches } = await resolveTaskId(context.cwd, id);
        if (!task) {
          emitResolveError(id, matches, 'Task');
          context.emit('done');
          return { handled: true };
        }

        let output = '\n**Task Details**\n\n';
        output += `**ID:** ${task.id}\n`;
        output += `**Description:** ${task.description}\n`;
        output += `**Status:** ${task.status}\n`;
        output += `**Priority:** ${task.priority}\n`;
        output += `**Created:** ${new Date(task.createdAt).toLocaleString()}\n`;
        if (task.startedAt) {
          output += `**Started:** ${new Date(task.startedAt).toLocaleString()}\n`;
        }
        if (task.completedAt) {
          output += `**Completed:** ${new Date(task.completedAt).toLocaleString()}\n`;
        }
        if (task.result) {
          output += `**Result:** ${task.result}\n`;
        }
        if (task.error) {
          output += `**Error:** ${task.error}\n`;
        }
        if (task.projectId) {
          output += `**Project:** ${task.projectId}\n`;
        }

        context.emit('text', output);
        context.emit('done');
        return { handled: true };
      }

      // Delete a task
      if (sub === 'delete') {
        const id = parts[1];
        if (!id) {
          context.emit('text', 'Usage: /tasks delete <id>\n');
          context.emit('done');
          return { handled: true };
        }

        const { task, matches } = await resolveTaskId(context.cwd, id);
        if (!task) {
          emitResolveError(id, matches, 'Task');
          context.emit('done');
          return { handled: true };
        }

        const deleted = await deleteTask(context.cwd, task.id);
        if (deleted) {
          context.emit('text', `Task deleted: ${task.id}\n`);
        } else {
          context.emit('text', `Task not found: ${task.id}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // Clear tasks
      if (sub === 'clear') {
        const arg = parts[1]?.toLowerCase();
        if (arg === 'done' || arg === 'completed') {
          const count = await clearCompletedTasks(context.cwd);
          context.emit('text', `Cleared ${count} completed/failed task${count !== 1 ? 's' : ''}.\n`);
        } else {
          const count = await clearPendingTasks(context.cwd);
          context.emit('text', `Cleared ${count} pending task${count !== 1 ? 's' : ''}.\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // Change priority
      if (sub === 'priority') {
        const id = parts[1];
        const newPriority = parts[2]?.toLowerCase();
        if (!id || !newPriority) {
          context.emit('text', 'Usage: /tasks priority <id> <high|normal|low>\n');
          context.emit('done');
          return { handled: true };
        }

        if (newPriority !== 'high' && newPriority !== 'normal' && newPriority !== 'low') {
          context.emit('text', 'Priority must be high, normal, or low.\n');
          context.emit('done');
          return { handled: true };
        }

        const { task: resolved, matches } = await resolveTaskId(context.cwd, id);
        if (!resolved) {
          emitResolveError(id, matches, 'Task');
          context.emit('done');
          return { handled: true };
        }

        const task = await updateTask(context.cwd, resolved.id, { priority: newPriority as TaskPriority });
        if (task) {
          context.emit('text', `Task priority updated to ${newPriority}: ${task.description}\n`);
        } else {
          context.emit('text', `Task not found: ${resolved.id}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // Pause queue
      if (sub === 'pause') {
        await setPaused(context.cwd, true);
        context.emit('text', 'Task queue paused. Tasks will not auto-run.\n');
        context.emit('done');
        return { handled: true };
      }

      // Resume queue
      if (sub === 'resume') {
        await setPaused(context.cwd, false);
        context.emit('text', 'Task queue resumed. Tasks will auto-run.\n');
        context.emit('done');
        return { handled: true };
      }

      // Run next task (manual run works even when auto-run is paused)
      if (sub === 'run') {
        const paused = await isPaused(context.cwd);
        if (paused) {
          context.emit('text', 'Note: Auto-run is paused. Running task manually.\n');
        }

        const nextTask = await getNextTask(context.cwd);
        if (!nextTask) {
          context.emit('text', 'No pending tasks to run.\n');
          context.emit('done');
          return { handled: true };
        }

        // Mark as in progress
        const started = await startTask(context.cwd, nextTask.id);
        if (!started) {
          context.emit('text', 'Failed to start task (locked or missing).\n');
          context.emit('done');
          return { handled: true };
        }
        context.emit('text', `Running task: ${nextTask.description}\n`);
        context.emit('done');

        // Return the task description as a prompt to execute
        return {
          handled: false,
          prompt: `Execute the following task:\n\n${nextTask.description}\n\nWhen done, report the result.`,
        };
      }

      context.emit('text', `Unknown tasks command: ${sub}\n`);
      context.emit('text', 'Use /tasks help for available commands.\n');
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /schedule - Schedule a command
 */
/**
 * /schedules - Browse and manage all scheduled commands
 */
export function schedulesCommand(): Command {
  return {
    name: 'schedules',
    description: 'Browse and manage all scheduled commands (active, paused, completed)',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const trimmed = args.trim().toLowerCase();
      const showAll = trimmed.includes('--all');
      const cleanedArgs = trimmed.replace('--all', '').trim();

      // Show interactive panel for no args or 'ui' command
      if (!cleanedArgs || cleanedArgs === 'ui') {
        context.emit('done');
        return { handled: true, showPanel: 'schedules' };
      }

      // Text-based list for 'list' or '--list'
      if (cleanedArgs === 'list' || cleanedArgs === '--list') {
        // By default only show schedules for current session + global
        const schedules = await listSchedules(context.cwd, showAll ? { global: true } : { sessionId: context.sessionId });
        if (schedules.length === 0) {
          context.emit('text', showAll ? 'No schedules found.\n' : 'No schedules found for this session.\n');
          context.emit('done');
          return { handled: true };
        }

        const escapeCell = (value: string) =>
          value.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

        let output = '\n| ID | Status | Next Run | Command |\n';
        output += '|----|--------|----------|---------|\n';
        for (const schedule of schedules.sort((a, b) => (a.nextRunAt || 0) - (b.nextRunAt || 0))) {
          const next = formatRelativeTime(schedule.nextRunAt);
          const cmd = escapeCell(schedule.command.slice(0, 40) + (schedule.command.length > 40 ? '...' : ''));
          output += `| ${schedule.id} | ${schedule.status} | ${next} | ${cmd} |\n`;
        }
        context.emit('text', output);
        context.emit('done');
        return { handled: true };
      }

      // Show help
      context.emit('text', '\n**Schedules** - Manage scheduled commands\n\n');
      context.emit('text', 'Usage:\n');
      context.emit('text', '  /schedules             Open interactive panel (create, delete, pause, resume)\n');
      context.emit('text', '  /schedules ui          Open interactive panel\n');
      context.emit('text', '  /schedules list        Show text table (this session)\n');
      context.emit('text', '  /schedules list --all  Show all schedules\n');
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /heartbeat - View heartbeat status and run history
 */
export function heartbeatCommand(): Command {
  return {
    name: 'heartbeat',
    description: 'View heartbeat status and recent heartbeat runs',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const trimmed = args.trim().toLowerCase();
      const showAll = trimmed.includes('--all');
      const cleanedArgs = trimmed.replace('--all', '').trim();

      const heartbeatState = context.getHeartbeatState?.() ?? null;
      const heartbeatConfig = context.getHeartbeatConfig?.() ?? null;
      const historyPathTemplate = heartbeatConfig?.historyPath;
      const storageDir = context.getStorageDir?.();
      const runsDir = storageDir ? join(storageDir, 'heartbeats', 'runs') : undefined;

      // Show interactive panel for no args or 'ui' command
      if (!cleanedArgs || cleanedArgs === 'ui') {
        context.emit('done');
        return { handled: true, showPanel: 'heartbeat' };
      }

      // Text-based list for 'list' or '--list'
      if (cleanedArgs === 'list' || cleanedArgs === '--list') {
        const canEnumerate =
          !historyPathTemplate || historyPathTemplate.includes('{sessionId}');
        const sessionIds = showAll && canEnumerate
          ? listHeartbeatHistorySessions(runsDir)
          : [context.sessionId];

        const rows: Array<{ sessionId: string; run: Heartbeat }> = [];
        for (const sessionId of sessionIds) {
          const historyPath = resolveHeartbeatHistoryPath(sessionId, historyPathTemplate, storageDir);
          const runs = await readHeartbeatHistory(historyPath, { order: 'desc' });
          for (const run of runs) {
            rows.push({ sessionId, run });
          }
        }

        if (rows.length === 0) {
          context.emit(
            'text',
            showAll
              ? 'No heartbeat runs found.\n'
              : 'No heartbeat runs found for this session.\n'
          );
          context.emit('done');
          return { handled: true };
        }

        rows.sort((a, b) => {
          const aTime = new Date(a.run.timestamp).getTime();
          const bTime = new Date(b.run.timestamp).getTime();
          return bTime - aTime;
        });

        const rel = (iso?: string) =>
          formatRelativeTime(iso ? new Date(iso).getTime() : undefined);

        if (heartbeatState) {
          const stateLine = `State: ${heartbeatState.state} | ` +
            `Stale: ${heartbeatState.isStale ? 'yes' : 'no'} | ` +
            `Last Activity: ${rel(heartbeatState.lastActivity)}`;
          context.emit('text', `\n**Heartbeat Status**\n${stateLine}\n\n`);
        }

        const escapeCell = (value: string) =>
          value.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

        let output = '\n';
        if (showAll) {
          output += '| Session | Time | State | Last Activity | Msgs | Tools | Errors |\n';
          output += '|--------|------|-------|---------------|------|-------|--------|\n';
        } else {
          output += '| Time | State | Last Activity | Msgs | Tools | Errors |\n';
          output += '|------|-------|---------------|------|-------|--------|\n';
        }

        for (const { sessionId, run } of rows) {
          const time = rel(run.timestamp);
          const activity = rel(run.lastActivity);
          const stats = run.stats || { messagesProcessed: 0, toolCallsExecuted: 0, errorsEncountered: 0 };
          if (showAll) {
            output += `| ${escapeCell(sessionId.slice(0, 8))} | ${time} | ${run.state} | ${activity} | ${stats.messagesProcessed} | ${stats.toolCallsExecuted} | ${stats.errorsEncountered} |\n`;
          } else {
            output += `| ${time} | ${run.state} | ${activity} | ${stats.messagesProcessed} | ${stats.toolCallsExecuted} | ${stats.errorsEncountered} |\n`;
          }
        }

        context.emit('text', output);
        if (showAll && historyPathTemplate && !historyPathTemplate.includes('{sessionId}')) {
          context.emit('text', '\nNote: custom heartbeat historyPath does not include {sessionId}; showing current session only.\n');
        }
        context.emit('done');
        return { handled: true };
      }

      if (cleanedArgs === 'status') {
        if (!heartbeatState) {
          context.emit('text', 'Heartbeat status unavailable.\n');
          context.emit('done');
          return { handled: true };
        }
        const rel = (iso?: string) =>
          formatRelativeTime(iso ? new Date(iso).getTime() : undefined);
        context.emit('text', '\n**Heartbeat Status**\n');
        context.emit('text', `State: ${heartbeatState.state}\n`);
        context.emit('text', `Enabled: ${heartbeatState.enabled ? 'yes' : 'no'}\n`);
        context.emit('text', `Stale: ${heartbeatState.isStale ? 'yes' : 'no'}\n`);
        context.emit('text', `Last Activity: ${rel(heartbeatState.lastActivity)}\n`);
        context.emit('text', `Uptime: ${heartbeatState.uptimeSeconds}s\n`);
        context.emit('done');
        return { handled: true };
      }

      // Show help
      context.emit('text', '\n**Heartbeat** - View heartbeat status and run history\n\n');
      context.emit('text', 'Usage:\n');
      context.emit('text', '  /heartbeat             Open interactive panel\n');
      context.emit('text', '  /heartbeat ui          Open interactive panel\n');
      context.emit('text', '  /heartbeat list        Show text table (this session)\n');
      context.emit('text', '  /heartbeat list --all  Show text table for all sessions\n');
      context.emit('text', '  /heartbeat status      Show current heartbeat status\n');
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /orders - Order lifecycle management
 */
export function ordersCommand(): Command {
  return {
    name: 'orders',
    description: 'Manage orders across stores and vendors',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const trimmed = args.trim();
      const [subcommand, ...rest] = trimmed.split(/\s+/);
      const subArgs = rest.join(' ');

      // /orders (no args) → open interactive panel
      if (!subcommand || subcommand === 'ui') {
        context.emit('done');
        return { handled: true, showPanel: 'orders' };
      }

      const manager = context.getOrdersManager?.();
      if (!manager) {
        context.emit('text', 'Orders are not enabled. Set orders.enabled: true in config.\n');
        context.emit('done');
        return { handled: true };
      }

      // /orders list [--status X]
      if (subcommand === 'list') {
        try {
          const statusMatch = subArgs.match(/--status\s+(\S+)/);
          const status = statusMatch?.[1];
          const orders = manager.listOrders({ status: status as any, limit: 20 });
          if (orders.length === 0) {
            context.emit('text', 'No orders found.\n');
          } else {
            context.emit('text', `Orders (${orders.length}):\n\n`);
            for (const order of orders) {
              const amount = order.totalAmount != null ? ` | ${order.currency} ${order.totalAmount.toFixed(2)}` : '';
              const desc = order.description ? ` — ${order.description}` : '';
              context.emit('text', `  ${order.id}: ${order.storeName} [${order.status}]${amount}${desc}\n`);
            }
          }
        } catch (error) {
          context.emit('text', `Error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /orders create <store> [description]
      if (subcommand === 'create') {
        const parts = splitArgs(subArgs);
        const store = parts[0];
        const description = parts.slice(1).join(' ') || undefined;

        if (!store) {
          context.emit('text', 'Usage: /orders create <store> [description]\n');
          context.emit('text', 'Example: /orders create Amazon "New laptop order"\n');
          context.emit('done');
          return { handled: true };
        }

        try {
          const result = manager.createOrder(store, { description });
          if (result.success) {
            context.emit('text', `Order created!\n`);
            context.emit('text', `  ID:    ${result.orderId}\n`);
            context.emit('text', `  Store: ${store}\n`);
            if (description) context.emit('text', `  Desc:  ${description}\n`);
          } else {
            context.emit('text', `Error: ${result.message}\n`);
          }
        } catch (error) {
          context.emit('text', `Error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /orders get <id>
      if (subcommand === 'get') {
        const orderId = subArgs.trim();
        if (!orderId) {
          context.emit('text', 'Usage: /orders get <order-id>\n');
          context.emit('done');
          return { handled: true };
        }

        try {
          const result = manager.getOrder(orderId);
          if (!result) {
            context.emit('text', `Order "${orderId}" not found.\n`);
          } else {
            const { order, items } = result;
            context.emit('text', `Order ${order.id}\n`);
            context.emit('text', `  Store:   ${order.storeName}\n`);
            context.emit('text', `  Status:  ${order.status}\n`);
            if (order.orderNumber) context.emit('text', `  Order #: ${order.orderNumber}\n`);
            if (order.description) context.emit('text', `  Desc:    ${order.description}\n`);
            if (order.totalAmount != null) context.emit('text', `  Total:   ${order.currency} ${order.totalAmount.toFixed(2)}\n`);
            if (order.trackingNumber) context.emit('text', `  Track:   ${order.trackingNumber}\n`);
            if (items.length > 0) {
              context.emit('text', `  Items (${items.length}):\n`);
              for (const item of items) {
                const price = item.totalPrice != null ? ` — $${item.totalPrice.toFixed(2)}` : '';
                context.emit('text', `    - ${item.name} x${item.quantity}${price}\n`);
              }
            }
          }
        } catch (error) {
          context.emit('text', `Error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /orders cancel <id>
      if (subcommand === 'cancel') {
        const orderId = subArgs.trim();
        if (!orderId) {
          context.emit('text', 'Usage: /orders cancel <order-id>\n');
          context.emit('done');
          return { handled: true };
        }

        const result = manager.cancelOrder(orderId);
        context.emit('text', `${result.success ? result.message : `Error: ${result.message}`}\n`);
        context.emit('done');
        return { handled: true };
      }

      // /orders track <id>
      if (subcommand === 'track') {
        const orderId = subArgs.trim();
        if (!orderId) {
          context.emit('text', 'Usage: /orders track <order-id>\n');
          context.emit('done');
          return { handled: true };
        }

        const tracking = manager.getTracking(orderId);
        if (!tracking) {
          context.emit('text', `Order "${orderId}" not found.\n`);
        } else {
          context.emit('text', `Tracking: ${tracking.orderId}\n`);
          context.emit('text', `  Store:    ${tracking.storeName}\n`);
          context.emit('text', `  Status:   ${tracking.status}\n`);
          context.emit('text', `  Track #:  ${tracking.trackingNumber || 'N/A'}\n`);
          if (tracking.trackingUrl) context.emit('text', `  URL:      ${tracking.trackingUrl}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /orders stores
      if (subcommand === 'stores') {
        // /orders stores add <name>
        if (rest[0] === 'add') {
          const name = rest.slice(1).join(' ').trim();
          if (!name) {
            context.emit('text', 'Usage: /orders stores add <store-name>\n');
            context.emit('done');
            return { handled: true };
          }
          const result = manager.addStore(name);
          context.emit('text', `${result.success ? result.message : `Error: ${result.message}`}\n`);
          context.emit('done');
          return { handled: true };
        }

        // /orders stores (list)
        try {
          const stores = manager.listStores();
          if (stores.length === 0) {
            context.emit('text', 'No stores registered. Use /orders stores add <name> to add one.\n');
          } else {
            context.emit('text', `Stores (${stores.length}):\n\n`);
            for (const store of stores) {
              const orders = store.orderCount > 0 ? ` | ${store.orderCount} orders` : '';
              context.emit('text', `  ${store.name} [${store.category}]${orders}\n`);
            }
          }
        } catch (error) {
          context.emit('text', `Error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /orders help
      if (subcommand === 'help') {
        context.emit('text', 'Order Commands:\n\n');
        context.emit('text', '/orders                        Open orders panel\n');
        context.emit('text', '/orders list [--status X]      List orders\n');
        context.emit('text', '/orders create <store> [desc]  Create order\n');
        context.emit('text', '/orders get <id>               Get order details\n');
        context.emit('text', '/orders cancel <id>            Cancel order\n');
        context.emit('text', '/orders track <id>             Get tracking info\n');
        context.emit('text', '/orders stores                 List stores\n');
        context.emit('text', '/orders stores add <name>      Add store\n');
        context.emit('text', '/orders help                   Show this help\n');
        context.emit('done');
        return { handled: true };
      }

      context.emit('text', `Unknown command: ${subcommand}\n`);
      context.emit('text', 'Use /orders help for available commands.\n');
      context.emit('done');
      return { handled: true };
    },
  };
}
