import React, { useEffect, useState, useMemo } from 'react';
import type { VoiceState, ActiveIdentityInfo, HeartbeatState } from '@hasna/assistants-shared';
import { getModelById } from '@hasna/assistants-shared';
import { Box, Text } from '../ui/ink';
import { themeColor } from '../theme/colors';

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  maxContextTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/**
 * Recent tool call info for status display
 */
export interface RecentToolInfo {
  name: string;
  status: 'running' | 'succeeded' | 'failed';
  durationMs: number;
  startedAt?: number;
}

interface StatusProps {
  isProcessing: boolean;
  cwd: string;
  queueLength?: number;
  tokenUsage?: TokenUsage;
  modelId?: string;
  /** Agent/assistant name for the current session */
  agentName?: string;

  voiceState?: VoiceState;
  heartbeatState?: HeartbeatState;
  identityInfo?: ActiveIdentityInfo;
  sessionIndex?: number;
  sessionCount?: number;
  backgroundProcessingCount?: number;
  processingStartTime?: number;
  verboseTools?: boolean;
  recentTools?: RecentToolInfo[];
  gitBranch?: string;

  /** App version string (e.g. "1.1.113") shown on the right in welcome mode */
  version?: string;
  /** When true, show simplified welcome-mode status: cwd on left, version on right */
  welcomeMode?: boolean;
}

export function Status({
  isProcessing,
  tokenUsage,
  modelId,
  agentName,
  processingStartTime,
  cwd,
  gitBranch,
  version,
  welcomeMode,
}: StatusProps) {
  const [elapsed, setElapsed] = useState(0);

  const formatDuration = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds < 0) return '...';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  useEffect(() => {
    if (!isProcessing || !processingStartTime) {
      setElapsed(0);
      return;
    }

    const update = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - processingStartTime) / 1000)));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [isProcessing, processingStartTime]);

  // Estimated cost from token usage and model pricing
  const costInfo = useMemo(() => {
    if (!tokenUsage || !modelId) return '';
    const model = getModelById(modelId);
    if (!model?.inputCostPer1M || !model?.outputCostPer1M) return '';
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

  // --- Welcome mode: cwd:branch on left, version on right ---
  if (welcomeMode) {
    const cwdDisplay = gitBranch ? `${cwd}:${gitBranch}` : cwd;
    return (
      <Box flexDirection="row" justifyContent="space-between">
        <Text fg={themeColor('muted')}>{cwdDisplay}</Text>
        {version ? <Text fg={themeColor('muted')}>v{version}</Text> : null}
      </Box>
    );
  }

  // Context usage
  let contextPercent = 0;
  if (tokenUsage && tokenUsage.maxContextTokens > 0) {
    contextPercent = Math.max(0, Math.min(100, Math.round((tokenUsage.totalTokens / tokenUsage.maxContextTokens) * 100)));
  }

  // --- Format token count like OpenCode: >=1M -> "1.2M", >=1K -> "1.2K", else raw ---
  const formatTokens = (n: number): string => {
    if (n >= 1_000_000) {
      const val = (n / 1_000_000).toFixed(1).replace(/\.0$/, '');
      return `${val}M`;
    }
    if (n >= 1_000) {
      const val = (n / 1_000).toFixed(1).replace(/\.0$/, '');
      return `${val}K`;
    }
    return String(n);
  };

  // --- LEFT: Help widget "[?]" in textMuted ---
  const helpWidget = (
    <Text key="help" fg={themeColor('muted')}>[?]</Text>
  );

  // --- CENTER-LEFT: Token info "14,413  5% ($0.00)" in textMuted ---
  // Percentage colored by threshold (warning at 80%, error at 95%)
  let tokenInfo: React.ReactNode = null;
  if (tokenUsage && tokenUsage.totalTokens > 0) {
    const tokenStr = formatTokens(tokenUsage.totalTokens);
    const percentColor = contextPercent >= 95
      ? themeColor('error')
      : contextPercent >= 80
        ? themeColor('warning')
        : themeColor('muted');
    const costStr = costInfo || '$0.00';

    tokenInfo = (
      <Box key="tokens" flexDirection="row">
        <Text fg={themeColor('muted')}>  {tokenStr}  </Text>
        <Text fg={percentColor}>{contextPercent}%</Text>
        <Text fg={themeColor('muted')}> ({costStr})</Text>
      </Box>
    );
  }

  // --- CENTER: Status message (processing timer, etc.) ---
  let statusMessage: React.ReactNode = null;
  if (isProcessing && processingStartTime) {
    statusMessage = (
      <Text key="status" fg={themeColor('muted')}>  {formatDuration(elapsed)}</Text>
    );
  }

  // --- RIGHT: Agent name + model (read-only) ---
  const model = modelId ? getModelById(modelId) : null;
  const modelName = model?.name || modelId || '';
  const displayAgent = agentName || 'Assistant';

  // Single row — agent info on the right, keyboard shortcuts centered
  return (
    <Box flexDirection="row" justifyContent="space-between">
      <Box flexDirection="row">
        {helpWidget}
        {tokenInfo}
        {statusMessage}
      </Box>
      <Box flexDirection="row">
        {modelName ? (
          <Text fg={themeColor('muted')}>{displayAgent} · {modelName}  </Text>
        ) : (
          <Text fg={themeColor('muted')}>{displayAgent}  </Text>
        )}
        <Text fg={themeColor('muted')} bold>tab</Text>
        <Text fg={themeColor('muted')}> agents  </Text>
        <Text fg={themeColor('muted')} bold>ctrl+p</Text>
        <Text fg={themeColor('muted')}> commands</Text>
      </Box>
    </Box>
  );
}
