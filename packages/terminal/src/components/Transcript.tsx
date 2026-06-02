/** @jsxImportSource react */
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Markdown, Text, VirtualMessageList } from '../ui/ink';
import {
  estimateActivityEntryLines,
  estimateActivityLogLines,
  estimateGroupedToolMessagesLines,
  estimateMessageLines,
  groupConsecutiveToolMessages,
  type DisplayMessage,
} from './messageLines';
import { themeColor } from '../theme/colors';
import {
  ActiveToolsPanel,
  CombinedToolMessage,
  MessageBubble,
  type ActivityEntry,
} from './message-parts';

export interface FinishInfo {
  variant?: string;
  modelName?: string;
  duration?: string;
}

type MessageListItem =
  | { kind: 'message'; id: string; message: DisplayMessage }
  | { kind: 'grouped'; id: string; messages: DisplayMessage[] };

export type TranscriptItem =
  | MessageListItem
  | { kind: 'activity_text'; id: string; entry: ActivityEntry }
  | { kind: 'activity_tools'; id: string; entries: ActivityEntry[] }
  | { kind: 'streaming'; id: string; message: DisplayMessage }
  | { kind: 'current_response'; id: string; content: string }
  | { kind: 'finish'; id: string; finishInfo: FinishInfo };

export type BuildTranscriptItemsProps = {
  messages: DisplayMessage[];
  streamingMessages?: DisplayMessage[];
  currentResponse?: string;
  activityLog?: ActivityEntry[];
  finishInfo?: FinishInfo;
};

export type TranscriptProps = BuildTranscriptItemsProps & {
  height: number;
  width?: number | string;
  focused?: boolean;
  stickyScroll?: boolean;
  queuedMessageIds?: Set<string>;
  verboseTools?: boolean;
  wrapWidth?: number;
  renderWidth?: number;
  overscan?: number;
  showIndicators?: boolean;
};

function hasFinishInfo(finishInfo: FinishInfo | undefined): finishInfo is FinishInfo {
  return Boolean(finishInfo && (finishInfo.variant || finishInfo.modelName || finishInfo.duration));
}

export function buildTranscriptItems({
  messages,
  streamingMessages = [],
  currentResponse,
  activityLog = [],
  finishInfo,
}: BuildTranscriptItemsProps): TranscriptItem[] {
  const items: TranscriptItem[] = [];
  const messageGroups = groupConsecutiveToolMessages(messages);

  for (const group of messageGroups) {
    if (group.type === 'single') {
      items.push({ kind: 'message', id: group.message.id, message: group.message });
    } else {
      items.push({ kind: 'grouped', id: group.messages[0]?.id ?? `group-${items.length}`, messages: group.messages });
    }
  }

  for (const entry of activityLog) {
    if (entry.type === 'text' && entry.content) {
      items.push({ kind: 'activity_text', id: entry.id, entry });
    }
  }

  const toolEntries = activityLog.filter((entry) => entry.type === 'tool_call' || entry.type === 'tool_result');
  if (toolEntries.some((entry) => entry.type === 'tool_call')) {
    items.push({ kind: 'activity_tools', id: 'active-tools', entries: toolEntries });
  }

  for (const message of streamingMessages) {
    items.push({ kind: 'streaming', id: message.id, message });
  }

  if (currentResponse && streamingMessages.length === 0) {
    items.push({ kind: 'current_response', id: 'current-response', content: currentResponse });
  }

  if (hasFinishInfo(finishInfo)) {
    items.push({ kind: 'finish', id: 'finish-info', finishInfo });
  }

  return items;
}

