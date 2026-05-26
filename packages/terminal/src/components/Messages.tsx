import React, { useEffect, useMemo, useState } from 'react';
import type { ToolCall, ToolResult } from '@hasna/assistants-shared';
import { Markdown } from './Markdown';
import {
  groupConsecutiveToolMessages,
  type DisplayMessage,
} from './messageLines';
import { themeColor } from '../theme/colors';
import {
  MessageBubble,
  CombinedToolMessage,
  ActiveToolsPanel,
  type ActivityEntry,
} from './message-parts';
// [brutus] Re-export for backward compatibility — hook lives in hooks/ to avoid circular deps
export { useCopyToClipboard } from '../hooks/useCopyToClipboard';

export interface FinishInfo {
  /** Variant label e.g. "Build" */
  variant?: string;
  /** Model display name */
  modelName?: string;
  /** Duration string e.g. "2.8s" */
  duration?: string;
}

interface MessagesProps {
  messages: DisplayMessage[];
  currentResponse?: string;
  streamingMessages?: DisplayMessage[];
  currentToolCall?: ToolCall;
  lastToolResult?: ToolResult;
  activityLog?: ActivityEntry[];
  queuedMessageIds?: Set<string>;
  verboseTools?: boolean;
  /** Finish line shown after last assistant response */
  finishInfo?: FinishInfo;
}

export function Messages({
  messages,
  currentResponse,
  streamingMessages = [],
  activityLog = [],
  queuedMessageIds,
  verboseTools = false,
  finishInfo,
}: MessagesProps) {
  const [now, setNow] = useState(Date.now());

  type MessageItem =
    | { kind: 'message'; message: DisplayMessage }
    | { kind: 'grouped'; messages: DisplayMessage[] };

  const messageGroups = useMemo(() => groupConsecutiveToolMessages(messages), [messages]);
  const messageItems = useMemo<MessageItem[]>(() => {
    return messageGroups.map((group) => (
      group.type === 'single'
        ? { kind: 'message', message: group.message }
        : { kind: 'grouped', messages: group.messages }
    ));
  }, [messageGroups]);

  const visibleActivity = activityLog;
  const visibleStreaming = streamingMessages;
  const showCurrentResponse = Boolean(currentResponse) && streamingMessages.length === 0;

  const historicalItems = messageItems.map((item) => {
    if (item.kind === 'message') {
      return { id: item.message.id, item };
    }
    return { id: item.messages[0].id, item };
  });

  const toolResultMap = useMemo(() => {
    const map = new Map<string, ActivityEntry>();
    for (const entry of activityLog) {
      if (entry.type === 'tool_result' && entry.toolResult) {
        map.set(entry.toolResult.toolCallId, entry);
      }
    }
    return map;
  }, [activityLog]);

  const hasPendingTools = useMemo(() => {
    for (const entry of activityLog) {
      if (entry.type === 'tool_call' && entry.toolCall) {
        if (!toolResultMap.has(entry.toolCall.id)) {
          return true;
        }
      }
    }
    return false;
  }, [activityLog, toolResultMap]);

  useEffect(() => {
    if (!hasPendingTools) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [hasPendingTools]);

  return (
    <box flexDirection="column" width="100%">
      {/* Historical messages */}
      {historicalItems.map((item) => {
        if (item.item.kind === 'message') {
          return (
            <MessageBubble
              key={item.id}
              message={item.item.message}
              queuedMessageIds={queuedMessageIds}
              verboseTools={verboseTools}
            />
          );
        }
        return <CombinedToolMessage key={item.id} messages={item.item.messages} verboseTools={verboseTools} />;
      })}

      {/* Show text entries from activity log */}
      {visibleActivity
        .filter((entry) => entry.type === 'text' && entry.content)
        .map((entry) => (
          <box key={entry.id} flexDirection="column">
            <box height={1} />
            <box flexDirection="row" width="100%">
              <text fg={themeColor('primary')}>{'│'} </text>
              <box flexDirection="column" flexGrow={1} flexShrink={1}>
                <Markdown content={entry.content!} indent={0} />
              </box>
            </box>
          </box>
        ))}

      {/* Unified active tools panel */}
      {visibleActivity.some((entry) => entry.type === 'tool_call') && (
        <ActiveToolsPanel
          activityLog={visibleActivity}
          now={now}
          verboseTools={verboseTools}
        />
      )}

      {visibleStreaming.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          queuedMessageIds={queuedMessageIds}
          verboseTools={verboseTools}
        />
      ))}

      {/* Show current streaming response */}
      {showCurrentResponse && (
        <box flexDirection="column">
          <box height={1} />
          <box flexDirection="row" width="100%">
            <text fg={themeColor('primary')}>{'│'} </text>
            <box flexDirection="column" flexGrow={1} flexShrink={1}>
              <Markdown content={currentResponse ?? ''} indent={0} />
            </box>
          </box>
        </box>
      )}

      {/* Finish line: ■ Build · model-name · duration */}
      {finishInfo && (finishInfo.variant || finishInfo.modelName || finishInfo.duration) && (
        <box flexDirection="row" marginTop={1}>
          <text fg={themeColor('secondary')}>{'■'}</text>
          <text fg={themeColor('muted')}>
            {finishInfo.variant ? `  ${finishInfo.variant}` : ''}
            {finishInfo.modelName ? ` · ${finishInfo.modelName}` : ''}
            {finishInfo.duration ? ` · ${finishInfo.duration}` : ''}
          </text>
        </box>
      )}
    </box>
  );
}
