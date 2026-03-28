import React, { useMemo } from 'react';
import { basename } from 'path';
import { getModelById } from '@hasna/assistants-shared';
import type { TokenUsage } from '@hasna/assistants-shared';
import { themeColor } from '../theme/colors';

export interface SidebarProps {
  /** Current prompt or session title */
  title?: string;
  /** Token usage stats */
  tokenUsage?: TokenUsage;
  /** Model ID for cost calculation */
  modelId?: string;
  /** Working directory */
  cwd: string;
  /** Current git branch */
  gitBranch?: string;
  /** Whether assistant is currently processing */
  isProcessing?: boolean;
}

/**
 * Sidebar panel — shows session context at a glance.
 *
 * Modeled after the OpenCode right-panel layout:
 * - Title/prompt at top (bold)
 * - Context section: token count, % used, $ spent
 * - Working directory + git branch at bottom
 *
 * [cassius] Created for two-panel layout (OPE7-00314)
 */
export function Sidebar({ title, tokenUsage, modelId, cwd, gitBranch, isProcessing }: SidebarProps) {
  // Token / context stats
  const tokenCount = tokenUsage?.totalTokens ?? 0;
  const maxTokens = tokenUsage?.maxContextTokens ?? 0;
  const contextPercent = maxTokens > 0 ? Math.min(100, Math.round((tokenCount / maxTokens) * 100)) : 0;

  // Estimated cost
  const costDisplay = useMemo(() => {
    if (!tokenUsage || !modelId) return '$0.00';
    const model = getModelById(modelId);
    if (!model?.inputCostPer1M || !model?.outputCostPer1M) return '$0.00';
    const inputCost = (tokenUsage.inputTokens * model.inputCostPer1M) / 1_000_000;
    const outputCost = (tokenUsage.outputTokens * model.outputCostPer1M) / 1_000_000;
    const cacheReadCost = tokenUsage.cacheReadTokens
      ? (tokenUsage.cacheReadTokens * model.inputCostPer1M * 0.1) / 1_000_000
      : 0;
    const cacheWriteCost = tokenUsage.cacheWriteTokens
      ? (tokenUsage.cacheWriteTokens * model.inputCostPer1M * 1.25) / 1_000_000
      : 0;
    const total = inputCost + outputCost + cacheReadCost + cacheWriteCost;
    return total < 0.01 ? `$${total.toFixed(3)}` : `$${total.toFixed(2)}`;
  }, [tokenUsage, modelId]);

  // Format token count (e.g. 16,871)
  const tokenDisplay = tokenCount > 0 ? tokenCount.toLocaleString() : '0';

  // Context color based on usage percentage
  const contextColor = contextPercent >= 80
    ? themeColor('error')
    : contextPercent >= 50
      ? themeColor('warning')
      : themeColor('muted');

  // Directory display — shorten home paths
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const displayDir = home && cwd.startsWith(home)
    ? '~' + cwd.slice(home.length)
    : cwd;
  const folderName = basename(cwd);

  return (
    <box flexDirection="column" flexGrow={1}>
      {/* Title / current prompt */}
      <box marginBottom={1}>
        <text fg={themeColor('primary')}>
          <b>{title || folderName}</b>
        </text>
      </box>

      {/* Context section */}
      <box flexDirection="column" marginBottom={1}>
        <text fg={themeColor('accent')}><b>Context</b></text>
        <text fg={themeColor('muted')}>{tokenDisplay} tokens</text>
        <text fg={contextColor}>{contextPercent}% used</text>
        <text fg={themeColor('muted')}>{costDisplay} spent</text>
      </box>

      {/* Status indicator */}
      {isProcessing && (
        <box marginBottom={1}>
          <text fg={themeColor('warning')}>Working...</text>
        </box>
      )}

      {/* Spacer to push bottom section down */}
      <box flexGrow={1} />

      {/* Working directory + git branch at bottom */}
      <box flexDirection="column">
        <text fg={themeColor('muted')}>{displayDir}</text>
        {gitBranch && (
          <text fg={themeColor('accent')}>{folderName}:{gitBranch}</text>
        )}
      </box>
    </box>
  );
}
