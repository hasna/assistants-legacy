import type { Command, CommandContext, TokenUsage } from './types';
import { splitArgs, singleLine, parseDisclosureOptions, pageItems, disclosureHint, truncateText } from './helpers';
import { getConfigDir } from '../config';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { getRuntime } from '../runtime';
import { generateId } from '@hasna/assistants-shared';
import {
  ensureDefaultProject,
  readProject,
  updateProject,
  type ProjectContextEntry,
  type ProjectRecord,
} from '../projects/store';
import { buildProjectContext } from '../projects/context';

async function ensureActiveProject(
  context: CommandContext,
  createIfMissing: boolean
): Promise<ProjectRecord | null> {
  const activeId = context.getActiveProjectId?.();
  if (activeId) {
    const project = await readProject(context.cwd, activeId);
    if (project) return project;
  }

  if (!createIfMissing) return null;

  const project = await ensureDefaultProject(context.cwd);
  context.setActiveProjectId?.(project.id);
  await applyProjectContext(context, project);
  return project;
}

async function applyProjectContext(context: CommandContext, project: ProjectRecord): Promise<void> {
  if (!context.setProjectContext) return;
  const projectContext = await buildProjectContext(project, {
    cwd: context.cwd,
    connectors: context.connectors,
  });
  context.setProjectContext(projectContext);
}

/**
 * /context - Manage injected project context or show context status
 */
