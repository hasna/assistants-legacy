import React from 'react';
import { themeColor } from '../theme/colors';

/**
 * ThinkingBlock renders thinking/reasoning content in a subtle bordered box
 * with yellow italic text, inspired by OpenCode's thinking display.
 *
 * When `content` is provided, it shows the thinking text.
 * When no content, it shows a generic "Thinking..." indicator.
 *
 * [brutus] Created for OpenCode-style thinking display.
 */

interface ThinkingBlockProps {
  /** The thinking/reasoning content to display */
  content?: string;
  /** Whether the model is actively thinking (shows animated dots) */
  isActive?: boolean;
}

export function ThinkingBlock({ content, isActive = false }: ThinkingBlockProps) {
  const warningCol = themeColor('warning');
  const mutedCol = themeColor('muted');
  const borderCol = themeColor('border');

  const displayText = content
    ? `Thinking: ${content}`
    : isActive
      ? 'Thinking...'
      : 'Thinking';

  return (
    <box
      flexDirection="column"
      borderStyle="single"
      borderColor={borderCol}
      border={['left']}
      paddingLeft={1}
      marginY={0}
    >
      <text fg={warningCol}>
        {displayText}
      </text>
    </box>
  );
}
