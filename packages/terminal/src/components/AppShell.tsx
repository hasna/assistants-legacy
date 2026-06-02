/** @jsxImportSource react */
import React, { type ReactNode } from 'react';
import { Box, Text } from '../ui/ink';
import { themeColor } from '../theme/colors';

export type AppShellLayout = {
  rows: number;
  columns: number;
  statusHeight: number;
  splitPaneHeight: number;
  messagesHeight: number;
  editorHeight: number;
  showSidebar: boolean;
  leftWidth: number;
  rightWidth: number;
};

export type AppShellLayoutOptions = {
  rows: number;
  columns: number;
  hasActiveSession: boolean;
};

export function calculateAppShellLayout({
  rows: rawRows,
  columns: rawColumns,
  hasActiveSession,
}: AppShellLayoutOptions): AppShellLayout {
  const rows = Math.max(1, Math.floor(rawRows || 24));
  const columns = Math.max(1, Math.floor(rawColumns || 80));
  const statusHeight = 1;
  const splitPaneHeight = Math.max(1, rows - statusHeight);
  const showSidebar = hasActiveSession && columns >= 100;
  const leftWidth = showSidebar ? Math.max(1, Math.floor(columns * 0.7)) : columns;
  const rightWidth = showSidebar ? Math.max(1, columns - leftWidth) : 0;
  const editorHeight = Math.max(3, Math.floor(splitPaneHeight * 0.1));
  const messagesHeight = Math.max(1, splitPaneHeight - editorHeight);

  return {
    rows,
    columns,
    statusHeight,
    splitPaneHeight,
    messagesHeight,
    editorHeight,
    showSidebar,
    leftWidth,
    rightWidth,
  };
}

export function calculateTranscriptRenderWidth(layout: Pick<AppShellLayout, 'leftWidth'>): number {
  // The chat column has 1 cell of left/right padding, and activity/command
  // rows reserve 2 cells for the leading gutter marker.
  return Math.max(1, layout.leftWidth - 4);
}

type CommonShellProps = AppShellLayoutOptions & {
  status: ReactNode;
  commandPalette?: ReactNode;
};

type WelcomeShellProps = CommonShellProps & {
  mode: 'welcome';
  welcomeBanner: ReactNode;
  welcomeInput: ReactNode;
  welcomeTip: string;
};

type ChatShellProps = CommonShellProps & {
  mode: 'chat';
  transcript: ReactNode;
  editor: ReactNode;
  sidebar?: ReactNode;
  isTranscriptFocused?: boolean;
  backgroundProcessingCount?: number;
  askUserPanel?: ReactNode;
  interviewPanel?: ReactNode;
  errorBanner?: ReactNode;
  processingIndicator?: ReactNode;
  showExitHint?: boolean;
  queueIndicator?: ReactNode;
  stopHint?: string | null;
};

export type AppShellProps = WelcomeShellProps | ChatShellProps;

function renderBackgroundProcessing(count: number | undefined): ReactNode {
  if (!count || count <= 0) return null;

  return (
    <Box marginBottom={1}>
      <Text fg={themeColor('warning')}>
        {count} session{count > 1 ? 's' : ''} processing in background (Ctrl+] to switch)
      </Text>
    </Box>
  );
}

export function AppShell(props: AppShellProps): React.JSX.Element {
  const layout = calculateAppShellLayout(props);

  if (props.mode === 'welcome') {
    const welcomeInputWidth = Math.max(1, Math.min(80, layout.columns - 4));

    return (
      <Box flexDirection="column" height={layout.rows} width={layout.columns}>
        <Box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
          {props.welcomeBanner}

          <Box flexDirection="column" width={welcomeInputWidth} marginTop={2}>
            <Box flexDirection="row" backgroundColor={themeColor('surface')} paddingX={1} paddingY={0}>
              {props.welcomeInput}
            </Box>

            <Box flexDirection="row" justifyContent="center" marginTop={1}>
              <Text fg={themeColor('muted')}>
                <Text bold>tab</Text> agents  <Text bold>ctrl+p</Text> commands
              </Text>
            </Box>

            <Box flexDirection="row" justifyContent="center" marginTop={1}>
              <Text fg={themeColor('warning')}>* </Text>
              <Text fg={themeColor('muted')}>Tip  {props.welcomeTip}</Text>
            </Box>
          </Box>
        </Box>

        <Box height={layout.statusHeight} width={layout.columns}>
          {props.status}
        </Box>
        {props.commandPalette}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={layout.rows} width={layout.columns}>
      <Box flexDirection="column" height={layout.splitPaneHeight} width={layout.columns}>
        <Box flexDirection="row" height={layout.messagesHeight} width={layout.columns}>
          <Box flexDirection="column" width={layout.leftWidth} paddingTop={1} paddingRight={1} paddingBottom={0} paddingLeft={1}>
            {renderBackgroundProcessing(props.backgroundProcessingCount)}

            <Box flexDirection="column" flexGrow={1} overflow="hidden">
              {props.transcript}
            </Box>

            {props.askUserPanel}
            {props.interviewPanel}
            {props.errorBanner}
            {props.processingIndicator}

            {props.showExitHint ? (
              <Box marginLeft={2} marginBottom={0}>
                <Text fg={themeColor('warning')}>(Press Ctrl+C again to exit)</Text>
              </Box>
            ) : null}

            {props.queueIndicator}

            {props.stopHint ? (
              <Box marginLeft={2}>
                <Text fg={themeColor('muted')}>{props.stopHint}</Text>
              </Box>
            ) : null}
          </Box>

          {layout.showSidebar && props.sidebar ? (
            <Box flexDirection="column" width={layout.rightWidth} paddingTop={1} paddingRight={1} paddingBottom={1} paddingLeft={1} backgroundColor={themeColor('surface')}>
              {props.sidebar}
            </Box>
          ) : null}
        </Box>

        <Box flexDirection="column" height={layout.editorHeight} width={layout.columns} flexShrink={0}>
          {props.editor}
        </Box>
      </Box>

      <Box height={layout.statusHeight} width={layout.columns}>
        {props.status}
      </Box>
      {props.commandPalette}
    </Box>
  );
}
