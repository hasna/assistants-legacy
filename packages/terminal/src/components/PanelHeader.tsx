import React from 'react';
import { Box, Text } from '../ui/ink';
import { color as dsColor } from './design-system';

interface PanelHeaderProps {
  title: string;
  count?: number;
  hints?: string;
}

/**
 * Standardized panel header — the shared chrome for all panels (plan P2.2).
 * Composed from design-system primitives (color() tokens + Badge for the count)
 * so every panel inherits consistent, theme-driven header styling from one place.
 * [cassius] Uses theme-aware colors for light/dark terminal contrast.
 */
export function PanelHeader({ title, count, hints }: PanelHeaderProps) {
  const mutedColor = dsColor('muted');
  const borderCol = dsColor('border');

  return (
    <Box flexDirection="row" borderStyle="round" borderColor={borderCol} border={["top", "bottom"]} paddingX={0} marginBottom={1}>
      <Text fg={dsColor('text')} bold>{title}</Text>
      {count !== undefined ? <Text fg={mutedColor}> </Text> : null}
      {count !== undefined ? <Text fg={mutedColor} bold>[{String(count)}]</Text> : null}
      {hints ? <Text fg={mutedColor}> | {hints}</Text> : null}
    </Box>
  );
}
