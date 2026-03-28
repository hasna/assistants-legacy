import React from 'react';
import { getModelDisplayName } from '@hasna/assistants-shared';
import { themeColor } from '../theme/colors';

interface WelcomeBannerProps {
  version: string;
  model: string;
  directory: string;
}

export function WelcomeBanner({ version, model, directory }: WelcomeBannerProps) {
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

  // [cassius] Theme-aware colors for light/dark terminal contrast
  const mutedColor = themeColor('muted');

  return (
    <box flexDirection="column" marginBottom={1}>
      <box>
        <text fg={mutedColor}>{'>'}</text>
        <text><b>_ Hasna Assistants</b></text>
        <text fg={mutedColor}>  (v{version})</text>
      </box>
      <text>{''}</text>
      <box>
        <text fg={mutedColor}>model:     </text>
        <text>{displayModel}</text>
        <text fg={mutedColor}>    /model to change</text>
      </box>
      <box>
        <text fg={mutedColor}>directory: </text>
        <text>{shortDir}</text>
      </box>
      <box>
        <text fg={mutedColor}>shortcuts: </text>
        <text fg={mutedColor}>Ctrl+] sessions · Ctrl+C stop · /help commands</text>
      </box>
    </box>
  );
}
