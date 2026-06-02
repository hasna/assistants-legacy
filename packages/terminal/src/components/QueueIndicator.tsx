import React from 'react';
import type { QueuedMessage } from './appTypes';
import { Box, Text } from '../ui/ink';
import { themeColor } from '../theme/colors';

interface QueueIndicatorProps {
  messages: QueuedMessage[];
  maxPreview?: number;
}

const DEFAULT_MAX_PREVIEW = 3;

function truncateQueued(text: string, maxLen: number = 80): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

export function QueueIndicator({
  messages,
  maxPreview = DEFAULT_MAX_PREVIEW,
}: QueueIndicatorProps) {
  if (messages.length === 0) return null;

  const totalCount = messages.length;
  const sorted = [...messages].sort((a, b) => a.queuedAt - b.queuedAt);
  const previewItems = sorted.slice(0, maxPreview);
  const hasMore = totalCount > maxPreview;
  const inlineCount = messages.filter((msg) => msg.mode === 'inline').length;
  const queuedCount = messages.filter((msg) => msg.mode === 'queued').length;

  // Build summary parts
  const parts: string[] = [];
  if (queuedCount > 0) parts.push(`${queuedCount} queued`);
  if (inlineCount > 0) parts.push(`${inlineCount} in-stream`);
  const summary = parts.join(', ');

  return (
    <Box flexDirection="column" marginTop={0} marginBottom={0}>
      {previewItems.map((msg) => (
        <Box key={msg.id}>
          <Text fg={msg.mode === 'inline' ? 'cyan' : 'yellow'}>
            {msg.mode === 'inline' ? '⚡' : '⏳'}{' '}
            {msg.mode === 'inline' ? 'in-stream' : 'queued'}:{' '}
          </Text>
          <Text fg={themeColor('muted')}>"{truncateQueued(msg.content, 60)}"</Text>
        </Box>
      ))}
      {hasMore && (
        <Text fg={themeColor('muted')}>  +{totalCount - maxPreview} more ({summary})</Text>
      )}
    </Box>
  );
}
