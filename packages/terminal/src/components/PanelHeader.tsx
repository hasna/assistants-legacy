import React from 'react';
import { themeColor } from '../theme/colors';

interface PanelHeaderProps {
  title: string;
  color?: string;
  count?: number;
  hints?: string;
}

/**
 * Standardized panel header component.
 * All panels should use this for consistent header formatting.
 * [cassius] Uses theme-aware colors for light/dark terminal contrast.
 */
export function PanelHeader({ title, color = 'cyan', count, hints }: PanelHeaderProps) {
  const mutedColor = themeColor('muted');
  const borderCol = themeColor('border');

  return (
    <box borderStyle="rounded" borderColor={borderCol} border={["top", "bottom"]} paddingX={0} marginBottom={1}>
      <text><b>{title}</b></text>
      {count !== undefined && (
        <text fg={mutedColor}> ({count})</text>
      )}
      {hints && (
        <>
          <text fg={mutedColor}> | </text>
          <text fg={mutedColor}>{hints}</text>
        </>
      )}
    </box>
  );
}
