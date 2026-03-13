import type { Command, TokenUsage } from './types';
import { splitArgs } from './helpers';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { getConfigDir } from '../config';

/**
 * /diff - Show git diff
 */
export function diffCommand(): Command {
  return {
    name: 'diff',
    description: 'Show git diff of current changes (supports --staged, <file>)',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      const parts = splitArgs(args);

      try {
        // Build git diff command
        let diffCmd = 'git diff';
        let statCmd = 'git diff --stat';

        if (parts.includes('--staged') || parts.includes('--cached')) {
          diffCmd += ' --staged';
          statCmd += ' --staged';
          const fileArgs = parts.filter(p => p !== '--staged' && p !== '--cached');
          if (fileArgs.length > 0) {
            const files = fileArgs.map(f => `'${f.replace(/'/g, "'\\''")}'`).join(' ');
            diffCmd += ` -- ${files}`;
            statCmd += ` -- ${files}`;
          }
        } else if (parts.length > 0) {
          const files = parts.map(f => `'${f.replace(/'/g, "'\\''")}'`).join(' ');
          diffCmd += ` -- ${files}`;
          statCmd += ` -- ${files}`;
        }

        const opts = { cwd: context.cwd, maxBuffer: 1024 * 1024 };

        const [statResult, diffResult] = await Promise.all([
          execAsync(statCmd, opts).catch(() => ({ stdout: '' })),
          execAsync(diffCmd, opts).catch(() => ({ stdout: '' })),
        ]);

        const statOutput = (statResult.stdout || '').trim();
        const diffOutput = (diffResult.stdout || '').trim();

        if (!statOutput && !diffOutput) {
          context.emit('text', '\nNo changes detected.\n');
          context.emit('done');
          return { handled: true };
        }

        let message = '\n**Git Diff**\n\n';
        if (statOutput) {
          message += '**Summary:**\n```\n' + statOutput + '\n```\n\n';
        }
        if (diffOutput) {
          message += '**Changes:**\n```diff\n' + diffOutput + '\n```\n';
        }

        context.emit('text', message);
      } catch {
        context.emit('text', '\nNot a git repository or git not available.\n');
      }

      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /undo - Revert uncommitted changes
 */
export function scriptsCommand(): Command {
  return {
    name: 'scripts',
    description: 'List generated files in the sandbox folder',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (_args, context) => {
      const { getProjectDataDir: getDataDir } = await import('../config');
      const { readdirSync, statSync } = await import('fs');

      const scriptsRoot = join(getDataDir(context.cwd), 'scripts', context.sessionId);

      let entries: Array<{ relativePath: string; size: number }> = [];

      const walk = (dir: string, prefix: string) => {
        let items: string[];
        try {
          items = readdirSync(dir);
        } catch {
          return;
        }
        for (const item of items) {
          const fullPath = join(dir, item);
          try {
            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
              walk(fullPath, prefix ? `${prefix}/${item}` : item);
            } else {
              entries.push({
                relativePath: prefix ? `${prefix}/${item}` : item,
                size: stat.size,
              });
            }
          } catch {
            // skip inaccessible files
          }
        }
      };

      walk(scriptsRoot, '');

      if (entries.length === 0) {
        context.emit('text', '\nNo generated files yet.\n');
        context.emit('done');
        return { handled: true };
      }

      const formatSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      };

      let message = `\n**Generated Files** (${entries.length})\n`;
      message += `📂 ${scriptsRoot}\n\n`;
      for (const entry of entries) {
        message += `  ${entry.relativePath}  (${formatSize(entry.size)})\n`;
      }
      message += '\n';

      context.emit('text', message);
      context.emit('done');
      return { handled: true };
    },
  };
}


