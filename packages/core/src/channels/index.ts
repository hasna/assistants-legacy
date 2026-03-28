/**
 * Channels module — local SQLite-backed channel collaboration for agents and people.
 *
 * NOT replaceable by @hasna/conversations SDK. The two systems serve different purposes:
 *   - channels/ (this module): In-process, SQLite-persisted, with full CRUD, membership,
 *     context injection, agent-pool multi-agent responses, @mention parsing, and a rich
 *     terminal UI (ChannelsPanel). Used for collaboration within a single assistant instance.
 *   - @hasna/conversations SDK: Cross-process DMs and spaces between independent agent sessions.
 *     Thin wrappers registered as messages_spaces_* tools in tools/conversations.ts.
 */

// Core manager
export { ChannelsManager, createChannelsManager } from './manager';
export type { ChannelsManagerOptions } from './manager';

// Agent pool for multi-agent channel responses
export { ChannelAgentPool } from './agent-pool';

// Store
export { ChannelStore } from './store';

// Mentions
export { parseMentions, resolveMentions, getMentionedMemberIds, resolveNameToKnown } from './mentions';

// Tools
export {
  channelTools,
  channelListTool,
  channelJoinTool,
  channelLeaveTool,
  channelSendTool,
  channelReadTool,
  channelMembersTool,
  channelInviteTool,
  createChannelToolExecutors,
  registerChannelTools,
} from './tools';

// Types
export type {
  Channel,
  ChannelMember,
  ChannelMessage,
  ChannelListItem,
  ChannelOperationResult,
  ChannelStatus,
  ChannelMemberRole,
  ChannelsConfig,
  MemberType,
} from './types';
