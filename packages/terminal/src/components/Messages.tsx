import React, { useEffect, useMemo, useState } from 'react';
import type { Message, ToolCall, ToolResult } from '@hasna/assistants-shared';
import { Markdown } from './Markdown';
import {
  groupConsecutiveToolMessages,
  type DisplayMessage,
} from './messageLines';
import { truncateToolResultWithInfo } from './toolDisplay';
import { TerminalImage } from './TerminalImage';
import { CodeBlock, shouldHighlightToolResult } from './CodeBlock';
import { basename } from 'path';
import { themeColor } from '../theme/colors';
import { ThinkingBlock } from './ThinkingBlock';
import {
  ToolCallDisplay,
  ToolCallSummary,
  capitalizeToolName,
  linkifyText,
  indentMultiline,
  formatDuration,
} from './ToolCallDisplay';
// [brutus] Re-export for backward compatibility — hook lives in hooks/ to avoid circular deps
export { useCopyToClipboard } from '../hooks/useCopyToClipboard';

interface ActivityEntry {
  id: string;
  type: 'text' | 'tool_call' | 'tool_result';
  content?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  timestamp: number;
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
}

export function Messages({
  messages,
  currentResponse,
  streamingMessages = [],
  currentToolCall,
  lastToolResult,
  activityLog = [],
  queuedMessageIds,
  verboseTools = false,
}: MessagesProps) {
  const [now, setNow] = useState(Date.now());

  type MessageItem =
    | { kind: 'message'; message: DisplayMessage }
    | { kind: 'grouped'; messages: DisplayMessage[] };

  type Item = MessageItem
    | { kind: 'activity'; entry: ActivityEntry }
    | { kind: 'streaming'; message: DisplayMessage };

  const messageGroups = useMemo(() => groupConsecutiveToolMessages(messages), [messages]);
  const messageItems = useMemo<MessageItem[]>(() => {
    return messageGroups.map((group) => (
      group.type === 'single'
        ? { kind: 'message', message: group.message }
        : { kind: 'grouped', messages: group.messages }
    ));
  }, [messageGroups]);

  const visibleMessageItems = messageItems;
  const visibleActivity = activityLog;
  const visibleStreaming = streamingMessages;
  const showCurrentResponse = Boolean(currentResponse) && streamingMessages.length === 0;

  const historicalItems = visibleMessageItems.map((item) => {
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
            <box
              borderStyle="single"
              borderColor={themeColor('primary')}
              border={['left']}
              paddingLeft={1}
            >
              <Markdown content={entry.content!} indent={0} />
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
          <box
            borderStyle="single"
            borderColor={themeColor('primary')}
            border={['left']}
            paddingLeft={1}
          >
            <Markdown content={currentResponse ?? ''} indent={0} />
          </box>
        </box>
      )}
    </box>
  );
}

// ============================================
// User Message — left border with secondary color
// Per OpenCode spec: thick left border, secondary color, raw text
// ============================================

function UserMessage({
  message,
  queuedMessageIds,
  verboseTools,
}: {
  message: DisplayMessage;
  queuedMessageIds?: Set<string>;
  verboseTools?: boolean;
}) {
  const isDraft = message.id.startsWith('listening-draft');
  const isQueued = queuedMessageIds?.has(message.id);
  const chunkMatch = message.id.match(/::chunk-(\d+)$/);
  const chunkIndex = chunkMatch ? Number(chunkMatch[1]) : -1;
  const isContinuation = chunkIndex > 0;
  const content = message.content ?? '';
  const displayContent = normalizeUserDisplay(content);
  const toolResults = message.toolResults || [];
  const showToolResultsOnly = toolResults.length > 0 && !isContinuation;
  const hasContent = Boolean(content.trim());
  const secondaryCol = themeColor('secondary');
  const mutedCol = themeColor('muted');

  return (
    <box flexDirection="column">
      {/* 1 empty line separator (skip for continuations) */}
      {!isContinuation && <box height={1} />}

      {isDraft && !isContinuation && (
        <box>
          <text fg={mutedCol}>  Live dictation</text>
        </box>
      )}

      {hasContent && (
        <box
          borderStyle="single"
          borderColor={secondaryCol}
          border={['left']}
          paddingLeft={1}
        >
          {isQueued && !isContinuation ? (
            <text fg={mutedCol}>{linkifyText(content)}</text>
          ) : (
            <text fg={isDraft ? mutedCol : themeColor('text')}>{linkifyText(displayContent)}</text>
          )}
        </box>
      )}

      {showToolResultsOnly && (
        <box marginTop={hasContent ? 0 : 0}>
          <ToolResultPanel toolResults={toolResults} verboseTools={verboseTools} />
        </box>
      )}
    </box>
  );
}

