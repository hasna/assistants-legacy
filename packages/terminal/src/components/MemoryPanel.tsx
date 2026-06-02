import React, { useEffect, useMemo, useState } from 'react';
import type { Memory, MemoryStats } from '@hasna/assistants-core';
import { Box, Inline, Text, useInput } from '../ui/ink';
import { themeColor } from '../theme/colors';

interface MemoryPanelProps {
  memories: Memory[];
  stats: MemoryStats | null;
  onRefresh: () => Promise<void>;
  onClose: () => void;
  error?: string | null;
}

type Mode = 'list' | 'detail';

const SCOPE_TAG: Record<Memory['scope'], string> = {
  global: '[G]',
  shared: '[S]',
  private: '[P]',
  session: '[T]',
};

function formatSummary(memory: Memory, maxLen: number = 60): string {
  const raw = memory.summary || (typeof memory.value === 'string'
    ? memory.value
    : JSON.stringify(memory.value));
  if (!raw) return '(empty)';
  return raw.length > maxLen ? `${raw.slice(0, maxLen)}...` : raw;
}

function formatValue(value: unknown, maxLen: number = 800): string {
  const raw = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (!raw) return '(empty)';
  return raw.length > maxLen ? `${raw.slice(0, maxLen)}...\n(truncated)` : raw;
}

export function MemoryPanel({ memories, stats, onRefresh, onClose, error }: MemoryPanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const sorted = useMemo(
    () => [...memories].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [memories]
  );

  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, sorted.length - 1)));
  }, [sorted.length]);

  const selected = sorted[selectedIndex];

  useEffect(() => {
    if (mode === 'detail' && !selected) {
      setMode('list');
    }
  }, [mode, selected]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  useInput((input, key) => {
    if (mode === 'detail') {
      if (key.escape) {
        setMode('list');
        return;
      }
      if (input === 'q' || input === 'Q') {
        onClose();
        return;
      }
      if (input === 'r' || input === 'R') {
        void handleRefresh();
        return;
      }
      return;
    }

    if (key.escape || input === 'q' || input === 'Q') {
      onClose();
      return;
    }
    if (sorted.length === 0) {
      return;
    }
    if (input === 'r' || input === 'R') {
      void handleRefresh();
      return;
    }
    if (key.return && selected) {
      setMode('detail');
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((prev) => (prev === 0 ? sorted.length - 1 : prev - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => (prev === sorted.length - 1 ? 0 : prev + 1));
      return;
    }
    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= 1 && num <= sorted.length) {
      setSelectedIndex(num - 1);
    }
  }, { isActive: true });

  if (mode === 'detail' && selected) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Box marginBottom={1}>
          <Text fg={themeColor('info')} bold>Memory Detail</Text>
        </Box>
        <Box flexDirection="column" borderStyle="round" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1}>
          <Text><Inline fg={themeColor('muted')}>Key:</Inline> {selected.key}</Text>
          <Text><Inline fg={themeColor('muted')}>Scope:</Inline> {selected.scope}{selected.scopeId ? ` (${selected.scopeId})` : ''}</Text>
          <Text><Inline fg={themeColor('muted')}>Category:</Inline> {selected.category}</Text>
          <Text><Inline fg={themeColor('muted')}>Importance:</Inline> {selected.importance}/10</Text>
          <Text><Inline fg={themeColor('muted')}>Tags:</Inline> {selected.tags.length > 0 ? selected.tags.join(', ') : '(none)'}</Text>
          <Text><Inline fg={themeColor('muted')}>Created:</Inline> {selected.createdAt}</Text>
          <Text><Inline fg={themeColor('muted')}>Updated:</Inline> {selected.updatedAt}</Text>
          <Text><Inline fg={themeColor('muted')}>Accessed:</Inline> {selected.accessCount} times</Text>
          <Box marginTop={1}>
            <Text fg={themeColor('muted')}>Value:</Text>
          </Box>
          <Box>
            <Text>{formatValue(selected.value)}</Text>
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text fg={themeColor('muted')}>Esc back | r refresh | q close</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingY={1}>
      <Box flexDirection="row" marginBottom={1} justifyContent="space-between">
        <Box flexDirection="row">
          <Text bold>Memory</Text>
          {stats && (
            <Text fg={themeColor('muted')}>
              {' '}({stats.totalCount} total · G{stats.byScope.global}/S{stats.byScope.shared}/P{stats.byScope.private})
            </Text>
          )}
        </Box>
        <Text fg={themeColor('muted')}>[r]efresh</Text>
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text fg={themeColor('error')}>Error: {error}</Text>
        </Box>
      )}

      <Box flexDirection="column" borderStyle="round" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1}>
        {sorted.length === 0 ? (
          <Box paddingY={1}>
            <Text fg={themeColor('muted')}>No memories yet.</Text>
          </Box>
        ) : (
          sorted.map((memory, index) => {
            const isSelected = index === selectedIndex;
            const summary = formatSummary(memory);
            const scopeTag = SCOPE_TAG[memory.scope];
            return (
              <Box key={memory.id} paddingY={0}>
                <Text bg={isSelected ? themeColor('primary') : undefined} fg={isSelected ? themeColor('text') : "gray"}>
                  {scopeTag} {index + 1}. {memory.key.padEnd(18)} {summary}
                </Text>
              </Box>
            );
          })
        )}
      </Box>

      {isRefreshing && (
        <Box marginTop={1}>
          <Text fg={themeColor('warning')}>Refreshing...</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text fg={themeColor('muted')}>Enter view | Esc close | ↑↓ navigate | 1-9 jump</Text>
      </Box>
    </Box>
  );
}
