import React from 'react';
import { describe, expect, test } from 'bun:test';
import { MessagesPanel } from '../src/components/MessagesPanel';
import { renderInk } from './utils/ink-test-harness';

const nowIso = new Date().toISOString();

function message(overrides: Partial<any> = {}) {
  return {
    id: 'msg-1',
    threadId: 'thread-1',
    fromAssistantId: 'assistant-1',
    fromAssistantName: 'Octavia',
    subject: 'Status update',
    preview: 'The migration is moving.',
    body: 'The migration is moving through the remaining panels.',
    priority: 'normal',
    status: 'unread',
    createdAt: nowIso,
    ...overrides,
  };
}

function renderMessagesPanel(props: Partial<React.ComponentProps<typeof MessagesPanel>> = {}) {
  return renderInk(
    <MessagesPanel
      messages={[]}
      onRead={async (id) => message({ id })}
      onDelete={async () => {}}
      onInject={async () => {}}
      onReply={async () => {}}
      onClose={() => {}}
      {...props}
    />,
    { width: 100, height: 28 },
  );
}

describe('MessagesPanel', () => {
  test('renders empty assistant inbox with Ink components', async () => {
    const harness = await renderMessagesPanel();
    try {
      const frame = await harness.waitForText('No messages in inbox.');
      expect(frame).toContain('Messages');
      expect(frame).toContain('q quit');
    } finally {
      await harness.cleanup();
    }
  });

  test('opens a message detail and injects the selected message', async () => {
    const messages = [
      message({ id: 'msg-1', fromAssistantName: 'Marcus', subject: 'First' }),
      message({ id: 'msg-2', fromAssistantName: 'Livia', subject: 'Second', priority: 'high' }),
    ];
    const readIds: string[] = [];
    const injectedIds: string[] = [];
    const harness = await renderMessagesPanel({
      messages,
      onRead: async (id) => {
        readIds.push(id);
        return messages.find((entry) => entry.id === id) ?? message({ id });
      },
      onInject: async (id) => {
        injectedIds.push(id);
      },
    });

    try {
      await harness.waitForText('First');
      harness.pressDown();
      await harness.waitForText('Second');
      harness.pressEnter();
      await harness.waitForText('Message:');
      expect(readIds).toEqual(['msg-2']);

      harness.typeText('i');
      await harness.waitForText('Inject Message');
      harness.typeText('y');
      await harness.waitForText('Enter view');
      expect(injectedIds).toEqual(['msg-2']);
    } finally {
      await harness.cleanup();
    }
  });

  test('switches to the email tab with upstream Ink input', async () => {
    const harness = await renderMessagesPanel({
      messages: [message()],
      inboxEnabled: true,
      inboxEmails: [],
      onInboxRead: async (id) => ({
        id,
        threadId: 'thread-email',
        from: 'sender@example.com',
        to: ['me@example.com'],
        subject: 'Email',
        body: 'Email body',
        snippet: 'Email body',
        date: nowIso,
        isRead: false,
        labels: [],
        attachments: [],
      }),
      onInboxFetch: async () => 0,
    } as any);

    try {
      await harness.waitForText('Assistant Messages');
      harness.pressTab();
      await harness.waitForText('No emails in inbox.');
    } finally {
      await harness.cleanup();
    }
  });
});
