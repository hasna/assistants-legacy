import React from 'react';
import { Box, Inline, Text } from '../ui/ink';
import { themeColor } from '../theme/colors';

/**
 * ThinkingBlock renders thinking/reasoning content per OpenCode spec:
 * - "Thinking:" prefix in warning color (orange)
 * - Content in italic
 * - Left border using borderDim color
 */

interface ThinkingBlockProps {
  /** The thinking/reasoning content to display */
  content?: string;
  /** Whether the model is actively thinking (shows animated dots) */
  isActive?: boolean;
}

export function ThinkingBlock({ content, isActive = false }: ThinkingBlockProps) {
  const warningCol = themeColor('warning');
  const accentCol = themeColor('accent');  // purple pipe per OpenCode ref
  const mutedCol = themeColor('muted');

  if (!content && !isActive) {
    return (
      <Box flexDirection="row" width="100%">
        <Text fg={accentCol}>{'\u2502'} </Text>
        <Text fg={warningCol} italic>Thinking</Text>
      </Box>
    );
  }

  if (!content) {
    return (
      <Box flexDirection="row" width="100%">
        <Text fg={accentCol}>{'\u2502'} </Text>
        <Text fg={warningCol} italic>Thinking...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="row" width="100%">
      <Text fg={accentCol}>{'\u2502'} </Text>
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        <Text>
          <Inline fg={warningCol} italic>Thinking: </Inline>
          <Inline fg={mutedCol} italic>{content}</Inline>
        </Text>
      </Box>
    </Box>
  );
}
