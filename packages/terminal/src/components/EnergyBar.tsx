import React from 'react';
import { themeColor } from '../theme/colors';

interface EnergyBarProps {
  current: number;
  max: number;
}

export function EnergyBar({ current, max }: EnergyBarProps) {
  const safeMax = Math.max(1, max);
  const percentage = Math.round((current / safeMax) * 100);
  const barWidth = 16;
  const filled = Math.round((current / safeMax) * barWidth);
  const empty = Math.max(0, barWidth - filled);

  const color = percentage > 50 ? themeColor('success') : percentage > 20 ? 'yellow' : 'red';
  const emoji = percentage > 70 ? '⚡' : percentage > 30 ? '🔋' : '🪫';

  return (
    <box>
      <text>{emoji} </text>
      <text fg={color}>{'█'.repeat(filled)}</text>
      <text fg={themeColor('muted')}>{'░'.repeat(empty)}</text>
      <text> {percentage}%</text>
    </box>
  );
}
