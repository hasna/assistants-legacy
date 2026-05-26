import { describe, expect, test, beforeEach } from 'bun:test';
import { readFile } from 'fs/promises';
import { withTempDir } from './fixtures/helpers';

const storedObjects: { key: string; body: Buffer }[] = [];
let lastSendOptions: any = null;

const { InboxManager } = await import('../src/inbox/inbox-manager');

const buildRawEmail = (options?: {
  to?: string;
  subject?: string;
  replyTo?: string;
  body?: string;
  attachmentContent?: string;
}): Buffer => {
  const to = options?.to ?? 'assistant@example.com';
  const subject = options?.subject ?? 'Hello';
  const replyToHeader = options?.replyTo ? `Reply-To: ${options.replyTo}\r\n` : '';
  const body = options?.body ?? 'Body';

  if (!options?.attachmentContent) {
    return Buffer.from([
      'From: From <from@example.com>',
      `To: ${to}`,
      replyToHeader.trimEnd(),
      `Subject: ${subject}`,
      'Message-ID: <message-1@example.com>',
      'Date: Mon, 01 Jan 2024 00:00:00 +0000',
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    ].filter(Boolean).join('\r\n'));
  }

  const boundary = 'boundary-assistants-test';
  const attachment = Buffer.from(options.attachmentContent).toString('base64');
  return Buffer.from([
    'From: From <from@example.com>',
    `To: ${to}`,
    `Subject: ${subject}`,
    'Message-ID: <message-1@example.com>',
    'Date: Mon, 01 Jan 2024 00:00:00 +0000',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
    `--${boundary}`,
    'Content-Type: text/plain; name="file.txt"',
    'Content-Disposition: attachment; filename="file.txt"',
    'Content-Transfer-Encoding: base64',
    '',
    attachment,
    `--${boundary}--`,
    '',
  ].join('\r\n'));
};

const createManagerOptions = (dir: string, assistantName = 'Assistant') => ({
  assistantId: 'assistant-1',
  assistantName,
  config: { domain: 'example.com', storage: { bucket: 'bucket', region: 'us-east-1' } },
  basePath: dir,
  s3Client: {
    async listObjects(): Promise<{ objects: { key: string }[] }> {
      return { objects: storedObjects.map((obj) => ({ key: obj.key })) };
    },

    async getObject(key: string): Promise<Buffer> {
      const match = storedObjects.find((obj) => obj.key === key);
      if (!match) {
        throw new Error('missing object');
      }
      return match.body;
    },

    extractEmailId(key: string): string {
      const parts = key.split('/');
      return parts[parts.length - 1] || key;
    },
  },
  emailProvider: {
    send: async (options: any) => {
      lastSendOptions = options;
      return { messageId: 'msg-1' };
    },
  },
});

describe('InboxManager', () => {
  beforeEach(() => {
    storedObjects.length = 0;
    lastSendOptions = null;
  });

  test('formats email address with domain and template', async () => {
    await withTempDir(async (dir) => {
      const manager = new InboxManager({
        assistantId: 'assistant-1',
        assistantName: 'Assistant Name',
        config: { domain: 'example.com', addressFormat: '{assistant-id}@{domain}' },
        basePath: dir,
      });

      expect(manager.getEmailAddress()).toBe('assistant-1@example.com');
    });
  });

  test('fetch stores only emails addressed to assistant', async () => {
    await withTempDir(async (dir) => {
      const assistantEmail = 'assistant@example.com';
      const manager = new InboxManager(createManagerOptions(dir));

      storedObjects.push(
        { key: 'inbox/assistant-1/email-1', body: buildRawEmail({ to: assistantEmail }) },
        { key: 'inbox/assistant-1/email-2', body: buildRawEmail({ to: 'other@example.com' }) }
      );

      const count = await manager.fetch({ limit: 5 });
      expect(count).toBe(1);

      const list = await manager.list();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('email-1');
    });
  });

  test('downloads attachments and caches file', async () => {
    await withTempDir(async (dir) => {
      const manager = new InboxManager(createManagerOptions(dir));

      storedObjects.push({
        key: 'inbox/assistant-1/email-1',
        body: buildRawEmail({ attachmentContent: 'attachment-content' }),
      });

      await manager.fetch({ limit: 5 });
      const localPath = await manager.downloadAttachment('email-1', 0);

      expect(localPath).toBeTruthy();
      const content = await readFile(localPath!, 'utf-8');
      expect(content).toBe('attachment-content');
    });
  });

  test('sends and replies using provider', async () => {
    await withTempDir(async (dir) => {
      const manager = new InboxManager(createManagerOptions(dir));

      await manager.send({ to: 'someone@example.com', subject: 'Hi', text: 'Body' });
      expect(lastSendOptions?.from).toContain('@example.com');

      storedObjects.push({
        key: 'inbox/assistant-1/email-1',
        body: buildRawEmail({ replyTo: 'reply@example.com' }),
      });

      await manager.fetch({ limit: 5 });
      await manager.reply('email-1', { text: 'Reply' });

      expect(lastSendOptions?.to).toBe('reply@example.com');
      expect(lastSendOptions?.subject).toContain('Re:');
    });
  });
});
