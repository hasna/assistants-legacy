import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { SavedSessionInfo } from '@hasna/assistants-core';
import type { SelectOption } from '@opentui/core';
import { useSafeInput as useInput } from '../hooks/useSafeInput';
import { themeColor } from '../theme/colors';

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

  // Build options for <select>
  const selectOptions: SelectOption[] = useMemo(() => {
    return filteredSessions.map((session) => {
      const time = formatRelativeTime(session.updatedAt).padEnd(8);
      const assistant = (session.assistantId || 'default').slice(0, 12).padEnd(12);
      const messages = String(session.messageCount ?? 0).padStart(4);
      const cwd = truncate(session.cwd ?? '', 48);
      return {
        name: `${time} ${assistant} ${messages} ${cwd}`,
        description: `ID: ${session.id} | ${session.cwd ?? ''}`,
        value: session,
      };
    });
  }, [filteredSessions]);

  const handleSelectChange = useCallback((_index: number, _option: SelectOption | null) => {
    setSelectedIndex(_index);
  }, []);

  const handleSelectConfirm = useCallback((_index: number, _option: SelectOption | null) => {
    if (_option) {
      onResume(_option.value as SavedSessionInfo);
    }
  }, [onResume]);

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
    <box flexDirection="column">
      <text><b>Resume Sessions</b></text>
      <box marginTop={1}>
        <text fg={themeColor('muted')}>
          Filter: {mode === 'cwd' ? 'current folder' : 'all sessions'} | Tab toggle | Enter resume | r refresh | q quit
        </text>
      </box>

      <box marginTop={1} flexDirection="column" borderStyle="rounded" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1}>
        {filteredSessions.length === 0 ? (
          <box paddingY={1}>
            <text fg={themeColor('muted')}>
              {mode === 'cwd'
                ? 'No saved sessions for this folder.'
                : 'No saved sessions found.'}
            </text>
          </box>
        ) : (
          <select
            options={selectOptions}
            focused={true}
            wrapSelection={true}
            showDescription={false}
            showScrollIndicator={true}
            selectedIndex={selectedIndex}
            onChange={handleSelectChange}
            onSelect={handleSelectConfirm}
          />
        )}
      </box>

      {selected && (
        <box marginTop={1} flexDirection="column">
          <text fg={themeColor('muted')}>Selected</text>
          <text>ID: {selected.id}</text>
          <text>Assistant: {selected.assistantId || 'default'}</text>
          <text>Updated: {selected.updatedAt}</text>
          <text>CWD: {selected.cwd}</text>
        </box>
      )}
    </box>
  );
}
