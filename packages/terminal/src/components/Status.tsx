import React, { useEffect, useState, useMemo } from 'react';
import type { VoiceState, ActiveIdentityInfo, HeartbeatState } from '@hasna/assistants-shared';
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

// [nero] Default model variants derived from commonly-used models
function getDefaultVariants(currentModelId?: string): ModelVariant[] {
  const defaults: ModelVariant[] = [
    { label: 'Opus', modelId: 'claude-opus-4-6' },
    { label: 'Sonnet', modelId: 'claude-sonnet-4-6' },
    { label: 'Haiku', modelId: 'claude-haiku-4-5-20251001' },
  ];

  // If current model is not in defaults, prepend it
  if (currentModelId && !defaults.some((v) => v.modelId === currentModelId)) {
    const model = getModelById(currentModelId);
    if (model) {
      defaults.unshift({ label: model.name.split(' ').pop() || model.name, modelId: currentModelId });
    }
  }

  return defaults;
}

export function Status({
  isProcessing,
  cwd,
  queueLength = 0,
  tokenUsage,
  modelId,
  voiceState,
  heartbeatState,
  identityInfo,
  sessionIndex,
  sessionCount,
  backgroundProcessingCount = 0,
  processingStartTime,
  verboseTools = false,
  recentTools = [],
  gitBranch,
  variants,
  onVariantSelect,
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

  // --- LEFT SIDE: Model variants ---
  const resolvedVariants = variants || getDefaultVariants(modelId);

  const leftElements: React.ReactNode[] = [];
  resolvedVariants.forEach((variant, i) => {
    const isActive = modelId === variant.modelId;
    const color = isActive ? themeColor('purple') : themeColor('muted');
    const separator = i < resolvedVariants.length - 1 ? (
      <text key={`sep-${i}`} fg={themeColor('muted')}> </text>
    ) : null;
    leftElements.push(
      isActive
        ? <text key={variant.modelId} fg={color}><b>{variant.label}</b></text>
        : <text key={variant.modelId} fg={color}>{variant.label}</text>,
    );
    if (separator) leftElements.push(separator);
  });

  // Processing indicator + cost after variants
  if (isProcessing && processingStartTime) {
    leftElements.push(
      <text key="timer" fg={themeColor('orange')}> {formatDuration(elapsed)}</text>,
    );
  }
  if (costInfo) {
    leftElements.push(
      <text key="cost" fg={themeColor('muted')}> {costInfo}</text>,
    );
  }

  // Context warning
  if (contextPercent >= 80) {
    const warnColor = contextPercent >= 95 ? themeColor('red') : themeColor('orange');
    const warnLabel = contextPercent >= 95 ? `!! ${contextPercent}%` : `! ${contextPercent}%`;
    leftElements.push(
      <text key="ctx" fg={warnColor}> {warnLabel}</text>,
    );
  }

  // --- RIGHT SIDE: Keyboard shortcuts ---
  const shortcuts: Array<{ key: string; label: string }> = [];

  if (isProcessing) {
    shortcuts.push({ key: 'esc', label: 'stop' });
  }
  shortcuts.push({ key: 'ctrl+t', label: 'variants' });
  shortcuts.push({ key: 'tab', label: 'agents' });
  shortcuts.push({ key: 'ctrl+p', label: 'commands' });

  const rightElements: React.ReactNode[] = [];
  shortcuts.forEach((sc, i) => {
    if (i > 0) {
      rightElements.push(
        <text key={`rsep-${i}`} fg={themeColor('muted')}>  </text>,
      );
    }
    rightElements.push(
      <text key={`key-${sc.key}`} fg={themeColor('text')}><b>{sc.key}</b></text>,
    );
    rightElements.push(
      <text key={`lbl-${sc.key}`} fg={themeColor('muted')}> {sc.label}</text>,
    );
  });

  return (
    <box flexDirection="row" justifyContent="space-between">
      <box flexDirection="row">{leftElements}</box>
      <box flexDirection="row">{rightElements}</box>
    </box>
  );
}
