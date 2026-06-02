/**
 * Communication panel renderers: Channels, Messages.
 */
import React from 'react';
import type { Email } from '@hasna/assistants-shared';
import { parseMentions, resolveNameToKnown, type ChannelMember } from '@hasna/assistants-core';
import { ChannelsPanel } from '../ChannelsPanel';
import { MessagesPanel } from '../MessagesPanel';
import { themeColor } from '../../theme/colors';
import { CloseOnAnyKeyPanel } from './utils';
import { Box, Bold, Text } from '../../ui/ink';
import type { PanelRenderContext } from './context';

export function renderChannelsPanel(ctx: PanelRenderContext): React.ReactNode {
  const channelsManager = ctx.activeSession?.client.getChannelsManager?.();
  if (!channelsManager) {
    return (
      <CloseOnAnyKeyPanel
        message="Channels are not enabled. Set channels.enabled: true in config."
        onClose={() => ctx.setShowChannelsPanel(false)}
      />
    );
  }
  const activeAssistantName = ctx.activeSession?.client.getIdentityInfo?.()?.assistant?.name
    || ctx.activeSession?.assistantId
    || 'Assistant';
  return (
    <ChannelsPanel
      manager={channelsManager}
      onClose={() => ctx.setShowChannelsPanel(false)}
      activePersonId={ctx.activeSession?.client.getPeopleManager?.()?.getActivePersonId?.() || undefined}
      activePersonName={ctx.activeSession?.client.getPeopleManager?.()?.getActivePerson?.()?.name || undefined}
      activeAssistantName={activeAssistantName}
      onPersonMessage={(channelName, personName, message) => {
        const members: ChannelMember[] = channelsManager.getMembers(channelName);

        const agentPool = ctx.activeSession?.client.getChannelAgentPool?.();
        if (agentPool) {
          agentPool.triggerResponses(
            channelName,
            personName,
            message,
            members,
            ctx.activeSession?.assistantId || undefined,
          );
        }

        const activeAssistantId = ctx.activeSession?.assistantId;
        const isActiveMember = activeAssistantId && members.some(
          (m) => m.assistantId === activeAssistantId && m.memberType === 'assistant'
        );

        const mentions = parseMentions(message);
        let activeAssistantTargeted = true;
        if (mentions.length > 0) {
          const assistantMembers = members.filter((m) => m.memberType === 'assistant');
          const knownNames = assistantMembers.map((m) => ({ id: m.assistantId, name: m.assistantName }));
          const resolved = mentions
            .map((m) => resolveNameToKnown(m, knownNames))
            .filter(Boolean) as Array<{ id: string; name: string }>;
          if (resolved.length > 0) {
            activeAssistantTargeted = resolved.some((r) => r.id === activeAssistantId);
          } else {
            activeAssistantTargeted = false;
          }
        }

        if (isActiveMember && activeAssistantTargeted) {
          const prompt = `[Channel Message] ${personName} posted in #${channelName}: "${message}"\n\nYou are in a group channel with other assistants and people. Respond in #${channelName} using channel_send. Be helpful and conversational. You may reference or build on what other assistants have said.`;
          ctx.activeSession?.client.send(prompt);
        }
      }}
    />
  );
}

