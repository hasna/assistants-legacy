import React, { useState, useEffect } from 'react';
import type { BudgetStatus } from '@hasna/assistants-core';
import { useSafeInput as useInput } from '../hooks/useSafeInput';

interface SessionEntry {
  id: string;
  label: string | null;
  assistantId: string | null;
  assistantName: string | null;
  isActive: boolean;
  isProcessing: boolean;
  isPaused: boolean;
  cwd: string;
  startedAt: number;
  budgetStatus?: BudgetStatus | null;
  unreadMessages: number;
}

interface AssistantsDashboardProps {
  sessions: SessionEntry[];
  projectBudget?: BudgetStatus | null;
  projectName?: string | null;
  swarmStatus?: string | null;
  swarmTaskProgress?: string | null;
  onSwitchSession: (sessionId: string) => void;
  onMessageAgent: (assistantId: string) => void;
  onPauseResume: (sessionId: string) => void;
  onCancel: () => void;
}

function formatElapsed(startedAt: number): string {
  const elapsed = Date.now() - startedAt;
  if (elapsed < 60000) return `${Math.round(elapsed / 1000)}s`;
  if (elapsed < 3600000) return `${Math.round(elapsed / 60000)}m`;
  return `${Math.round(elapsed / 3600000)}h`;
}

function StateIndicator({ isProcessing, isPaused }: { isProcessing: boolean; isPaused: boolean }) {
  if (isPaused) return <text fg="yellow"><b>PAUSED</b></text>;
  if (isProcessing) return <text fg="green">active</text>;
  return <text fg="gray">idle</text>;
}

export function AssistantsDashboard({
  sessions,
  projectBudget,
  projectName,
  swarmStatus,
  swarmTaskProgress,
  onSwitchSession,
  onMessageAgent,
  onPauseResume,
  onCancel,
}: AssistantsDashboardProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, sessions.length - 1)));
  }, [sessions.length]);

  useInput((input, key) => {
    if (sessions.length === 0) {
      if (key.escape || input === 'q' || input === 'Q') {
        onCancel();
      }
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(sessions.length - 1, prev + 1));
      return;
    }
    if (key.return) {
      const session = sessions[selectedIndex];
      if (session && !session.isActive) {
        onSwitchSession(session.id);
      } else if (session?.isActive) {
        // Active session - just close the dashboard
        onCancel();
      }
      return;
    }
    if (input === 'm' || input === 'M') {
      const session = sessions[selectedIndex];
      if (session?.assistantId) {
        onMessageAgent(session.assistantId);
      }
      return;
    }
    if (input === 'p' || input === 'P') {
      const session = sessions[selectedIndex];
      if (session) {
        onPauseResume(session.id);
      }
      return;
    }
    // Number keys for quick selection
    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= 1 && num <= sessions.length) {
      const session = sessions[num - 1];
      if (session && !session.isActive) {
        onSwitchSession(session.id);
      }
      return;
    }
    if (key.escape || input === 'q' || input === 'Q') {
      onCancel();
      return;
    }
  }, { isActive: true });

  return (
    <box flexDirection="column" paddingY={1}>
      <box marginBottom={1}>
        <text><b>Assistants Dashboard</b></text>
      </box>

      <box flexDirection="column" borderStyle="rounded" borderColor="#d4d4d8" borderLeft={false} borderRight={false} paddingX={1} paddingY={1}>
        {/* Sessions */}
        <text fg="gray"><b>Sessions ({sessions.length}):</b></text>
        {sessions.length === 0 ? (
          <box marginTop={1}><text fg="gray">No active sessions.</text></box>
        ) : (
        <box flexDirection="column" marginTop={1}>
          {sessions.map((session, i) => {
            const isSelected = i === selectedIndex;
            const label = session.label || session.assistantName || `Session ${i + 1}`;

            return (
              <box key={session.id} gap={1}>
                <text attributes={isSelected ? 32 : undefined}>
                  {isSelected ? '>' : ' '} {String(i + 1)}
                </text>
                <text attributes={isSelected ? 1 : undefined} fg={session.isActive ? 'green' : undefined}><b>
                  {label.slice(0, 20).padEnd(20)}
                </b></text>
                <StateIndicator isProcessing={session.isProcessing} isPaused={session.isPaused} />
                <text fg="gray"> {formatElapsed(session.startedAt)}</text>
                {session.unreadMessages > 0 && (
                  <text fg="yellow"> [{session.unreadMessages} msg]</text>
                )}
                {session.budgetStatus?.overallExceeded && (
                  <text fg="red"> [budget!]</text>
                )}
              </box>
            );
          })}
        </box>
        )}

        {/* Project Budget */}
        {projectBudget && (
          <box marginTop={1} flexDirection="column">
            <text fg="gray"><b>Project Budget{projectName ? `: ${projectName}` : ''}:</b></text>
            <box paddingLeft={1}>
              <text fg="gray">Tokens: </text>
              <text>{projectBudget.usage.totalTokens.toLocaleString()}</text>
              {projectBudget.limits.maxTotalTokens && (
                <text fg="gray"> / {projectBudget.limits.maxTotalTokens.toLocaleString()}</text>
              )}
              {projectBudget.overallExceeded && (
                <text fg="red"><b> EXCEEDED</b></text>
              )}
            </box>
          </box>
        )}

        {/* Swarm Status */}
        {swarmStatus && (
          <box marginTop={1}>
            <text fg="gray"><b>Swarm: </b></text>
            <text fg={swarmStatus === 'executing' ? 'blue' : swarmStatus === 'completed' ? 'green' : 'gray'}>
              {swarmStatus}
            </text>
            {swarmTaskProgress && (
              <text fg="gray"> ({swarmTaskProgress})</text>
            )}
          </box>
        )}
      </box>

      <box marginTop={1}>
        <text fg="gray">
          ↑↓ navigate | Enter switch | [m]essage | [p]ause/resume | [q]uit
        </text>
      </box>
    </box>
  );
}
