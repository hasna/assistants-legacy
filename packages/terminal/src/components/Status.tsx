import React, { useEffect, useState, useMemo } from 'react';
import { basename } from 'path';
import type { VoiceState, ActiveIdentityInfo, HeartbeatState } from '@hasna/assistants-shared';
import { getModelById } from '@hasna/assistants-shared';

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
}: StatusProps) {
  const [elapsed, setElapsed] = useState(0);
  const [heartbeatCountdown, setHeartbeatCountdown] = useState('');

  const formatDuration = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds < 0) return '…';
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

  useEffect(() => {
    if (!heartbeatState?.enabled) {
      setHeartbeatCountdown('');
      return;
    }

    const resolveNextHeartbeat = (): number => {
      if (heartbeatState.nextHeartbeatAt) {
        const nextAt = new Date(heartbeatState.nextHeartbeatAt).getTime();
        if (!Number.isNaN(nextAt)) {
          return nextAt;
        }
      }

      const intervalMs = heartbeatState.intervalMs ?? 15000;
      const lastActivityMs = new Date(heartbeatState.lastActivity).getTime();
      if (!Number.isNaN(lastActivityMs)) {
        return lastActivityMs + intervalMs;
      }

      return Date.now() + intervalMs;
    };

    const update = () => {
      const nextAt = resolveNextHeartbeat();
      const remainingSeconds = Math.max(0, Math.ceil((nextAt - Date.now()) / 1000));
      setHeartbeatCountdown(formatDuration(remainingSeconds));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [heartbeatState?.enabled, heartbeatState?.nextHeartbeatAt, heartbeatState?.lastActivity, heartbeatState?.intervalMs]);

  // Folder name from cwd
  const folderName = basename(cwd);

  // Format context usage with warning thresholds
  let contextInfo = '';
  let contextPercent = 0;
  if (tokenUsage && tokenUsage.maxContextTokens > 0) {
    const rawPercent = Math.round((tokenUsage.totalTokens / tokenUsage.maxContextTokens) * 100);
    contextPercent = Math.max(0, Math.min(100, rawPercent));
    contextInfo = `${contextPercent}%`;
  }

  // Estimated cost from token usage and model pricing
  const costInfo = useMemo(() => {
    if (!tokenUsage || !modelId) return '';
    const model = getModelById(modelId);
    if (!model?.inputCostPer1M || !model?.outputCostPer1M) return '';
    const inputCost = (tokenUsage.inputTokens * model.inputCostPer1M) / 1_000_000;
    const outputCost = (tokenUsage.outputTokens * model.outputCostPer1M) / 1_000_000;
    // Cache pricing: reads ~10% of input, writes ~125% of input (Anthropic standard)
    const cacheReadCost = tokenUsage.cacheReadTokens
      ? (tokenUsage.cacheReadTokens * model.inputCostPer1M * 0.1) / 1_000_000
      : 0;
    const cacheWriteCost = tokenUsage.cacheWriteTokens
      ? (tokenUsage.cacheWriteTokens * model.inputCostPer1M * 1.25) / 1_000_000
      : 0;
    const total = inputCost + outputCost + cacheReadCost + cacheWriteCost;
    return total < 0.01 ? `$${total.toFixed(3)}` : `$${total.toFixed(2)}`;
  }, [tokenUsage, modelId]);

  // Session indicator (only show if multiple sessions)
  // sessionIndex is already 1-based from registry.getSessionIndex()
  const sessionInfo = sessionCount && sessionCount > 1 && sessionIndex !== undefined
    ? `${sessionIndex}/${sessionCount}`
    : '';

  // Background processing indicator
  const bgIndicator = backgroundProcessingCount > 0
    ? ` +${backgroundProcessingCount}`
    : '';

  // Voice indicator (flat text)
  const voiceLabel = voiceState?.enabled
    ? voiceState.isTalking ? 'talk' : voiceState.isListening ? 'mic' : voiceState.isSpeaking ? 'spk' : 'voice'
    : '';

  // Heartbeat indicator (flat text)
  const heartbeatLabel = heartbeatState?.enabled
    ? heartbeatState.isStale ? 'hb!' : 'hb'
    : '';
  const heartbeatDisplay = heartbeatLabel
    ? `${heartbeatLabel}${heartbeatCountdown ? ` ${heartbeatCountdown}` : ''}`
    : '';

  const queueInfo = queueLength > 0 ? `${queueLength}q` : '';
  const verboseLabel = verboseTools ? 'verbose' : '';

  // Build recent tools summary (group by tool name with counts and elapsed time)
  const recentToolsSummary = useMemo(() => {
    if (recentTools.length === 0) return '';

    const counts = new Map<string, { count: number; failed: number; running: number; maxElapsed: number }>();
    const now = Date.now();
    for (const tool of recentTools) {
      const existing = counts.get(tool.name) || { count: 0, failed: 0, running: 0, maxElapsed: 0 };
      existing.count++;
      if (tool.status === 'failed') existing.failed++;
      if (tool.status === 'running') {
        existing.running++;
        if (tool.startedAt) {
          const elapsedSec = Math.floor((now - tool.startedAt) / 1000);
          existing.maxElapsed = Math.max(existing.maxElapsed, elapsedSec);
        }
      }
      counts.set(tool.name, existing);
    }

    const parts: string[] = [];
    for (const [name, { count, failed, running, maxElapsed }] of counts) {
      let part = name;
      if (count > 1) part += `x${count}`;
      if (failed > 0) part += '!';
      if (running > 0) {
        part += maxElapsed > 0 ? ` ${maxElapsed}s..` : '..';
      }
      parts.push(part);
    }

    return parts.slice(0, 4).join(' ');
  }, [recentTools, elapsed]);

  // Build right-side segments (plain parts rendered dimColor, context/cost may be colored)
  const rightParts: string[] = [];
  if (heartbeatDisplay) rightParts.push(heartbeatDisplay);
  if (voiceLabel) rightParts.push(voiceLabel);
  if (isProcessing) rightParts.push('esc');
  if (isProcessing && processingStartTime) rightParts.push(formatDuration(elapsed));
  if (sessionInfo) rightParts.push(`${sessionInfo}${bgIndicator}`);

  if (verboseLabel) rightParts.push(verboseLabel);
  if (queueInfo) rightParts.push(queueInfo);
  if (recentToolsSummary) rightParts.push(recentToolsSummary);

  // Context warning hint shown in status bar at high usage
  const contextWarning = contextPercent >= 80 && contextPercent < 95
    ? ' /compact'
    : contextPercent >= 95
    ? ' /compact!'
    : '';

  // Build left-side segments
  const leftParts: string[] = [];
  leftParts.push(folderName);
  if (gitBranch) leftParts.push(gitBranch);

  // Build context/cost display — add warning prefix at high usage
  const contextDisplay = contextInfo
    ? contextPercent >= 95 ? `!! ${contextInfo}` : contextPercent >= 80 ? `! ${contextInfo}` : contextInfo
    : '';

  if (contextDisplay) rightParts.push(contextDisplay + contextWarning);
  if (costInfo) rightParts.push(costInfo);

  return (
    <box flexDirection="row" justifyContent="space-between">
      <text fg="gray">{leftParts.join('  ·  ')}</text>
      <text fg="gray">{rightParts.join('  ·  ')}</text>
    </box>
  );
}
