import React, { useEffect, useState, useMemo } from 'react';
import type { VoiceState, ActiveIdentityInfo, HeartbeatState } from '@hasna/assistants-shared'; // kept for StatusProps interface
import { getModelById } from '@hasna/assistants-shared';
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

/**
 * Model variant (preset) displayed in the status bar left side.
 * Each variant maps a short label to a model ID.
 */
export interface ModelVariant {
  label: string;
  modelId: string;
}

interface StatusProps {
  isProcessing: boolean;
  cwd: string;
  queueLength?: number;
  tokenUsage?: TokenUsage;
  modelId?: string;

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

  /** Model variants shown as clickable labels on the left. Auto-generated if omitted. */
  variants?: ModelVariant[];
  /** Callback when a variant label is selected */
  onVariantSelect?: (variant: ModelVariant) => void;
}

export function Status({
  isProcessing,
  tokenUsage,
  modelId,
  processingStartTime,
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
    <text key="help" fg={themeColor('muted')}>[?]</text>
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
      <box key="tokens" flexDirection="row">
        <text fg={themeColor('muted')}>  {tokenStr}  </text>
        <text fg={percentColor}>{contextPercent}%</text>
        <text fg={themeColor('muted')}> ({costStr})</text>
      </box>
    );
  }

  // --- CENTER: Status message (processing timer, etc.) ---
  let statusMessage: React.ReactNode = null;
  if (isProcessing && processingStartTime) {
    statusMessage = (
      <text key="status" fg={themeColor('muted')}>  {formatDuration(elapsed)}</text>
    );
  }

  // --- RIGHT: Model name in primary color ---
  const modelName = modelId ? (getModelById(modelId)?.name || modelId) : '';
  const modelDisplay = modelName ? (
    <text key="model" fg={themeColor('primary')}>{modelName}</text>
  ) : null;

  // Single row, transparent background (no bg set)
  return (
    <box flexDirection="row" justifyContent="space-between">
      <box flexDirection="row">
        {helpWidget}
        {tokenInfo}
        {statusMessage}
      </box>
      <box flexDirection="row">
        {modelDisplay}
      </box>
    </box>
  );
}
