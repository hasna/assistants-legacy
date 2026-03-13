import type { Tool } from '@hasna/assistants-shared';
import type { ToolExecutor } from './registry';
import { exec } from 'child_process';

interface NotifyInput {
  title: string;
  message: string;
  sound?: boolean;
}

function escapeShellArg(str: string): string {
  return str.replace(/'/g, "'\\''");
}

function buildCommand(input: NotifyInput): string {
  const platform = process.platform;
  const title = escapeShellArg(input.title);
  const message = escapeShellArg(input.message);

  if (platform === 'darwin') {
    const soundClause = input.sound ? ' sound name "default"' : '';
    return `osascript -e 'display notification "${message}" with title "${title}"${soundClause}'`;
  }

  if (platform === 'linux') {
    return `notify-send '${title}' '${message}'`;
  }

  if (platform === 'win32') {
    const ps = `[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; ` +
      `$n = New-Object System.Windows.Forms.NotifyIcon; ` +
      `$n.Icon = [System.Drawing.SystemIcons]::Information; ` +
      `$n.Visible = $true; ` +
      `$n.ShowBalloonTip(5000, '${title}', '${message}', 'Info')`;
    return `powershell -Command "${ps.replace(/"/g, '\\"')}"`;
  }

  throw new Error(`Unsupported platform: ${platform}`);
}

function execAsync(command: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

export class NotifyTool {
  static readonly tool: Tool = {
    name: 'notify',
    description: 'Send a native desktop notification. Works on macOS (osascript), Linux (notify-send), and Windows (PowerShell).',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Notification title',
        },
        message: {
          type: 'string',
          description: 'Notification message body',
        },
        sound: {
          type: 'boolean',
          description: 'Play a sound with the notification (macOS only)',
          default: false,
        },
      },
      required: ['title', 'message'],
    },
  };

  static readonly executor: ToolExecutor = async (input) => {
    const notifyInput: NotifyInput = {
      title: String(input.title || 'Notification'),
      message: String(input.message || ''),
      sound: input.sound === true,
    };

    try {
      const command = buildCommand(notifyInput);
      await execAsync(command);
      return `Notification sent: "${notifyInput.title}" — ${notifyInput.message}`;
    } catch (error) {
      return `Error sending notification: ${error instanceof Error ? error.message : String(error)}`;
    }
  };
}

export const __test__ = {
  buildCommand,
  escapeShellArg,
};
