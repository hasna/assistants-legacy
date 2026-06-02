import React, { useEffect, useMemo, useState } from 'react';
import type { RegisteredAssistant, RegistryStats, RegistryAssistantState, AssistantType } from '@hasna/assistants-core';
import { Box, Text, useInput } from '../ui/ink';
import { themeColor } from '../theme/colors';

interface AssistantsPanelProps {
  assistants: RegisteredAssistant[];
  stats: RegistryStats;
  onRefresh: () => void;
  onCancel: () => void;
}

type Mode = 'overview' | 'list' | 'details';

const STATE_COLORS: Record<RegistryAssistantState, string> = {
  idle: themeColor('success'),
  processing: themeColor('warning'),
  waiting_input: themeColor('info'),
  error: themeColor('error'),
  offline: themeColor('muted'),
  stopped: themeColor('muted'),
};

const TYPE_COLORS: Record<AssistantType, string> = {
  assistant: themeColor('info'),
  subassistant: themeColor('accent'),
  coordinator: themeColor('warning'),
  worker: themeColor('success'),
};

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString();
}

export function AssistantsRegistryPanel({
  assistants,
  stats,
  onRefresh,
  onCancel,
}: AssistantsPanelProps) {
  const [mode, setMode] = useState<Mode>('overview');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Sort assistants by registration time (most recent first)
  const sortedAssistants = useMemo(() => {
    return [...assistants].sort((a, b) =>
      new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime()
    );
  }, [assistants]);

  const totalItems = sortedAssistants.length;

  useEffect(() => {
    if (sortedAssistants.length === 0) {
      setSelectedIndex(0);
      if (mode !== 'overview') {
        setMode('overview');
      }
      return;
    }
    setSelectedIndex((prev) => Math.min(prev, sortedAssistants.length - 1));
  }, [sortedAssistants.length, mode]);

  useInput((input, key) => {
    // Navigation in list/details mode
    if (mode === 'list' || mode === 'details') {
      if (key.upArrow) {
        setSelectedIndex((prev) => (prev === 0 ? Math.max(0, totalItems - 1) : prev - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((prev) => (prev >= totalItems - 1 ? 0 : prev + 1));
        return;
      }

      // Show details
      if (mode === 'list' && (key.return || input === 'd' || input === 'D')) {
        if (sortedAssistants.length > 0) {
          setMode('details');
        }
        return;
      }

      // Back to list/overview
      if (key.escape || input === '\x1b' || input === 'b' || input === 'B') {
        if (mode === 'details') {
          setMode('list');
        } else {
          setMode('overview');
          setSelectedIndex(0);
        }
        return;
      }
    }

    // Overview mode shortcuts
    if (mode === 'overview') {
      // View assistants list
      if (input === 'a' || input === 'A') {
        setMode('list');
        setSelectedIndex(0);
        return;
      }

      // Refresh
      if (input === 'r' || input === 'R') {
        onRefresh();
        return;
      }
    }

    // Quit
    if (key.escape || input === '\x1b' || input === 'q' || input === 'Q') {
      onCancel();
      return;
    }
  }, { isActive: true });

  // Details mode - show full assistant info
  if (mode === 'details' && sortedAssistants.length > 0) {
    const assistant = sortedAssistants[selectedIndex];

    return (
      <Box flexDirection="column" paddingY={1}>
        <Box flexDirection="row" marginBottom={1} justifyContent="space-between">
          <Text bold>Assistant Details</Text>
          <Text fg={themeColor('muted')}>{selectedIndex + 1} of {sortedAssistants.length}</Text>
        </Box>

        <Box flexDirection="column" borderStyle="round" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} paddingY={1}>
          {/* Identity */}
          <Box marginBottom={1} flexDirection="column">
            <Box>
              <Text bold>{assistant.name}</Text>
              <Text fg={themeColor('muted')}> ({assistant.id.slice(0, 12)}...)</Text>
            </Box>
            {assistant.description && (
              <Box paddingLeft={1}>
                <Text fg={themeColor('muted')}>{assistant.description}</Text>
              </Box>
            )}
          </Box>

          {/* Type & State */}
          <Box marginBottom={1} flexDirection="column">
            <Box>
              <Text fg={themeColor('muted')}>Type: </Text>
              <Text fg={TYPE_COLORS[assistant.type]}>{assistant.type}</Text>
            </Box>
            <Box>
              <Text fg={themeColor('muted')}>State: </Text>
              <Text fg={STATE_COLORS[assistant.status.state]}>{assistant.status.state}</Text>
              {assistant.status.currentTask && (
                <Text fg={themeColor('muted')}> ({assistant.status.currentTask})</Text>
              )}
            </Box>
          </Box>

          {/* Relationships */}
          {(assistant.parentId || assistant.childIds.length > 0) && (
            <Box marginBottom={1} flexDirection="column">
              {assistant.parentId && (
                <Box>
                  <Text fg={themeColor('muted')}>Parent: </Text>
                  <Text>{assistant.parentId.slice(0, 16)}...</Text>
                </Box>
              )}
              {assistant.childIds.length > 0 && (
                <Box>
                  <Text fg={themeColor('muted')}>Children: </Text>
                  <Text>{assistant.childIds.length}</Text>
                </Box>
              )}
            </Box>
          )}

          {/* Capabilities */}
          <Box marginBottom={1} flexDirection="column">
            <Text fg={themeColor('muted')} bold>Capabilities:</Text>
            {assistant.capabilities.tools.length > 0 && (
              <Box paddingLeft={1}>
                <Text fg={themeColor('muted')}>Tools: </Text>
                <Text>{assistant.capabilities.tools.slice(0, 5).join(', ')}</Text>
                {assistant.capabilities.tools.length > 5 && (
                  <Text fg={themeColor('muted')}> +{assistant.capabilities.tools.length - 5} more</Text>
                )}
              </Box>
            )}
            {assistant.capabilities.skills.length > 0 && (
              <Box paddingLeft={1}>
                <Text fg={themeColor('muted')}>Skills: </Text>
                <Text>{assistant.capabilities.skills.join(', ')}</Text>
              </Box>
            )}
            {assistant.capabilities.tags.length > 0 && (
              <Box paddingLeft={1}>
                <Text fg={themeColor('muted')}>Tags: </Text>
                <Text>{assistant.capabilities.tags.join(', ')}</Text>
              </Box>
            )}
          </Box>

          {/* Load */}
          <Box marginBottom={1} flexDirection="column">
            <Text fg={themeColor('muted')} bold>Load:</Text>
            <Box paddingLeft={1}>
              <Text fg={themeColor('muted')}>Active Tasks: </Text>
              <Text>{assistant.load.activeTasks}</Text>
              <Text fg={themeColor('muted')}> | Queued: </Text>
              <Text>{assistant.load.queuedTasks}</Text>
            </Box>
            <Box paddingLeft={1}>
              <Text fg={themeColor('muted')}>Tokens: </Text>
              <Text>{assistant.load.tokensUsed.toLocaleString()}</Text>
              <Text fg={themeColor('muted')}> | LLM Calls: </Text>
              <Text>{assistant.load.llmCalls}</Text>
            </Box>
            <Box paddingLeft={1}>
              <Text fg={themeColor('muted')}>Depth: </Text>
              <Text>{assistant.load.currentDepth}</Text>
              {assistant.capabilities.maxDepth && (
                <Text fg={themeColor('muted')}>/{assistant.capabilities.maxDepth}</Text>
              )}
            </Box>
          </Box>

          {/* Status Metrics */}
          <Box marginBottom={1} flexDirection="column">
            <Text fg={themeColor('muted')} bold>Metrics:</Text>
            <Box paddingLeft={1}>
              <Text fg={themeColor('muted')}>Uptime: </Text>
              <Text>{formatUptime(assistant.status.uptime)}</Text>
            </Box>
            <Box paddingLeft={1}>
              <Text fg={themeColor('muted')}>Messages: </Text>
              <Text>{assistant.status.messagesProcessed}</Text>
            </Box>
            <Box paddingLeft={1}>
              <Text fg={themeColor('muted')}>Tool Calls: </Text>
              <Text>{assistant.status.toolCallsExecuted}</Text>
            </Box>
            <Box paddingLeft={1}>
              <Text fg={themeColor('muted')}>Errors: </Text>
              <Text fg={assistant.status.errorsCount > 0 ? themeColor('error') : themeColor('text')}>{assistant.status.errorsCount}</Text>
            </Box>
          </Box>

          {/* Heartbeat */}
          <Box flexDirection="column">
            <Text fg={themeColor('muted')} bold>Heartbeat:</Text>
            <Box paddingLeft={1}>
              <Text fg={themeColor('muted')}>Last: </Text>
              <Text>{formatTimestamp(assistant.heartbeat.lastHeartbeat)}</Text>
              {assistant.heartbeat.isStale && (
                <Text fg={themeColor('error')}> (stale)</Text>
              )}
            </Box>
          </Box>
        </Box>

        <Box marginTop={1}>
          <Text fg={themeColor('muted')}>↑↓ navigate [b]ack [q]uit</Text>
        </Box>
      </Box>
    );
  }

  // List mode - show all assistants
  if (mode === 'list') {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Box flexDirection="row" marginBottom={1} justifyContent="space-between">
          <Text bold>Registered Assistants</Text>
          <Text fg={themeColor('muted')}>{sortedAssistants.length} assistant{sortedAssistants.length !== 1 ? 's' : ''}</Text>
        </Box>

        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={themeColor('border')} border={["top", "bottom"]}
          paddingX={1}
          height={Math.min(14, sortedAssistants.length + 2)}
          overflow="hidden"
        >
          {sortedAssistants.length === 0 ? (
            <Box paddingY={1}>
              <Text fg={themeColor('muted')}>No assistants registered.</Text>
            </Box>
          ) : (
            sortedAssistants.map((item, index) => {
              const isSelected = index === selectedIndex;
              const stateColor = STATE_COLORS[item.status.state];
              const typeColor = TYPE_COLORS[item.type];

              return (
                <Box key={item.id}>
                  <Text bg={isSelected ? themeColor('primary') : undefined} fg={isSelected ? themeColor('text') : undefined}>
                    {isSelected ? '>' : ' '}{' '}
                    <Text fg={stateColor}>[{item.status.state.slice(0, 4).padEnd(4)}]</Text>{' '}
                    <Text bold={isSelected}>{item.name.slice(0, 18).padEnd(18)}</Text>{' '}
                    <Text fg={typeColor}>{item.type.slice(0, 8).padEnd(8)}</Text>{' '}
                    <Text fg={themeColor('muted')}>{formatTimestamp(item.registeredAt)}</Text>
                  </Text>
                </Box>
              );
            })
          )}
        </Box>

        <Box marginTop={1}>
          <Text fg={themeColor('muted')}>↑↓ navigate [d]etails [b]ack [q]uit</Text>
        </Box>
      </Box>
    );
  }

  // Overview mode (default)
  const activeAssistants = sortedAssistants.filter(a => a.status.state !== 'offline' && !a.heartbeat.isStale);
  const processingAssistants = sortedAssistants.filter(a => a.status.state === 'processing');

  return (
    <Box flexDirection="column" paddingY={1}>
      <Box flexDirection="row" marginBottom={1} justifyContent="space-between">
        <Text bold>Assistant Registry</Text>
        <Text fg={themeColor('muted')}>
          {activeAssistants.length}/{sortedAssistants.length} active
        </Text>
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} paddingY={1}>
        {/* Summary Stats */}
        <Box marginBottom={1} flexDirection="column">
          <Box>
            <Text fg={themeColor('muted')}>Total Assistants: </Text>
            <Text bold>{stats.totalAssistants}</Text>
          </Box>
          <Box>
            <Text fg={themeColor('muted')}>Active: </Text>
            <Text fg={themeColor('success')}>{activeAssistants.length}</Text>
            {processingAssistants.length > 0 && (
              <>
                <Text fg={themeColor('muted')}> | Processing: </Text>
                <Text fg={themeColor('warning')}>{processingAssistants.length}</Text>
              </>
            )}
            {stats.staleCount > 0 && (
              <>
                <Text fg={themeColor('muted')}> | Stale: </Text>
                <Text fg={themeColor('error')}>{stats.staleCount}</Text>
              </>
            )}
          </Box>
        </Box>

        {/* By Type */}
        <Box marginBottom={1} flexDirection="column">
          <Text fg={themeColor('muted')} bold>By Type:</Text>
          <Box paddingLeft={1}>
            <Text fg={themeColor('info')}>Assistants: {stats.byType.assistant}</Text>
            <Text fg={themeColor('muted')}> | </Text>
            <Text fg={themeColor('accent')}>Subassistants: {stats.byType.subassistant}</Text>
          </Box>
          <Box paddingLeft={1}>
            <Text fg={themeColor('warning')}>Coordinators: {stats.byType.coordinator}</Text>
            <Text fg={themeColor('muted')}> | </Text>
            <Text fg={themeColor('success')}>Workers: {stats.byType.worker}</Text>
          </Box>
        </Box>

        {/* By State */}
        <Box marginBottom={1} flexDirection="column">
          <Text fg={themeColor('muted')} bold>By State:</Text>
          <Box paddingLeft={1}>
            <Text fg={themeColor('success')}>Idle: {stats.byState.idle}</Text>
            <Text fg={themeColor('muted')}> | </Text>
            <Text fg={themeColor('warning')}>Processing: {stats.byState.processing}</Text>
            <Text fg={themeColor('muted')}> | </Text>
            <Text fg={themeColor('info')}>Waiting: {stats.byState.waiting_input}</Text>
          </Box>
          <Box paddingLeft={1}>
            <Text fg={themeColor('error')}>Error: {stats.byState.error}</Text>
            <Text fg={themeColor('muted')}> | </Text>
            <Text fg={themeColor('muted')}>Offline: {stats.byState.offline}</Text>
            <Text fg={themeColor('muted')}> | </Text>
            <Text fg={themeColor('muted')}>Stopped: {stats.byState.stopped}</Text>
          </Box>
        </Box>

        {/* Average Load */}
        <Box flexDirection="column">
          <Box>
            <Text fg={themeColor('muted')}>Average Load: </Text>
            <Text fg={stats.averageLoad > 0.8 ? themeColor('error') : stats.averageLoad > 0.5 ? themeColor('warning') : themeColor('success')}>
              {(stats.averageLoad * 100).toFixed(0)}%
            </Text>
          </Box>
          <Box>
            <Text fg={themeColor('muted')}>Registry Uptime: </Text>
            <Text>{formatUptime(stats.uptime)}</Text>
          </Box>
        </Box>

        {/* Quick assistant list preview */}
        {sortedAssistants.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text fg={themeColor('muted')} bold>Recent Assistants:</Text>
            {sortedAssistants.slice(0, 3).map((item) => (
              <Box key={item.id} paddingLeft={1}>
                <Text fg={STATE_COLORS[item.status.state]}>●</Text>
                <Text> {item.name}</Text>
                <Text fg={themeColor('muted')}> ({item.type})</Text>
              </Box>
            ))}
            {sortedAssistants.length > 3 && (
              <Box paddingLeft={1}>
                <Text fg={themeColor('muted')}>+ {sortedAssistants.length - 3} more</Text>
              </Box>
            )}
          </Box>
        )}
      </Box>

      <Box marginTop={1}>
        <Text fg={themeColor('muted')}>[a]ssistants list [r]efresh [q]uit</Text>
      </Box>
    </Box>
  );
}
