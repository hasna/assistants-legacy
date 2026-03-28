import React, { Component, type ReactNode } from 'react';
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
        <box flexDirection="column" padding={1}>
          <box borderStyle="rounded" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} marginBottom={1}>
            <text fg={themeColor('error')}><b>
              {this.props.panelName || 'Panel'} Error
            </b></text>
          </box>
          <box paddingX={1} flexDirection="column">
            <text fg={themeColor('error')}>An error occurred while rendering this panel.</text>
            <text> </text>
            <text fg={themeColor('muted')}>{this.state.error?.message || 'Unknown error'}</text>
            <text> </text>
            <text fg={themeColor('muted')}>Press 'q' or Escape to close.</text>
          </box>
        </box>
      );
    }

    return this.props.children;
  }
}
