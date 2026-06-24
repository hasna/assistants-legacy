/**
 * Conversations tools leveraging @hasna/conversations spaces feature.
 * Adds broadcast channels (spaces) on top of the existing DM messages system.
 */

import type { Tool } from '@hasna/assistants-shared';
import type { ToolExecutor, ToolRegistry } from './registry';
import { DEFAULT_COMPACT_LIMIT, MAX_COMPACT_LIMIT, pageItems, truncateText } from '../commands/helpers';

// Lazily import @hasna/conversations to avoid module-level side effects
// that can interfere with Anthropic SDK streaming
async function getConversationsLib() {
  const { sendMessage, listSpaces, createSpace, joinSpace, leaveSpace } = await import('@hasna/conversations');
  return { sendMessage, listSpaces, createSpace, joinSpace, leaveSpace };
}

export function createMessagesSpacesListTool(): { tool: Tool; executor: ToolExecutor } {
  const tool: Tool = {
    name: 'messages_spaces_list',
    description: 'List available broadcast spaces for agent coordination. Spaces allow one-to-many messaging.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum spaces to return (default 20, max 100)' },
        cursor: { type: 'number', description: 'Zero-based offset for pagination' },
        verbose: { type: 'boolean', description: 'Include longer descriptions' },
        full: { type: 'boolean', description: 'Return all spaces without compact truncation' },
      },
    },
  };

  const executor: ToolExecutor = async (input) => {
    try {
      const { listSpaces } = await getConversationsLib();
      const spaces = listSpaces({});
      if (spaces.length === 0) return 'No spaces available. Create one with messages_spaces_join.';
      const full = input.full === true;
      const verbose = full || input.verbose === true;
      const limitInput = typeof input.limit === 'number' ? input.limit : DEFAULT_COMPACT_LIMIT;
      const cursorInput = typeof input.cursor === 'number' ? input.cursor : 0;
      const limit = full ? Math.max(spaces.length, 1) : Math.min(Math.max(Math.floor(limitInput), 1), MAX_COMPACT_LIMIT);
      const cursor = Math.max(Math.floor(cursorInput), 0);
      const page = pageItems(spaces, { limit, cursor });
      const lines = page.items.map((s) =>
        `• ${truncateText(s.name, verbose ? 100 : 48)}${s.description ? ` - ${truncateText(s.description, verbose ? 180 : 80)}` : ''}${s.message_count ? ` (${s.message_count} messages)` : ''}`
      );
      const hint = !full
        ? (page.nextCursor !== null
          ? `\nShowing ${page.shown} of ${page.total}. Pass cursor=${page.nextCursor} for more, or full=true for all spaces.`
          : '\nPass verbose=true for longer descriptions, or full=true for all spaces.')
        : '';
      return `Available spaces (${page.shown}/${page.total}):\n\n${lines.join('\n')}${hint}`;
    } catch (err) {
      return `Failed to list spaces: ${err instanceof Error ? err.message : String(err)}`;
    }
  };

  return { tool, executor };
}

export function createMessagesSpacesJoinTool(agentId: string): { tool: Tool; executor: ToolExecutor } {
  const tool: Tool = {
    name: 'messages_spaces_join',
    description: 'Join or create a broadcast space for agent coordination. Other agents can subscribe to the same space.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Space name (e.g. "deployments", "project-alpha")' },
        description: { type: 'string', description: 'Space description (used when creating new space)' },
      },
      required: ['name'],
    },
  };

  const executor: ToolExecutor = async (input) => {
    const name = String(input.name || '').trim();
    if (!name) return 'Space name is required.';

    try {
      const { joinSpace, createSpace } = await getConversationsLib();
      // Try to join existing space, or create+join a new one
      try {
        joinSpace(name, agentId);
        return `Joined space "${name}". Use messages_spaces_send to broadcast to all members.`;
      } catch {
        // Space doesn't exist — create it
        const desc = String(input.description || '');
        createSpace(name, agentId, { description: desc || undefined });
        return `Created and joined space "${name}".`;
      }
    } catch (err) {
      return `Failed to join space "${name}": ${err instanceof Error ? err.message : String(err)}`;
    }
  };

  return { tool, executor };
}

export function createMessagesSpacesSendTool(agentId: string): { tool: Tool; executor: ToolExecutor } {
  const tool: Tool = {
    name: 'messages_spaces_send',
    description: 'Broadcast a message to all members of a space. Use for team-wide announcements.',
    parameters: {
      type: 'object',
      properties: {
        space: { type: 'string', description: 'Space name to broadcast to' },
        content: { type: 'string', description: 'Message content' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], description: 'Message priority (default: normal)' },
      },
      required: ['space', 'content'],
    },
  };

  const executor: ToolExecutor = async (input) => {
    const space = String(input.space || '').trim();
    const content = String(input.content || '').trim();
    if (!space) return 'Space name is required.';
    if (!content) return 'Message content is required.';

    const priority = (['low', 'normal', 'high', 'urgent'].includes(String(input.priority)))
      ? String(input.priority) as 'low' | 'normal' | 'high' | 'urgent'
      : 'normal';

    try {
      const { sendMessage } = await getConversationsLib();
      sendMessage({
        from: agentId,
        to: space,
        space,
        content,
        priority,
      });
      return `Broadcast message to space "${space}".`;
    } catch (err) {
      return `Failed to send to space "${space}": ${err instanceof Error ? err.message : String(err)}`;
    }
  };

  return { tool, executor };
}

export function registerConversationsSpacesTools(registry: ToolRegistry, agentId: string): void {
  const list = createMessagesSpacesListTool();
  registry.register(list.tool, list.executor);
  const join = createMessagesSpacesJoinTool(agentId);
  registry.register(join.tool, join.executor);
  const send = createMessagesSpacesSendTool(agentId);
  registry.register(send.tool, send.executor);
}
