import React from 'react';
import { Box, Text } from '../ui/ink';

interface DeleteConfirmationProps {
  title?: string;
  itemName: string;
  itemId?: string;
  message?: string;
  color?: string;
}

/**
 * Standardized delete confirmation dialog.
 * Press 'y' to confirm, 'n' to cancel.
 */
export function DeleteConfirmation({
  title = 'Delete?',
  itemName,
  itemId,
  message,
  color = 'red',
}: DeleteConfirmationProps) {
  return (
    <Box paddingX={1} flexDirection="column">
      <Text fg={color}>{title}</Text>
      <Box height={1} />
      <Text>This will delete "{itemName}"{itemId ? ` (${itemId})` : ''}.</Text>
      {message ? <Text>{message}</Text> : null}
      <Box height={1} />
      <Text>Press 'y' to confirm, 'n' to cancel.</Text>
    </Box>
  );
}
