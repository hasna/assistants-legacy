/**
 * Conversations tools leveraging @hasna/conversations spaces feature.
 * Adds broadcast channels (spaces) on top of the existing DM messages system.
 */

import type { Tool } from '@hasna/assistants-shared';
import type { ToolExecutor, ToolRegistry } from './registry';
import {
  sendMessage,
  listSpaces,
  createSpace,
  joinSpace,
  leaveSpace,
} from '@hasna/conversations';

export function createMessagesSpacesListTool(): { tool: Tool; executor: ToolExecutor } {
  const tool: Tool = {
    name: 'messages_spaces_list',
    description: 'List available broadcast spaces for agent coordination. Spaces allow one-to-many messaging.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  };

  const executor: ToolExecutor = async () => {
    try {
      const spaces = listSpaces({});
      if (spaces.length === 0) return 'No spaces available. Create one with messages_spaces_join.';
      const lines = spaces.map((s) =>
        `• ${s.name}${s.description ? ` — ${s.description}` : ''}${s.message_count ? ` (${s.message_count} messages)` : ''}`
      );
      return `Available spaces (${spaces.length}):\n\n${lines.join('\n')}`;
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
    inputSchema: {
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
      // Try to join existing space, or create+join a new one
      try {
        joinSpace({ name, from: agentId });
        return `Joined space "${name}". Use messages_spaces_send to broadcast to all members.`;
      } catch {
        // Space doesn't exist — create it
        const desc = String(input.description || '');
        createSpace({ name, description: desc || undefined, from: agentId });
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
    inputSchema: {
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
