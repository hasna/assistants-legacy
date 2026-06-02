import React from 'react';
import { Box, Text } from '../ui/ink';
import { themeColor } from '../theme/colors';

interface EmptyStateProps {
  message: string;
  hint?: string;
}

/**
 * Standardized empty state component for panels.
 */
export function EmptyState({ message, hint }: EmptyStateProps) {
  const muted = themeColor('muted');

  return (
    <Box paddingX={1} flexDirection="column">
      <Text fg={muted}>{message}</Text>
      {hint && (
        <Box marginTop={1}>
          <Text fg={muted}>{hint}</Text>
        </Box>
      )}
    </Box>
  );
}
