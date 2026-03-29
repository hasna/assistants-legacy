import React from 'react';
import { themeColor } from '../theme/colors';

/**
 * ThinkingBlock renders thinking/reasoning content per OpenCode spec:
 * - "Thinking:" prefix in warning color (orange)
 * - Content in italic
 * - Left border using borderDim color
 *
 * [brutus] Updated to match OpenCode spec colors exactly.
 * [cassius] Replaced border={['left']} with row-based pipe char for OpenTUI compat.
 */

interface ThinkingBlockProps {
  /** The thinking/reasoning content to display */
  content?: string;
  /** Whether the model is actively thinking (shows animated dots) */
  isActive?: boolean;
}

export function ThinkingBlock({ content, isActive = false }: ThinkingBlockProps) {
  const warningCol = themeColor('warning');
  const accentCol = themeColor('accent');  // purple pipe per OpenCode ref
  const mutedCol = themeColor('muted');

  if (!content && !isActive) {
    return (
      <box flexDirection="row" width="100%">
        <text fg={accentCol}>{'\u2502'} </text>
        <text fg={warningCol}><i>Thinking</i></text>
      </box>
    );
  }

  if (!content) {
    return (
      <box flexDirection="row" width="100%">
        <text fg={accentCol}>{'\u2502'} </text>
        <text fg={warningCol}><i>Thinking...</i></text>
      </box>
    );
  }

  return (
    <box flexDirection="row" width="100%">
      <text fg={accentCol}>{'\u2502'} </text>
      <box flexDirection="column" flexGrow={1} flexShrink={1}>
        <text>
          <text fg={warningCol}><i>Thinking: </i></text>
          <text fg={mutedCol}><i>{content}</i></text>
        </text>
      </box>
    </box>
  );
}
