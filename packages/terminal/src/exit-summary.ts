import type { TokenUsage } from '@hasna/assistants-shared';

export interface ExitStats {
  sessionId: string;
  startedAt: number;
  tokenUsage?: TokenUsage;
  messageCount: number;
}

// Module-level state: set by App before exit, read by index.tsx after Ink unmounts
let exitStats: ExitStats | null = null;

export function setExitStats(stats: ExitStats): void {
  exitStats = stats;
}

export function getExitStats(): ExitStats | null {
  return exitStats;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}m`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}k`;
  }
  return String(count);
}

export function printExitSummary(stats: ExitStats): void {
  const durationMs = Date.now() - stats.startedAt;
  const lines: string[] = [];

  lines.push('');
  lines.push(`\x1b[1mResume this session:\x1b[0m`);
  lines.push(`  assistants --resume ${stats.sessionId}`);
  lines.push('');

  const durationLabel = 'Total duration (wall):';
  const messagesLabel = 'Total messages:';
  const pad = Math.max(durationLabel.length, messagesLabel.length) + 2;

  lines.push(`${durationLabel.padEnd(pad)}${formatDuration(durationMs)}`);
  lines.push(`${messagesLabel.padEnd(pad)}${stats.messageCount} messages`);

  if (stats.tokenUsage) {
    const u = stats.tokenUsage;
    lines.push('Token usage:');
    lines.push(`    input:        ${formatTokenCount(u.inputTokens)} tokens`);
    lines.push(`    output:       ${formatTokenCount(u.outputTokens)} tokens`);
    if (u.cacheReadTokens) {
      lines.push(`    cache read:   ${formatTokenCount(u.cacheReadTokens)} tokens`);
    }
    if (u.cacheWriteTokens) {
      lines.push(`    cache write:  ${formatTokenCount(u.cacheWriteTokens)} tokens`);
    }
  }

  lines.push('');

  process.stderr.write(lines.join('\n'));
}
