/** @jsxImportSource react */
/**
 * Assistant message renderer (plan 8d98da29 P4.2) — extracted from Messages.tsx.
 * Thick left border in the primary color; markdown content; tool calls below.
 */
import React from 'react';
import type { DisplayMessage } from '../messageLines';
import { Box, Markdown, Text } from '../../ui/ink';
import { themeColor } from '../../theme/colors';
import { ToolCallsBlock, ToolResultPanel } from './ToolParts';

export function AssistantMessage({
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

  return (
    <Box flexDirection="column">
      {/* 1 empty line separator (skip for continuations) */}
      {!isContinuation && <Box height={1} />}

      {/* Assistant text content — left border with primary color, markdown rendered */}
      {hasContent && (
        <Box
          flexDirection="row"
          width="100%"
        >
          <Text fg={primaryCol}>{'\u2502'} </Text>
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            <Markdown content={content} />
          </Box>
        </Box>
      )}

      {/* Tool calls rendered below the text content */}
      {toolCalls.length > 0 && (
        <Box marginTop={0} flexDirection="column">
          <ToolCallsBlock
            toolCalls={toolCalls}
            toolResults={toolResults}
            verboseTools={verboseTools}
          />
        </Box>
      )}

      {/* Orphan tool results */}
      {showToolResultsOnly && (
        <Box marginTop={0}>
          <ToolResultPanel toolResults={toolResults} verboseTools={verboseTools} />
        </Box>
      )}
    </Box>
  );
}
