import type { Command, TokenUsage } from './types';
import { splitArgs, singleLine, resetTokenUsage, parseDisclosureOptions, pageItems, disclosureHint, truncateText } from './helpers';
import { SessionStorage } from '../logger';
import { formatRelativeTime } from '../scheduler/format';

/**
 * /clear - Clear conversation history
 */
export function clearCommand(tokenUsage: TokenUsage): Command {
  return {
    name: 'clear',
    description: 'Clear current conversation history and reset context',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      context.clearMessages();
      tokenUsage.inputTokens = 0;
      tokenUsage.outputTokens = 0;
      tokenUsage.totalTokens = 0;
      tokenUsage.cacheReadTokens = 0;
      tokenUsage.cacheWriteTokens = 0;
      context.emit('text', 'Conversation cleared. Starting fresh.\n');
      context.emit('done');
      return { handled: true, clearConversation: true };
    },
  };
}


/**
 * /new - Start a new conversation (alias for /clear)
 */
export function newCommand(tokenUsage: TokenUsage): Command {
  return {
    name: 'new',
    description: 'Start a new conversation session (preserves previous session)',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      context.clearMessages();
      tokenUsage.inputTokens = 0;
      tokenUsage.outputTokens = 0;
      tokenUsage.totalTokens = 0;
      tokenUsage.cacheReadTokens = 0;
      tokenUsage.cacheWriteTokens = 0;
      context.emit('text', 'Starting new conversation.\n');
      context.emit('done');
      return { handled: true, clearConversation: true };
    },
  };
}


/**
 * /session - List and switch sessions
 */