// ============================================
// Assistant Message — left border with primary color, markdown + finish info
// Per OpenCode spec: thick left border, primary color, markdown content,
// finish info line showing model + duration at bottom
// ============================================

function AssistantMessage({
  message,
  verboseTools,
}: {
  message: DisplayMessage;
  verboseTools?: boolean;
}) {
  const chunkMatch = message.id.match(/::chunk-(\d+)$/);
  const chunkIndex = chunkMatch ? Number(chunkMatch[1]) : -1;
  const isContinuation = chunkIndex > 0;
  const content = message.content ?? '';
  const hasContent = content && content.trim();
  const toolCalls = message.toolCalls || [];
  const toolResults = message.toolResults || [];
  const showToolResultsOnly = toolCalls.length === 0 && toolResults.length > 0;
  const primaryCol = themeColor('primary');
  const mutedCol = themeColor('muted');

  const resultMap = useMemo(() => {
    const map = new Map<string, ToolResult>();
    for (const result of toolResults) {
      map.set(result.toolCallId, result);
    }
    return map;
  }, [toolResults]);

  return (
    <box flexDirection="column">
      {/* 1 empty line separator (skip for continuations) */}
      {!isContinuation && <box height={1} />}

      {/* Assistant text content — left border with primary color, markdown rendered */}
      {hasContent && (
        <box
          borderStyle="single"
          borderColor={primaryCol}
          border={['left']}
          paddingLeft={1}
          flexDirection="column"
        >
          <Markdown content={content} preRendered={Boolean(message.__rendered)} indent={0} />
        </box>
      )}

      {/* Tool calls rendered below the text content */}
      {toolCalls.length > 0 && (
        <box marginTop={0} flexDirection="column">
          <ToolCallsBlock
            toolCalls={toolCalls}
            toolResults={toolResults}
            verboseTools={verboseTools}
          />
        </box>
      )}

      {/* Orphan tool results */}
      {showToolResultsOnly && (
        <box marginTop={0}>
          <ToolResultPanel toolResults={toolResults} verboseTools={verboseTools} />
        </box>
      )}
    </box>
  );
}

// ============================================
// Tool calls block — left border with borderDim, tool name + params + result
// Per OpenCode spec: thick left border, TextMuted (borderDim) color,
// "ToolName: params" header, result truncated to max 10 lines
// ============================================

function ToolCallsBlock({
  toolCalls,
  toolResults = [],
  verboseTools = false,
}: {
  toolCalls: ToolCall[];
  toolResults?: ToolResult[];
  verboseTools?: boolean;
}) {
  if (toolCalls.length === 0) return null;

  const resultMap = useMemo(() => {
    const map = new Map<string, ToolResult>();
    for (const result of toolResults) {
      map.set(result.toolCallId, result);
    }
    return map;
  }, [toolResults]);

  // Compact summary for 2+ tool calls when not verbose
  if (!verboseTools && toolCalls.length >= 2) {
    const allComplete = toolCalls.every((tc) => resultMap.has(tc.id));
    const isRunning = !allComplete;
    return (
      <ToolCallSummary
        toolCalls={toolCalls}
        toolResults={toolResults}
        isRunning={isRunning}
      />
    );
  }

  return (
    <box flexDirection="column">
      {toolCalls.map((toolCall) => {
        const result = resultMap.get(toolCall.id);
        return (
          <ToolCallDisplay
            key={toolCall.id}
            toolCall={toolCall}
            result={result}
            isRunning={!result}
            verboseTools={verboseTools}
          />
        );
      })}
    </box>
  );
}

