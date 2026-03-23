import React from 'react';

interface PanelHeaderProps {
  title: string;
  color?: string;
  count?: number;
  hints?: string;
}

/**
 * Standardized panel header component.
 * All panels should use this for consistent header formatting.
 */
export function PanelHeader({ title, color = 'cyan', count, hints }: PanelHeaderProps) {
  return (
    <box borderStyle="rounded" borderColor="#d4d4d8" borderLeft={false} borderRight={false} paddingX={0} marginBottom={1}>
      <text><b>{title}</b></text>
      {count !== undefined && (
        <text fg="gray"> ({count})</text>
      )}
      {hints && (
        <>
          <text fg="gray"> | </text>
          <text fg="gray">{hints}</text>
        </>
      )}
    </box>
  );
}
