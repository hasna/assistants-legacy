/**
 * Tool-rendering message parts (plan 8d98da29 P4.2) — extracted from Messages.tsx.
 * Renders tool calls and tool results (inline, grouped, and streaming/active).
 */
import React, { useMemo } from 'react';
import type { ToolCall, ToolResult } from '@hasna/assistants-shared';
import { basename } from 'path';
import { themeColor } from '../../theme/colors';
import { truncateToolResultWithInfo } from '../toolDisplay';
import { TerminalImage } from '../TerminalImage';
import { CodeBlock, shouldHighlightToolResult } from '../CodeBlock';
import {
  ToolCallDisplay,
  ToolCallSummary,
  capitalizeToolName,
  linkifyText,
} from '../ToolCallDisplay';

/** An entry in the streaming activity log (text / tool call / tool result). */
export interface ActivityEntry {
  id: string;
  type: 'text' | 'tool_call' | 'tool_result';
  content?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  timestamp: number;
}

// ============================================
// Tool calls block — left border with borderDim, tool name + params + result
// ============================================

export function ToolCallsBlock({
  toolCalls,
  toolResults = [],
  verboseTools = false,
}: {
  toolCalls: ToolCall[];
  toolResults?: ToolResult[];
  verboseTools?: boolean;
}) {
  const resultMap = useMemo(() => {
    const map = new Map<string, ToolResult>();
    for (const result of toolResults) {
      map.set(result.toolCallId, result);
    }
    return map;
  }, [toolResults]);

  if (toolCalls.length === 0) return null;

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

export function ActiveToolsPanel({ activityLog, now, verboseTools }: ActiveToolsPanelProps) {
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

export function ToolResultPanel({
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
                <box key={`${result.toolCallId}-${index}`} flexDirection="row" width="100%">
                  <text fg={borderDimCol}>{'│'} </text>
                  <box flexDirection="column" flexGrow={1} flexShrink={1}>
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
          <box key={`${result.toolCallId}-${index}`} flexDirection="row" width="100%">
            <text fg={borderDimCol}>{'│'} </text>
            <box flexDirection="column" flexGrow={1} flexShrink={1}>
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