// ============================================
// Message Bubble dispatcher
// ============================================

interface MessageBubbleProps {
  message: DisplayMessage;
  queuedMessageIds?: Set<string>;
  verboseTools?: boolean;
}

function MessageBubble({ message, queuedMessageIds, verboseTools }: MessageBubbleProps) {
  if (message.role === 'system') return null;

  if (message.role === 'user') {
    return (
      <UserMessage
        message={message}
        queuedMessageIds={queuedMessageIds}
        verboseTools={verboseTools}
      />
    );
  }

  // Assistant message
  return (
    <AssistantMessage
      message={message}
      verboseTools={verboseTools}
    />
  );
}

// ============================================
// Combined Tool Message (grouped consecutive tool-only messages)
// ============================================

function CombinedToolMessage({ messages, verboseTools }: { messages: DisplayMessage[]; verboseTools?: boolean }) {
  const allToolCalls: ToolCall[] = [];
  const allToolResults: ToolResult[] = [];
  for (const msg of messages) {
    if (msg.toolCalls) allToolCalls.push(...msg.toolCalls);
    if (msg.toolResults) allToolResults.push(...msg.toolResults);
  }

  return (
    <box flexDirection="column">
      <box height={1} />
      <ToolCallsBlock toolCalls={allToolCalls} toolResults={allToolResults} verboseTools={verboseTools} />
    </box>
  );
}

// ============================================
// Active Tools Panel (streaming/in-progress)
// ============================================

interface ActiveToolInfo {
  id: string;
  toolCall: ToolCall;
  status: 'running' | 'succeeded' | 'failed';
  startTime: number;
  endTime?: number;
  result?: ToolResult;
}

interface ActiveToolsPanelProps {
  activityLog: ActivityEntry[];
  now: number;
  verboseTools?: boolean;
}

function ActiveToolsPanel({ activityLog, now, verboseTools }: ActiveToolsPanelProps) {
  const toolCalls = useMemo(() => {
    const calls: ActiveToolInfo[] = [];
    const resultMap = new Map<string, { result: ToolResult; timestamp: number }>();

    for (const entry of activityLog) {
      if (entry.type === 'tool_result' && entry.toolResult) {
        resultMap.set(entry.toolResult.toolCallId, {
          result: entry.toolResult,
          timestamp: entry.timestamp,
        });
      }
    }

    const currentTime = Date.now();
    for (const entry of activityLog) {
      if (entry.type === 'tool_call' && entry.toolCall) {
        const resultInfo = resultMap.get(entry.toolCall.id);
        let status: 'running' | 'succeeded' | 'failed';
        if (resultInfo) {
          status = resultInfo.result.isError ? 'failed' : 'succeeded';
        } else {
          const elapsed = currentTime - entry.timestamp;
          status = elapsed > 60_000 ? 'failed' : 'running';
        }
        calls.push({
          id: entry.toolCall.id,
          toolCall: entry.toolCall,
          status,
          startTime: entry.timestamp,
          endTime: resultInfo?.timestamp,
          result: resultInfo?.result,
        });
      }
    }

    return calls;
  }, [activityLog]);

  if (toolCalls.length === 0) return null;

  // Compact summary for 2+ tool calls when not verbose
  if (!verboseTools && toolCalls.length >= 2) {
    const anyRunning = toolCalls.some((c) => c.status === 'running');
    return (
      <ToolCallSummary
        toolCalls={toolCalls.map((c) => c.toolCall)}
        toolResults={toolCalls.filter((c) => c.result).map((c) => c.result!)}
        isRunning={anyRunning}
      />
    );
  }

  return (
    <box flexDirection="column">
      {toolCalls.map((call) => {
        const elapsedMs = (call.endTime ?? now) - call.startTime;
        return (
          <ToolCallDisplay
            key={call.id}
            toolCall={call.toolCall}
            result={call.result}
            isRunning={call.status === 'running'}
            elapsedMs={elapsedMs}
            verboseTools={verboseTools}
          />
        );
      })}
    </box>
  );
}

