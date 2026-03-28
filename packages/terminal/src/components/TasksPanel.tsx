import React, { useEffect, useState } from 'react';
import type { Task, TaskPriority, TaskStatus, TaskCreateOptions } from '@hasna/assistants-core';
import { useSafeInput as useInput } from '../hooks/useSafeInput';
import { themeColor } from '../theme/colors';

interface TasksPanelProps {
  tasks: Task[];
  paused: boolean;
  onAdd: (options: TaskCreateOptions) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRun: (id: string) => Promise<void>;
  onClearPending: () => Promise<void>;
  onClearCompleted: () => Promise<void>;
  onTogglePause: () => Promise<void>;
  onChangePriority: (id: string, priority: TaskPriority) => Promise<void>;
  onClose: () => void;
}

type Mode = 'list' | 'create' | 'delete-confirm' | 'priority-select';
type CreateField = 'description' | 'priority' | 'blockedBy' | 'blocks' | 'assignee';

const STATUS_ICONS: Record<TaskStatus, string> = {
  pending: '○',
  in_progress: '◐',
  completed: '●',
  failed: '✗',
};

const STATUS_COLORS: Record<TaskStatus, string | undefined> = {
  pending: undefined,
  in_progress: 'yellow',
  completed: themeColor('success'),
  failed: 'red',
};

const PRIORITY_ICONS: Record<TaskPriority, string> = {
  high: '↑',
  normal: '-',
  low: '↓',
};

const PRIORITY_COLORS: Record<TaskPriority, string | undefined> = {
  high: 'red',
  normal: undefined,
  low: themeColor('muted'),
};

/**
 * Format date for task display
 */
function formatTaskTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).toLowerCase();
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  }).toLowerCase();
}

