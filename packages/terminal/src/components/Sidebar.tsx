import React from 'react';
import { getModelDisplayName, getModelById } from '@hasna/assistants-shared';
import { Box, Text } from '../ui/ink';
import { themeColor } from '../theme/colors';

export interface ModifiedFile {
  path: string;
  additions: number;
  removals: number;
}

export interface SidebarProps {
  /** Session title */
  title?: string;
  /** Model ID (for display name) */
  modelId?: string;
  /** Working directory */
  cwd: string;
  /** Modified files with diff stats */
  modifiedFiles?: ModifiedFile[];
  /** LSP diagnostics count */
  diagnosticsCount?: number;
  /** Token usage info for context section */
  tokenUsage?: {
    totalTokens: number;
    maxContextTokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  /** Git branch name */
  gitBranch?: string;
  /** App version string */
  appVersion?: string;
}

/**
 * Sidebar panel — matches OpenCode reference layout:
 *
 * Top:    Session title (bold)
 * Upper:  Context section (tokens, %, cost)
 * Middle: LSP section
 * Bottom: path:branch, then app name + version
 */
export function Sidebar({ title, modelId, cwd, modifiedFiles, diagnosticsCount, tokenUsage, gitBranch, appVersion }: SidebarProps) {
  const mutedColor = themeColor('muted');
  const textColor = themeColor('text');

  // Strip home dir from cwd for display
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const displayCwd = home && cwd.startsWith(home)
    ? '~/' + cwd.slice(home.length + 1)
    : cwd;

  // Compute cost from token usage
  let costStr = '$0.00';
  if (tokenUsage && modelId) {
    const model = getModelById(modelId);
    if (model?.inputCostPer1M && model?.outputCostPer1M) {
      const inputCost = (tokenUsage.inputTokens * model.inputCostPer1M) / 1_000_000;
      const outputCost = (tokenUsage.outputTokens * model.outputCostPer1M) / 1_000_000;
      const cacheReadCost = tokenUsage.cacheReadTokens
        ? (tokenUsage.cacheReadTokens * model.inputCostPer1M * 0.1) / 1_000_000
        : 0;
      const cacheWriteCost = tokenUsage.cacheWriteTokens
        ? (tokenUsage.cacheWriteTokens * model.inputCostPer1M * 1.25) / 1_000_000
        : 0;
      const total = inputCost + outputCost + cacheReadCost + cacheWriteCost;
      costStr = total < 0.01 ? `$${total.toFixed(3)}` : `$${total.toFixed(2)}`;
    }
  }

  // Context percentage
  let contextPercent = 0;
  if (tokenUsage && tokenUsage.maxContextTokens > 0) {
    contextPercent = Math.max(0, Math.min(100, Math.round((tokenUsage.totalTokens / tokenUsage.maxContextTokens) * 100)));
  }

  // Format token count
  const formatTokens = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return n.toLocaleString();
  };

  const tokenStr = tokenUsage ? formatTokens(tokenUsage.totalTokens) : '0';

  // Path with branch
  const pathWithBranch = gitBranch
    ? `${displayCwd}:${gitBranch}`
    : displayCwd;

  return (
    <Box flexDirection="column" flexGrow={1} paddingLeft={2} paddingRight={1}>
      {/* Session title — bold at top */}
      {title && (
        <Text fg={textColor} bold>{title}</Text>
      )}

      {/* Empty line */}
      <Box height={1} />

      {/* Context section */}
      <Text fg={textColor} bold>Context</Text>
      <Text fg={mutedColor}>{tokenStr} tokens</Text>
      <Text fg={mutedColor}>{contextPercent}% used</Text>
      <Text fg={mutedColor}>{costStr} spent</Text>

      {/* Empty line */}
      <Box height={1} />

      {/* LSP section */}
      <Text fg={textColor} bold>LSP</Text>
      {diagnosticsCount !== undefined && diagnosticsCount > 0 ? (
        <Text fg={themeColor('warning')}>{diagnosticsCount} diagnostic{diagnosticsCount !== 1 ? 's' : ''}</Text>
      ) : (
        <Text fg={mutedColor}>LSPs will activate as files are read</Text>
      )}

      {/* Spacer to push bottom content down */}
      <Box flexGrow={1} />

      {/* Path:branch near bottom */}
      <Text fg={mutedColor}>{pathWithBranch}</Text>

      {/* Empty line */}
      <Box height={1} />

      {/* App name + version at very bottom */}
      <Box flexDirection="row">
        <Text fg={mutedColor}>{'\u2022'} </Text>
        <Text fg={textColor} bold>Open</Text>
        <Text fg={textColor}>Assistants</Text>
        <Text fg={mutedColor}> {appVersion || '1.0.0'}</Text>
      </Box>
    </Box>
  );
}
