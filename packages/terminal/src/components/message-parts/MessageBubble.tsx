/** @jsxImportSource react */
/**
 * Per-type message dispatcher (plan 8d98da29 P4.2) — extracted from Messages.tsx.
 * Routes a message to its role-specific renderer. System messages are
 * intentionally not shown in the transcript (they carry internal context).
 */
import React from 'react';
import type { ToolCall, ToolResult } from '@hasna/assistants-shared';
import type { DisplayMessage } from '../messageLines';
import { Box } from '../../ui/ink';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import { ToolCallsBlock } from './ToolParts';

interface MessageBubbleProps {
  message: DisplayMessage;
  queuedMessageIds?: Set<string>;
  verboseTools?: boolean;
}

export function MessageBubble({ message, queuedMessageIds, verboseTools }: MessageBubbleProps) {
  if (message.role === 'system') return null;

  if (message.role === 'user') {
    return (
      <UserMessage
        message={message}
        queuedMessageIds={queuedMessageIds}
        verboseTools={verboseTools}
      />
    );
  }

  return <AssistantMessage message={message} verboseTools={verboseTools} />;
}

// ============================================
// Combined Tool Message (grouped consecutive tool-only messages)
// ============================================

export function CombinedToolMessage({
  messages,
  verboseTools,
}: {
  messages: DisplayMessage[];
  verboseTools?: boolean;
}) {
  const allToolCalls: ToolCall[] = [];
  const allToolResults: ToolResult[] = [];
  for (const msg of messages) {
    if (msg.toolCalls) allToolCalls.push(...msg.toolCalls);
    if (msg.toolResults) allToolResults.push(...msg.toolResults);
  }

  return (
    <Box flexDirection="column">
      <Box height={1} />
      <ToolCallsBlock toolCalls={allToolCalls} toolResults={allToolResults} verboseTools={verboseTools} />
    </Box>
  );
}
