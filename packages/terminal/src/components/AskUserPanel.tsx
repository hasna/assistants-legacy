import React from 'react';
import type { AskUserQuestion, AskUserRequest } from '@hasna/assistants-shared';
import { Box, Text } from '../ui/ink';
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
    <Box flexDirection="column" borderStyle="round" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} marginY={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text fg={themeColor('info')} bold>{request.title || 'Question'}</Text>
        <Text fg={themeColor('muted')}>{index + 1}/{total}</Text>
      </Box>
      {request.description && (
        <Box marginTop={1}>
          <Text fg={themeColor('muted')}>{request.description}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text>{question.question}</Text>
      </Box>
      {question.options && question.options.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {question.options.map((opt, idx) => (
            <Text key={`${opt}-${idx}`} fg={themeColor('muted')}>
              • {opt}
            </Text>
          ))}
        </Box>
      )}
      {question.multiline && (
        <Box marginTop={1}>
          <Text fg={themeColor('muted')}>Multi-line answer allowed. Use Alt+Enter to insert newlines.</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text fg={themeColor('muted')}>Session: {sessionId}</Text>
      </Box>
    </Box>
  );
}
