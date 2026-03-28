import React from 'react';
import { themeColor } from '../theme/colors';

/**
 * ThinkingBlock renders thinking/reasoning content per OpenCode spec:
 * - "Thinking:" prefix in warning color (orange)
 * - Content in italic
 * - Left border using borderDim color
 *
 * [brutus] Updated to match OpenCode spec colors exactly.
 */

interface ThinkingBlockProps {
  /** The thinking/reasoning content to display */
  content?: string;
  /** Whether the model is actively thinking (shows animated dots) */
  isActive?: boolean;
}

export function ThinkingBlock({ content, isActive = false }: ThinkingBlockProps) {
  const warningCol = themeColor('warning');
  const borderDimCol = themeColor('borderDim');
  const mutedCol = themeColor('muted');

  if (!content && !isActive) {
    return (
      <box
        borderStyle="single"
        borderColor={borderDimCol}
        border={['left']}
        paddingLeft={1}
      >
        <text fg={warningCol}>Thinking</text>
      </box>
    );
  }

  if (!content) {
    return (
      <box
        borderStyle="single"
        borderColor={borderDimCol}
        border={['left']}
        paddingLeft={1}
      >
        <text fg={warningCol}>Thinking...</text>
      </box>
    );
  }

  return (
    <box
      flexDirection="column"
      borderStyle="single"
      borderColor={borderDimCol}
      border={['left']}
      paddingLeft={1}
    >
      <text>
        <text fg={warningCol}>Thinking: </text>
        <text fg={mutedCol}><i>{content}</i></text>
      </text>
    </box>
  );
}
