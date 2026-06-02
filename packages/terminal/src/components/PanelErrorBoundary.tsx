import React, { Component, type ReactNode } from 'react';
import { Box, Text } from '../ui/ink';
import { themeColor } from '../theme/colors';

interface Props {
  children: ReactNode;
  panelName?: string;
  onClose?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary for panel components.
 * Catches rendering errors and displays a graceful fallback
 * instead of crashing the entire terminal UI.
 */
export class PanelErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box flexDirection="column" padding={1}>
          <Box borderStyle="round" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} marginBottom={1}>
            <Text fg={themeColor('error')} bold>
              {this.props.panelName || 'Panel'} Error
            </Text>
          </Box>
          <Box paddingX={1} flexDirection="column">
            <Text fg={themeColor('error')}>An error occurred while rendering this panel.</Text>
            <Box height={1} />
            <Text fg={themeColor('muted')}>{this.state.error?.message || 'Unknown error'}</Text>
            <Box height={1} />
            <Text fg={themeColor('muted')}>Press 'q' or Escape to close.</Text>
          </Box>
        </Box>
      );
    }

    return this.props.children;
  }
}
