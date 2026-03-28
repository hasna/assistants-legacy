import React from 'react';
import { getModelDisplayName } from '@hasna/assistants-shared';
import { themeColor } from '../theme/colors';

// ASCII logo — same as WelcomeBanner, rendered in textMuted
const LOGO_LINES = [
  ' _                           ',
  '| |__   __ _ ___ _ __   __ _ ',
  "| '_ \\ / _` / __| '_ \\ / _` |",
  '| | | | (_| \\__ \\ | | | (_| |',
  '|_| |_|\\__,_|___/_| |_|\\__,_|',
];

export interface ModifiedFile {
  path: string;
  additions: number;
  removals: number;
}

export interface SidebarProps {
  /** Session title */
  title?: string;
  /** Model ID (for display name) */
  modelId?: string;
  /** Working directory */
  cwd: string;
  /** Modified files with diff stats */
  modifiedFiles?: ModifiedFile[];
  /** LSP diagnostics count */
  diagnosticsCount?: number;
}

/**
 * Sidebar panel — per OpenCode spec section 6.
 *
 * Top:    ASCII logo in textMuted color
 * Middle: Session title (text), model (primary), modified files (+N/-M)
 * Bottom: LSP diagnostics count
 */
export function Sidebar({ title, modelId, cwd, modifiedFiles, diagnosticsCount }: SidebarProps) {
  const mutedColor = themeColor('muted');
  const textColor = themeColor('text');
  const primaryColor = themeColor('primary');
  const successColor = themeColor('success');
  const errorColor = themeColor('error');

  // Strip home dir from cwd for display
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const displayCwd = home && cwd.startsWith(home)
    ? '~' + cwd.slice(home.length)
    : cwd;

  const modelDisplay = modelId ? getModelDisplayName(modelId) : undefined;

  // Sort files alphabetically and strip cwd prefix
  const sortedFiles = (modifiedFiles || [])
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(f => ({
      ...f,
      path: f.path.startsWith(cwd) ? f.path.slice(cwd.length + 1) : f.path,
    }));

  return (
    <box flexDirection="column" flexGrow={1} paddingLeft={4} paddingRight={2}>
      {/* ASCII logo in textMuted */}
      <box flexDirection="column">
        {LOGO_LINES.map((line, i) => (
          <text key={i} fg={mutedColor}>{line}</text>
        ))}
      </box>

      {/* Empty line */}
      <box height={1} />

      {/* CWD */}
      <text fg={mutedColor}>cwd: {displayCwd}</text>

      {/* Space separator */}
      <text> </text>

      {/* Session section */}
      {title && (
        <text fg={textColor}>Session: {title}</text>
      )}

      {/* Model in primary color */}
      {modelDisplay && (
        <text fg={primaryColor}>{modelDisplay}</text>
      )}

      {/* Space separator */}
      <text> </text>

      {/* Modified Files section */}
      <text fg={primaryColor}><b>Modified Files</b></text>
      {sortedFiles.length > 0 ? (
        <box flexDirection="column">
          {sortedFiles.map((file, i) => (
            <box key={i} flexDirection="row">
              <text fg={textColor}>{file.path}</text>
              <text fg={successColor}> +{file.additions}</text>
              <text fg={errorColor}> -{file.removals}</text>
            </box>
          ))}
        </box>
      ) : (
        <text fg={mutedColor}>No modified files</text>
      )}

      {/* Spacer to push diagnostics to bottom */}
      <box flexGrow={1} />

      {/* LSP diagnostics count at bottom */}
      {diagnosticsCount !== undefined && diagnosticsCount > 0 ? (
        <text fg={themeColor('warning')}>{diagnosticsCount} diagnostic{diagnosticsCount !== 1 ? 's' : ''}</text>
      ) : (
        <text fg={mutedColor}>No diagnostics</text>
      )}
    </box>
  );
}
