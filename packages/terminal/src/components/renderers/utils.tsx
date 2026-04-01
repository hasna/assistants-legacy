/**
 * Shared utility components for panel renderers.
 */
import React from 'react';
import { useSafeInput as useInput } from '../../hooks/useSafeInput';
import { themeColor } from '../../theme/colors';

/**
 * Panel wrapper that dismisses on any keypress with an error message.
 */
export function CloseOnAnyKeyPanel({ message, onClose }: { message: string; onClose: () => void }) {
  useInput(() => {
    onClose();
  }, { isActive: true });

  return (
    <box flexDirection="column" padding={1}>
      <text fg={themeColor('error')}>{message}</text>
      <text fg={themeColor('muted')}>Press any key to close.</text>
    </box>
  );
}
