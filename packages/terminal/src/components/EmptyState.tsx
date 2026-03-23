import React from 'react';

interface EmptyStateProps {
  message: string;
  hint?: string;
}

/**
 * Standardized empty state component for panels.
 */
export function EmptyState({ message, hint }: EmptyStateProps) {
  return (
    <box paddingX={1} flexDirection="column">
      <text fg="gray">{message}</text>
      {hint && (
        <box marginTop={1}>
          <text fg="gray">{hint}</text>
        </box>
      )}
    </box>
  );
}
