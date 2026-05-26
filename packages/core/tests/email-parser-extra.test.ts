import { describe, expect, test } from 'bun:test';

const { EmailParser, formatEmailAsMarkdown } = await import('../src/inbox/parser/email-parser');

describe('EmailParser parse and attachments', () => {
  const rawWithAttachment = Buffer.from([
    'From: Sender <sender@example.com>',
    'To: to@example.com',
    'Cc: CC <cc@example.com>',
    'Subject:',
    'Message-ID: <msg-1@example.com>',
    'Date: Sun, 01 Feb 2026 00:00:00 +0000',
    'X-Test: value',
    'Content-Type: multipart/mixed; boundary="parser-extra-boundary"',
    '',
    '--parser-extra-boundary',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Hello',
    '--parser-extra-boundary',
    'Content-Type: text/plain; name="file.txt"',
    'Content-ID: <cid-1>',
    'Content-Disposition: attachment; filename="file.txt"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from('abc').toString('base64'),
    '--parser-extra-boundary--',
    '',
  ].join('\r\n'));

  test('parse builds Email with defaults and headers', async () => {
    const parser = new EmailParser();
    const email = await parser.parse(rawWithAttachment, { id: 'email-1', includeRaw: true, s3Key: 's3-key' });

    expect(email.id).toBe('email-1');
    expect(email.messageId).toBe('<msg-1@example.com>');
    expect(email.subject).toBe('(No Subject)');
    expect(email.from.address).toBe('sender@example.com');
    expect(email.to[0].address).toBe('to@example.com');
    expect(email.cc?.[0].address).toBe('cc@example.com');
    expect(email.attachments?.[0].contentId).toBe('cid-1');
    expect(email.headers['x-test']).toBe('value');
    expect(email.raw).toBe(rawWithAttachment.toString('utf-8'));
  });

  test('parse falls back to unknown addresses', async () => {
    const parser = new EmailParser();
    const email = await parser.parse(Buffer.from('Subject:\r\n\r\n'), { id: 'email-2' });

    expect(email.from.address).toBe('unknown@unknown.com');
    expect(email.to[0].address).toBe('unknown@unknown.com');
  });

  test('extractAttachment returns content or null', async () => {
    const parser = new EmailParser();
    const content = await parser.extractAttachment(rawWithAttachment, 0);
    expect(content).toEqual(Buffer.from('abc'));

    const missing = await parser.extractAttachment(rawWithAttachment, 2);
    expect(missing).toBeNull();
  });

  test('formatEmailAsMarkdown handles attachments and html-only content', () => {
    const markdown = formatEmailAsMarkdown({
      id: 'email-1',
      messageId: 'msg-1',
      from: { address: 'sender@example.com', name: 'Sender' },
      to: [{ address: 'to@example.com' }],
      subject: 'Subject',
      date: '2026-02-01T00:00:00Z',
      body: { html: '<p>hi</p>' },
      headers: {},
      attachments: [
        { filename: 'file.txt', contentType: 'text/plain', size: 3 },
      ],
    });

    expect(markdown).toContain('## Attachments');
    expect(markdown).toContain('file.txt');
    expect(markdown).toContain('HTML content available');
  });
});
