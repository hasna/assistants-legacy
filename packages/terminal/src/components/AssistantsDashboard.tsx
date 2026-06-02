import React, { useState, useEffect } from 'react';
import type { BudgetStatus } from '@hasna/assistants-core';
import { useAppInput as useInput } from '../hooks/useAppInput';
import { themeColor } from '../theme/colors';
import { Box, Bold, Text } from '../ui/ink';

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
  if (isPaused) return <Text fg={themeColor('warning')}><Bold>PAUSED</Bold></Text>;
  if (isProcessing) return <Text fg={themeColor('success')}>active</Text>;
  return <Text fg={themeColor('muted')}>idle</Text>;
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
    <Box flexDirection="column" paddingY={1}>
      <Box marginBottom={1}>
        <Text><Bold>Assistants Dashboard</Bold></Text>
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} paddingY={1}>
        {/* Sessions */}
        <Text fg={themeColor('muted')}><Bold>Sessions ({sessions.length}):</Bold></Text>
        {sessions.length === 0 ? (
          <Box marginTop={1}><Text fg={themeColor('muted')}>No active sessions.</Text></Box>
        ) : (
        <Box flexDirection="column" marginTop={1}>
          {sessions.map((session, i) => {
            const isSelected = i === selectedIndex;
            const label = session.label || session.assistantName || `Session ${i + 1}`;

            return (
              <Box key={session.id} gap={1}>
                <Text bg={isSelected ? themeColor('primary') : undefined} fg={isSelected ? themeColor('text') : undefined}>
                  {isSelected ? '>' : ' '} {String(i + 1)}
                </Text>
                <Text attributes={isSelected ? 1 : undefined} fg={session.isActive ? themeColor('success') : undefined}><Bold>
                  {label.slice(0, 20).padEnd(20)}
                </Bold></Text>
                <StateIndicator isProcessing={session.isProcessing} isPaused={session.isPaused} />
                <Text fg={themeColor('muted')}> {formatElapsed(session.startedAt)}</Text>
                {session.unreadMessages > 0 && (
                  <Text fg={themeColor('warning')}> [{session.unreadMessages} msg]</Text>
                )}
                {session.budgetStatus?.overallExceeded && (
                  <Text fg={themeColor('error')}> [budget!]</Text>
                )}
              </Box>
            );
          })}
        </Box>
        )}

        {/* Project Budget */}
        {projectBudget && (
          <Box marginTop={1} flexDirection="column">
            <Text fg={themeColor('muted')}><Bold>Project Budget{projectName ? `: ${projectName}` : ''}:</Bold></Text>
            <Box paddingLeft={1}>
              <Text fg={themeColor('muted')}>Tokens: </Text>
              <Text>{projectBudget.usage.totalTokens.toLocaleString()}</Text>
              {projectBudget.limits.maxTotalTokens && (
                <Text fg={themeColor('muted')}> / {projectBudget.limits.maxTotalTokens.toLocaleString()}</Text>
              )}
              {projectBudget.overallExceeded && (
                <Text fg={themeColor('error')}><Bold> EXCEEDED</Bold></Text>
              )}
            </Box>
          </Box>
        )}

        {/* Swarm Status */}
        {swarmStatus && (
          <Box marginTop={1}>
            <Text fg={themeColor('muted')}><Bold>Swarm: </Bold></Text>
            <Text fg={swarmStatus === 'executing' ? 'blue' : swarmStatus === 'completed' ? themeColor('success') : themeColor('muted')}>
              {swarmStatus}
            </Text>
            {swarmTaskProgress && (
              <Text fg={themeColor('muted')}> ({swarmTaskProgress})</Text>
            )}
          </Box>
        )}
      </Box>

      <Box marginTop={1}>
        <Text fg={themeColor('muted')}>
          ↑↓ navigate | Enter switch | [m]essage | [p]ause/resume | [q]uit
        </Text>
      </Box>
    </Box>
  );
}
