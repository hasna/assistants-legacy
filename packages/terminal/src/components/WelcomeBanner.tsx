import React from 'react';
import { getModelDisplayName } from '@hasna/assistants-shared';

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

  return (
    <box flexDirection="column" marginBottom={1}>
      <box>
        <text fg="gray">{'>'}</text>
        <text><b>_ Hasna Assistants</b></text>
        <text fg="gray">  (v{version})</text>
      </box>
      <text>{''}</text>
      <box>
        <text fg="gray">model:     </text>
        <text>{displayModel}</text>
        <text fg="gray">    /model to change</text>
      </box>
      <box>
        <text fg="gray">directory: </text>
        <text>{shortDir}</text>
      </box>
      <box>
        <text fg="gray">shortcuts: </text>
        <text fg="gray">Ctrl+] sessions · Ctrl+C stop · /help commands</text>
      </box>
    </box>
  );
}
