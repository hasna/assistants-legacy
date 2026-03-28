import React, { Component, type ReactNode } from 'react';

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
          <box borderStyle="rounded" borderColor="#d4d4d8" border={["top", "bottom"]} paddingX={1} marginBottom={1}>
            <text fg="red"><b>
              {this.props.panelName || 'Panel'} Error
            </b></text>
          </box>
          <box paddingX={1} flexDirection="column">
            <text fg="red">An error occurred while rendering this panel.</text>
            <text> </text>
            <text fg="gray">{this.state.error?.message || 'Unknown error'}</text>
            <text> </text>
            <text fg="gray">Press 'q' or Escape to close.</text>
          </box>
        </box>
      );
    }

    return this.props.children;
  }
}
