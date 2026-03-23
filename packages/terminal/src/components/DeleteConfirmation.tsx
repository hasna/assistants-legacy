import React from 'react';

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
    <box paddingX={1} flexDirection="column">
      <text fg={color}><b>{title}</b></text>
      <text> </text>
      <text>This will delete "{itemName}"{itemId ? ` (${itemId})` : ''}.</text>
      {message && <text>{message}</text>}
      <text> </text>
      <text>Press <text><b>'y'</b></text> to confirm, <text><b>'n'</b></text> to cancel.</text>
    </box>
  );
}
