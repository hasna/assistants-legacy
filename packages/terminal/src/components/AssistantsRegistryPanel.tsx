import React, { useEffect, useMemo, useState } from 'react';
import type { RegisteredAssistant, RegistryStats, RegistryAssistantState, AssistantType } from '@hasna/assistants-core';
import { useSafeInput as useInput } from '../hooks/useSafeInput';
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
  processing: 'yellow',
  waiting_input: 'cyan',
  error: 'red',
  offline: themeColor('muted'),
  stopped: themeColor('muted'),
};

const TYPE_COLORS: Record<AssistantType, string> = {
  assistant: 'cyan',
  subassistant: 'magenta',
  coordinator: 'yellow',
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
      if (key.escape || input === 'b' || input === 'B') {
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
    if (key.escape || input === 'q' || input === 'Q') {
      onCancel();
      return;
    }
  }, { isActive: true });

  // Details mode - show full assistant info
  if (mode === 'details' && sortedAssistants.length > 0) {
    const assistant = sortedAssistants[selectedIndex];

    return (
      <box flexDirection="column" paddingY={1}>
        <box flexDirection="row" marginBottom={1} justifyContent="space-between">
          <text><b>Assistant Details</b></text>
          <text fg={themeColor('muted')}>{selectedIndex + 1} of {sortedAssistants.length}</text>
        </box>

        <box flexDirection="column" borderStyle="rounded" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} paddingY={1}>
          {/* Identity */}
          <box marginBottom={1} flexDirection="column">
            <box>
              <text><b>{assistant.name}</b></text>
              <text fg={themeColor('muted')}> ({assistant.id.slice(0, 12)}...)</text>
            </box>
            {assistant.description && (
              <box paddingLeft={1}>
                <text fg={themeColor('muted')}>{assistant.description}</text>
              </box>
            )}
          </box>

          {/* Type & State */}
          <box marginBottom={1} flexDirection="column">
            <box>
              <text fg={themeColor('muted')}>Type: </text>
              <text fg={TYPE_COLORS[assistant.type]}>{assistant.type}</text>
            </box>
            <box>
              <text fg={themeColor('muted')}>State: </text>
              <text fg={STATE_COLORS[assistant.status.state]}>{assistant.status.state}</text>
              {assistant.status.currentTask && (
                <text fg={themeColor('muted')}> ({assistant.status.currentTask})</text>
              )}
            </box>
          </box>

          {/* Relationships */}
          {(assistant.parentId || assistant.childIds.length > 0) && (
            <box marginBottom={1} flexDirection="column">
              {assistant.parentId && (
                <box>
                  <text fg={themeColor('muted')}>Parent: </text>
                  <text>{assistant.parentId.slice(0, 16)}...</text>
                </box>
              )}
              {assistant.childIds.length > 0 && (
                <box>
                  <text fg={themeColor('muted')}>Children: </text>
                  <text>{assistant.childIds.length}</text>
                </box>
              )}
            </box>
          )}

          {/* Capabilities */}
          <box marginBottom={1} flexDirection="column">
            <text fg={themeColor('muted')}><b>Capabilities:</b></text>
            {assistant.capabilities.tools.length > 0 && (
              <box paddingLeft={1}>
                <text fg={themeColor('muted')}>Tools: </text>
                <text>{assistant.capabilities.tools.slice(0, 5).join(', ')}</text>
                {assistant.capabilities.tools.length > 5 && (
                  <text fg={themeColor('muted')}> +{assistant.capabilities.tools.length - 5} more</text>
                )}
              </box>
            )}
            {assistant.capabilities.skills.length > 0 && (
              <box paddingLeft={1}>
                <text fg={themeColor('muted')}>Skills: </text>
                <text>{assistant.capabilities.skills.join(', ')}</text>
              </box>
            )}
            {assistant.capabilities.tags.length > 0 && (
              <box paddingLeft={1}>
                <text fg={themeColor('muted')}>Tags: </text>
                <text>{assistant.capabilities.tags.join(', ')}</text>
              </box>
            )}
          </box>

          {/* Load */}
          <box marginBottom={1} flexDirection="column">
            <text fg={themeColor('muted')}><b>Load:</b></text>
            <box paddingLeft={1}>
              <text fg={themeColor('muted')}>Active Tasks: </text>
              <text>{assistant.load.activeTasks}</text>
              <text fg={themeColor('muted')}> | Queued: </text>
              <text>{assistant.load.queuedTasks}</text>
            </box>
            <box paddingLeft={1}>
              <text fg={themeColor('muted')}>Tokens: </text>
              <text>{assistant.load.tokensUsed.toLocaleString()}</text>
              <text fg={themeColor('muted')}> | LLM Calls: </text>
              <text>{assistant.load.llmCalls}</text>
            </box>
            <box paddingLeft={1}>
              <text fg={themeColor('muted')}>Depth: </text>
              <text>{assistant.load.currentDepth}</text>
              {assistant.capabilities.maxDepth && (
                <text fg={themeColor('muted')}>/{assistant.capabilities.maxDepth}</text>
              )}
            </box>
          </box>

          {/* Status Metrics */}
          <box marginBottom={1} flexDirection="column">
            <text fg={themeColor('muted')}><b>Metrics:</b></text>
            <box paddingLeft={1}>
              <text fg={themeColor('muted')}>Uptime: </text>
              <text>{formatUptime(assistant.status.uptime)}</text>
            </box>
            <box paddingLeft={1}>
              <text fg={themeColor('muted')}>Messages: </text>
              <text>{assistant.status.messagesProcessed}</text>
            </box>
            <box paddingLeft={1}>
              <text fg={themeColor('muted')}>Tool Calls: </text>
              <text>{assistant.status.toolCallsExecuted}</text>
            </box>
            <box paddingLeft={1}>
              <text fg={themeColor('muted')}>Errors: </text>
              <text fg={assistant.status.errorsCount > 0 ? 'red' : 'white'}>{assistant.status.errorsCount}</text>
            </box>
          </box>

          {/* Heartbeat */}
          <box flexDirection="column">
            <text fg={themeColor('muted')}><b>Heartbeat:</b></text>
            <box paddingLeft={1}>
              <text fg={themeColor('muted')}>Last: </text>
              <text>{formatTimestamp(assistant.heartbeat.lastHeartbeat)}</text>
              {assistant.heartbeat.isStale && (
                <text fg={themeColor('error')}> (stale)</text>
              )}
            </box>
          </box>
        </box>

        <box marginTop={1}>
          <text fg={themeColor('muted')}>↑↓ navigate [b]ack [q]uit</text>
        </box>
      </box>
    );
  }

  // List mode - show all assistants
  if (mode === 'list') {
    return (
      <box flexDirection="column" paddingY={1}>
        <box flexDirection="row" marginBottom={1} justifyContent="space-between">
          <text><b>Registered Assistants</b></text>
          <text fg={themeColor('muted')}>{sortedAssistants.length} assistant{sortedAssistants.length !== 1 ? 's' : ''}</text>
        </box>

        <box
          flexDirection="column"
          borderStyle="rounded"
          borderColor={themeColor('border')} border={["top", "bottom"]}
          paddingX={1}
          height={Math.min(14, sortedAssistants.length + 2)}
          overflow="hidden"
        >
          {sortedAssistants.length === 0 ? (
            <box paddingY={1}>
              <text fg={themeColor('muted')}>No assistants registered.</text>
            </box>
          ) : (
            sortedAssistants.map((item, index) => {
              const isSelected = index === selectedIndex;
              const stateColor = STATE_COLORS[item.status.state];
              const typeColor = TYPE_COLORS[item.type];

              return (
                <box key={item.id}>
                  <text bg={isSelected ? themeColor('primary') : undefined} fg={isSelected ? themeColor('text') : undefined}>
                    {isSelected ? '>' : ' '}{' '}
                    <text fg={stateColor}>[{item.status.state.slice(0, 4).padEnd(4)}]</text>{' '}
                    <text attributes={isSelected ? 1 : undefined}><b>{item.name.slice(0, 18).padEnd(18)}</b></text>{' '}
                    <text fg={typeColor}>{item.type.slice(0, 8).padEnd(8)}</text>{' '}
                    <text fg={themeColor('muted')}>{formatTimestamp(item.registeredAt)}</text>
                  </text>
                </box>
              );
            })
          )}
        </box>

        <box marginTop={1}>
          <text fg={themeColor('muted')}>↑↓ navigate [d]etails [b]ack [q]uit</text>
        </box>
      </box>
    );
  }

  // Overview mode (default)
  const activeAssistants = sortedAssistants.filter(a => a.status.state !== 'offline' && !a.heartbeat.isStale);
  const processingAssistants = sortedAssistants.filter(a => a.status.state === 'processing');

  return (
    <box flexDirection="column" paddingY={1}>
      <box flexDirection="row" marginBottom={1} justifyContent="space-between">
        <text><b>Assistant Registry</b></text>
        <text fg={themeColor('muted')}>
          {activeAssistants.length}/{sortedAssistants.length} active
        </text>
      </box>

      <box flexDirection="column" borderStyle="rounded" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} paddingY={1}>
        {/* Summary Stats */}
        <box marginBottom={1} flexDirection="column">
          <box>
            <text fg={themeColor('muted')}>Total Assistants: </text>
            <text><b>{stats.totalAssistants}</b></text>
          </box>
          <box>
            <text fg={themeColor('muted')}>Active: </text>
            <text fg={themeColor('success')}>{activeAssistants.length}</text>
            {processingAssistants.length > 0 && (
              <>
                <text fg={themeColor('muted')}> | Processing: </text>
                <text fg={themeColor('warning')}>{processingAssistants.length}</text>
              </>
            )}
            {stats.staleCount > 0 && (
              <>
                <text fg={themeColor('muted')}> | Stale: </text>
                <text fg={themeColor('error')}>{stats.staleCount}</text>
              </>
            )}
          </box>
        </box>

        {/* By Type */}
        <box marginBottom={1} flexDirection="column">
          <text fg={themeColor('muted')}><b>By Type:</b></text>
          <box paddingLeft={1}>
            <text fg={themeColor('info')}>Assistants: {stats.byType.assistant}</text>
            <text fg={themeColor('muted')}> | </text>
            <text fg={themeColor('accent')}>Subassistants: {stats.byType.subassistant}</text>
          </box>
          <box paddingLeft={1}>
            <text fg={themeColor('warning')}>Coordinators: {stats.byType.coordinator}</text>
            <text fg={themeColor('muted')}> | </text>
            <text fg={themeColor('success')}>Workers: {stats.byType.worker}</text>
          </box>
        </box>

        {/* By State */}
        <box marginBottom={1} flexDirection="column">
          <text fg={themeColor('muted')}><b>By State:</b></text>
          <box paddingLeft={1}>
            <text fg={themeColor('success')}>Idle: {stats.byState.idle}</text>
            <text fg={themeColor('muted')}> | </text>
            <text fg={themeColor('warning')}>Processing: {stats.byState.processing}</text>
            <text fg={themeColor('muted')}> | </text>
            <text fg={themeColor('info')}>Waiting: {stats.byState.waiting_input}</text>
          </box>
          <box paddingLeft={1}>
            <text fg={themeColor('error')}>Error: {stats.byState.error}</text>
            <text fg={themeColor('muted')}> | </text>
            <text fg={themeColor('muted')}>Offline: {stats.byState.offline}</text>
            <text fg={themeColor('muted')}> | </text>
            <text fg={themeColor('muted')}>Stopped: {stats.byState.stopped}</text>
          </box>
        </box>

        {/* Average Load */}
        <box flexDirection="column">
          <box>
            <text fg={themeColor('muted')}>Average Load: </text>
            <text fg={stats.averageLoad > 0.8 ? 'red' : stats.averageLoad > 0.5 ? 'yellow' : themeColor('success')}>
              {(stats.averageLoad * 100).toFixed(0)}%
            </text>
          </box>
          <box>
            <text fg={themeColor('muted')}>Registry Uptime: </text>
            <text>{formatUptime(stats.uptime)}</text>
          </box>
        </box>

        {/* Quick assistant list preview */}
        {sortedAssistants.length > 0 && (
          <box marginTop={1} flexDirection="column">
            <text fg={themeColor('muted')}><b>Recent Assistants:</b></text>
            {sortedAssistants.slice(0, 3).map((item) => (
              <box key={item.id} paddingLeft={1}>
                <text fg={STATE_COLORS[item.status.state]}>●</text>
                <text> {item.name}</text>
                <text fg={themeColor('muted')}> ({item.type})</text>
              </box>
            ))}
            {sortedAssistants.length > 3 && (
              <box paddingLeft={1}>
                <text fg={themeColor('muted')}>+ {sortedAssistants.length - 3} more</text>
              </box>
            )}
          </box>
        )}
      </box>

      <box marginTop={1}>
        <text fg={themeColor('muted')}>[a]ssistants list [r]efresh [q]uit</text>
      </box>
    </box>
  );
}
