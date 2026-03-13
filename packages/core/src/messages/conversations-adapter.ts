/**
 * Conversations adapter for @hasna/conversations
 * Implements the same interface as MessagesManager, enabling drop-in replacement.
 * Maps between native AssistantMessage types and SDK Message types.
 *
 * Key mappings:
 *   threadId      ↔  session_id
 *   fromAssistantId ↔  from_agent
 *   toAssistantId   ↔  to_agent
 *   body          ↔  content
 *   status 'injected' → stored in metadata
 *   subject       → stored in metadata
 */

import {
  sendMessage,
  readMessages,
  markRead,
  deleteMessage,
  searchMessages,
  listAgents,
  heartbeat,
  startPolling,
  type Message as SdkMessage,
  type SendMessageOptions,
  type AgentPresence,
} from '@hasna/conversations';

import type {
  AssistantMessage,
  MessageListItem,
  MessageThread,
  MessagesInboxStats,
  SendMessageInput,
  MessagesConfig,
  MessagesOperationResult,
} from './types';

// ─── Type Conversion ──────────────────────────────────────────────────────────

function sdkToNative(msg: SdkMessage): AssistantMessage {
  const meta = (msg.metadata ?? {}) as Record<string, unknown>;
  const isInjected = meta.__injected === true;
  const subject = meta.subject as string | undefined;

  return {
    id: String(msg.id),
    threadId: msg.session_id,
    parentId: (meta.__reply_to != null) ? String(meta.__reply_to) : null,
    fromAssistantId: msg.from_agent,
    fromAssistantName: msg.from_agent,
    toAssistantId: msg.to_agent,
    toAssistantName: msg.to_agent,
    subject,
    body: msg.content,
    priority: msg.priority,
    status: isInjected ? 'injected' : msg.read_at ? 'read' : 'unread',
    createdAt: msg.created_at,
    readAt: msg.read_at ?? undefined,
    injectedAt: isInjected ? (meta.__injectedAt as string) : undefined,
    metadata: msg.metadata ?? undefined,
  };
}

function nativeToSdkOptions(input: SendMessageInput, fromId: string): SendMessageOptions {
  const meta: Record<string, unknown> = { ...(input.metadata ?? {}) };
  if (input.subject) meta.subject = input.subject;
  if (input.replyTo) meta.__reply_to = Number(input.replyTo);

  return {
    from: fromId,
    to: input.to,
    content: input.body,
    priority: input.priority ?? 'normal',
    session_id: undefined, // let SDK auto-generate
    metadata: Object.keys(meta).length > 0 ? meta : undefined,
  };
}

// ─── ConversationsAdapter ─────────────────────────────────────────────────────

export class ConversationsAdapter {
  private assistantId: string;
  private assistantName: string;
  private config: MessagesConfig;
  private pollStop: (() => void) | null = null;
  private messageCallbacks: Set<(message: AssistantMessage) => void> = new Set();

  constructor(assistantId: string, assistantName: string, config: MessagesConfig) {
    this.assistantId = assistantId;
    this.assistantName = assistantName;
    this.config = config;
  }

  async initialize(): Promise<void> {
    // Register presence
    try {
      heartbeat(this.assistantId, 'online');
    } catch {
      // Ignore presence errors — conversations may not be configured
    }
  }