export function sessionCommand(): Command {
  return {
    name: 'sessions',
    aliases: ['session'],
    description: 'Manage sessions: list, create with agent, switch, assign agent',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const parts = splitArgs(args);
      const sub = parts[0]?.toLowerCase() || '';

      // /session help
      if (sub === 'help') {
        let message = '\n## Session Commands\n\n';
        message += '/session                           List all sessions\n';
        message += '/session list                      List all sessions with agents\n';
        message += '/session new [label] --agent <name>  Create session with agent\n';
        message += '/session assign <agent>            Assign agent to current session\n';
        message += '/session rename [number] <label>   Rename a session (defaults to current)\n';
        message += '/session <number>                  Switch to session by number\n';
        message += '/session help                      Show this help\n';
        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      // /session new [label] --agent <name>
      if (sub === 'new') {
        let label: string | undefined;
        let agent: string | undefined;

        // Parse --agent flag
        const agentIdx = parts.indexOf('--agent');
        if (agentIdx !== -1 && parts[agentIdx + 1]) {
          agent = parts[agentIdx + 1];
          const labelParts = parts.slice(1, agentIdx);
          if (labelParts.length > 0) {
            label = labelParts.join(' ');
          }
        } else {
          const labelParts = parts.slice(1);
          if (labelParts.length > 0) {
            label = labelParts.join(' ');
          }
        }

        // Validate agent name if provided
        if (agent) {
          const assistantManager = context.getAssistantManager?.();
          if (assistantManager) {
            const assistants = assistantManager.listAssistants();
            const found = assistants.find(
              (a) => a.name.toLowerCase() === agent!.toLowerCase() || a.id === agent
            );
            if (!found) {
              const names = assistants.map((a) => a.name).join(', ');
              context.emit('text', `\n⚠ Agent "${agent}" not found. Available: ${names || 'none'}\n`);
              context.emit('done');
              return { handled: true };
            }
            agent = found.id;
            if (label) {
              context.emit('text', `\n✓ Creating session "${label}" with agent ${found.name}\n`);
            } else {
              context.emit('text', `\n✓ Creating session with agent ${found.name}\n`);
            }
          }
        }

        context.emit('done');
        return {
          handled: true,
          sessionAction: 'new',
          sessionLabel: label,
          sessionAgent: agent,
        };
      }

      // /session assign <agent>
      if (sub === 'assign') {
        const agentName = parts.slice(1).join(' ').trim();
        if (!agentName) {
          context.emit('text', '\nUsage: /session assign <agent-name>\n');
          context.emit('done');
          return { handled: true };
        }

        const assistantManager = context.getAssistantManager?.();
        if (!assistantManager) {
          context.emit('text', '\n⚠ Assistant manager not available.\n');
          context.emit('done');
          return { handled: true };
        }

        const assistants = assistantManager.listAssistants();
        const found = assistants.find(
          (a) => a.name.toLowerCase() === agentName.toLowerCase() || a.id === agentName
        );
        if (!found) {
          const names = assistants.map((a) => a.name).join(', ');
          context.emit('text', `\n⚠ Agent "${agentName}" not found. Available: ${names || 'none'}\n`);
          context.emit('done');
          return { handled: true };
        }

        context.emit('text', `\n✓ Assigned agent **${found.name}** to current session\n`);
        context.emit('done');
        return {
          handled: true,
          sessionAction: 'assign',
          sessionAgent: found.id,
        };
      }

      // /session rename [number] <label>
      if (sub === 'rename' || sub === 'name') {
        if (parts.length < 2) {
          context.emit('text', '\nUsage: /session rename [number] <label>\n');
          context.emit('done');
          return { handled: true };
        }

        let sessionNumber: number | undefined;
        let labelParts = parts.slice(1);
        const firstArg = parts[1];
        const parsedNumber = parseInt(firstArg, 10);
        if (!isNaN(parsedNumber) && parsedNumber > 0) {
          sessionNumber = parsedNumber;
          labelParts = parts.slice(2);
        } else if (['current', 'this', '.'].includes(firstArg.toLowerCase())) {
          labelParts = parts.slice(2);
        }

        const label = labelParts.join(' ').trim();
        if (!label) {
          context.emit('text', '\nUsage: /session rename [number] <label>\n');
          context.emit('done');
          return { handled: true };
        }

        context.emit('done');
        return {
          handled: true,
          sessionAction: 'rename',
          sessionNumber,
          sessionLabel: label,
        };
      }

      // /session <number> - switch
      const num = parseInt(sub, 10);
      if (!isNaN(num) && num > 0) {
        context.emit('done');
        return { handled: true, sessionAction: 'switch', sessionNumber: num };
      }

      // /session list or no arg - signal to show session list
      context.emit('done');
      return { handled: true, sessionAction: 'list' };
    },
  };
}


/**
 * /resume - Resume saved sessions
 */
