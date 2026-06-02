/**
 * Shared utility components for panel renderers.
 */
import React from 'react';
import { useAppInput as useInput } from '../../hooks/useAppInput';
import { themeColor } from '../../theme/colors';
import { Box, Text } from '../../ui/ink';

/**
 * Panel wrapper that dismisses on any keypress with an error message.
 */
export function CloseOnAnyKeyPanel({ message, onClose }: { message: string; onClose: () => void }) {
  useInput(() => {
    onClose();
  }, { isActive: true });

  return (
    <Box flexDirection="column" padding={1}>
      <Text fg={themeColor('error')}>{message}</Text>
      <Text fg={themeColor('muted')}>Press any key to close.</Text>
    </Box>
  );
}
