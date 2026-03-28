import React from 'react';
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
    <box paddingX={1} flexDirection="column">
      <text fg={muted}>{message}</text>
      {hint && (
        <box marginTop={1}>
          <text fg={muted}>{hint}</text>
        </box>
      )}
    </box>
  );
}
