import React from 'react';
import { useTerminalDimensions } from '@opentui/react';
import { getModelDisplayName } from '@hasna/assistants-shared';
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
  version: string;
  model: string;
  directory: string;
}

export function WelcomeBanner({ version, model, directory }: WelcomeBannerProps) {
  const termDims = useTerminalDimensions();
  const termWidth = termDims.width || 80;
  const termHeight = termDims.height || 24;

  const homeDir = process.env.HOME || '';
  const displayDir = homeDir && directory.startsWith(homeDir)
    ? '~' + directory.slice(homeDir.length)
    : directory;

  // Shorten long paths: ~/Workspace/hasna/opensource/opensourcedev/foo -> ~/…/opensourcedev/foo
  const parts = displayDir.split('/');
  const shortDir = parts.length > 4
    ? parts[0] + '/\u2026/' + parts.slice(-2).join('/')
    : displayDir;

  const displayModel = getModelDisplayName(model);

  const mutedColor = themeColor('muted');
  const accentColor = themeColor('primary'); // cyan #61dafb on dark

  // Calculate vertical centering: logo + gap + input box + gap + shortcuts
  // Logo: 5 lines, gap: 1, input box: ~3 lines, gap: 1, shortcuts: 1 = ~11 lines
  const contentHeight = 11;
  const topPadding = Math.max(0, Math.floor((termHeight - contentHeight) / 2) - 2);

  // Center the logo horizontally
  const logoWidth = LOGO_LINES.reduce((max, l) => Math.max(max, l.length), 0);
  const logoPadLeft = Math.max(0, Math.floor((termWidth - logoWidth) / 2));
  const logoIndent = ' '.repeat(logoPadLeft);

  // Input box width: ~60% of terminal width, min 40, max 80
  const inputBoxWidth = Math.min(80, Math.max(40, Math.floor(termWidth * 0.6)));
  const boxPadLeft = Math.max(0, Math.floor((termWidth - inputBoxWidth) / 2));
  const boxIndent = ' '.repeat(boxPadLeft);

  // Shortcuts line centered
  const shortcutsText = 'ctrl+] sessions    /model change    /help commands';
  const shortcutsPadLeft = Math.max(0, Math.floor((termWidth - shortcutsText.length) / 2));
  const shortcutsIndent = ' '.repeat(shortcutsPadLeft);

  // Model variants bar (inside input box)
  const modelLine = displayModel;

  return (
    <box flexDirection="column" flexGrow={1}>
      {/* Vertical centering spacer */}
      {topPadding > 0 && (
        <box height={topPadding} />
      )}

      {/* ASCII logo centered */}
      <box flexDirection="column" alignItems="center">
        {LOGO_LINES.map((line, i) => (
          <text key={i} fg={themeColor('muted')}>
            {logoIndent}{line}
          </text>
        ))}
      </box>

      {/* Spacer */}
      <box height={1} />

      {/* Centered input box with left accent border */}
      <box flexDirection="row">
        <text>{boxIndent}</text>
        {/* Left accent border — single column of block chars */}
        <box flexDirection="column">
          <text fg={accentColor}>{'\u2588'}</text>
          <text fg={accentColor}>{'\u2588'}</text>
        </box>
        {/* Dark background input area placeholder */}
        <box flexDirection="column" width={inputBoxWidth - 1} bg="#282a36" paddingX={1}>
          <text fg="#6272a4" bg="#282a36">Ask anything... &quot;{shortDir}&quot;</text>
          <box flexDirection="row">
            <text fg={accentColor} bg="#282a36"><b>{modelLine}</b></text>
            <text fg={mutedColor} bg="#282a36">  v{version}</text>
          </box>
        </box>
      </box>

      {/* Spacer */}
      <box height={1} />

      {/* Shortcuts bar centered */}
      <box>
        <text fg={mutedColor}>
          {shortcutsIndent}<b>ctrl+]</b> sessions   <b>/model</b> change   <b>/help</b> commands
        </text>
      </box>
    </box>
  );
}