// ============================================
// Tool Result Panel (orphan results without calls)
// ============================================

function ToolResultPanel({
  toolResults,
  verboseTools,
}: {
  toolResults: ToolResult[];
  verboseTools?: boolean;
}) {
  if (toolResults.length === 0) return null;

  const mutedCol = themeColor('muted');
  const borderDimCol = themeColor('borderDim');
  const errorCol = themeColor('error');

  return (
    <box flexDirection="column">
      {toolResults.map((result, index) => {
        const isError = result.isError;
        const title = result.toolName
          ? capitalizeToolName(result.toolName)
          : `Result ${index + 1}`;

        // Render inline image for display_image tool results
        if (result.toolName === 'display_image' && !result.isError) {
          try {
            const data = JSON.parse(result.content);
            if (data.path) {
              return (
                <box key={`${result.toolCallId}-${index}`} flexDirection="column">
                  <box
                    borderStyle="single"
                    borderColor={borderDimCol}
                    border={['left']}
                    paddingLeft={1}
                    flexDirection="column"
                  >
                    <text fg={mutedCol}>{title}</text>
                    <TerminalImage src={data.path} width={data.width} height={data.height} alt={data.alt || basename(data.path)} />
                  </box>
                </box>
              );
            }
          } catch { /* fall through to text display */ }
        }

        // Truncate to max 10 lines per OpenCode spec
        const truncatedResult = truncateToolResultWithInfo(result, 10, 400, { verbose: verboseTools });
        const resultText = truncatedResult.content;
        const showMoreHint = !verboseTools && truncatedResult.truncation.wasTruncated;
        const moreLines = truncatedResult.truncation.originalLines - truncatedResult.truncation.displayedLines;
        const useHighlight = shouldHighlightToolResult(result.toolName, resultText, result.isError);

        return (
          <box key={`${result.toolCallId}-${index}`} flexDirection="column">
            <box
              borderStyle="single"
              borderColor={borderDimCol}
              border={['left']}
              paddingLeft={1}
              flexDirection="column"
            >
              <text fg={mutedCol}>{title}</text>
              {isError ? (
                <text fg={errorCol}>Error: {resultText}</text>
              ) : useHighlight ? (
                <CodeBlock
                  content={resultText}
                  filetype={result.toolName === 'bash' ? 'bash' : undefined}
                />
              ) : (
                <text fg={mutedCol}>{linkifyText(resultText)}</text>
              )}
              {showMoreHint && moreLines > 0 && (
                <text fg={mutedCol}>[{moreLines} more lines]</text>
              )}
            </box>
          </box>
        );
      })}
    </box>
  );
}

// ============================================
// Helpers (kept here for backward compat)
// ============================================

function startsWithListOrTable(content: string): boolean {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = stripAnsi(line).trimStart();
    if (!trimmed) continue;
    if (/^[-*\u2022]\s+/.test(trimmed)) return true;
    if (/^\d+\.\s+/.test(trimmed)) return true;
    if (trimmed.startsWith('|')) return true;
    if (trimmed.startsWith('```')) return true;
    if (trimmed.startsWith(':::')) return true;
    if (/^[\u250c\u2510\u2514\u2518\u251c\u2524\u252c\u2534\u253c\u2502]/.test(trimmed)) return true;
    if (/^[\u256d\u256e\u2570\u256f\u2502]/.test(trimmed)) return true;
    return false;
  }
  return false;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-9;]*m/g, '');
}

function normalizeUserDisplay(content: string): string {
  const normalized = content.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
  if (normalized.includes('```')) {
    return normalized.replace(/\t/g, '  ');
  }
  const compact = normalized
    .split('\n')
    .map((line) => line.replace(/\t/g, '  ').replace(/ {2,}/g, ' '))
    .join('\n')
    .replace(/\n{2,}/g, '\n');
  return compact;
}

// Re-export URL_PATTERN for backward compat
const URL_PATTERN = /https?:\/\/[^\s<>"\])\u0000-\u001F]+/g;