  async send(input: SendMessageInput): Promise<MessagesOperationResult> {
    try {
      const opts = nativeToSdkOptions(input, this.assistantId);
      const msg = sendMessage(opts);
      return { success: true, message: 'Message sent', messageId: String(msg.id) };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  async list(options?: { limit?: number; unreadOnly?: boolean; threadId?: string; from?: string }): Promise<MessageListItem[]> {
    try {
      const msgs = readMessages({
        to: this.assistantId,
        unread_only: options?.unreadOnly,
        session_id: options?.threadId,
        from: options?.from,
        limit: options?.limit ?? 50,
        order: 'desc',
      });

      return msgs.map((m) => {
        const native = sdkToNative(m);
        return {
          ...native,
          preview: m.content.slice(0, 120),
          replyCount: 0,
        };
      });
    } catch {
      return [];
    }
  }

  async read(messageId: string): Promise<AssistantMessage | null> {
    try {
      const id = Number(messageId);
      markRead([id], this.assistantId);

      const msgs = readMessages({ to: this.assistantId, limit: 200 });
      const msg = msgs.find((m) => m.id === id);
      if (!msg) return null;
      return sdkToNative({ ...msg, read_at: new Date().toISOString() });
    } catch {
      return null;
    }
  }

  async readThread(threadId: string): Promise<AssistantMessage[]> {
    try {
      const msgs = readMessages({ session_id: threadId, order: 'asc' });
      // Mark all as read
      const unreadIds = msgs.filter((m) => !m.read_at).map((m) => m.id);
      if (unreadIds.length > 0) {
        markRead(unreadIds, this.assistantId);
      }
      return msgs.map(sdkToNative);
    } catch {
      return [];
    }
  }

  async delete(messageId: string): Promise<boolean> {
    try {
      deleteMessage(Number(messageId), this.assistantId);
      return true;
    } catch {
      return false;
    }
  }

  async listThreads(): Promise<MessageThread[]> {
    try {
      const msgs = readMessages({ to: this.assistantId, limit: 200, order: 'desc' });
      const threadMap = new Map<string, SdkMessage[]>();
      for (const msg of msgs) {
        if (!threadMap.has(msg.session_id)) threadMap.set(msg.session_id, []);
        threadMap.get(msg.session_id)!.push(msg);
      }

      return Array.from(threadMap.entries()).map(([threadId, threadMsgs]) => {
        const sorted = threadMsgs.sort((a, b) => a.id - b.id);
        const last = sorted[sorted.length - 1];
        const unreadCount = sorted.filter((m) => !m.read_at).length;
        const meta = (last.metadata ?? {}) as Record<string, unknown>;

        return {
          threadId,
          subject: meta.subject as string | undefined,
          participants: [...new Set(threadMsgs.flatMap((m) => [m.from_agent, m.to_agent]))].map((agent) => ({
            assistantId: agent,
            assistantName: agent,
          })),
          messageCount: sorted.length,
          unreadCount,
          lastMessage: {
            ...sdkToNative(last),
            preview: last.content.slice(0, 120),
            replyCount: sorted.length - 1,
          },
          createdAt: sorted[0].created_at,
          updatedAt: last.created_at,
        };
      });
    } catch {
      return [];
    }
  }

  async listAssistants(): Promise<Array<{ id: string; name: string; lastSeen?: string }>> {
    try {
      const agents: AgentPresence[] = listAgents({});
      return agents.map((a) => ({
        id: a.agent,
        name: a.agent,
        lastSeen: a.last_seen_at,
      }));
    } catch {
      return [];
    }
  }

  async getStats(): Promise<MessagesInboxStats> {
    try {
      const all = readMessages({ to: this.assistantId, limit: 1000 });
      const unread = all.filter((m) => !m.read_at);
      const threadIds = new Set(all.map((m) => m.session_id));
      return {
        totalMessages: all.length,
        unreadCount: unread.length,
        threadCount: threadIds.size,
      };
    } catch {
      return { totalMessages: 0, unreadCount: 0, threadCount: 0 };
    }
  }

  async getUnreadForInjection(): Promise<AssistantMessage[]> {
    try {
      const threshold = (this.config as { injectionThreshold?: string }).injectionThreshold ?? 'high';
      const priorityRank: Record<string, number> = { low: 0, normal: 1, high: 2, urgent: 3 };
      const minRank = priorityRank[threshold] ?? 2;

      const msgs = readMessages({ to: this.assistantId, unread_only: true, limit: 20, order: 'desc' });
      return msgs
        .filter((m) => (priorityRank[m.priority] ?? 0) >= minRank)
        .filter((m) => {
          const meta = (m.metadata ?? {}) as Record<string, unknown>;
          return !meta.__injected;
        })
        .map(sdkToNative);
    } catch {
      return [];
    }
  }

  async markInjected(messageIds: string[]): Promise<void> {
    // Mark as read in SDK; store injected flag in metadata would require message edit
    // For simplicity, mark as read which prevents re-injection
    const ids = messageIds.map(Number).filter(Boolean);
    if (ids.length > 0) {
      try {
        markRead(ids, this.assistantId);
      } catch {
        // ignore
      }
    }
  }

  buildInjectionContext(messages: AssistantMessage[]): string | null {
    if (messages.length === 0) return null;

    const lines: string[] = ['--- Unread Messages ---'];
    for (const msg of messages) {
      const priority = msg.priority !== 'normal' ? ` [${msg.priority.toUpperCase()}]` : '';
      const subject = msg.subject ? ` — ${msg.subject}` : '';
      lines.push(`From: ${msg.fromAssistantName}${subject}${priority}`);
      lines.push(msg.body);
      lines.push('');
    }
    lines.push('--- End Messages ---');
    return lines.join('\n');
  }

  startWatching(): void {
    if (this.pollStop) return; // already watching

    this.pollStop = startPolling({
      to_agent: this.assistantId,
      interval_ms: 200,
      on_messages: (msgs: SdkMessage[]) => {
        for (const msg of msgs) {
          const native = sdkToNative(msg);
          for (const cb of this.messageCallbacks) {
            cb(native);
          }
        }
      },
    }).stop;
  }

  stopWatching(): void {
    if (this.pollStop) {
      this.pollStop();
      this.pollStop = null;
    }
  }

  onMessage(callback: (message: AssistantMessage) => void): () => void {
    this.messageCallbacks.add(callback);
    return () => this.messageCallbacks.delete(callback);
  }

  async search(query: string): Promise<AssistantMessage[]> {
    try {
      const results = searchMessages({ query, to: this.assistantId, limit: 20 });
      return results.map(sdkToNative);
    } catch {
      return [];
    }
  }

  async cleanup(): Promise<void> {
    this.stopWatching();
    this.messageCallbacks.clear();
  }
}

export function createConversationsAdapter(
  assistantId: string,
  assistantName: string,
  config: MessagesConfig,
): ConversationsAdapter {
  return new ConversationsAdapter(assistantId, assistantName, config);
}