export function undoCommand(): Command {
  return {
    name: 'undo',
    description: 'Revert uncommitted changes (file, all, or show preview)',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      const parts = splitArgs(args);
      const opts = { cwd: context.cwd };

      try {
        if (parts.length === 0) {
          const { stdout } = await execAsync('git diff --stat', opts);
          const statOutput = stdout.trim();

          if (!statOutput) {
            context.emit('text', '\nNo uncommitted changes to undo.\n');
            context.emit('done');
            return { handled: true };
          }

          let message = '\n**Uncommitted Changes:**\n```\n' + statOutput + '\n```\n\n';
          message += 'Use `/undo <file>` to revert a specific file\n';
          message += 'Use `/undo all` to revert all changes\n';

          context.emit('text', message);
          context.emit('done');
          return { handled: true };
        }

        if (parts[0] === 'all') {
          const { stdout } = await execAsync('git diff --stat', opts);
          const statOutput = stdout.trim();

          if (!statOutput) {
            context.emit('text', '\nNo uncommitted changes to undo.\n');
            context.emit('done');
            return { handled: true };
          }

          await execAsync('git checkout -- .', opts);
          context.emit('text', '\n**Reverted all uncommitted changes:**\n```\n' + statOutput + '\n```\n');
          context.emit('done');
          return { handled: true };
        }

        // Revert specific file(s)
        const escaped = parts.map(f => `'${f.replace(/'/g, "'\\''")}'`).join(' ');
        const { stdout } = await execAsync(`git diff --stat -- ${escaped}`, opts);
        const checkOutput = stdout.trim();

        if (!checkOutput) {
          context.emit('text', `\nNo changes found for: ${parts.join(' ')}\n`);
          context.emit('done');
          return { handled: true };
        }

        await execAsync(`git checkout -- ${escaped}`, opts);
        context.emit('text', `\n**Reverted:** ${parts.join(' ')}\n`);
      } catch {
        context.emit('text', '\nNot a git repository or git not available.\n');
      }

      context.emit('done');
      return { handled: true };
    },
  };
}


