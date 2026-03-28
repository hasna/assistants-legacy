/**
 * SDK-backed InboxManager adapter — uses @hasna/emails SDK as primary data source.
 *
 * [nero] This adapter implements the same public API as InboxManager so it can be
 * used interchangeably by TelephonyPanel / InboxPanel / appPanelRenderers.
 * When @hasna/emails SDK is available, all operations go through the SDK.
 * This enables the InboxPanel to work even when inbox.enabled is false in config,
 * as long as the emails SDK is installed.
 */

import type { Email, EmailListItem } from '@hasna/assistants-shared';
import * as emailsSdk from '../emails/sdk-adapter';

/**
 * SdkInboxAdapter — drop-in replacement for InboxManager backed by @hasna/emails
 */
export class SdkInboxAdapter {
  private assistantId: string;

  constructor(assistantId: string) {
    this.assistantId = assistantId;
  }

  /**
   * List emails from SDK
   */
  async list(options?: { limit?: number; unreadOnly?: boolean }): Promise<EmailListItem[]> {
    const raw = await emailsSdk.listInboundEmails({ limit: options?.limit || 50 });
    if (!raw || !Array.isArray(raw)) return [];
    // Map SDK results to EmailListItem shape expected by panel
    return raw.map((e: any) => ({
      id: e.id || e.messageId || '',
      messageId: e.messageId || e.id || '',
      from: e.from?.address || e.from || '',
      subject: e.subject || '(no subject)',
      date: e.date || e.receivedAt || e.createdAt || new Date().toISOString(),
      isRead: e.isRead ?? e.read ?? false,
      hasAttachments: !!(e.attachments?.length || e.hasAttachments),
    }));
  }

  /**
   * Read a specific email by ID
   */
  async read(emailId: string): Promise<Email | null> {
    const raw = await emailsSdk.getEmailContent(emailId);
    if (!raw) {
      // Try the getEmail endpoint as fallback
      const basic = await emailsSdk.getEmail(emailId);
      if (!basic) return null;
      return this.normalizeEmail(basic);
    }
    return this.normalizeEmail(raw);
  }

  /**
   * Fetch new emails (sync inbox from provider)
   */
  async fetch(options?: { limit?: number }): Promise<number> {
    const result = await emailsSdk.syncInbox({ limit: options?.limit || 20 });
    if (result && typeof result === 'object' && 'count' in result) {
      return (result as any).count;
    }
    if (result && typeof result === 'object' && 'synced' in result) {
      return (result as any).synced;
    }
    return 0;
  }

  /**
   * Mark an email as read
   */
  async markRead(emailId: string): Promise<void> {
    await emailsSdk.updateEmailStatus(emailId, 'read');
  }

  /**
   * Mark an email as unread
   */
  async markUnread(emailId: string): Promise<void> {
    await emailsSdk.updateEmailStatus(emailId, 'unread');
  }

  /**
   * Normalize any SDK email shape to the Email type expected by panels
   */
  private normalizeEmail(raw: any): Email {
    return {
      id: raw.id || raw.messageId || '',
      messageId: raw.messageId || raw.id || '',
      subject: raw.subject || '(no subject)',
      from: typeof raw.from === 'string'
        ? { address: raw.from, name: '' }
        : { address: raw.from?.address || '', name: raw.from?.name || '' },
      to: Array.isArray(raw.to)
        ? raw.to.map((t: any) => typeof t === 'string' ? { address: t, name: '' } : { address: t.address || '', name: t.name || '' })
        : [{ address: String(raw.to || ''), name: '' }],
      cc: raw.cc ? (Array.isArray(raw.cc) ? raw.cc.map((c: any) => typeof c === 'string' ? { address: c, name: '' } : { address: c.address || '', name: c.name || '' }) : []) : undefined,
      date: raw.date || raw.receivedAt || raw.createdAt || new Date().toISOString(),
      body: {
        text: raw.body?.text || raw.text || raw.body || '',
        html: raw.body?.html || raw.html || undefined,
      },
      headers: raw.headers || {},
      attachments: raw.attachments || [],
      s3Key: raw.s3Key,
    };
  }
}

/**
 * Check if @hasna/emails SDK is available and create an SdkInboxAdapter
 */
export async function createSdkInboxAdapter(assistantId: string): Promise<SdkInboxAdapter | null> {
  const available = await emailsSdk.isAvailable();
  if (!available) return null;
  return new SdkInboxAdapter(assistantId);
}