export function contextCommand(): Command {
  return {
    name: 'context',
    description: 'Manage injected project context (files, connectors, notes) or show status',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const parts = splitArgs(args);
      const sub = parts[0] || 'status';

      if (sub === 'help') {
        const usage = [
          'Usage:',
          '  /context status',
          '  /context list [--limit n] [--cursor n] [--verbose] [--json]',
          '  /context add file <path>',
          '  /context add connector <name>',
          '  /context add database <name>',
          '  /context add note <text>',
          '  /context add entity <text>',
          '  /context remove <id>',
          '  /context clear',
        ].join('\n');
        context.emit('text', `\n${usage}\n`);
        context.emit('done');
        return { handled: true };
      }

      if (sub === 'status') {
        const info = context.getContextInfo?.();
        if (!info) {
          context.emit('text', '\nContext summarization is not available.\n');
          context.emit('done');
          return { handled: true };
        }

        const { config, state } = info;
        const rawPercent = config.maxContextTokens > 0
          ? Math.round((state.totalTokens / config.maxContextTokens) * 100)
          : 0;
        const usedPercent = Math.max(0, Math.min(100, rawPercent));

        let message = '\n**Context Status**\n\n';
        message += `**Messages:** ${state.messageCount}\n`;
        message += `**Estimated Tokens:** ${state.totalTokens.toLocaleString()} / ${config.maxContextTokens.toLocaleString()} (${usedPercent}%)\n`;
        message += `**Summary Count:** ${state.summaryCount}\n`;
        message += `**Strategy:** ${config.summaryStrategy}\n`;
        message += `**Keep Recent Messages:** ${config.keepRecentMessages}\n`;

        if (state.lastSummaryAt) {
          message += `**Last Summary:** ${state.lastSummaryAt}\n`;
          if (state.lastSummaryTokensBefore && state.lastSummaryTokensAfter) {
            message += `**Last Summary Tokens:** ${state.lastSummaryTokensBefore.toLocaleString()} -> ${state.lastSummaryTokensAfter.toLocaleString()}\n`;
          }
        }

        const barLength = 30;
        const filledLength = Math.max(0, Math.min(barLength, Math.round((usedPercent / 100) * barLength)));
        const bar = '█'.repeat(filledLength) + '░'.repeat(Math.max(0, barLength - filledLength));
        message += `\n[${bar}] ${usedPercent}%\n`;

        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      const project = await ensureActiveProject(context, true);
      if (!project) {
        context.emit('text', 'No project found. Use /projects new <name> first.\n');
        context.emit('done');
        return { handled: true };
      }

      if (sub === 'list') {
        const outputOptions = parseDisclosureOptions(parts.slice(1));
        if (outputOptions.error) {
          context.emit('text', `${outputOptions.error}\n`);
          context.emit('done');
          return { handled: true };
        }
        if (project.context.length === 0) {
          context.emit('text', `\nNo context entries for project "${project.name}".\n`);
          context.emit('done');
          return { handled: true };
        }
        const page = pageItems(project.context, outputOptions);
        if (outputOptions.json) {
          context.emit('text', JSON.stringify({
            entries: page.items,
            total: page.total,
            limit: outputOptions.limit,
            cursor: outputOptions.cursor,
            nextCursor: page.nextCursor,
          }, null, 2));
          context.emit('done');
          return { handled: true };
        }
        let output = `\n**Context Entries (${truncateText(project.name, 56)})** (${page.shown}/${page.total})\n\n`;
        for (const entry of page.items) {
          const label = entry.label ? ` (${truncateText(entry.label, 40)})` : '';
          output += `- ${entry.id} [${entry.type}] ${truncateText(entry.value, outputOptions.verbose ? 160 : 80)}${label}\n`;
        }
        output += disclosureHint(outputOptions, page.total, page.shown, '/context remove <id>');
        context.emit('text', output);
        context.emit('done');
        return { handled: true };
      }

      if (sub === 'clear') {
        const updated = await updateProject(context.cwd, project.id, (current) => ({
          ...current,
          context: [],
          updatedAt: Date.now(),
        }));
        if (updated) {
          await applyProjectContext(context, updated);
          context.emit('text', `Cleared context entries for "${updated.name}".\n`);
          context.emit('done');
          return { handled: true };
        }
        context.emit('text', `Failed to clear context entries for "${project.name}".\n`);
        context.emit('done');
        return { handled: true };
      }

      if (sub === 'remove') {
        const id = parts[1];
        if (!id) {
          context.emit('text', 'Usage: /context remove <id>\n');
          context.emit('done');
          return { handled: true };
        }
        if (!project.context.some((entry) => entry.id === id)) {
          context.emit('text', `Context entry not found: ${id}\n`);
          context.emit('done');
          return { handled: true };
        }
        const updated = await updateProject(context.cwd, project.id, (current) => ({
          ...current,
          context: current.context.filter((entry) => entry.id !== id),
          updatedAt: Date.now(),
        }));
        if (updated) {
          await applyProjectContext(context, updated);
          context.emit('text', `Removed context entry ${id} from "${updated.name}".\n`);
          context.emit('done');
          return { handled: true };
        }
        context.emit('text', `Failed to remove context entry ${id} from "${project.name}".\n`);
        context.emit('done');
        return { handled: true };
      }

      if (sub === 'add') {
        const type = parts[1];
        const value = parts.slice(2).join(' ').trim();
        if (!type) {
          context.emit('text', 'Usage: /context add <type> <value>\n');
          context.emit('done');
          return { handled: true };
        }

        const allowedTypes: ProjectContextEntry['type'][] = ['file', 'connector', 'database', 'note', 'entity'];
        const entryType = allowedTypes.includes(type as ProjectContextEntry['type'])
          ? (type as ProjectContextEntry['type'])
          : 'note';
        const entryValue = entryType === 'note' && !value ? parts.slice(1).join(' ').trim() : value;
        if (!entryValue) {
          context.emit('text', 'Error: context value is required.\n');
          context.emit('done');
          return { handled: true };
        }

        const entry: ProjectContextEntry = {
          id: generateId(),
          type: entryType,
          value: entryValue,
          addedAt: Date.now(),
        };

        const updated = await updateProject(context.cwd, project.id, (current) => ({
          ...current,
          context: [...current.context, entry],
          updatedAt: Date.now(),
        }));

        if (updated) {
          await applyProjectContext(context, updated);
          context.emit('text', `Added ${entry.type} context to "${updated.name}".\n`);
          context.emit('done');
          return { handled: true };
        }
        context.emit('text', `Failed to add context entry to "${project.name}".\n`);
        context.emit('done');
        return { handled: true };
      }

      context.emit('text', 'Unknown /context command. Use /context help.\n');
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /tokens - Show token usage (alias for /status)
 */
export function tokensCommand(tokenUsage: TokenUsage): Command {
  return {
    name: 'tokens',
    description: 'Show token usage breakdown (input, output, cache, total)',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const usage = tokenUsage;
      const rawPercent = usage.maxContextTokens > 0
        ? Math.round((usage.totalTokens / usage.maxContextTokens) * 100)
        : 0;
      const usedPercent = Math.max(0, Math.min(100, rawPercent));

      let message = '\n**Token Usage**\n\n';
      message += `Input: ${usage.inputTokens.toLocaleString()}\n`;
      message += `Output: ${usage.outputTokens.toLocaleString()}\n`;
      message += `Total: ${usage.totalTokens.toLocaleString()} / ${usage.maxContextTokens.toLocaleString()} (${usedPercent}%)\n`;

      // Visual progress bar
      const barLength = 30;
      const filledLength = Math.max(0, Math.min(barLength, Math.round((usedPercent / 100) * barLength)));
      const bar = '█'.repeat(filledLength) + '░'.repeat(Math.max(0, barLength - filledLength));
      message += `\n[${bar}] ${usedPercent}%\n`;

      context.emit('text', message);
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /summarize - Summarize conversation in background
 *
 * Unlike /compact (which sends a prompt to the LLM in-stream),
 * /summarize dispatches a background task to summarize the context
 * and posts results to the inbox when done.
 */
export function summarizeCommand(): Command {
  return {
    name: 'summarize',
    description: 'Summarize conversation in background (results posted to inbox)',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const parts = splitArgs(args);
      const flag = parts[0]?.toLowerCase();

      // /summarize help
      if (flag === 'help') {
        context.emit('text', '\n## /summarize - Background Context Summarization\n\n');
        context.emit('text', 'Dispatches a background task to summarize the current conversation.\n');
        context.emit('text', 'Results are posted to your inbox when complete.\n\n');
        context.emit('text', '**Usage:**\n');
        context.emit('text', '  /summarize         Start background summarization\n');
        context.emit('text', '  /summarize now     Summarize immediately (no background)\n');
        context.emit('text', '  /summarize help    Show this help\n\n');
        context.emit('text', '**Note:** Use `/compact` for in-stream summarization.\n');
        context.emit('done');
        return { handled: true };
      }

      // /summarize now - immediate summarization (legacy behavior)
      if (flag === 'now') {
        if (!context.summarizeContext) {
          context.emit('text', '\nContext summarization is not available.\n');
          context.emit('done');
          return { handled: true };
        }

        const result = await context.summarizeContext();
        if (!result.summarized) {
          context.emit('text', '\nNothing to summarize right now.\n');
          context.emit('done');
          return { handled: true };
        }

        let message = '\n**Context Summary Generated**\n\n';
        message += `Summarized ${result.summarizedCount} message(s).\n`;
        message += `Tokens: ${result.tokensBefore.toLocaleString()} -> ${result.tokensAfter.toLocaleString()}\n\n`;
        if (result.summary) {
          message += `${result.summary}\n`;
        }

        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      // Default: background summarization
      if (!context.summarizeContext) {
        context.emit('text', '\nContext summarization is not available.\n');
        context.emit('done');
        return { handled: true };
      }

      // Get context info for the summary task
      const contextInfo = context.getContextInfo?.();
      if (!contextInfo || contextInfo.state.messageCount < 2) {
        context.emit('text', '\nNot enough context to summarize yet.\n');
        context.emit('done');
        return { handled: true };
      }

      // Perform summarization - we do it immediately but present it as "background"
      // since the actual LLM work happens asynchronously
      context.emit('text', '\n📋 Starting context summarization...\n');

      try {
        const result = await context.summarizeContext();

        if (!result.summarized) {
          context.emit('text', 'Nothing to summarize right now.\n');
          context.emit('done');
          return { handled: true };
        }

        // Post result to inbox if available
        const inboxManager = context.getInboxManager?.();
        const messagesManager = context.getMessagesManager?.();

        let summaryMessage = `## Context Summary\n\n`;
        summaryMessage += `Summarized ${result.summarizedCount} message(s).\n`;
        summaryMessage += `Tokens: ${result.tokensBefore.toLocaleString()} → ${result.tokensAfter.toLocaleString()}\n\n`;
        if (result.summary) {
          summaryMessage += `${result.summary}\n`;
        }

        // Try to post to messages system for cross-session visibility
        if (messagesManager) {
          try {
            const assistant = context.getAssistantManager?.()?.getActive();
            const assistantId = assistant?.id || context.sessionId;
            const assistantName = assistant?.name || 'assistant';

            await messagesManager.send({
              to: assistantId, // Send to self for visibility in inbox
              body: summaryMessage,
              subject: 'Context Summary',
              priority: 'normal',
            });

            context.emit('text', '✓ Summary generated and posted to messages inbox.\n');
            context.emit('text', `  Use /messages to view the full summary.\n`);
          } catch {
            // If posting fails, just show inline
            context.emit('text', '✓ Summary generated:\n\n');
            context.emit('text', summaryMessage);
          }
        } else {
          // No messages system, show inline
          context.emit('text', '✓ Summary generated:\n\n');
          context.emit('text', summaryMessage);
        }

        context.emit('done');
        return { handled: true };
      } catch (error) {
        context.emit('text', `\n❌ Summarization failed: ${error instanceof Error ? error.message : String(error)}\n`);
        context.emit('done');
        return { handled: true };
      }
    },
  };
}


/**
 * /memory - Manage persistent memories
 */
export function memoryCommand(): Command {
  return {
    name: 'memory',
    description: 'Manage persistent memories (list, get, set, search, delete, stats, export, import)',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const manager = context.getMemoryManager?.();
      if (!manager) {
        context.emit('text', 'Memory system not available. Enable it in config.\n');
        context.emit('done');
        return { handled: true };
      }

      const [action, ...rest] = args.trim().split(/\s+/).filter(Boolean);

      // No args or explicit ui - open interactive panel
      if (!action || action === 'ui') {
        context.emit('done');
        return { handled: true, showPanel: 'memory' as const };
      }

      // /memory help - show help and stats
      if (action === 'help') {
        const stats = await manager.getStats();
        context.emit('text', '\n/memory - Persistent Memory Management\n');
        context.emit('text', '───────────────────────────────────────\n\n');
        context.emit('text', `Total memories: ${stats.totalCount}\n`);
        context.emit('text', `  By scope: global=${stats.byScope.global}, shared=${stats.byScope.shared}, private=${stats.byScope.private}\n`);
        context.emit('text', `  By category: preference=${stats.byCategory.preference}, fact=${stats.byCategory.fact}, knowledge=${stats.byCategory.knowledge}, history=${stats.byCategory.history}\n\n`);
        context.emit('text', 'Commands:\n');
        context.emit('text', '  /memory                         Open interactive memory panel\n');
        context.emit('text', '  /memory list [cat] [opts]     List memories compactly\n');
        context.emit('text', '  /memory get <key>             Get a specific memory\n');
        context.emit('text', '  /memory set <key> <value>     Save a memory (supports --scope, --scopeId)\n');
        context.emit('text', '  /memory update <key> [opts]   Update memory metadata\n');
        context.emit('text', '  /memory search <query>        Search memories\n');
        context.emit('text', '  /memory delete <key>          Delete a memory\n');
        context.emit('text', '  /memory stats                 Show detailed statistics\n');
        context.emit('text', '  /memory export [file]         Export memories to JSON\n');
        context.emit('text', '  /memory import <file>         Import memories from JSON\n');
        context.emit('text', '\nList options:\n');
        context.emit('text', '  --scope <global|shared|private>  Filter by scope\n');
        context.emit('text', '  --tags <tag1,tag2>               Filter by tags\n');
        context.emit('text', '  --importance <n>                 Minimum importance (1-10)\n');
        context.emit('text', '  --limit <n> --cursor <n>         Page results (default 20)\n');
        context.emit('text', '  --verbose                        Wider previews\n');
        context.emit('text', '  --json                           Structured page output\n');
        context.emit('text', '\nCategories: preference | fact | knowledge | history\n');
        context.emit('text', '  preference - User settings and choices (timezone, language, etc.)\n');
        context.emit('text', '  fact       - Known truths about the user or environment\n');
        context.emit('text', '  knowledge  - Learned information (patterns, API endpoints, etc.)\n');
        context.emit('text', '  history    - Session context and conversation topics\n');
        context.emit('done');
        return { handled: true };
      }

      // /memory list [category] [--scope global|shared|private] [--tags tag1,tag2] [--importance n]
      if (action === 'list') {
        const outputOptions = parseDisclosureOptions(rest);
        if (outputOptions.error) {
          context.emit('text', `${outputOptions.error}\n`);
          context.emit('done');
          return { handled: true };
        }
        const VALID_CATEGORIES = new Set(['preference', 'fact', 'knowledge', 'history']);
        const VALID_SCOPES = new Set(['global', 'shared', 'private']);
        let category: 'preference' | 'fact' | 'knowledge' | 'history' | undefined;
        let scope: 'global' | 'shared' | 'private' | undefined;
        let tags: string[] | undefined;
        let minImportance: number | undefined;
        const filterArgs = outputOptions.args;

        // Parse args
        let i = 0;
        while (i < filterArgs.length) {
          if (filterArgs[i] === '--scope' && filterArgs[i + 1]) {
            const scopeInput = filterArgs[i + 1].toLowerCase();
            if (!VALID_SCOPES.has(scopeInput)) {
              context.emit('text', `Error: Invalid scope "${filterArgs[i + 1]}". Must be one of: global, shared, private\n`);
              context.emit('done');
              return { handled: true };
            }
            scope = scopeInput as 'global' | 'shared' | 'private';
            i += 2;
          } else if (filterArgs[i] === '--tags' && filterArgs[i + 1]) {
            tags = filterArgs[i + 1].split(',').map(t => t.trim()).filter(Boolean);
            i += 2;
          } else if (filterArgs[i] === '--importance' && filterArgs[i + 1]) {
            const impInput = parseInt(filterArgs[i + 1], 10);
            if (isNaN(impInput) || impInput < 1 || impInput > 10) {
              context.emit('text', `Error: Invalid importance "${filterArgs[i + 1]}". Must be a number between 1 and 10.\n`);
              context.emit('done');
              return { handled: true };
            }
            minImportance = impInput;
            i += 2;
          } else if (!filterArgs[i].startsWith('--')) {
            // Positional argument - category
            const catInput = filterArgs[i].toLowerCase();
            if (VALID_CATEGORIES.has(catInput)) {
              category = catInput as 'preference' | 'fact' | 'knowledge' | 'history';
            }
            i++;
          } else {
            i++;
          }
        }

        const result = await manager.query({
          category,
          scope,
          tags: tags && tags.length > 0 ? tags : undefined,
          minImportance,
          limit: outputOptions.limit,
          offset: outputOptions.cursor,
          orderBy: 'importance',
          orderDir: 'desc',
        });

        if (result.memories.length === 0) {
          context.emit('text', 'No memories found.\n');
        } else if (outputOptions.json) {
          context.emit('text', JSON.stringify({
            memories: result.memories,
            total: result.total,
            limit: outputOptions.limit,
            cursor: outputOptions.cursor,
            nextCursor: result.hasMore ? outputOptions.cursor + result.memories.length : null,
          }, null, 2));
        } else {
          context.emit('text', `\nMemories (${result.memories.length}/${result.total}):\n`);
          for (const memory of result.memories) {
            const scopeTag = memory.scope === 'global' ? '[G]' : memory.scope === 'shared' ? '[S]' : '[P]';
            const summary = memory.summary || (typeof memory.value === 'string' ? memory.value : JSON.stringify(memory.value));
            context.emit('text', `  ${scopeTag} ${truncateText(memory.key, 48)}: ${truncateText(summary, outputOptions.verbose ? 160 : 56)} (${memory.category}, imp=${memory.importance})\n`);
          }
          context.emit('text', disclosureHint(outputOptions, result.total, result.memories.length, '/memory get <key>'));
        }
        context.emit('done');
        return { handled: true };
      }

      // /memory get <key>
      if (action === 'get') {
        const key = rest.join(' ');
        if (!key) {
          context.emit('text', 'Usage: /memory get <key>\n');
          context.emit('done');
          return { handled: true };
        }

        const memory = await manager.get(key);
        if (!memory) {
          context.emit('text', `Memory not found: ${key}\n`);
        } else {
          context.emit('text', `\nKey: ${memory.key}\n`);
          context.emit('text', `Category: ${memory.category}\n`);
          context.emit('text', `Scope: ${memory.scope}${memory.scopeId ? ` (${memory.scopeId})` : ''}\n`);
          context.emit('text', `Importance: ${memory.importance}/10\n`);
          context.emit('text', `Tags: ${memory.tags.length > 0 ? memory.tags.join(', ') : '(none)'}\n`);
          context.emit('text', `Created: ${memory.createdAt}\n`);
          context.emit('text', `Updated: ${memory.updatedAt}\n`);
          context.emit('text', `Accessed: ${memory.accessCount} times\n`);
          context.emit('text', `\nValue:\n${typeof memory.value === 'string' ? memory.value : JSON.stringify(memory.value, null, 2)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /memory set <key> <value> [--category <cat>] [--importance <n>] [--tags <t1,t2>] [--scope <scope>] [--scopeId <id>]
      if (action === 'set') {
        if (rest.length < 2) {
          context.emit('text', 'Usage: /memory set <key> <value> [options]\n');
          context.emit('text', '\nOptions:\n');
          context.emit('text', '  --category <preference|fact|knowledge|history>  Memory category (default: fact)\n');
          context.emit('text', '  --importance <1-10>                             Importance level (default: 5)\n');
          context.emit('text', '  --tags <tag1,tag2>                              Tags for filtering\n');
          context.emit('text', '  --scope <global|shared|private>                 Memory scope (default: private)\n');
          context.emit('text', '  --scopeId <id>                                  Scope identifier (for shared/private)\n');
          context.emit('done');
          return { handled: true };
        }

        const key = rest[0];
        let value = '';
        let category: 'preference' | 'fact' | 'knowledge' | 'history' = 'fact';
        let importance = 5;
        let tags: string[] = [];
        let scope: 'global' | 'shared' | 'private' | undefined;
        let scopeId: string | undefined;

        // Valid categories and scopes for validation
        const VALID_CATEGORIES = new Set(['preference', 'fact', 'knowledge', 'history']);
        const VALID_SCOPES = new Set(['global', 'shared', 'private']);

        // Parse remaining args
        let i = 1;
        while (i < rest.length) {
          if (rest[i] === '--category' && rest[i + 1]) {
            const catInput = rest[i + 1].toLowerCase();
            if (!VALID_CATEGORIES.has(catInput)) {
              context.emit('text', `Error: Invalid category "${rest[i + 1]}". Must be one of: preference, fact, knowledge, history\n`);
              context.emit('done');
              return { handled: true };
            }
            category = catInput as 'preference' | 'fact' | 'knowledge' | 'history';
            i += 2;
          } else if (rest[i] === '--importance' && rest[i + 1]) {
            const impInput = parseInt(rest[i + 1], 10);
            if (isNaN(impInput) || impInput < 1 || impInput > 10) {
              context.emit('text', `Error: Invalid importance "${rest[i + 1]}". Must be a number between 1 and 10.\n`);
              context.emit('done');
              return { handled: true };
            }
            importance = impInput;
            i += 2;
          } else if (rest[i] === '--tags' && rest[i + 1]) {
            tags = rest[i + 1].split(',').map(t => t.trim()).filter(Boolean);
            if (tags.length > 20) {
              context.emit('text', 'Error: Too many tags. Maximum is 20.\n');
              context.emit('done');
              return { handled: true };
            }
            i += 2;
          } else if (rest[i] === '--scope' && rest[i + 1]) {
            const scopeInput = rest[i + 1].toLowerCase();
            if (!VALID_SCOPES.has(scopeInput)) {
              context.emit('text', `Error: Invalid scope "${rest[i + 1]}". Must be one of: global, shared, private\n`);
              context.emit('done');
              return { handled: true };
            }
            scope = scopeInput as 'global' | 'shared' | 'private';
            i += 2;
          } else if (rest[i] === '--scopeId' && rest[i + 1]) {
            scopeId = rest[i + 1];
            i += 2;
          } else {
            value += (value ? ' ' : '') + rest[i];
            i++;
          }
        }

        if (!value) {
          context.emit('text', 'Error: value is required.\n');
          context.emit('done');
          return { handled: true };
        }

        // Validate key length
        if (key.length > 256) {
          context.emit('text', 'Error: key is too long. Maximum is 256 characters.\n');
          context.emit('done');
          return { handled: true };
        }

        // Validate value length
        if (value.length > 65536) {
          context.emit('text', 'Error: value is too long. Maximum is 64KB.\n');
          context.emit('done');
          return { handled: true };
        }

        // Validate scopeId usage
        if (scopeId && scope === 'global') {
          context.emit('text', 'Error: scopeId cannot be used with global scope.\n');
          context.emit('done');
          return { handled: true };
        }

        const memory = await manager.set(key, value, {
          category,
          importance,
          tags,
          source: 'user',
          scope,
          scopeId,
        });
        context.emit('text', `Memory saved: ${key} (scope: ${memory.scope})\n`);
        context.emit('done');
        return { handled: true };
      }

      // /memory search <query>
      if (action === 'search') {
        const outputOptions = parseDisclosureOptions(rest);
        if (outputOptions.error) {
          context.emit('text', `${outputOptions.error}\n`);
          context.emit('done');
          return { handled: true };
        }
        const query = outputOptions.args.join(' ');
        if (!query) {
          context.emit('text', 'Usage: /memory search <query> [--limit n] [--cursor n] [--verbose] [--json]\n');
          context.emit('done');
          return { handled: true };
        }

        const result = await manager.query({ search: query, limit: outputOptions.limit, offset: outputOptions.cursor });
        if (result.memories.length === 0) {
          context.emit('text', `No memories found matching: ${query}\n`);
        } else if (outputOptions.json) {
          context.emit('text', JSON.stringify({
            memories: result.memories,
            total: result.total,
            limit: outputOptions.limit,
            cursor: outputOptions.cursor,
            nextCursor: result.hasMore ? outputOptions.cursor + result.memories.length : null,
          }, null, 2));
        } else {
          context.emit('text', `\nSearch results for "${truncateText(query, 80)}" (${result.memories.length}/${result.total}):\n`);
          for (const memory of result.memories) {
            const summary = memory.summary || (typeof memory.value === 'string' ? memory.value : JSON.stringify(memory.value));
            context.emit('text', `  ${truncateText(memory.key, 48)}: ${truncateText(summary, outputOptions.verbose ? 160 : 64)}\n`);
          }
          context.emit('text', disclosureHint(outputOptions, result.total, result.memories.length, '/memory get <key>'));
        }
        context.emit('done');
        return { handled: true };
      }

      // /memory delete <key>
      if (action === 'delete') {
        const key = rest.join(' ');
        if (!key) {
          context.emit('text', 'Usage: /memory delete <key>\n');
          context.emit('done');
          return { handled: true };
        }

        const deleted = await manager.deleteByKey(key);
        if (deleted) {
          context.emit('text', `Memory deleted: ${key}\n`);
        } else {
          context.emit('text', `Memory not found: ${key}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /memory update <key> [--importance n] [--tags t1,t2] [--summary text]
      if (action === 'update') {
        if (rest.length < 1) {
          context.emit('text', 'Usage: /memory update <key> [--importance 1-10] [--tags tag1,tag2] [--summary text]\n');
          context.emit('done');
          return { handled: true };
        }

        const key = rest[0];
        let importance: number | undefined;
        let tags: string[] | undefined;
        let summary: string | undefined;

        // Parse arguments
        let i = 1;
        while (i < rest.length) {
          if (rest[i] === '--importance' && rest[i + 1]) {
            const impInput = parseInt(rest[i + 1], 10);
            if (isNaN(impInput) || impInput < 1 || impInput > 10) {
              context.emit('text', `Error: Invalid importance "${rest[i + 1]}". Must be a number between 1 and 10.\n`);
              context.emit('done');
              return { handled: true };
            }
            importance = impInput;
            i += 2;
          } else if (rest[i] === '--tags' && rest[i + 1]) {
            tags = rest[i + 1].split(',').map(t => t.trim()).filter(Boolean);
            if (tags.length > 20) {
              context.emit('text', 'Error: Too many tags. Maximum is 20.\n');
              context.emit('done');
              return { handled: true };
            }
            i += 2;
          } else if (rest[i] === '--summary') {
            // Collect all remaining args for summary
            i++;
            const summaryParts: string[] = [];
            while (i < rest.length && !rest[i].startsWith('--')) {
              summaryParts.push(rest[i]);
              i++;
            }
            summary = summaryParts.join(' ');
            if (summary.length > 500) {
              context.emit('text', 'Error: Summary too long. Maximum is 500 characters.\n');
              context.emit('done');
              return { handled: true };
            }
          } else {
            i++;
          }
        }

        // Require at least one update
        if (importance === undefined && tags === undefined && summary === undefined) {
          context.emit('text', 'Error: Provide at least one update (--importance, --tags, or --summary).\n');
          context.emit('done');
          return { handled: true };
        }

        // Find the memory
        const memory = await manager.get(key);
        if (!memory) {
          context.emit('text', `Memory not found: ${key}\n`);
          context.emit('done');
          return { handled: true };
        }

        // Build updates
        const updates: Record<string, unknown> = {};
        if (importance !== undefined) updates.importance = importance;
        if (tags !== undefined) updates.tags = tags;
        if (summary !== undefined) updates.summary = summary;

        await manager.update(memory.id, updates);
        context.emit('text', `Memory updated: ${key}\n`);
        context.emit('done');
        return { handled: true };
      }

      // /memory stats
      if (action === 'stats') {
        const stats = await manager.getStats();
        context.emit('text', '\nMemory Statistics\n');
        context.emit('text', '─────────────────\n');
        context.emit('text', `Total memories: ${stats.totalCount}\n\n`);
        context.emit('text', 'By scope:\n');
        context.emit('text', `  Global:  ${stats.byScope.global}\n`);
        context.emit('text', `  Shared:  ${stats.byScope.shared}\n`);
        context.emit('text', `  Private: ${stats.byScope.private}\n\n`);
        context.emit('text', 'By category:\n');
        context.emit('text', `  Preferences: ${stats.byCategory.preference}\n`);
        context.emit('text', `  Facts:       ${stats.byCategory.fact}\n`);
        context.emit('text', `  Knowledge:   ${stats.byCategory.knowledge}\n`);
        context.emit('text', `  History:     ${stats.byCategory.history}\n\n`);
        context.emit('text', `Average importance: ${stats.avgImportance.toFixed(1)}/10\n`);
        if (stats.oldestMemory) context.emit('text', `Oldest memory: ${stats.oldestMemory}\n`);
        if (stats.newestMemory) context.emit('text', `Newest memory: ${stats.newestMemory}\n`);
        context.emit('done');
        return { handled: true };
      }

      // /memory export [file]
      if (action === 'export') {
        const filePath = rest[0] || join(context.getStorageDir?.() || getConfigDir(), 'memories-export.json');
        const memories = await manager.export();

        try {
          const content = JSON.stringify(memories, null, 2);
          writeFileSync(filePath, content, 'utf-8');
          context.emit('text', `Exported ${memories.length} memories to: ${filePath}\n`);
        } catch (error) {
          context.emit('text', `Error exporting: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /memory import <file> [--overwrite]
      if (action === 'import') {
        let filePath = '';
        let overwrite = false;

        // Parse arguments
        for (const arg of rest) {
          if (arg === '--overwrite') {
            overwrite = true;
          } else if (!filePath) {
            filePath = arg;
          }
        }

        if (!filePath) {
          context.emit('text', 'Usage: /memory import <file> [--overwrite]\n');
          context.emit('text', '  --overwrite  Replace existing memories with same key\n');
          context.emit('done');
          return { handled: true };
        }

        try {
          const runtime = getRuntime();
          const file = runtime.file(filePath);
          if (!(await file.exists())) {
            context.emit('text', `File not found: ${filePath}\n`);
            context.emit('done');
            return { handled: true };
          }
          const content = await file.text();

          // Parse JSON
          let parsed: unknown;
          try {
            parsed = JSON.parse(content);
          } catch {
            context.emit('text', 'Error: Invalid JSON format.\n');
            context.emit('done');
            return { handled: true };
          }

          // Validate structure - must be an array
          if (!Array.isArray(parsed)) {
            context.emit('text', 'Error: File must contain a JSON array of memory objects.\n');
            context.emit('done');
            return { handled: true };
          }

          // Validate each memory entry
          const VALID_SCOPES = new Set(['global', 'shared', 'private']);
          const VALID_CATEGORIES = new Set(['preference', 'fact', 'knowledge', 'history']);
          const VALID_SOURCES = new Set(['user', 'assistant', 'system']);
          const validMemories: unknown[] = [];
          const errors: string[] = [];

          for (let i = 0; i < parsed.length; i++) {
            const entry = parsed[i] as Record<string, unknown>;

            // Validate required fields
            if (!entry || typeof entry !== 'object') {
              errors.push(`Entry ${i}: Must be an object`);
              continue;
            }

            if (!entry.key || typeof entry.key !== 'string') {
              errors.push(`Entry ${i}: Missing or invalid "key" (must be a string)`);
              continue;
            }

            if (entry.value === undefined) {
              errors.push(`Entry ${i}: Missing "value" field`);
              continue;
            }

            if (!entry.category || !VALID_CATEGORIES.has(entry.category as string)) {
              errors.push(`Entry ${i}: Invalid "category" (must be one of: preference, fact, knowledge, history)`);
              continue;
            }

            // Validate optional fields
            if (entry.scope && !VALID_SCOPES.has(entry.scope as string)) {
              errors.push(`Entry ${i}: Invalid "scope" (must be one of: global, shared, private)`);
              continue;
            }

            if (entry.source && !VALID_SOURCES.has(entry.source as string)) {
              errors.push(`Entry ${i}: Invalid "source" (must be one of: user, assistant, system)`);
              continue;
            }

            if (entry.importance !== undefined) {
              const imp = entry.importance as number;
              if (typeof imp !== 'number' || imp < 1 || imp > 10) {
                errors.push(`Entry ${i}: Invalid "importance" (must be 1-10)`);
                continue;
              }
            }

            if (entry.tags !== undefined) {
              if (!Array.isArray(entry.tags) || !entry.tags.every((t: unknown) => typeof t === 'string')) {
                errors.push(`Entry ${i}: Invalid "tags" (must be array of strings)`);
                continue;
              }
            }

            validMemories.push(entry);
          }

          // Report validation errors
          if (errors.length > 0) {
            context.emit('text', `Validation errors (${errors.length}):\n`);
            for (const err of errors.slice(0, 10)) {
              context.emit('text', `  - ${err}\n`);
            }
            if (errors.length > 10) {
              context.emit('text', `  ... and ${errors.length - 10} more errors\n`);
            }

            if (validMemories.length === 0) {
              context.emit('text', '\nNo valid entries to import. Please fix the errors and try again.\n');
              context.emit('done');
              return { handled: true };
            }

            // Import valid entries and skip invalid ones
            context.emit('text', `\nImporting ${validMemories.length} valid entries (skipping ${errors.length} invalid)...\n`);
          }

          // Import valid memories
          const imported = await manager.import(validMemories as Parameters<typeof manager.import>[0], { overwrite });
          context.emit('text', `Imported ${imported} memories from: ${filePath}${overwrite ? ' (with overwrite)' : ''}${errors.length > 0 ? ` (${errors.length} skipped)` : ''}\n`);
        } catch (error) {
          context.emit('text', `Error importing: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // Unknown action
      context.emit('text', `Unknown action: ${action}\n`);
      context.emit('text', 'Use /memory for help.\n');
      context.emit('done');
      return { handled: true };
    },
  };
}
