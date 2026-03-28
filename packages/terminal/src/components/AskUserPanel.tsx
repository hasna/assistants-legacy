import React from 'react';
import type { AskUserQuestion, AskUserRequest } from '@hasna/assistants-shared';
import { themeColor } from '../theme/colors';

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
    <box flexDirection="column" borderStyle="rounded" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} marginY={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={themeColor('info')}><b>{request.title || 'Question'}</b></text>
        <text fg={themeColor('muted')}>{index + 1}/{total}</text>
      </box>
      {request.description && (
        <box marginTop={1}>
          <text fg={themeColor('muted')}>{request.description}</text>
        </box>
      )}
      <box marginTop={1}>
        <text>{question.question}</text>
      </box>
      {question.options && question.options.length > 0 && (
        <box flexDirection="column" marginTop={1}>
          {question.options.map((opt, idx) => (
            <text key={`${opt}-${idx}`} fg={themeColor('muted')}>
              • {opt}
            </text>
          ))}
        </box>
      )}
      {question.multiline && (
        <box marginTop={1}>
          <text fg={themeColor('muted')}>Multi-line answer allowed. Use Alt+Enter to insert newlines.</text>
        </box>
      )}
      <box marginTop={1}>
        <text fg={themeColor('muted')}>Session: {sessionId}</text>
      </box>
    </box>
  );
}
