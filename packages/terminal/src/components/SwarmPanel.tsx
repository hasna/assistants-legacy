import React from 'react';
import type { SerializableSwarmState, SwarmConfig } from '@hasna/assistants-core';
import { useSafeInput as useInput } from '../hooks/useSafeInput';
import { themeColor } from '../theme/colors';

interface SwarmPanelProps {
  state: SerializableSwarmState | null;
  config: SwarmConfig | null;
  memoryStats?: { totalEntries: number; byCategory: Record<string, number> } | null;
  onStop: () => void;
  onCancel: () => void;
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    idle: themeColor('muted'),
    planning: 'cyan',
    executing: 'blue',
    reviewing: 'yellow',
    aggregating: 'magenta',
    completed: themeColor('success'),
    failed: 'red',
    cancelled: 'red',
  };

  return <text fg={colorMap[status] || themeColor('muted')}><b>{status.toUpperCase()}</b></text>;
}

function TaskStatusIcon({ status }: { status: string }) {
  const icons: Record<string, string> = {
    pending: '○',
    assigned: '◐',
    running: '●',
    completed: '✓',
    failed: '✗',
    blocked: '⊘',
    cancelled: '—',
  };
  const colors: Record<string, string> = {
    pending: themeColor('muted'),
    assigned: 'cyan',
    running: 'blue',
    completed: themeColor('success'),
    failed: 'red',
    blocked: 'yellow',
    cancelled: themeColor('muted'),
  };

  return <text fg={colors[status] || themeColor('muted')}>{icons[status] || '?'}</text>;
}

export function SwarmPanel({
  state,
  config,
  memoryStats,
  onStop,
  onCancel,
}: SwarmPanelProps) {
  useInput((input, key) => {
    if (input === 's' || input === 'S') {
      onStop();
      return;
    }
    if (key.escape || input === 'q' || input === 'Q') {
      onCancel();
      return;
    }
  }, { isActive: true });

  if (!state) {
    return (
      <box flexDirection="column" paddingY={1}>
        <text><b>Swarm</b></text>
        <box marginTop={1}>
          <text fg={themeColor('muted')}>No swarm currently running. Use /swarm &lt;goal&gt; to start.</text>
        </box>
        <box marginTop={1}>
          <text fg={themeColor('muted')}>[q]uit</text>
        </box>
      </box>
    );
  }

  const tasks = state.plan?.tasks || [];
  const isRunning = !['completed', 'failed', 'cancelled'].includes(state.status);

  return (
    <box flexDirection="column" paddingY={1}>
      {/* Header */}
      <box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <text><b>Swarm</b></text>
        <StatusBadge status={state.status} />
      </box>

      <box flexDirection="column" borderStyle="rounded" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} paddingY={1}>
        {/* Goal */}
        {state.plan?.goal && (
          <box flexDirection="row" marginBottom={1}>
            <text fg={themeColor('muted')}>Goal: </text>
            <text>{state.plan.goal}</text>
          </box>
        )}

        {/* Task Graph */}
        {tasks.length > 0 && (
          <box flexDirection="column" marginBottom={1}>
            <text fg={themeColor('muted')}><b>Tasks ({state.metrics.completedTasks}/{state.metrics.totalTasks}):</b></text>
            <box flexDirection="column" marginTop={1}>
              {tasks.slice(0, 15).map((task, i) => (
                <box key={task.id || i} gap={1}>
                  <TaskStatusIcon status={task.status} />
                  <text fg={task.status === 'completed' ? "gray" : undefined}>{task.description.slice(0, 60)}</text>
                  {task.assignedAssistantId && (
                    <text fg={themeColor('info')}> [{task.assignedAssistantId.slice(0, 6)}]</text>
                  )}
                </box>
              ))}
              {tasks.length > 15 && (
                <text fg={themeColor('muted')}>  ...and {tasks.length - 15} more</text>
              )}
            </box>
          </box>
        )}

        {/* Metrics */}
        <box flexDirection="column">
          <text fg={themeColor('muted')}><b>Metrics:</b></text>
          <box paddingLeft={1} flexDirection="column">
            <box>
              <text fg={themeColor('muted')}>{'LLM Calls:'.padEnd(16)}</text>
              <text>{state.metrics.llmCalls}</text>
            </box>
            <box>
              <text fg={themeColor('muted')}>{'Tool Calls:'.padEnd(16)}</text>
              <text>{state.metrics.toolCalls}</text>
            </box>
            <box>
              <text fg={themeColor('muted')}>{'Tokens Used:'.padEnd(16)}</text>
              <text>{state.metrics.tokensUsed.toLocaleString()}</text>
              {config?.tokenBudget && config.tokenBudget > 0 && (
                <text fg={themeColor('muted')}> / {config.tokenBudget.toLocaleString()}</text>
              )}
            </box>
            {state.metrics.replans > 0 && (
              <box>
                <text fg={themeColor('muted')}>{'Replans:'.padEnd(16)}</text>
                <text>{state.metrics.replans}</text>
              </box>
            )}
          </box>
        </box>

        {/* Active Assistants */}
        {state.activeAssistants && state.activeAssistants.length > 0 && (
          <box marginTop={1}>
            <text fg={themeColor('muted')}>Active workers: </text>
            <text fg={themeColor('info')}>{state.activeAssistants.length}</text>
          </box>
        )}

        {/* Shared Memory */}
        {memoryStats && memoryStats.totalEntries > 0 && (
          <box marginTop={1} flexDirection="column">
            <text fg={themeColor('muted')}><b>Shared Memory: {memoryStats.totalEntries} entries</b></text>
            <box paddingLeft={1}>
              {Object.entries(memoryStats.byCategory)
                .filter(([_, count]) => count > 0)
                .map(([cat, count]) => (
                  <text key={cat} fg={themeColor('muted')}>{cat}: {count}  </text>
                ))}
            </box>
          </box>
        )}

        {/* Errors */}
        {state.errors && state.errors.length > 0 && (
          <box marginTop={1} flexDirection="column">
            <text fg={themeColor('error')}><b>Errors:</b></text>
            {state.errors.slice(-3).map((err, i) => (
              <text key={i} fg={themeColor('error')}>  - {err.slice(0, 80)}</text>
            ))}
          </box>
        )}
      </box>

      <box marginTop={1}>
        <text fg={themeColor('muted')}>
          {isRunning ? '[s]top ' : ''}[q]uit
        </text>
      </box>
    </box>
  );
}
