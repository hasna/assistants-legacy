/** @jsxImportSource react */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { SavedSessionInfo } from '@hasna/assistants-core';
import { themeColor } from '../theme/colors';
import { Box, Select, Text, useInput, type SelectOption } from '../ui/ink';

type FilterMode = 'cwd' | 'all';

interface ResumePanelProps {
  sessions: SavedSessionInfo[];
  activeCwd: string;
  initialFilter?: FilterMode;
  onResume: (session: SavedSessionInfo) => void;
  onRefresh: () => Promise<void>;
  onClose: () => void;
}

function formatRelativeTime(iso: string | undefined): string {
  if (!iso) return 'n/a';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return 'n/a';
  const diff = Date.now() - ts;
  const seconds = Math.max(0, Math.floor(Math.abs(diff) / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 3)}...`;
}

function normalizeCwd(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/\/+$/, '');
}

export function ResumePanel({
  sessions,
  activeCwd,
  initialFilter,
  onResume,
  onRefresh,
  onClose,
}: ResumePanelProps) {
  const [mode, setMode] = useState<FilterMode>(initialFilter ?? 'cwd');
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setMode(initialFilter ?? 'cwd');
  }, [initialFilter]);

  const normalizedCwd = useMemo(() => normalizeCwd(activeCwd), [activeCwd]);

  const filteredSessions = useMemo(() => {
    if (mode === 'all') return sessions;
    return sessions.filter((session) => normalizeCwd(session.cwd) === normalizedCwd);
  }, [mode, sessions, normalizedCwd]);

  const selected = filteredSessions[selectedIndex];

  // Build options for the Ink Select primitive.
  const selectOptions: SelectOption<string>[] = useMemo(() => {
    return filteredSessions.map((session) => {
      const time = formatRelativeTime(session.updatedAt).padEnd(8);
      const assistant = (session.assistantId || 'default').slice(0, 12).padEnd(12);
      const messages = String(session.messageCount ?? 0).padStart(4);
      const cwd = truncate(session.cwd ?? '', 48);
      return {
        label: `${time} ${assistant} ${messages} ${cwd}`,
        description: `ID: ${session.id} | ${session.cwd ?? ''}`,
        value: session.id,
      };
    });
  }, [filteredSessions]);

  const handleFocus = useCallback((sessionId: string) => {
    setSelectedIndex((current) => {
      const next = filteredSessions.findIndex((session) => session.id === sessionId);
      return next >= 0 ? next : current;
    });
  }, [filteredSessions]);

  const handleSelectConfirm = useCallback((sessionId: string) => {
    const session = filteredSessions.find((candidate) => candidate.id === sessionId);
    if (session) {
      onResume(session);
    }
  }, [filteredSessions, onResume]);

  // Handle non-navigation keys (escape, filter toggle, refresh)
  useInput((input, key) => {
    if (key.escape || input === 'q' || input === 'Q') {
      onClose();
      return;
    }

    if (key.tab || input === 'a' || input === 'A' || input === 'c' || input === 'C') {
      if (input === 'a' || input === 'A') {
        setMode('all');
      } else if (input === 'c' || input === 'C') {
        setMode('cwd');
      } else {
        setMode((prev) => (prev === 'cwd' ? 'all' : 'cwd'));
      }
      setSelectedIndex(0);
      return;
    }

    if (input === 'r' || input === 'R') {
      void onRefresh();
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold>Resume Sessions</Text>
      <Box marginTop={1}>
        <Text fg={themeColor('muted')}>
          Filter: {mode === 'cwd' ? 'current folder' : 'all sessions'} | Tab toggle | Enter resume | r refresh | q quit
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1}>
        {filteredSessions.length === 0 ? (
          <Box paddingY={1}>
            <Text fg={themeColor('muted')}>
              {mode === 'cwd'
                ? 'No saved sessions for this folder.'
                : 'No saved sessions found.'}
            </Text>
          </Box>
        ) : (
          <Select
            options={selectOptions}
            isActive={true}
            wrapSelection={true}
            inlineDescriptions={false}
            visibleOptionCount={10}
            defaultFocusValue={selectOptions[selectedIndex]?.value}
            value={selected?.id}
            onFocus={handleFocus}
            onSelect={handleSelectConfirm}
            onCancel={onClose}
          />
        )}
      </Box>

      {selected && (
        <Box marginTop={1} flexDirection="column">
          <Text fg={themeColor('muted')}>Selected</Text>
          <Text>ID: {selected.id}</Text>
          <Text>Assistant: {selected.assistantId || 'default'}</Text>
          <Text>Updated: {selected.updatedAt}</Text>
          <Text>CWD: {selected.cwd}</Text>
        </Box>
      )}
    </Box>
  );
}
