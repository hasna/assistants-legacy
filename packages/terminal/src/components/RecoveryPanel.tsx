import React, { useState, useMemo } from 'react';
import type { RecoverableSession } from '@hasna/assistants-core';
import { Box, Text, useInput } from '../ui/ink';
import { themeColor } from '../theme/colors';

interface RecoveryPanelProps {
  sessions: RecoverableSession[];
  onRecover: (session: RecoverableSession) => void;
  onStartFresh: () => void;
}

const VISIBLE_COUNT = 5;

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getStateLabel(state: string): string {
  return state === 'processing'
    ? 'processing'
    : state === 'waiting_input'
    ? 'waiting for input'
    : 'active';
}

function truncatePath(path: string, maxLen: number): string {
  if (path.length <= maxLen) return path;
  const parts = path.split('/');
  let result = parts[parts.length - 1];
  for (let i = parts.length - 2; i >= 0 && result.length < maxLen - 4; i--) {
    const candidate = parts[i] + '/' + result;
    if (candidate.length > maxLen - 4) break;
    result = candidate;
  }
  return '.../' + result;
}

export function RecoveryPanel({ sessions, onRecover, onStartFresh }: RecoveryPanelProps) {
  // Index 0 = "Start fresh", 1..sessions.length = recoverable sessions
  const [selectedIndex, setSelectedIndex] = useState(0);
  const totalItems = sessions.length + 1;

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => (prev === 0 ? totalItems - 1 : prev - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => (prev === totalItems - 1 ? 0 : prev + 1));
      return;
    }

    if (key.return) {
      if (selectedIndex === 0) {
        onStartFresh();
      } else {
        onRecover(sessions[selectedIndex - 1]);
      }
      return;
    }

    if (key.escape || input === '\x1b') {
      onStartFresh();
      return;
    }
  });

  // Calculate the visible window of session items (excluding "Start fresh" which is always shown)
  const { visibleSessions, startIdx, showUpArrow, showDownArrow } = useMemo(() => {
    const sessionSelectedIdx = selectedIndex - 1; // -1 means "Start fresh" is selected
    const sessionCount = sessions.length;

    if (sessionCount <= VISIBLE_COUNT) {
      return {
        visibleSessions: sessions.map((s, i) => ({ session: s, originalIndex: i })),
        startIdx: 0,
        showUpArrow: false,
        showDownArrow: false,
      };
    }

    // Keep the selected session in the middle of the visible window when possible
    let start = Math.max(0, sessionSelectedIdx - Math.floor(VISIBLE_COUNT / 2));
    start = Math.min(start, sessionCount - VISIBLE_COUNT);
    start = Math.max(0, start);

    const visible = sessions
      .slice(start, start + VISIBLE_COUNT)
      .map((s, i) => ({ session: s, originalIndex: start + i }));

    return {
      visibleSessions: visible,
      startIdx: start,
      showUpArrow: start > 0,
      showDownArrow: start + VISIBLE_COUNT < sessionCount,
    };
  }, [sessions, selectedIndex]);

  const selectedSessionIndex = selectedIndex - 1;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box marginBottom={1}>
        <Text fg={themeColor('warning')} bold>
          Session Recovery
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text fg={themeColor('muted')}>
          {sessions.length} recoverable session{sessions.length !== 1 ? 's' : ''} found.
        </Text>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={themeColor('border')} border={["top", "bottom"]}
        paddingX={1}
        marginBottom={1}
      >
        {/* Start fresh option — always on top */}
        <Box paddingY={0}>
          <Text bg={selectedIndex === 0 ? themeColor('primary') : undefined} fg={selectedIndex === 0 ? themeColor('text') : undefined}>
            {selectedIndex === 0 ? '▶' : ' '} Start fresh (new session)
          </Text>
        </Box>

        {/* Separator */}
        <Box marginY={0}>
          <Text fg={themeColor('muted')}>────────────────────────────────────</Text>
        </Box>

        {/* Scroll up indicator */}
        {showUpArrow && (
          <Box>
            <Text fg={themeColor('muted')}>  ↑ {startIdx} more above</Text>
          </Box>
        )}

        {/* Visible sessions */}
        {visibleSessions.map(({ session, originalIndex }) => {
          const isSelected = originalIndex === selectedSessionIndex;
          const timeAgo = formatTimeAgo(session.lastActivity);
          const cwdDisplay = truncatePath(session.cwd, 30);
          const displayName = session.label || cwdDisplay;
          const msgCount = session.messageCount > 0 ? `${session.messageCount} msgs` : '';
          const modelName = session.model || '';
          const meta = [msgCount, modelName].filter(Boolean).join(', ');

          return (
            <Box key={session.sessionId} flexDirection="column" paddingY={0}>
              <Box>
                <Text bg={isSelected ? themeColor('primary') : undefined} fg={isSelected ? themeColor('text') : undefined}>
                  {isSelected ? '▶' : ' '} {displayName}{' '}
                </Text>
                <Text bg={isSelected ? themeColor('primary') : undefined} fg={isSelected ? themeColor('text') : themeColor('muted')}>
                  ({timeAgo})
                </Text>
                {meta ? (
                  <Text bg={isSelected ? themeColor('primary') : undefined} fg={isSelected ? themeColor('text') : themeColor('muted')}>
                    {' - '}{meta}
                  </Text>
                ) : null}
              </Box>
              {session.lastMessage && (
                <Text fg={themeColor('muted')}>    {'\u2018'}{session.lastMessage}{'\u2019'}</Text>
              )}
            </Box>
          );
        })}

        {/* Scroll down indicator */}
        {showDownArrow && (
          <Box>
            <Text fg={themeColor('muted')}>  ↓ {sessions.length - startIdx - VISIBLE_COUNT} more below</Text>
          </Box>
        )}
      </Box>

      {/* Details of selected session */}
      {selectedSessionIndex >= 0 && selectedSessionIndex < sessions.length && (() => {
        const s = sessions[selectedSessionIndex];
        const details = [
          formatTimeAgo(s.lastActivity),
          getStateLabel(s.heartbeat.state),
          s.messageCount > 0 ? `${s.messageCount} messages` : null,
          s.model || null,
        ].filter(Boolean).join(' · ');
        return (
          <Box flexDirection="column" marginBottom={1}>
            <Text fg={themeColor('muted')}>Selected:</Text>
            <Box>
              <Text>  </Text>
              <Text fg={themeColor('info')}>{s.cwd}</Text>
            </Box>
            <Text>  {details}</Text>
            {s.lastMessage && (
              <Text fg={themeColor('muted')}>  Last: {'\u2018'}{s.lastMessage}{'\u2019'}</Text>
            )}
          </Box>
        );
      })()}

      <Box>
        <Text fg={themeColor('muted')}>
          ↑/↓ navigate · Enter select · Esc fresh start
        </Text>
      </Box>
    </Box>
  );
}
