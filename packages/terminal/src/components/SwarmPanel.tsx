import React from 'react';
import type { SerializableSwarmState, SwarmConfig } from '@hasna/assistants-core';
import { Box, Text, useInput } from '../ui/ink';
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

  return <Text fg={colorMap[status] || themeColor('muted')} bold>{status.toUpperCase()}</Text>;
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

  return <Text fg={colors[status] || themeColor('muted')}>{icons[status] || '?'}</Text>;
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
    if (key.escape || input === '\x1b' || input === 'q' || input === 'Q') {
      onCancel();
      return;
    }
  }, { isActive: true });

  if (!state) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text bold>Swarm</Text>
        <Box marginTop={1}>
          <Text fg={themeColor('muted')}>No swarm currently running. Use /swarm &lt;goal&gt; to start.</Text>
        </Box>
        <Box marginTop={1}>
          <Text fg={themeColor('muted')}>[q]uit</Text>
        </Box>
      </Box>
    );
  }

  const tasks = state.plan?.tasks || [];
  const isRunning = !['completed', 'failed', 'cancelled'].includes(state.status);

  return (
    <Box flexDirection="column" paddingY={1}>
      {/* Header */}
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Text bold>Swarm</Text>
        <StatusBadge status={state.status} />
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} paddingY={1}>
        {/* Goal */}
        {state.plan?.goal && (
          <Box flexDirection="row" marginBottom={1}>
            <Text fg={themeColor('muted')}>Goal: </Text>
            <Text>{state.plan.goal}</Text>
          </Box>
        )}

        {/* Task Graph */}
        {tasks.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            <Text fg={themeColor('muted')} bold>Tasks ({state.metrics.completedTasks}/{state.metrics.totalTasks}):</Text>
            <Box flexDirection="column" marginTop={1}>
              {tasks.slice(0, 15).map((task, i) => (
                <Box key={task.id || i} gap={1}>
                  <TaskStatusIcon status={task.status} />
                  <Text fg={task.status === 'completed' ? "gray" : undefined}>{task.description.slice(0, 60)}</Text>
                  {task.assignedAssistantId && (
                    <Text fg={themeColor('info')}> [{task.assignedAssistantId.slice(0, 6)}]</Text>
                  )}
                </Box>
              ))}
              {tasks.length > 15 && (
                <Text fg={themeColor('muted')}>  ...and {tasks.length - 15} more</Text>
              )}
            </Box>
          </Box>
        )}

        {/* Metrics */}
        <Box flexDirection="column">
          <Text fg={themeColor('muted')} bold>Metrics:</Text>
          <Box paddingLeft={1} flexDirection="column">
            <Box>
              <Text fg={themeColor('muted')}>{'LLM Calls:'.padEnd(16)}</Text>
              <Text>{state.metrics.llmCalls}</Text>
            </Box>
            <Box>
              <Text fg={themeColor('muted')}>{'Tool Calls:'.padEnd(16)}</Text>
              <Text>{state.metrics.toolCalls}</Text>
            </Box>
            <Box>
              <Text fg={themeColor('muted')}>{'Tokens Used:'.padEnd(16)}</Text>
              <Text>{state.metrics.tokensUsed.toLocaleString()}</Text>
              {config?.tokenBudget && config.tokenBudget > 0 && (
                <Text fg={themeColor('muted')}> / {config.tokenBudget.toLocaleString()}</Text>
              )}
            </Box>
            {state.metrics.replans > 0 && (
              <Box>
                <Text fg={themeColor('muted')}>{'Replans:'.padEnd(16)}</Text>
                <Text>{state.metrics.replans}</Text>
              </Box>
            )}
          </Box>
        </Box>

        {/* Active Assistants */}
        {state.activeAssistants && state.activeAssistants.length > 0 && (
          <Box marginTop={1}>
            <Text fg={themeColor('muted')}>Active workers: </Text>
            <Text fg={themeColor('info')}>{state.activeAssistants.length}</Text>
          </Box>
        )}

        {/* Shared Memory */}
        {memoryStats && memoryStats.totalEntries > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text fg={themeColor('muted')} bold>Shared Memory: {memoryStats.totalEntries} entries</Text>
            <Box paddingLeft={1}>
              {Object.entries(memoryStats.byCategory)
                .filter(([_, count]) => count > 0)
                .map(([cat, count]) => (
                  <Text key={cat} fg={themeColor('muted')}>{cat}: {count}  </Text>
                ))}
            </Box>
          </Box>
        )}

        {/* Errors */}
        {state.errors && state.errors.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text fg={themeColor('error')} bold>Errors:</Text>
            {state.errors.slice(-3).map((err, i) => (
              <Text key={i} fg={themeColor('error')}>  - {err.slice(0, 80)}</Text>
            ))}
          </Box>
        )}
      </Box>

      <Box marginTop={1}>
        <Text fg={themeColor('muted')}>
          {isRunning ? '[s]top ' : ''}[q]uit
        </Text>
      </Box>
    </Box>
  );
}