export function TasksPanel({
  tasks,
  paused,
  onAdd,
  onDelete,
  onRun,
  onClearPending,
  onClearCompleted,
  onTogglePause,
  onChangePriority,
  onClose,
}: TasksPanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [newDescription, setNewDescription] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>('normal');
  const [newBlockedBy, setNewBlockedBy] = useState<string[]>([]);
  const [newBlocks, setNewBlocks] = useState<string[]>([]);
  const [newAssignee, setNewAssignee] = useState('');
  const [createField, setCreateField] = useState<CreateField>('description');
  const [blockedByIndex, setBlockedByIndex] = useState(0);
  const [blocksIndex, setBlocksIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get pending/in_progress tasks that can be selected as blockers
  const selectableTasks = tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress');

  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, tasks.length)));
  }, [tasks.length]);

  useEffect(() => {
    if ((mode === 'delete-confirm' || mode === 'priority-select') && (tasks.length === 0 || selectedIndex >= tasks.length)) {
      setMode('list');
    }
  }, [mode, tasks.length, selectedIndex]);

  useInput((input, key) => {
    // In create mode, handle navigation between fields
    if (mode === 'create') {
      if (key.escape) {
        setMode('list');
        setNewDescription('');
        setNewPriority('normal');
        setNewBlockedBy([]);
        setNewBlocks([]);
        setNewAssignee('');
        setCreateField('description');
        return;
      }

      // Tab to move to next field
      if (key.tab && !key.shift) {
        const fields: CreateField[] = ['description', 'priority', 'blockedBy', 'blocks', 'assignee'];
        const currentIndex = fields.indexOf(createField);
        const nextIndex = (currentIndex + 1) % fields.length;
        setCreateField(fields[nextIndex]);
        return;
      }

      // Shift+Tab to move to previous field
      if (key.tab && key.shift) {
        const fields: CreateField[] = ['description', 'priority', 'blockedBy', 'blocks', 'assignee'];
        const currentIndex = fields.indexOf(createField);
        const prevIndex = currentIndex === 0 ? fields.length - 1 : currentIndex - 1;
        setCreateField(fields[prevIndex]);
        return;
      }

      // Handle priority field
      if (createField === 'priority') {
        if (key.leftArrow || input === 'h') {
          setNewPriority((prev) => (prev === 'low' ? 'high' : prev === 'high' ? 'normal' : 'low'));
        } else if (key.rightArrow || input === 'l') {
          setNewPriority((prev) => (prev === 'high' ? 'low' : prev === 'low' ? 'normal' : 'high'));
        }
        return;
      }

      // Handle blockedBy field - select tasks to be blocked by
      if (createField === 'blockedBy') {
        if (selectableTasks.length > 0) {
          if (key.upArrow) {
            setBlockedByIndex((prev) => (prev === 0 ? selectableTasks.length - 1 : prev - 1));
          } else if (key.downArrow) {
            setBlockedByIndex((prev) => (prev === selectableTasks.length - 1 ? 0 : prev + 1));
          } else if (input === ' ' || key.return) {
            // Toggle selection
            const taskId = selectableTasks[blockedByIndex]?.id;
            if (taskId) {
              setNewBlockedBy((prev) =>
                prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
              );
            }
          }
        }
        return;
      }

      // Handle blocks field - select tasks that this task blocks
      if (createField === 'blocks') {
        if (selectableTasks.length > 0) {
          if (key.upArrow) {
            setBlocksIndex((prev) => (prev === 0 ? selectableTasks.length - 1 : prev - 1));
          } else if (key.downArrow) {
            setBlocksIndex((prev) => (prev === selectableTasks.length - 1 ? 0 : prev + 1));
          } else if (input === ' ' || key.return) {
            // Toggle selection
            const taskId = selectableTasks[blocksIndex]?.id;
            if (taskId) {
              setNewBlocks((prev) =>
                prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
              );
            }
          }
        }
        return;
      }

      // Text input handled by TextInput component for description and assignee
      return;
    }

    // In delete confirmation mode
    if (mode === 'delete-confirm') {
      if (input === 'y' || input === 'Y') {
        const task = tasks[selectedIndex];
        if (task) {
          setIsSubmitting(true);
          onDelete(task.id).finally(() => {
            setIsSubmitting(false);
            setMode('list');
          });
        }
        return;
      }
      if (input === 'n' || input === 'N' || key.escape) {
        setMode('list');
        return;
      }
      return;
    }

    // In priority select mode
    if (mode === 'priority-select') {
      const task = tasks[selectedIndex];
      if (input === 'h' || input === 'H') {
        if (task) {
          setIsSubmitting(true);
          onChangePriority(task.id, 'high').finally(() => {
            setIsSubmitting(false);
            setMode('list');
          });
        }
        return;
      }
      if (input === 'n' || input === 'N') {
        if (task) {
          setIsSubmitting(true);
          onChangePriority(task.id, 'normal').finally(() => {
            setIsSubmitting(false);
            setMode('list');
          });
        }
        return;
      }
      if (input === 'l' || input === 'L') {
        if (task) {
          setIsSubmitting(true);
          onChangePriority(task.id, 'low').finally(() => {
            setIsSubmitting(false);
            setMode('list');
          });
        }
        return;
      }
      if (key.escape) {
        setMode('list');
        return;
      }
      return;
    }

    // List mode shortcuts
    // n: new task
    if (input === 'n' || input === 'N') {
      setMode('create');
      return;
    }

    // d: delete selected task
    if (input === 'd' || input === 'D') {
      if (tasks.length > 0 && selectedIndex < tasks.length) {
        setMode('delete-confirm');
      }
      return;
    }

    // p: change priority of selected task
    if (input === 'p' || input === 'P') {
      if (tasks.length > 0 && selectedIndex < tasks.length) {
        setMode('priority-select');
      }
      return;
    }

    // r: run selected task
    if (input === 'r' || input === 'R') {
      const task = tasks[selectedIndex];
      if (task && task.status === 'pending') {
        setIsSubmitting(true);
        onRun(task.id).finally(() => {
          setIsSubmitting(false);
          onClose();
        });
      }
      return;
    }

    // Space: toggle pause
    if (input === ' ') {
      setIsSubmitting(true);
      onTogglePause().finally(() => {
        setIsSubmitting(false);
      });
      return;
    }

    // c: clear completed
    if (input === 'c' || input === 'C') {
      setIsSubmitting(true);
      onClearCompleted().finally(() => {
        setIsSubmitting(false);
      });
      return;
    }

    // Escape or q: close panel
    if (key.escape || input === 'q' || input === 'Q') {
      onClose();
      return;
    }

    // Enter: run selected task (if pending)
    if (key.return) {
      if (selectedIndex === tasks.length) {
        // "New task" option
        setMode('create');
      } else {
        const task = tasks[selectedIndex];
        if (task && task.status === 'pending') {
          setIsSubmitting(true);
          onRun(task.id).finally(() => {
            setIsSubmitting(false);
            onClose();
          });
        }
      }
      return;
    }

    // Arrow navigation with wraparound
    if (key.upArrow) {
      setSelectedIndex((prev) => (prev === 0 ? tasks.length : prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => (prev === tasks.length ? 0 : prev + 1));
      return;
    }

    // Number keys for quick selection (1-9)
    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= 1 && num <= tasks.length) {
      setSelectedIndex(num - 1);
      return;
    }
  }, { isActive: mode !== 'create' });

  const handleCreateSubmit = async () => {
    if (!newDescription.trim()) return;
    setIsSubmitting(true);
    try {
      await onAdd({
        description: newDescription.trim(),
        priority: newPriority,
        blockedBy: newBlockedBy.length > 0 ? newBlockedBy : undefined,
        blocks: newBlocks.length > 0 ? newBlocks : undefined,
        assignee: newAssignee.trim() || undefined,
      });
      setNewDescription('');
      setNewPriority('normal');
      setNewBlockedBy([]);
      setNewBlocks([]);
      setNewAssignee('');
      setCreateField('description');
      setMode('list');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTaskLabel = (taskId: string): string => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return taskId;
    const desc = task.description.slice(0, 30) + (task.description.length > 30 ? '...' : '');
    return desc;
  };

  // Create mode UI
  if (mode === 'create') {
    const isFieldActive = (field: CreateField) => createField === field;

    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg={themeColor('info')}><b>Add New Task</b></text>
        </box>

        <box flexDirection="column" borderStyle="rounded" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} paddingY={0}>
          {/* Description field */}
          <box flexDirection="row">
            <text bg={isFieldActive('description') ? themeColor('primary') : undefined} fg={isFieldActive('description') ? themeColor('text') : undefined}>
              Task:{' '}
            </text>
            {isFieldActive('description') ? (
              <input
                value={newDescription}
                onChange={setNewDescription}
                onSubmit={() => setCreateField('priority')}
                focused
                placeholder="What needs to be done..."
              />
            ) : (
              <text fg={!newDescription ? "gray" : undefined}>{newDescription || '(empty)'}</text>
            )}
          </box>

          {/* Priority field */}
          <box flexDirection="row" marginTop={0}>
            <text bg={isFieldActive('priority') ? themeColor('primary') : undefined} fg={isFieldActive('priority') ? themeColor('text') : undefined}>
              Priority:{' '}
            </text>
            <text fg={PRIORITY_COLORS[newPriority]}>
              {PRIORITY_ICONS[newPriority]} {newPriority}
            </text>
            {isFieldActive('priority') && <text fg={themeColor('muted')}> (←/→ to change)</text>}
          </box>

          {/* Blocked By field */}
          <box marginTop={0} flexDirection="column">
            <box flexDirection="row">
              <text bg={isFieldActive('blockedBy') ? themeColor('primary') : undefined} fg={isFieldActive('blockedBy') ? themeColor('text') : undefined}>
                Blocked by:{' '}
              </text>
              {newBlockedBy.length > 0 ? (
                <text>{newBlockedBy.map((id) => getTaskLabel(id)).join(', ')}</text>
              ) : (
                <text fg={themeColor('muted')}>(none)</text>
              )}
            </box>
            {isFieldActive('blockedBy') && selectableTasks.length > 0 && (
              <box flexDirection="column" marginLeft={2}>
                {selectableTasks.map((task, idx) => {
                  const isSelected = newBlockedBy.includes(task.id);
                  const isCursor = idx === blockedByIndex;
                  const desc = task.description.slice(0, 35) + (task.description.length > 35 ? '...' : '');
                  return (
                    <text key={task.id} bg={isCursor ? themeColor('primary') : undefined} fg={isCursor ? themeColor('text') : undefined}>
                      {isSelected ? '[x]' : '[ ]'} {desc}
                    </text>
                  );
                })}
                <text fg={themeColor('muted')}>↑/↓ navigate, Space to toggle</text>
              </box>
            )}
            {isFieldActive('blockedBy') && selectableTasks.length === 0 && (
              <box marginLeft={2}><text fg={themeColor('muted')}>No tasks available to select</text></box>
            )}
          </box>

          {/* Blocks field */}
          <box marginTop={0} flexDirection="column">
            <box flexDirection="row">
              <text bg={isFieldActive('blocks') ? themeColor('primary') : undefined} fg={isFieldActive('blocks') ? themeColor('text') : undefined}>
                Blocks:{' '}
              </text>
              {newBlocks.length > 0 ? (
                <text>{newBlocks.map((id) => getTaskLabel(id)).join(', ')}</text>
              ) : (
                <text fg={themeColor('muted')}>(none)</text>
              )}
            </box>
            {isFieldActive('blocks') && selectableTasks.length > 0 && (
              <box flexDirection="column" marginLeft={2}>
                {selectableTasks.map((task, idx) => {
                  const isSelected = newBlocks.includes(task.id);
                  const isCursor = idx === blocksIndex;
                  const desc = task.description.slice(0, 35) + (task.description.length > 35 ? '...' : '');
                  return (
                    <text key={task.id} bg={isCursor ? themeColor('primary') : undefined} fg={isCursor ? themeColor('text') : undefined}>
                      {isSelected ? '[x]' : '[ ]'} {desc}
                    </text>
                  );
                })}
                <text fg={themeColor('muted')}>↑/↓ navigate, Space to toggle</text>
              </box>
            )}
            {isFieldActive('blocks') && selectableTasks.length === 0 && (
              <box marginLeft={2}><text fg={themeColor('muted')}>No tasks available to select</text></box>
            )}
          </box>

          {/* Assignee field */}
          <box flexDirection="row" marginTop={0}>
            <text bg={isFieldActive('assignee') ? themeColor('primary') : undefined} fg={isFieldActive('assignee') ? themeColor('text') : undefined}>
              Assignee:{' '}
            </text>
            {isFieldActive('assignee') ? (
              <input
                value={newAssignee}
                onChange={setNewAssignee}
                onSubmit={handleCreateSubmit}
                focused
                placeholder="assistant name or leave empty"
              />
            ) : (
              <text fg={!newAssignee ? "gray" : undefined}>{newAssignee || '(unassigned)'}</text>
            )}
          </box>

          {/* Submit button hint */}
          <box marginTop={1}>
            <text fg={themeColor('muted')}>
              {createField === 'assignee'
                ? 'Enter: save task | Tab: cycle fields | Esc: cancel'
                : 'Enter: next field | Tab: cycle fields | Esc: cancel'}
            </text>
          </box>
        </box>

        {isSubmitting && (
          <box marginTop={1}>
            <text fg={themeColor('warning')}>Adding task...</text>
          </box>
        )}
      </box>
    );
  }

  // Delete confirmation mode
  if (mode === 'delete-confirm') {
    const task = tasks[selectedIndex];
    if (!task) {
      setMode('list');
      return null;
    }
    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg={themeColor('error')}><b>Delete Task</b></text>
        </box>
        <box marginBottom={1}>
          <text>
            Delete task: &quot;{task.description.slice(0, 50)}{task.description.length > 50 ? '...' : ''}&quot;?
          </text>
        </box>
        <box marginTop={1}>
          <text>
            Press <text fg={themeColor('success')}><b>y</b></text> to confirm or{' '}
            <text fg={themeColor('error')}><b>n</b></text> to cancel
          </text>
        </box>
      </box>
    );
  }

  // Priority select mode
  if (mode === 'priority-select') {
    const task = tasks[selectedIndex];
    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg={themeColor('info')}><b>Change Priority</b></text>
        </box>
        <box marginBottom={1}>
          <text>Task: {task?.description.slice(0, 50)}{(task?.description.length || 0) > 50 ? '...' : ''}</text>
        </box>
        <box marginTop={1} flexDirection="column">
          <text>
            <text fg={themeColor('error')}><b>h</b></text> High priority
          </text>
          <text>
            <text><b>n</b></text> Normal priority
          </text>
          <text>
            <text fg={themeColor('muted')}><b>l</b></text> Low priority
          </text>
        </box>
        <box marginTop={1}>
          <text fg={themeColor('muted')}>Press letter to select | Esc to cancel</text>
        </box>
      </box>
    );
  }

  // Count tasks by status
  const pendingCount = tasks.filter((t) => t.status === 'pending').length;
  const inProgressCount = tasks.filter((t) => t.status === 'in_progress').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const failedCount = tasks.filter((t) => t.status === 'failed').length;

  // List mode UI
  return (
    <box flexDirection="column" paddingY={1}>
      <box flexDirection="row" marginBottom={1} justifyContent="space-between">
        <box flexDirection="row">
          <text><b>Tasks </b></text>
          <text fg={paused ? 'yellow' : themeColor('success')}>
            {paused ? '(Paused)' : '(Active)'}
          </text>
        </box>
        <text fg={themeColor('muted')}>[n]ew [Space]pause</text>
      </box>

      {/* Status summary */}
      <box marginBottom={1}>
        <text fg={themeColor('muted')}>
          {pendingCount} pending, {inProgressCount} running, {completedCount} done, {failedCount} failed
        </text>
      </box>

      <box
        flexDirection="column"
        borderStyle="rounded"
        borderColor={themeColor('border')} border={["top", "bottom"]}
        paddingX={1}
      >
        {tasks.length === 0 ? (
          <box paddingY={1}>
            <text fg={themeColor('muted')}>No tasks yet. Press n to add one.</text>
          </box>
        ) : (
          tasks.map((task, index) => {
            const isSelected = index === selectedIndex;
            const statusIcon = STATUS_ICONS[task.status];
            const statusColor = STATUS_COLORS[task.status];
            const priorityIcon = PRIORITY_ICONS[task.priority];
            const priorityColor = PRIORITY_COLORS[task.priority];
            const time = formatTaskTime(task.createdAt);
            const desc = task.description.slice(0, 40) + (task.description.length > 40 ? '...' : '');

            return (
              <box key={task.id} paddingY={0}>
                <text bg={isSelected ? themeColor('primary') : undefined} fg={isSelected ? themeColor('text') : task.status === 'completed' ? "gray" : undefined}>
                  <text fg={statusColor}>{statusIcon}</text>
                  {' '}
                  <text fg={priorityColor}>[{priorityIcon}]</text>
                  {' '}
                  {index + 1}. {desc.padEnd(42)} {time}
                </text>
              </box>
            );
          })
        )}

        {/* New task option */}
        <box marginTop={1} paddingY={0}>
          <text
            bg={selectedIndex === tasks.length ? themeColor('primary') : undefined}
            fg={selectedIndex === tasks.length ? themeColor('text') : "gray"}
          >
            + Add task (n)
          </text>
        </box>
      </box>

      {/* Selected task details */}
      {tasks.length > 0 && selectedIndex < tasks.length && (() => {
        const task = tasks[selectedIndex];
        const formatTime = (ts: number | undefined) => ts ? new Date(ts).toLocaleString() : 'n/a';
        const getElapsed = () => {
          if (task.status !== 'in_progress' || !task.startedAt) return null;
          const elapsed = Date.now() - task.startedAt;
          const secs = Math.floor(elapsed / 1000);
          const mins = Math.floor(secs / 60);
          const hrs = Math.floor(mins / 60);
          if (hrs > 0) return `${hrs}h ${mins % 60}m elapsed`;
          if (mins > 0) return `${mins}m ${secs % 60}s elapsed`;
          return `${secs}s elapsed`;
        };
        const elapsed = getElapsed();

        return (
          <box marginTop={1} flexDirection="column" borderStyle="rounded" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1}>
            <text wrapMode="word"><b>{task.description}</b></text>

            {/* Timestamps and elapsed time */}
            <box marginTop={0}>
              <text fg={themeColor('muted')}>Created: {formatTime(task.createdAt)}</text>
              {elapsed && <text fg={themeColor('warning')}> | {elapsed}</text>}
            </box>
            {task.startedAt && (
              <text fg={themeColor('muted')}>Started: {formatTime(task.startedAt)}</text>
            )}
            {task.completedAt && (
              <text fg={themeColor('muted')}>Completed: {formatTime(task.completedAt)}</text>
            )}

            {/* Dependencies and assignment */}
            {task.blockedBy && task.blockedBy.length > 0 && (
              <text fg={themeColor('muted')}>Blocked by: {task.blockedBy.map(id => getTaskLabel(id)).join(', ')}</text>
            )}
            {task.blocks && task.blocks.length > 0 && (
              <text fg={themeColor('muted')}>Blocks: {task.blocks.map(id => getTaskLabel(id)).join(', ')}</text>
            )}
            {task.assignee && (
              <text fg={themeColor('muted')}>Assignee: {task.assignee}</text>
            )}
            {task.projectId && (
              <text fg={themeColor('muted')}>Project: {task.projectId}</text>
            )}

            {/* Result/Error */}
            {task.error && (
              <text fg={themeColor('error')}>Error: {task.error}</text>
            )}
            {task.result && (
              <text fg={themeColor('success')}>Result: {task.result}</text>
            )}
          </box>
        );
      })()}

      <box marginTop={1}>
        <text fg={themeColor('muted')}>
          Enter/r run | p priority | d delete | c clear done | Esc close
        </text>
      </box>
    </box>
  );
}
