import React, { useEffect, useMemo, useState } from 'react';
import type { Memory, MemoryStats } from '@hasna/assistants-core';
import { useSafeInput as useInput } from '../hooks/useSafeInput';

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
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg="cyan"><b>Memory Detail</b></text>
        </box>
        <box flexDirection="column" borderStyle="rounded" borderColor="#d4d4d8" border={["top", "bottom"]} paddingX={1}>
          <text><text fg="gray">Key:</text> {selected.key}</text>
          <text><text fg="gray">Scope:</text> {selected.scope}{selected.scopeId ? ` (${selected.scopeId})` : ''}</text>
          <text><text fg="gray">Category:</text> {selected.category}</text>
          <text><text fg="gray">Importance:</text> {selected.importance}/10</text>
          <text><text fg="gray">Tags:</text> {selected.tags.length > 0 ? selected.tags.join(', ') : '(none)'}</text>
          <text><text fg="gray">Created:</text> {selected.createdAt}</text>
          <text><text fg="gray">Updated:</text> {selected.updatedAt}</text>
          <text><text fg="gray">Accessed:</text> {selected.accessCount} times</text>
          <box marginTop={1}>
            <text fg="gray">Value:</text>
          </box>
          <box>
            <text>{formatValue(selected.value)}</text>
          </box>
        </box>
        <box marginTop={1}>
          <text fg="gray">Esc back | r refresh | q close</text>
        </box>
      </box>
    );
  }

  return (
    <box flexDirection="column" paddingY={1}>
      <box marginBottom={1} justifyContent="space-between">
        <box>
          <text><b>Memory</b></text>
          {stats && (
            <text fg="gray">
              {' '}({stats.totalCount} total · G{stats.byScope.global}/S{stats.byScope.shared}/P{stats.byScope.private})
            </text>
          )}
        </box>
        <text fg="gray">[r]efresh</text>
      </box>

      {error && (
        <box marginBottom={1}>
          <text fg="red">Error: {error}</text>
        </box>
      )}

      <box flexDirection="column" borderStyle="rounded" borderColor="#d4d4d8" border={["top", "bottom"]} paddingX={1}>
        {sorted.length === 0 ? (
          <box paddingY={1}>
            <text fg="gray">No memories yet.</text>
          </box>
        ) : (
          sorted.map((memory, index) => {
            const isSelected = index === selectedIndex;
            const summary = formatSummary(memory);
            const scopeTag = SCOPE_TAG[memory.scope];
            return (
              <box key={memory.id} paddingY={0}>
                <text attributes={isSelected ? 32 : undefined} fg={!isSelected ? "gray" : undefined}>
                  {scopeTag} {index + 1}. {memory.key.padEnd(18)} {summary}
                </text>
              </box>
            );
          })
        )}
      </box>

      {isRefreshing && (
        <box marginTop={1}>
          <text fg="yellow">Refreshing...</text>
        </box>
      )}

      <box marginTop={1}>
        <text fg="gray">Enter view | Esc close | ↑↓ navigate | 1-9 jump</text>
      </box>
    </box>
  );
}
