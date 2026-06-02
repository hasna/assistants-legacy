import React from 'react';
import { describe, expect, test } from 'bun:test';
import type { Channel, ChannelListItem, ChannelMember, ChannelMessage, ChannelsManager } from '@hasna/assistants-core';
import { ChannelsPanel } from '../src/components/ChannelsPanel';
import { renderInk } from './utils/ink-test-harness';

type MockChannelsManager = ChannelsManager & {
  channels: Channel[];
  membersByChannel: Map<string, ChannelMember[]>;
  messagesByChannel: Map<string, ChannelMessage[]>;
};

const now = '2026-05-28T12:00:00.000Z';

function createChannel(id: string, name: string, description: string | null = null): Channel {
  return {
    id,
    name,
    description,
    createdBy: 'assistant-1',
    createdByName: 'Octavia',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

function createMember(
  channelId: string,
  assistantId: string,
  assistantName: string,
  memberType: ChannelMember['memberType'] = 'assistant',
  role: ChannelMember['role'] = 'member'
): ChannelMember {
  return {
    channelId,
    assistantId,
    assistantName,
    memberType,
    role,
    joinedAt: now,
    lastReadAt: null,
  };
}

function normalizeChannelName(name: string): string {
  return name.toLowerCase().replace(/^#/, '').replace(/[^a-z0-9_-]/g, '-');
}

function createMockManager(): MockChannelsManager {
  const channels = [
    createChannel('ch_general', 'general', 'Team coordination'),
    createChannel('ch_ops', 'ops', 'Operations'),
  ];
  const membersByChannel = new Map<string, ChannelMember[]>([
    [
      'ch_general',
      [
        createMember('ch_general', 'assistant-1', 'Octavia', 'assistant', 'owner'),
        createMember('ch_general', 'person-1', 'Ada Lovelace', 'person'),
      ],
    ],
    ['ch_ops', [createMember('ch_ops', 'assistant-1', 'Octavia', 'assistant', 'owner')]],
  ]);
  const messagesByChannel = new Map<string, ChannelMessage[]>([
    [
      'ch_general',
      [
        {
          id: 'msg_1',
          channelId: 'ch_general',
          senderId: 'person-1',
          senderName: 'Ada Lovelace',
          content: 'Initial planning note',
          createdAt: now,
        },
      ],
    ],
    ['ch_ops', []],
  ]);

  const resolveChannel = (nameOrId: string): Channel | null => {
    const normalized = normalizeChannelName(nameOrId);
    return channels.find((channel) => channel.id === nameOrId || channel.name === normalized) ?? null;
  };

  const manager = {
    channels,
    membersByChannel,
    messagesByChannel,
    listChannels(): ChannelListItem[] {
      return channels
        .filter((channel) => channel.status === 'active')
        .map((channel) => {
          const messages = messagesByChannel.get(channel.id) ?? [];
          const lastMessage = messages.at(-1);
          return {
            id: channel.id,
            name: channel.name,
            description: channel.description,
            status: channel.status,
            memberCount: membersByChannel.get(channel.id)?.length ?? 0,
            lastMessageAt: lastMessage?.createdAt ?? null,
            lastMessagePreview: lastMessage?.content ?? null,
            unreadCount: 0,
            createdAt: channel.createdAt,
          };
        });
    },
    getChannel(nameOrId: string): Channel | null {
      return resolveChannel(nameOrId);
    },
    readMessages(nameOrId: string): { channel: Channel; messages: ChannelMessage[] } | null {
      const channel = resolveChannel(nameOrId);
      if (!channel) return null;
      return { channel, messages: messagesByChannel.get(channel.id) ?? [] };
    },
    getMembers(nameOrId: string): ChannelMember[] {
      const channel = resolveChannel(nameOrId);
      if (!channel) return [];
      return membersByChannel.get(channel.id) ?? [];
    },
    createChannel(name: string, description?: string) {
      const normalized = normalizeChannelName(name);
      const id = `ch_${normalized}`;
      const channel = createChannel(id, normalized, description ?? null);
      channels.unshift(channel);
      membersByChannel.set(id, [createMember(id, 'assistant-1', 'Octavia', 'assistant', 'owner')]);
      messagesByChannel.set(id, []);
      return { success: true, message: `Channel #${normalized} created.`, channelId: id };
    },
    archiveChannel(nameOrId: string) {
      const channel = resolveChannel(nameOrId);
      if (!channel) return { success: false, message: 'not found' };
      channel.status = 'archived';
      return { success: true, message: `Channel #${channel.name} archived.`, channelId: channel.id };
    },
    leave(nameOrId: string) {
      const channel = resolveChannel(nameOrId);
      return {
        success: Boolean(channel),
        message: channel ? `Left #${channel.name}.` : 'not found',
        channelId: channel?.id,
      };
    },
    invite(nameOrId: string, targetId: string, targetName: string) {
      const channel = resolveChannel(nameOrId);
      if (!channel) return { success: false, message: 'not found' };
      membersByChannel.set(channel.id, [
        ...(membersByChannel.get(channel.id) ?? []),
        createMember(channel.id, targetId, targetName),
      ]);
      return { success: true, message: `Invited ${targetName} to #${channel.name}.`, channelId: channel.id };
    },
    send(nameOrId: string, content: string) {
      const channel = resolveChannel(nameOrId);
      if (!channel) return { success: false, message: 'not found' };
      const messages = messagesByChannel.get(channel.id) ?? [];
      messages.push({
        id: `msg_${messages.length + 1}`,
        channelId: channel.id,
        senderId: 'assistant-1',
        senderName: 'Octavia',
        content,
        createdAt: now,
      });
      messagesByChannel.set(channel.id, messages);
      return { success: true, message: `Message sent to #${channel.name}.`, channelId: channel.id };
    },
    sendAs(nameOrId: string, content: string, senderId: string, senderName: string) {
      const channel = resolveChannel(nameOrId);
      if (!channel) return { success: false, message: 'not found' };
      const messages = messagesByChannel.get(channel.id) ?? [];
      messages.push({
        id: `msg_${messages.length + 1}`,
        channelId: channel.id,
        senderId,
        senderName,
        content,
        createdAt: now,
      });
      messagesByChannel.set(channel.id, messages);
      return { success: true, message: `Message sent to #${channel.name}.`, channelId: channel.id };
    },
  } as MockChannelsManager;

  return manager;
}

describe('ChannelsPanel', () => {
  test('renders channel list and opens members with Ink input', async () => {
    const manager = createMockManager();
    const harness = await renderInk(<ChannelsPanel manager={manager} onClose={() => {}} />, { width: 100, height: 30 });

    try {
      const listFrame = await harness.waitForText('#general');
      expect(listFrame).toContain('Initial planning note');

      harness.pressKey('m');
      const membersFrame = await harness.waitForText('Members (2)');
      expect(membersFrame).toContain('Ada Lovelace');
      expect(membersFrame).toContain('[person]');
    } finally {
      await harness.cleanup();
    }
  });

  test('creates a channel with submitted Ink TextInput values', async () => {
    const manager = createMockManager();
    const harness = await renderInk(<ChannelsPanel manager={manager} onClose={() => {}} />, { width: 100, height: 30 });

    try {
      await harness.waitForText('#general');
      harness.pressKey('c');
      await harness.waitForText('Name: #');

      harness.typeText('research');
      await harness.waitForText('research');
      harness.pressEnter();

      await harness.waitForText('Description:');
      harness.typeText('Deep investigation');
      await harness.waitForText('Deep investigation');
      harness.pressEnter();

      await harness.waitForText('Confirm Channel Creation');
      harness.pressKey('y');

      const chatFrame = await harness.waitForText('#research');
      expect(chatFrame).toContain('No messages yet');
      expect(manager.getChannel('research')?.description).toBe('Deep investigation');
    } finally {
      await harness.cleanup();
    }
  });

  test('sends chat messages as the active person through Ink TextInput', async () => {
    const manager = createMockManager();
    const personMessages: Array<[string, string, string]> = [];
    const harness = await renderInk(
      <ChannelsPanel
        manager={manager}
        onClose={() => {}}
        activePersonId="person-operator"
        activePersonName="Hasna"
        activeAssistantName="Octavia"
        onPersonMessage={(channelName, personName, message) => {
          personMessages.push([channelName, personName, message]);
        }}
      />,
      { width: 100, height: 30 }
    );

    try {
      await harness.waitForText('#general');
      harness.pressEnter();
      await harness.waitForText('Type a message');

      harness.typeText('Ship the Ink port');
      await harness.waitForText('Ship the Ink port');
      harness.pressEnter();

      const chatFrame = await harness.waitForText('Hasna');
      expect(chatFrame).toContain('Ship the Ink port');
      expect(personMessages).toEqual([['general', 'Hasna', 'Ship the Ink port']]);
      expect(manager.messagesByChannel.get('ch_general')?.at(-1)?.content).toBe('Ship the Ink port');
    } finally {
      await harness.cleanup();
    }
  });
});
