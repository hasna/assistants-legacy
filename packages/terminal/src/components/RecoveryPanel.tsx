import React, { useState, useMemo } from 'react';
import type { RecoverableSession } from '@hasna/assistants-core';
import { useSafeInput as useInput } from '../hooks/useSafeInput';

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

    if (key.escape) {
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
    <box flexDirection="column" paddingX={1} paddingY={1}>
      <box marginBottom={1}>
        <text fg="yellow"><b>
          Session Recovery
        </b></text>
      </box>

      <box marginBottom={1}>
        <text fg="gray">
          {sessions.length} recoverable session{sessions.length !== 1 ? 's' : ''} found.
        </text>
      </box>

      <box
        flexDirection="column"
        borderStyle="rounded"
        borderColor="#d4d4d8" border={["top", "bottom"]}
        paddingX={1}
        marginBottom={1}
      >
        {/* Start fresh option — always on top */}
        <box paddingY={0}>
          <text attributes={selectedIndex === 0 ? 32 : undefined} fg={selectedIndex === 0 ? 'cyan' : undefined}>
            {selectedIndex === 0 ? '▶' : ' '} Start fresh (new session)
          </text>
        </box>

        {/* Separator */}
        <box marginY={0}>
          <text fg="gray">────────────────────────────────────</text>
        </box>

        {/* Scroll up indicator */}
        {showUpArrow && (
          <box>
            <text fg="gray">  ↑ {startIdx} more above</text>
          </box>
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
            <box key={session.sessionId} flexDirection="column" paddingY={0}>
              <text attributes={isSelected ? 32 : undefined}>
                {isSelected ? '▶' : ' '} {displayName} <text fg="gray">({timeAgo})</text>
                {meta ? <text fg="gray"> — {meta}</text> : null}
              </text>
              {session.lastMessage && (
                <text fg="gray">    {'\u2018'}{session.lastMessage}{'\u2019'}</text>
              )}
            </box>
          );
        })}

        {/* Scroll down indicator */}
        {showDownArrow && (
          <box>
            <text fg="gray">  ↓ {sessions.length - startIdx - VISIBLE_COUNT} more below</text>
          </box>
        )}
      </box>

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
          <box flexDirection="column" marginBottom={1}>
            <text fg="gray">Selected:</text>
            <text>  <text fg="cyan">{s.cwd}</text></text>
            <text>  {details}</text>
            {s.lastMessage && (
              <text fg="gray">  Last: {'\u2018'}{s.lastMessage}{'\u2019'}</text>
            )}
          </box>
        );
      })()}

      <box>
        <text fg="gray">
          ↑/↓ navigate · Enter select · Esc fresh start
        </text>
      </box>
    </box>
  );
}
