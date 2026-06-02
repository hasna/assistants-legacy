import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { Heartbeat } from '@hasna/assistants-core';
import type { HeartbeatState } from '@hasna/assistants-shared';
import { Box, Select, Text, useInput, type SelectOption } from '../ui/ink';
import { themeColor } from '../theme/colors';

interface HeartbeatPanelProps {
  runs: Heartbeat[];
  heartbeatState?: HeartbeatState;
  onRefresh: () => Promise<void>;
  onClose: () => void;
}

type Mode = 'list' | 'detail';

function formatRelativeTime(iso: string | undefined): string {
  if (!iso) return 'n/a';
  const now = Date.now();
  const ts = new Date(iso).getTime();
  const diff = now - ts;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

export function HeartbeatPanel({
  runs,
  heartbeatState,
  onRefresh,
  onClose,
}: HeartbeatPanelProps) {
  const [mode, setMode] = useState<Mode>('list');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const sortedRuns = useMemo(() => {
    return [...runs].sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      return bTime - aTime;
    });
  }, [runs]);

  const selectedRun = sortedRuns[selectedIndex];

  useEffect(() => {
    if (mode === 'detail' && !selectedRun) {
      setMode('list');
    }
  }, [mode, selectedRun]);

  const selectOptions: SelectOption<Heartbeat>[] = useMemo(() => {
    return sortedRuns.map((run) => {
      const time = formatRelativeTime(run.timestamp).padEnd(8);
      const activity = formatRelativeTime(run.lastActivity).padEnd(8);
      const stats = run.stats || { messagesProcessed: 0, toolCallsExecuted: 0, errorsEncountered: 0 };
      const summary = `msgs:${stats.messagesProcessed} tools:${stats.toolCallsExecuted} err:${stats.errorsEncountered}`;
      return {
        label: `${time} ${run.state.padEnd(12)} ${activity}`,
        description: summary,
        value: run,
      };
    });
  }, [sortedRuns]);

  const handleSelectFocus = useCallback((run: Heartbeat) => {
    const nextIndex = sortedRuns.indexOf(run);
    if (nextIndex >= 0) {
      setSelectedIndex(nextIndex);
    }
  }, [sortedRuns]);

  const handleSelectConfirm = useCallback((run: Heartbeat) => {
    const nextIndex = sortedRuns.indexOf(run);
    if (nextIndex >= 0) {
      setSelectedIndex(nextIndex);
      setMode('detail');
    }
  }, [sortedRuns]);

  // Handle non-navigation keys (escape, refresh)
  useInput((input, key) => {
    if (mode === 'detail') {
      if (key.escape || input === 'q' || input === 'Q') {
        setMode('list');
      }
      return;
    }

    if (key.escape || input === 'q' || input === 'Q') {
      onClose();
      return;
    }

    if (input === 'r' || input === 'R') {
      void onRefresh();
      return;
    }
  });

  if (mode === 'detail' && selectedRun) {
    return (
      <Box flexDirection="column">
        <Text bold>Heartbeat Run Details</Text>
        <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1}>
          <Text>{JSON.stringify(selectedRun, null, 2)}</Text>
        </Box>
        <Box marginTop={1}>
          <Text fg={themeColor('muted')}>Esc / q to go back</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>Heartbeat</Text>

      <Box marginTop={1}>
        {heartbeatState ? (
          <Text fg={themeColor('muted')}>
            State: {heartbeatState.state} | Stale: {heartbeatState.isStale ? 'yes' : 'no'} | Last Activity:{' '}
            {formatRelativeTime(heartbeatState.lastActivity)} | Uptime: {heartbeatState.uptimeSeconds}s
          </Text>
        ) : (
          <Text fg={themeColor('muted')}>Heartbeat status unavailable.</Text>
        )}
      </Box>

      <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1}>
        {sortedRuns.length === 0 ? (
          <Box paddingY={1}>
            <Text fg={themeColor('muted')}>No heartbeat runs recorded yet.</Text>
          </Box>
        ) : (
          <Select
            options={selectOptions}
            isActive={mode === 'list'}
            wrapSelection={true}
            visibleOptionCount={8}
            focusValue={selectedRun}
            onFocus={handleSelectFocus}
            onSelect={handleSelectConfirm}
          />
        )}
      </Box>

      <Box marginTop={1}>
        <Text fg={themeColor('muted')}>↑↓ navigate | Enter details | r refresh | q quit</Text>
      </Box>
    </Box>
  );
}
