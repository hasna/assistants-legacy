import type { Tool } from '@hasna/assistants-shared';
import type { ToolExecutor } from './registry';
import { toolError } from '../errors';
import { getRuntime } from '../runtime';

/**
 * Helper: run a tmux command and return stdout.
 */
async function exec(args: string[]): Promise<string> {
  const runtime = getRuntime();
  const proc = runtime.spawn(['tmux', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr] = await Promise.all([
    proc.stdout ? new Response(proc.stdout).text() : '',
    proc.stderr ? new Response(proc.stderr).text() : '',
  ]);

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw toolError('tmux', `tmux ${args[0]} failed (exit ${exitCode}): ${stderr.trim() || stdout.trim()}`);
  }
  return stdout;
}

/** Prefix for assistant-managed sessions */
const SESSION_PREFIX = 'asst-';

function prefixed(name: string): string {
  return name.startsWith(SESSION_PREFIX) ? name : `${SESSION_PREFIX}${name}`;
}

/**
 * Tmux tool — persistent terminal sessions for long-running processes.
 */
export class TmuxTools {
  static readonly tool: Tool = {
    name: 'tmux',
    description:
      'Manage persistent terminal sessions. Create sessions per project, run background processes (dev servers, builds, watchers), capture their output later, and monitor long-running commands.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'create_session',
            'list_sessions',
            'kill_session',
            'send_command',
            'capture_output',
            'get_status',
            'create_window',
            'list_windows',
            'list_panes',
            'split_pane',
            'interrupt',
          ],
          description: 'The tmux action to perform',
        },
        session: {
          type: 'string',
          description: 'Session name (auto-prefixed with "asst-")',
        },
        target: {
          type: 'string',
          description: 'Target pane: session, session:window, or session:window.pane',
        },
        command: {
          type: 'string',
          description: 'Command to send to the pane',
        },
        window_name: {
          type: 'string',
          description: 'Name for a new window',
        },
        cwd: {
          type: 'string',
          description: 'Working directory for new session/window',
        },
        lines: {
          type: 'number',
          description: 'Number of scrollback lines to capture (default: 200)',
        },
        wait: {
          type: 'boolean',
          description: 'Wait for command to finish before returning (send_command only)',
        },
        direction: {
          type: 'string',
          enum: ['horizontal', 'vertical'],
          description: 'Split direction (split_pane only)',
        },
      },
      required: ['action'],
    },
  };

  static readonly executor: ToolExecutor = async (input) => {
    const runtime = getRuntime();
    if (!runtime.which('tmux')) {
      throw toolError('tmux', 'tmux is not installed. Install it with: brew install tmux (macOS) or apt install tmux (Linux)');
    }

    const action = input.action as string;
    const session = input.session as string | undefined;
    const target = input.target as string | undefined;
    const command = input.command as string | undefined;
    const windowName = input.window_name as string | undefined;
    const cwd = input.cwd as string | undefined;
    const lines = (input.lines as number) || 200;
    const wait = (input.wait as boolean) || false;
    const direction = (input.direction as string) || 'vertical';

    switch (action) {
      case 'create_session': {
        if (!session) throw toolError('tmux', 'session name is required for create_session');
        const name = prefixed(session);
        const args = ['new-session', '-d', '-s', name];
        if (windowName) {
          args.push('-n', windowName);
        }
        if (cwd) {
          args.push('-c', cwd);
        }
        if (command) {
          args.push(command);
        }
        await exec(args);
        return `Session "${name}" created${cwd ? ` in ${cwd}` : ''}`;
      }

      case 'list_sessions': {
        try {
          const out = await exec(['list-sessions', '-F', '#{session_name}: #{session_windows} windows (created #{session_created_string})#{?session_attached, (attached),}']);
          const lines = out.trim().split('\n');
          const assistantSessions = lines.filter((l) => l.startsWith(SESSION_PREFIX));
          if (assistantSessions.length === 0) {
            return 'No assistant tmux sessions found.';
          }
          return assistantSessions.join('\n');
        } catch {
          return 'No tmux sessions running.';
        }
      }

      case 'kill_session': {
        if (!session) throw toolError('tmux', 'session name is required for kill_session');
        const name = prefixed(session);
        await exec(['kill-session', '-t', name]);
        return `Session "${name}" killed.`;
      }

      case 'send_command': {
        if (!target) throw toolError('tmux', 'target is required for send_command');
        if (!command) throw toolError('tmux', 'command is required for send_command');
        const t = prefixTarget(target);

        if (wait) {
          // Use tmux wait-for pattern for synchronous execution
          const marker = `asst-done-${Date.now()}`;
          const wrappedCmd = `${command}; tmux wait-for -S ${marker}`;
          await exec(['send-keys', '-t', t, wrappedCmd, 'Enter']);
          await exec(['wait-for', marker]);
          // Capture the output after the command finishes
          const out = await exec(['capture-pane', '-t', t, '-pJ', '-S', '-50']);
          return out.trim() || 'Command completed (no output).';
        }

        await exec(['send-keys', '-t', t, command, 'Enter']);
        return `Command sent to ${t}.`;
      }

      case 'capture_output': {
        if (!target) throw toolError('tmux', 'target is required for capture_output');
        const t = prefixTarget(target);
        const startLine = -Math.abs(lines);
        const out = await exec(['capture-pane', '-t', t, '-pJ', '-S', String(startLine)]);
        const trimmed = out.trim();
        return trimmed || '(empty — no output in scrollback)';
      }

      case 'get_status': {
        if (!target) throw toolError('tmux', 'target is required for get_status');
        const t = prefixTarget(target);
        const out = await exec([
          'display-message', '-t', t, '-p',
          'pane_pid=#{pane_pid} pane_current_command=#{pane_current_command} pane_width=#{pane_width} pane_height=#{pane_height} pane_dead=#{pane_dead}',
        ]);
        return out.trim();
      }

      case 'create_window': {
        if (!session) throw toolError('tmux', 'session name is required for create_window');
        const name = prefixed(session);
        const args = ['new-window', '-t', name];
        if (windowName) {
          args.push('-n', windowName);
        }
        if (cwd) {
          args.push('-c', cwd);
        }
        await exec(args);
        return `Window${windowName ? ` "${windowName}"` : ''} created in session "${name}".`;
      }

      case 'list_windows': {
        if (!session) throw toolError('tmux', 'session name is required for list_windows');
        const name = prefixed(session);
        const out = await exec([
          'list-windows', '-t', name, '-F',
          '#{window_index}: #{window_name}#{?window_active, (active),} (#{window_panes} panes)',
        ]);
        return out.trim();
      }

      case 'list_panes': {
        if (!target) throw toolError('tmux', 'target is required for list_panes');
        const t = prefixTarget(target);
        const out = await exec([
          'list-panes', '-t', t, '-F',
          '#{pane_index}: #{pane_current_command} (#{pane_width}x#{pane_height})#{?pane_active, (active),}',
        ]);
        return out.trim();
      }

      case 'split_pane': {
        if (!target) throw toolError('tmux', 'target is required for split_pane');
        const t = prefixTarget(target);
        const flag = direction === 'horizontal' ? '-h' : '-v';
        const args = ['split-window', flag, '-t', t];
        if (cwd) {
          args.push('-c', cwd);
        }
        await exec(args);
        return `Pane split ${direction}ly in ${t}.`;
      }

      case 'interrupt': {
        if (!target) throw toolError('tmux', 'target is required for interrupt');
        const t = prefixTarget(target);
        await exec(['send-keys', '-t', t, 'C-c', '']);
        return `Ctrl+C sent to ${t}.`;
      }

      default:
        throw toolError('tmux', `Unknown action: ${action}`);
    }
  };
}

/**
 * Prefix the session portion of a target string.
 * Handles: "session", "session:window", "session:window.pane"
 */
function prefixTarget(target: string): string {
  const colonIdx = target.indexOf(':');
  if (colonIdx === -1) {
    return prefixed(target);
  }
  const sessionPart = target.slice(0, colonIdx);
  const rest = target.slice(colonIdx);
  return prefixed(sessionPart) + rest;
}
