import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import type { SessionInfo } from '@hasna/assistants-core';
import type { PersistedSessionData } from '@hasna/assistants-core';
import { useSafeInput as useInput } from '../hooks/useSafeInput';

interface SessionSelectorProps {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onNew: () => void | Promise<void>;
  onCancel: () => void;
  /** Persisted subagent sessions (shown under their parent with a prefix) */
  subagentSessions?: PersistedSessionData[];
}

/**
 * Format date/time for session display
 */
function formatSessionTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).toLowerCase();
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).toLowerCase();
}

/**
 * Format path for display (abbreviate home directory)
 */
function formatPath(cwd: string): string {
  const home = process.env.HOME || '';
  if (home && cwd.startsWith(home)) {
    return '~' + cwd.slice(home.length);
  }
  return cwd;
}

/**
 * Build a flat display list: parent sessions with their subagent children interleaved
 */
interface DisplayEntry {
  type: 'session' | 'subagent';
  session?: SessionInfo;
  subagent?: PersistedSessionData;
  /** 1-based index for interactive selection (only for sessions, not subagents) */
  sessionIndex?: number;
}

function buildDisplayList(
  sessions: SessionInfo[],
  subagentSessions: PersistedSessionData[]
): DisplayEntry[] {
  // Group subagent sessions by parent
  const subagentsByParent = new Map<string, PersistedSessionData[]>();
  for (const sub of subagentSessions) {
    if (!sub.parentSessionId) continue;
    const existing = subagentsByParent.get(sub.parentSessionId) ?? [];
    existing.push(sub);
    subagentsByParent.set(sub.parentSessionId, existing);
  }

  const entries: DisplayEntry[] = [];
  let sessionIdx = 0;

  for (const session of sessions) {
    sessionIdx++;
    entries.push({ type: 'session', session, sessionIndex: sessionIdx });

    // Add child subagent sessions right after their parent
    const children = subagentsByParent.get(session.id);
    if (children) {
      for (const child of children) {
        entries.push({ type: 'subagent', subagent: child });
      }
    }
  }

  return entries;
}

export function SessionSelector({
  sessions,
  activeSessionId,
  onSelect,
  onNew,
  onCancel,
  subagentSessions = [],
}: SessionSelectorProps) {
  const displayList = buildDisplayList(sessions, subagentSessions);
  // Selectable items = sessions + "new" option (subagent entries are display-only for now)
  const selectableCount = sessions.length;
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, selectableCount));
  }, [selectableCount]);

  useInput((input, key) => {
    // 'n' or 'N' for new session - check first to prioritize
    if (input === 'n' || input === 'N') {
      onNew();
      return;
    }

    // Escape: cancel
    if (key.escape) {
      onCancel();
      return;
    }

    // Enter: select current option
    if (key.return) {
      if (selectedIndex >= selectableCount) {
        // "New session" option or out of bounds
        onNew();
      } else {
        onSelect(sessions[selectedIndex].id);
      }
      return;
    }

    // Arrow navigation
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(selectableCount, prev + 1)); // +1 for "new" option
      return;
    }

    // Number keys for quick selection (1-9)
    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= 1 && num <= selectableCount) {
      onSelect(sessions[num - 1].id);
      return;
    }
  });

  // Track which session index we're at for selection highlighting
  let currentSessionIdx = -1;

  return (
    <Box flexDirection="column" paddingY={1}>
      <Box marginBottom={1}>
        <Text bold>Sessions</Text>
      </Box>

      {displayList.map((entry, i) => {
        if (entry.type === 'session' && entry.session) {
          currentSessionIdx++;
          const session = entry.session;
          const isActive = session.id === activeSessionId;
          const isSelected = currentSessionIdx === selectedIndex;
          const prefix = isActive ? '[*]' : '   ';
          const time = formatSessionTime(session.updatedAt);
          const path = formatPath(session.cwd);
          const processing = session.isProcessing ? ' (processing)' : '';
          const displayName = session.label || path;

          return (
            <Box key={session.id}>
              <Text
                inverse={isSelected}
                color={isActive ? 'green' : undefined}
                dimColor={!isSelected && !isActive}
              >
                {prefix} {entry.sessionIndex}. {time}  {displayName}{processing}
              </Text>
            </Box>
          );
        }

        if (entry.type === 'subagent' && entry.subagent) {
          const sub = entry.subagent;
          const time = formatSessionTime(sub.updatedAt);
          const statusTag = sub.status === 'completed' ? ' (done)' : sub.status === 'active' ? ' (running)' : '';

          return (
            <Box key={sub.id} paddingLeft={3}>
              <Text dimColor color="cyan">
                {'     '}&#8627; {time}  {sub.label || 'subagent'}{statusTag}
              </Text>
            </Box>
          );
        }

        return null;
      })}

      {/* New session option */}
      <Box marginTop={1}>
        <Text
          inverse={selectedIndex === selectableCount}
          dimColor={selectedIndex !== selectableCount}
        >
            + New session (n)
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Enter to select | Esc to cancel | 1-{selectableCount} to switch | n for new
        </Text>
      </Box>
    </Box>
  );
}