export function renderMessagesPanel(ctx: PanelRenderContext): React.ReactNode {
  const messagesManager = ctx.activeSession?.client.getMessagesManager?.();
  const inboxManager = ctx.activeSession?.client.getInboxManager?.();

  const handleMessagesRead = async (id: string) => {
    if (!messagesManager) throw new Error('Messages not available');
    const msg = await messagesManager.read(id);
    return {
      id: msg.id,
      threadId: msg.threadId,
      fromAssistantId: msg.fromAssistantId,
      fromAssistantName: msg.fromAssistantName,
      subject: msg.subject,
      preview: msg.preview,
      body: msg.body,
      priority: msg.priority as 'low' | 'normal' | 'high' | 'urgent',
      status: msg.status as 'unread' | 'read' | 'archived' | 'injected',
      createdAt: msg.createdAt,
      replyCount: msg.replyCount,
    };
  };

  const refreshMessagesList = async () => {
    const msgs = await messagesManager!.list({ limit: 50 });
    ctx.setMessagesList(msgs.map((m: { id: string; threadId: string; fromAssistantId: string; fromAssistantName: string; subject?: string; preview: string; body?: string; priority: string; status: string; createdAt: string; replyCount?: number }) => ({
      id: m.id,
      threadId: m.threadId,
      fromAssistantId: m.fromAssistantId,
      fromAssistantName: m.fromAssistantName,
      subject: m.subject,
      preview: m.preview,
      body: m.body,
      priority: m.priority as 'low' | 'normal' | 'high' | 'urgent',
      status: m.status as 'unread' | 'read' | 'archived' | 'injected',
      createdAt: m.createdAt,
      replyCount: m.replyCount,
    })));
  };

  const handleMessagesDelete = async (id: string) => {
    if (!messagesManager) throw new Error('Messages not available');
    await messagesManager.delete(id);
    await refreshMessagesList();
  };

  const handleMessagesInject = async (id: string) => {
    if (!messagesManager) throw new Error('Messages not available');
    const msg = await messagesManager.read(id);
    if (ctx.activeSession) {
      ctx.activeSession.client.addSystemMessage(`[Injected message from ${msg.fromAssistantName}]\n\n${msg.body || msg.preview}`);
    }
    await messagesManager.markStatus?.(id, 'injected');
    await refreshMessagesList();
  };

  const handleMessagesReply = async (id: string, body: string) => {
    if (!messagesManager) throw new Error('Messages not available');
    const msg = await messagesManager.read(id);
    await messagesManager.send({
      to: msg.fromAssistantId,
      body,
      replyTo: id,
    });
  };

  const handleInboxRead = async (id: string): Promise<Email> => {
    if (!inboxManager) throw new Error('Inbox not available');
    const email = await inboxManager.read(id);
    if (!email) throw new Error('Email not found');
    const emails = await inboxManager.list({ limit: 50 });
    ctx.setInboxEmails(emails);
    return email;
  };

  // [nero] Delete via SDK adapter when available, fallback to local manager
  const handleInboxDelete = async (id: string) => {
    if (!inboxManager) throw new Error('Inbox not available');
    // SdkInboxAdapter exposes deleteEmail via the emails SDK
    if ('deleteEmail' in (inboxManager as any) && typeof (inboxManager as any).deleteEmail === 'function') {
      await (inboxManager as any).deleteEmail(id);
    } else {
      // Try dynamic import of emails SDK adapter
      try {
        const emailsSdk = await import('@hasna/assistants-core/emails/sdk-adapter') as any;
        await emailsSdk.deleteEmail(id);
      } catch {
        throw new Error('Delete not available — install @hasna/emails SDK');
      }
    }
    const emails = await inboxManager.list({ limit: 50 });
    ctx.setInboxEmails(emails);
  };

  const handleInboxFetch = async (): Promise<number> => {
    if (!inboxManager) throw new Error('Inbox not available');
    const count = await inboxManager.fetch({ limit: 20 });
    const emails = await inboxManager.list({ limit: 50 });
    ctx.setInboxEmails(emails);
    return count;
  };

  const handleInboxMarkRead = async (id: string) => {
    if (!inboxManager) throw new Error('Inbox not available');
    await inboxManager.markRead(id);
    const emails = await inboxManager.list({ limit: 50 });
    ctx.setInboxEmails(emails);
  };

  const handleInboxMarkUnread = async (id: string) => {
    if (!inboxManager) throw new Error('Inbox not available');
    await inboxManager.markUnread(id);
    const emails = await inboxManager.list({ limit: 50 });
    ctx.setInboxEmails(emails);
  };

  const handleInboxReply = (id: string) => {
    ctx.setShowMessagesPanel(false);
    ctx.activeSession?.client.send(`/messages compose ${id}`);
  };

  if (!messagesManager && !inboxManager) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text fg={themeColor('info')}><Bold>Messages</Bold></Text>
        </Box>
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={themeColor('border')} border={["top", "bottom"]}
          paddingX={1}
          paddingY={1}
        >
          <Text>Messages are not enabled.</Text>
          <Text fg={themeColor('muted')}>Configure messages in config.json to enable.</Text>
        </Box>
        <Box marginTop={1}>
          <Text fg={themeColor('muted')}>q quit</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <MessagesPanel
        messages={ctx.messagesList}
        onRead={handleMessagesRead}
        onDelete={handleMessagesDelete}
        onInject={handleMessagesInject}
        onReply={handleMessagesReply}
        onClose={() => ctx.setShowMessagesPanel(false)}
        error={ctx.messagesPanelError}
        inboxEmails={ctx.inboxEmails}
        onInboxRead={handleInboxRead}
        onInboxDelete={handleInboxDelete}
        onInboxFetch={handleInboxFetch}
        onInboxMarkRead={handleInboxMarkRead}
        onInboxMarkUnread={handleInboxMarkUnread}
        onInboxReply={handleInboxReply}
        inboxError={ctx.inboxError}
        inboxEnabled={ctx.inboxEnabled}
      />
    </Box>
  );
}