export function treeCommand(): Command {
  return {
    name: 'tree',
    description: 'Show session message history as a navigable tree',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (_args, context) => {
      const messages = context.messages;

      if (!messages || messages.length === 0) {
        context.emit('text', '\nNo messages in the current session.\n');
        context.emit('done');
        return { handled: true };
      }

      let output = '\n## Session Tree\n\n';

      const formatTimeAgo = (ts: number): string => {
        const diff = Date.now() - ts;
        const seconds = Math.floor(diff / 1000);
        if (seconds < 60) return `${seconds}s ago`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
      };

      const preview = (text: string): string => {
        const clean = text.replace(/\n/g, ' ').trim();
        return clean.length > 50 ? clean.slice(0, 50) + '...' : clean;
      };

      // Build tree: user messages are branch points, assistant responses are leaves
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i] as { role: string; content: string; timestamp?: number; parentId?: string };
        const isLast = i === messages.length - 1;
        const timeStr = msg.timestamp ? ` (${formatTimeAgo(msg.timestamp)})` : '';

        if (msg.role === 'user') {
          const connector = isLast ? '└─' : '├─';
          output += `${connector} [user] "${preview(msg.content)}"${timeStr}\n`;

          // Look ahead for assistant response(s)
          let j = i + 1;
          while (j < messages.length && messages[j].role === 'assistant') {
            const aMsg = messages[j] as { role: string; content: string; timestamp?: number };
            const aTimeStr = aMsg.timestamp ? ` (${formatTimeAgo(aMsg.timestamp)})` : '';
            const isLastAssistant = j + 1 >= messages.length || messages[j + 1].role !== 'assistant';
            const prefix = isLast ? '   ' : '│  ';
            const aConnector = isLastAssistant ? '└─' : '├─';
            output += `${prefix}${aConnector} [assistant] "${preview(aMsg.content)}"${aTimeStr}\n`;
            j++;
          }
          // Skip assistant messages we already rendered
          i = j - 1;
        } else if (msg.role === 'system') {
          const connector = isLast ? '└─' : '├─';
          output += `${connector} [system] "${preview(msg.content)}"${timeStr}\n`;
        } else {
          // Standalone assistant message (no preceding user message)
          const connector = isLast ? '└─' : '├─';
          output += `${connector} [assistant] "${preview(msg.content)}"${timeStr}\n`;
        }
      }

      output += `\n**Total messages:** ${messages.length}\n`;

      context.emit('text', output);
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /export - Export current conversation in portable markdown or JSON format
 */
export function exportCommand(tokenUsage: TokenUsage): Command {
  return {
    name: 'export',
    description: 'Export current conversation to markdown or JSON file',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const arg = args.trim().toLowerCase();

      if (arg === 'help') {
        context.emit('text', [
          '\nUsage:',
          '  /export          — Export as portable markdown (default)',
          '  /export md       — Export as portable markdown',
          '  /export json     — Export as raw JSON',
          '  /export help     — Show this help',
          '',
        ].join('\n') + '\n');
        context.emit('done');
        return { handled: true };
      }

      const format = arg === 'json' ? 'json' : 'md';
      const storageDir = context.getStorageDir?.() || getConfigDir();
      const exportsDir = join(storageDir, 'exports');

      if (!existsSync(exportsDir)) {
        mkdirSync(exportsDir, { recursive: true });
      }

      const messages = context.messages || [];
      const sessionId = context.sessionId;
      const model = context.getModel?.() || 'unknown';
      const now = new Date();
      const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `${sessionId}-${dateStr}.${format}`;
      const filePath = join(exportsDir, filename);

      if (format === 'json') {
        const data = {
          sessionId,
          model,
          exportedAt: now.toISOString(),
          messageCount: messages.length,
          tokenUsage: tokenUsage,
          messages,
        };
        writeFileSync(filePath, JSON.stringify(data, null, 2));
      } else {
        const lines: string[] = [];

        // Header
        lines.push('# Conversation Export');
        lines.push('');
        lines.push(`- **Session**: ${sessionId}`);
        lines.push(`- **Date**: ${now.toISOString()}`);
        lines.push(`- **Model**: ${model}`);
        lines.push('');
        lines.push('---');
        lines.push('');

        // Messages
        let messageCount = 0;
        for (const msg of messages as Array<{ role: string; content: unknown; tool_calls?: unknown[]; tool_call_id?: string; name?: string }>) {
          const role = msg.role || 'unknown';

          if (role === 'system') {
            continue; // Skip system messages in portable export
          }

          messageCount++;
          const roleName = role === 'user' ? 'User' : role === 'assistant' ? 'Assistant' : role === 'tool' ? 'Tool Result' : role;
          lines.push(`## ${roleName}`);
          lines.push('');

          // Handle content
          if (typeof msg.content === 'string') {
            lines.push(msg.content);
          } else if (Array.isArray(msg.content)) {
            for (const part of msg.content as Array<{ type: string; text?: string; tool_use_id?: string; content?: string }>) {
              if (part.type === 'text' && part.text) {
                lines.push(part.text);
              } else if (part.type === 'tool_result' && part.content) {
                lines.push(`### Tool Result (${part.tool_use_id || 'unknown'})`);
                lines.push('');
                lines.push('```');
                lines.push(typeof part.content === 'string' ? part.content : JSON.stringify(part.content, null, 2));
                lines.push('```');
              }
            }
          } else if (msg.content != null) {
            lines.push(String(msg.content));
          }
          lines.push('');

          // Handle tool calls (assistant messages with tool_use blocks)
          if (Array.isArray(msg.tool_calls)) {
            for (const call of msg.tool_calls as Array<{ function?: { name: string; arguments: string }; id?: string }>) {
              if (call.function) {
                lines.push(`### Tool Call: ${call.function.name}`);
                lines.push('');
                lines.push('```json');
                try {
                  lines.push(JSON.stringify(JSON.parse(call.function.arguments), null, 2));
                } catch {
                  lines.push(call.function.arguments);
                }
                lines.push('```');
                lines.push('');
              }
            }
          }
        }

        // Footer
        lines.push('---');
        lines.push('');
        lines.push(`_${messageCount} messages exported. Tokens used: ${tokenUsage.totalTokens.toLocaleString()}_`);
        lines.push('');

        writeFileSync(filePath, lines.join('\n'));
      }

      context.emit('text', `\nConversation exported to:\n  ${filePath}\n`);
      context.emit('done');
      return { handled: true };
    },
  };
}
