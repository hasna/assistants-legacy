import React from 'react';
import { useTerminalDimensions } from '@opentui/react';
import { themeColor } from '../theme/colors';

// Block-letter ASCII art for "hasna"
const LOGO_LINES = [
  ' _                           ',
  '| |__   __ _ ___ _ __   __ _ ',
  "| '_ \\ / _` / __| '_ \\ / _` |",
  '| | | | (_| \\__ \\ | | | (_| |',
  '|_| |_|\\__,_|___/_| |_|\\__,_|',
];

interface WelcomeBannerProps {
  /** unused — kept for backward compat; the input box is rendered separately */
  version?: string;
  model?: string;
  directory?: string;
}

/**
 * Welcome banner — per OpenCode spec: when no session is active,
 * display a centered ASCII logo and nothing else.
 * The editor/input box is rendered separately in the layout below.
 */
export function WelcomeBanner(_props: WelcomeBannerProps) {
  const termDims = useTerminalDimensions();
  const termWidth = termDims.width || 80;
  const termHeight = termDims.height || 24;

  const mutedColor = themeColor('muted');

  // Logo dimensions
  const logoHeight = LOGO_LINES.length;
  const logoWidth = LOGO_LINES.reduce((max, l) => Math.max(max, l.length), 0);

  // Center vertically — place logo roughly in the upper-center area
  const topPadding = Math.max(0, Math.floor((termHeight - logoHeight) / 2) - 3);

  // Center horizontally
  const logoPadLeft = Math.max(0, Math.floor((termWidth - logoWidth) / 2));
  const logoIndent = ' '.repeat(logoPadLeft);

  return (
    <box flexDirection="column" flexGrow={1}>
      {/* Vertical centering spacer */}
      {topPadding > 0 && <box height={topPadding} />}

      {/* ASCII logo centered, textMuted color */}
      <box flexDirection="column" alignItems="center">
        {LOGO_LINES.map((line, i) => (
          <text key={i} fg={mutedColor}>
            {logoIndent}{line}
          </text>
        ))}
      </box>
    </box>
  );
}
