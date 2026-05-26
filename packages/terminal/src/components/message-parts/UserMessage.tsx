/**
 * User message renderer (plan 8d98da29 P4.2) — extracted from Messages.tsx.
 * Thick left border in the secondary color over a surface background; raw text.
 */
import React from 'react';
import type { DisplayMessage } from '../messageLines';
import { themeColor } from '../../theme/colors';
import { linkifyText } from '../ToolCallDisplay';
import { normalizeUserDisplay } from './helpers';
import { ToolResultPanel } from './ToolParts';

export function UserMessage({
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
  const surfaceCol = themeColor('surface');

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
          flexDirection="row"
          width="100%"
          backgroundColor={surfaceCol}
        >
          <text fg={secondaryCol} bg={surfaceCol}>{'│'} </text>
          <box flexGrow={1} flexShrink={1} backgroundColor={surfaceCol}>
            {isQueued && !isContinuation ? (
              <text fg={mutedCol} bg={surfaceCol}>{linkifyText(content)}</text>
            ) : (
              <text fg={isDraft ? mutedCol : themeColor('text')} bg={surfaceCol}>{linkifyText(displayContent)}</text>
            )}
          </box>
        </box>
      )}

      {showToolResultsOnly && (
        <box>
          <ToolResultPanel toolResults={toolResults} verboseTools={verboseTools} />
        </box>
      )}
    </box>
  );
}
