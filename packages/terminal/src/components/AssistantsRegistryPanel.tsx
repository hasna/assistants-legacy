import React, { useEffect, useMemo, useState } from 'react';
import type { RegisteredAssistant, RegistryStats, RegistryAssistantState, AssistantType } from '@hasna/assistants-core';
import { useSafeInput as useInput } from '../hooks/useSafeInput';

interface AssistantsPanelProps {
  assistants: RegisteredAssistant[];
  stats: RegistryStats;
  onRefresh: () => void;
  onCancel: () => void;
}

type Mode = 'overview' | 'list' | 'details';

const STATE_COLORS: Record<RegistryAssistantState, string> = {
  idle: 'green',
  processing: 'yellow',
  waiting_input: 'cyan',
  error: 'red',
  offline: 'gray',
  stopped: 'gray',
};

const TYPE_COLORS: Record<AssistantType, string> = {
  assistant: 'cyan',
  subassistant: 'magenta',
  coordinator: 'yellow',
  worker: 'green',
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
        <box marginBottom={1} justifyContent="space-between">
          <text><b>Assistant Details</b></text>
          <text fg="gray">{selectedIndex + 1} of {sortedAssistants.length}</text>
        </box>

        <box flexDirection="column" borderStyle="rounded" borderColor="#d4d4d8" border={["top", "bottom"]} paddingX={1} paddingY={1}>
          {/* Identity */}
          <box marginBottom={1} flexDirection="column">
            <box>
              <text><b>{assistant.name}</b></text>
              <text fg="gray"> ({assistant.id.slice(0, 12)}...)</text>
            </box>
            {assistant.description && (
              <box paddingLeft={1}>
                <text fg="gray">{assistant.description}</text>
              </box>
            )}
          </box>

          {/* Type & State */}
          <box marginBottom={1} flexDirection="column">
            <box>
              <text fg="gray">Type: </text>
              <text fg={TYPE_COLORS[assistant.type]}>{assistant.type}</text>
            </box>
            <box>
              <text fg="gray">State: </text>
              <text fg={STATE_COLORS[assistant.status.state]}>{assistant.status.state}</text>
              {assistant.status.currentTask && (
                <text fg="gray"> ({assistant.status.currentTask})</text>
              )}
            </box>
          </box>

          {/* Relationships */}
          {(assistant.parentId || assistant.childIds.length > 0) && (
            <box marginBottom={1} flexDirection="column">
              {assistant.parentId && (
                <box>
                  <text fg="gray">Parent: </text>
                  <text>{assistant.parentId.slice(0, 16)}...</text>
                </box>
              )}
              {assistant.childIds.length > 0 && (
                <box>
                  <text fg="gray">Children: </text>
                  <text>{assistant.childIds.length}</text>
                </box>
              )}
            </box>
          )}

          {/* Capabilities */}
          <box marginBottom={1} flexDirection="column">
            <text fg="gray"><b>Capabilities:</b></text>
            {assistant.capabilities.tools.length > 0 && (
              <box paddingLeft={1}>
                <text fg="gray">Tools: </text>
                <text>{assistant.capabilities.tools.slice(0, 5).join(', ')}</text>
                {assistant.capabilities.tools.length > 5 && (
                  <text fg="gray"> +{assistant.capabilities.tools.length - 5} more</text>
                )}
              </box>
            )}
            {assistant.capabilities.skills.length > 0 && (
              <box paddingLeft={1}>
                <text fg="gray">Skills: </text>
                <text>{assistant.capabilities.skills.join(', ')}</text>
              </box>
            )}
            {assistant.capabilities.tags.length > 0 && (
              <box paddingLeft={1}>
                <text fg="gray">Tags: </text>
                <text>{assistant.capabilities.tags.join(', ')}</text>
              </box>
            )}
          </box>

          {/* Load */}
          <box marginBottom={1} flexDirection="column">
            <text fg="gray"><b>Load:</b></text>
            <box paddingLeft={1}>
              <text fg="gray">Active Tasks: </text>
              <text>{assistant.load.activeTasks}</text>
              <text fg="gray"> | Queued: </text>
              <text>{assistant.load.queuedTasks}</text>
            </box>
            <box paddingLeft={1}>
              <text fg="gray">Tokens: </text>
              <text>{assistant.load.tokensUsed.toLocaleString()}</text>
              <text fg="gray"> | LLM Calls: </text>
              <text>{assistant.load.llmCalls}</text>
            </box>
            <box paddingLeft={1}>
              <text fg="gray">Depth: </text>
              <text>{assistant.load.currentDepth}</text>
              {assistant.capabilities.maxDepth && (
                <text fg="gray">/{assistant.capabilities.maxDepth}</text>
              )}
            </box>
          </box>

          {/* Status Metrics */}
          <box marginBottom={1} flexDirection="column">
            <text fg="gray"><b>Metrics:</b></text>
            <box paddingLeft={1}>
              <text fg="gray">Uptime: </text>
              <text>{formatUptime(assistant.status.uptime)}</text>
            </box>
            <box paddingLeft={1}>
              <text fg="gray">Messages: </text>
              <text>{assistant.status.messagesProcessed}</text>
            </box>
            <box paddingLeft={1}>
              <text fg="gray">Tool Calls: </text>
              <text>{assistant.status.toolCallsExecuted}</text>
            </box>
            <box paddingLeft={1}>
              <text fg="gray">Errors: </text>
              <text fg={assistant.status.errorsCount > 0 ? 'red' : 'white'}>{assistant.status.errorsCount}</text>
            </box>
          </box>

          {/* Heartbeat */}
          <box flexDirection="column">
            <text fg="gray"><b>Heartbeat:</b></text>
            <box paddingLeft={1}>
              <text fg="gray">Last: </text>
              <text>{formatTimestamp(assistant.heartbeat.lastHeartbeat)}</text>
              {assistant.heartbeat.isStale && (
                <text fg="red"> (stale)</text>
              )}
            </box>
          </box>
        </box>

        <box marginTop={1}>
          <text fg="gray">↑↓ navigate [b]ack [q]uit</text>
        </box>
      </box>
    );
  }

  // List mode - show all assistants
  if (mode === 'list') {
    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1} justifyContent="space-between">
          <text><b>Registered Assistants</b></text>
          <text fg="gray">{sortedAssistants.length} assistant{sortedAssistants.length !== 1 ? 's' : ''}</text>
        </box>

        <box
          flexDirection="column"
          borderStyle="rounded"
          borderColor="#d4d4d8" border={["top", "bottom"]}
          paddingX={1}
          height={Math.min(14, sortedAssistants.length + 2)}
          overflow="hidden"
        >
          {sortedAssistants.length === 0 ? (
            <box paddingY={1}>
              <text fg="gray">No assistants registered.</text>
            </box>
          ) : (
            sortedAssistants.map((item, index) => {
              const isSelected = index === selectedIndex;
              const stateColor = STATE_COLORS[item.status.state];
              const typeColor = TYPE_COLORS[item.type];

              return (
                <box key={item.id}>
                  <text attributes={isSelected ? 32 : undefined}>
                    {isSelected ? '>' : ' '}{' '}
                    <text fg={stateColor}>[{item.status.state.slice(0, 4).padEnd(4)}]</text>{' '}
                    <text attributes={isSelected ? 1 : undefined}><b>{item.name.slice(0, 18).padEnd(18)}</b></text>{' '}
                    <text fg={typeColor}>{item.type.slice(0, 8).padEnd(8)}</text>{' '}
                    <text fg="gray">{formatTimestamp(item.registeredAt)}</text>
                  </text>
                </box>
              );
            })
          )}
        </box>

        <box marginTop={1}>
          <text fg="gray">↑↓ navigate [d]etails [b]ack [q]uit</text>
        </box>
      </box>
    );
  }

  // Overview mode (default)
  const activeAssistants = sortedAssistants.filter(a => a.status.state !== 'offline' && !a.heartbeat.isStale);
  const processingAssistants = sortedAssistants.filter(a => a.status.state === 'processing');

  return (
    <box flexDirection="column" paddingY={1}>
      <box marginBottom={1} justifyContent="space-between">
        <text><b>Assistant Registry</b></text>
        <text fg="gray">
          {activeAssistants.length}/{sortedAssistants.length} active
        </text>
      </box>

      <box flexDirection="column" borderStyle="rounded" borderColor="#d4d4d8" border={["top", "bottom"]} paddingX={1} paddingY={1}>
        {/* Summary Stats */}
        <box marginBottom={1} flexDirection="column">
          <box>
            <text fg="gray">Total Assistants: </text>
            <text><b>{stats.totalAssistants}</b></text>
          </box>
          <box>
            <text fg="gray">Active: </text>
            <text fg="green">{activeAssistants.length}</text>
            {processingAssistants.length > 0 && (
              <>
                <text fg="gray"> | Processing: </text>
                <text fg="yellow">{processingAssistants.length}</text>
              </>
            )}
            {stats.staleCount > 0 && (
              <>
                <text fg="gray"> | Stale: </text>
                <text fg="red">{stats.staleCount}</text>
              </>
            )}
          </box>
        </box>

        {/* By Type */}
        <box marginBottom={1} flexDirection="column">
          <text fg="gray"><b>By Type:</b></text>
          <box paddingLeft={1}>
            <text fg="cyan">Assistants: {stats.byType.assistant}</text>
            <text fg="gray"> | </text>
            <text fg="magenta">Subassistants: {stats.byType.subassistant}</text>
          </box>
          <box paddingLeft={1}>
            <text fg="yellow">Coordinators: {stats.byType.coordinator}</text>
            <text fg="gray"> | </text>
            <text fg="green">Workers: {stats.byType.worker}</text>
          </box>
        </box>

        {/* By State */}
        <box marginBottom={1} flexDirection="column">
          <text fg="gray"><b>By State:</b></text>
          <box paddingLeft={1}>
            <text fg="green">Idle: {stats.byState.idle}</text>
            <text fg="gray"> | </text>
            <text fg="yellow">Processing: {stats.byState.processing}</text>
            <text fg="gray"> | </text>
            <text fg="cyan">Waiting: {stats.byState.waiting_input}</text>
          </box>
          <box paddingLeft={1}>
            <text fg="red">Error: {stats.byState.error}</text>
            <text fg="gray"> | </text>
            <text fg="gray">Offline: {stats.byState.offline}</text>
            <text fg="gray"> | </text>
            <text fg="gray">Stopped: {stats.byState.stopped}</text>
          </box>
        </box>

        {/* Average Load */}
        <box flexDirection="column">
          <box>
            <text fg="gray">Average Load: </text>
            <text fg={stats.averageLoad > 0.8 ? 'red' : stats.averageLoad > 0.5 ? 'yellow' : 'green'}>
              {(stats.averageLoad * 100).toFixed(0)}%
            </text>
          </box>
          <box>
            <text fg="gray">Registry Uptime: </text>
            <text>{formatUptime(stats.uptime)}</text>
          </box>
        </box>

        {/* Quick assistant list preview */}
        {sortedAssistants.length > 0 && (
          <box marginTop={1} flexDirection="column">
            <text fg="gray"><b>Recent Assistants:</b></text>
            {sortedAssistants.slice(0, 3).map((item) => (
              <box key={item.id} paddingLeft={1}>
                <text fg={STATE_COLORS[item.status.state]}>●</text>
                <text> {item.name}</text>
                <text fg="gray"> ({item.type})</text>
              </box>
            ))}
            {sortedAssistants.length > 3 && (
              <box paddingLeft={1}>
                <text fg="gray">+ {sortedAssistants.length - 3} more</text>
              </box>
            )}
          </box>
        )}
      </box>

      <box marginTop={1}>
        <text fg="gray">[a]ssistants list [r]efresh [q]uit</text>
      </box>
    </box>
  );
}