export function resumeCommand(): Command {
  return {
    name: 'resume',
    description: 'Resume saved sessions from disk',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const parts = splitArgs(args);
      const showAll = parts.includes('--all');
      const filteredParts = parts.filter((part) => part !== '--all');
      const cleanedArgs = filteredParts[0]?.toLowerCase() || '';

      if (!cleanedArgs || cleanedArgs === 'ui') {
        context.emit('done');
        return {
          handled: true,
          showPanel: 'resume',
          panelValue: showAll ? 'all' : 'cwd',
        };
      }

      if (cleanedArgs === 'list' || cleanedArgs === '--list') {
        const outputOptions = parseDisclosureOptions(filteredParts.slice(1));
        if (outputOptions.error) {
          context.emit('text', `${outputOptions.error}\n`);
          context.emit('done');
          return { handled: true };
        }
        const allSessions = SessionStorage.listAllSessions(context.getStorageDir?.());
        const normalizeCwd = (value: string) => value.replace(/\/+$/, '');
        const targetCwd = normalizeCwd(context.cwd);
        const sessions = showAll
          ? allSessions
          : allSessions.filter((session) => normalizeCwd(session.cwd) === targetCwd);

        if (sessions.length === 0) {
          context.emit(
            'text',
            showAll
              ? 'No saved sessions found.\n'
              : 'No saved sessions found for this directory.\n'
          );
          context.emit('done');
          return { handled: true };
        }

        const assistantManager = context.getAssistantManager?.();
        const assistantNames = assistantManager
          ? new Map(assistantManager.listAssistants().map((a) => [a.id, a.name]))
          : null;
        const page = pageItems(sessions, outputOptions);

        const truncate = (value: string, maxLen: number) =>
          value.length > maxLen ? `${value.slice(0, maxLen - 3)}...` : value;
        const escapeCell = (value: string) =>
          value.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

        if (outputOptions.json) {
          context.emit('text', JSON.stringify({
            sessions: page.items,
            total: page.total,
            limit: outputOptions.limit,
            cursor: outputOptions.cursor,
            nextCursor: page.nextCursor,
          }, null, 2));
          context.emit('done');
          return { handled: true };
        }

        let output = `\n**Saved Sessions** (${page.shown}/${page.total})\n\n`;
        if (showAll) {
          output += '| ID | Assistant | Updated | Messages | CWD |\n';
          output += '|----|-----------|---------|----------|-----|\n';
        } else {
          output += '| ID | Updated | Messages | CWD |\n';
          output += '|----|---------|----------|-----|\n';
        }

        for (const session of page.items) {
          const updated = formatRelativeTime(new Date(session.updatedAt).getTime());
          const messageCount = session.messageCount ?? 0;
          const cwd = escapeCell(truncateText(session.cwd || '', outputOptions.verbose ? 100 : 48));
          const id = escapeCell(session.id.slice(0, 8));
          if (showAll) {
            const assistantLabel = session.assistantId
              ? assistantNames?.get(session.assistantId) || session.assistantId
              : 'default';
            output += `| ${id} | ${escapeCell(truncate(assistantLabel, outputOptions.verbose ? 32 : 16))} | ${updated} | ${messageCount} | ${cwd} |\n`;
          } else {
            output += `| ${id} | ${updated} | ${messageCount} | ${cwd} |\n`;
          }
        }
        output += disclosureHint(outputOptions, page.total, page.shown, '/resume <id>');

        context.emit('text', output);
        context.emit('done');
        return { handled: true };
      }

      context.emit('text', '\n**Resume** - Load saved sessions from disk\n\n');
      context.emit('text', 'Usage:\n');
      context.emit('text', '  /resume             Open interactive panel (current folder)\n');
      context.emit('text', '  /resume --all       Open interactive panel (all sessions)\n');
      context.emit('text', '  /resume list [--limit n] [--cursor n] [--verbose] [--json]\n');
      context.emit('text', '  /resume list --all  Show text table (all sessions)\n');
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /rename <name> - Shortcut to rename the current session
 */
export function renameCommand(): Command {
  return {
    name: 'rename',
    description: 'Rename the current session (shortcut for /session rename)',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const label = args.trim();
      if (!label) {
        context.emit('text', '\nUsage: /rename <name>\nExample: /rename auth-refactor\n');
        context.emit('done');
        return { handled: true };
      }

      context.emit('done');
      return {
        handled: true,
        sessionAction: 'rename',
        sessionLabel: label,
      };
    },
  };
}


export function exitCommand(): Command {
  return {
    name: 'exit',
    description: 'Exit the assistant session and return to shell',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      context.emit('text', 'Goodbye!\n');
      context.emit('done');
      // Signal exit by returning special flag
      return { handled: true, exit: true };
    },
  };
}


/**
 * /compact - Summarize conversation to save context
 */
export function compactCommand(): Command {
  return {
    name: 'compact',
    description: 'Summarize conversation to save context space (auto-compaction)',
    builtin: true,
    selfHandled: false,
    content: `Please summarize our conversation so far into a concise format that preserves:
1. Key decisions made
2. Important context about the codebase
3. Current task/goal we're working on
4. Any constraints or requirements mentioned

Format the summary as a brief bullet-point list. This summary will replace the conversation history to save context space.`,
  };
}
