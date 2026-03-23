import React from 'react';
import type { AskUserQuestion, AskUserRequest } from '@hasna/assistants-shared';

interface AskUserPanelProps {
  sessionId: string;
  request: AskUserRequest;
  question: AskUserQuestion;
  index: number;
  total: number;
}

export function AskUserPanel({
  sessionId,
  request,
  question,
  index,
  total,
}: AskUserPanelProps) {
  return (
    <box flexDirection="column" borderStyle="rounded" borderColor="#d4d4d8" borderLeft={false} borderRight={false} paddingX={1} marginY={1}>
      <box justifyContent="space-between">
        <text fg="cyan"><b>{request.title || 'Question'}</b></text>
        <text fg="gray">{index + 1}/{total}</text>
      </box>
      {request.description && (
        <box marginTop={1}>
          <text fg="gray">{request.description}</text>
        </box>
      )}
      <box marginTop={1}>
        <text>{question.question}</text>
      </box>
      {question.options && question.options.length > 0 && (
        <box flexDirection="column" marginTop={1}>
          {question.options.map((opt, idx) => (
            <text key={`${opt}-${idx}`} fg="gray">
              • {opt}
            </text>
          ))}
        </box>
      )}
      {question.multiline && (
        <box marginTop={1}>
          <text fg="gray">Multi-line answer allowed. Use Alt+Enter to insert newlines.</text>
        </box>
      )}
      <box marginTop={1}>
        <text fg="gray">Session: {sessionId}</text>
      </box>
    </box>
  );
}