export function estimateTranscriptItemHeight(
  item: TranscriptItem,
  wrapWidth: number,
  renderWidth?: number,
): number {
  switch (item.kind) {
    case 'message':
    case 'streaming':
      return estimateMessageLines(item.message, renderWidth);
    case 'grouped':
      return estimateGroupedToolMessagesLines(item.messages, renderWidth);
    case 'activity_text':
      return estimateActivityEntryLines(item.entry, wrapWidth, renderWidth);
    case 'activity_tools':
      return Math.max(1, estimateActivityLogLines(item.entries, wrapWidth, renderWidth));
    case 'current_response':
      return estimateActivityEntryLines({ type: 'text', content: item.content }, wrapWidth, renderWidth);
    case 'finish':
      return 1;
  }
}

function renderActivityText(entry: ActivityEntry, renderWidth?: number): React.ReactNode {
  const markdownWidth = renderWidth ? Math.max(1, renderWidth - 2) : undefined;

  return (
    <Box flexDirection="column">
      <Box height={1} />
      <Box flexDirection="row" width="100%">
        <Text fg={themeColor('primary')}>{'\u2502'} </Text>
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          <Markdown content={entry.content ?? ''} maxWidth={markdownWidth} />
        </Box>
      </Box>
    </Box>
  );
}

function renderCurrentResponse(content: string, renderWidth?: number): React.ReactNode {
  return renderActivityText({
    id: 'current-response',
    type: 'text',
    content,
    timestamp: Date.now(),
  }, renderWidth);
}

function renderFinishInfo(finishInfo: FinishInfo): React.ReactNode {
  return (
    <Box flexDirection="row" marginTop={1}>
      <Text fg={themeColor('secondary')}>{'\u25a0'}</Text>
      <Text fg={themeColor('muted')}>
        {finishInfo.variant ? `  ${finishInfo.variant}` : ''}
        {finishInfo.modelName ? ` \u00b7 ${finishInfo.modelName}` : ''}
        {finishInfo.duration ? ` \u00b7 ${finishInfo.duration}` : ''}
      </Text>
    </Box>
  );
}

export function Transcript({
  height,
  width = '100%',
  messages,
  currentResponse,
  streamingMessages = [],
  activityLog = [],
  queuedMessageIds,
  verboseTools = false,
  finishInfo,
  focused = false,
  stickyScroll = true,
  wrapWidth,
  renderWidth,
  overscan = 2,
  showIndicators = false,
}: TranscriptProps): React.JSX.Element {
  const [now, setNow] = useState(Date.now());
  const items = useMemo(() => buildTranscriptItems({
    messages,
    streamingMessages,
    currentResponse,
    activityLog,
    finishInfo,
  }), [activityLog, currentResponse, finishInfo, messages, streamingMessages]);

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
      if (entry.type === 'tool_call' && entry.toolCall && !toolResultMap.has(entry.toolCall.id)) {
        return true;
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

  const resolvedWrapWidth = Math.max(1, Math.floor(wrapWidth ?? renderWidth ?? 80));

  return (
    <VirtualMessageList
      height={height}
      width={width}
      focused={focused}
      stickyScroll={stickyScroll}
      items={items}
      overscan={overscan}
      showIndicators={showIndicators}
      estimateItemHeight={(item) => estimateTranscriptItemHeight(item, resolvedWrapWidth, renderWidth)}
      renderItem={(item) => {
        switch (item.kind) {
          case 'message':
            return <MessageBubble message={item.message} queuedMessageIds={queuedMessageIds} verboseTools={verboseTools} />;
          case 'grouped':
            return <CombinedToolMessage messages={item.messages} verboseTools={verboseTools} />;
          case 'activity_text':
            return renderActivityText(item.entry, renderWidth);
          case 'activity_tools':
            return <ActiveToolsPanel activityLog={item.entries} now={now} verboseTools={verboseTools} />;
          case 'streaming':
            return <MessageBubble message={item.message} queuedMessageIds={queuedMessageIds} verboseTools={verboseTools} />;
          case 'current_response':
            return renderCurrentResponse(item.content, renderWidth);
          case 'finish':
            return renderFinishInfo(item.finishInfo);
        }
      }}
    />
  );
}
