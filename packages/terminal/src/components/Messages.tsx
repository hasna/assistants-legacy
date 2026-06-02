/** @jsxImportSource react */
import React from 'react';
import type { ToolCall, ToolResult } from '@hasna/assistants-shared';
import { Transcript, type FinishInfo } from './Transcript';
import type { DisplayMessage } from './messageLines';
import type { ActivityEntry } from './message-parts';

export { useCopyToClipboard } from '../hooks/useCopyToClipboard';
export type { FinishInfo };

interface MessagesProps {
  messages: DisplayMessage[];
  currentResponse?: string;
  streamingMessages?: DisplayMessage[];
  currentToolCall?: ToolCall;
  lastToolResult?: ToolResult;
  activityLog?: ActivityEntry[];
  queuedMessageIds?: Set<string>;
  verboseTools?: boolean;
  finishInfo?: FinishInfo;
  height?: number;
  width?: number | string;
  focused?: boolean;
  stickyScroll?: boolean;
  wrapWidth?: number;
  renderWidth?: number;
}

export function Messages({
  messages,
  currentResponse,
  streamingMessages = [],
  activityLog = [],
  queuedMessageIds,
  verboseTools = false,
  finishInfo,
  height = 1000,
  width = '100%',
  focused = false,
  stickyScroll = false,
  wrapWidth,
  renderWidth,
}: MessagesProps) {
  return (
    <Transcript
      height={height}
      width={width}
      messages={messages}
      currentResponse={currentResponse}
      streamingMessages={streamingMessages}
      activityLog={activityLog}
      queuedMessageIds={queuedMessageIds}
      verboseTools={verboseTools}
      finishInfo={finishInfo}
      focused={focused}
      stickyScroll={stickyScroll}
      wrapWidth={wrapWidth}
      renderWidth={renderWidth}
    />
  );
}
