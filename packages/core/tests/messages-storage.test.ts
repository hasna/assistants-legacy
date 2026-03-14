import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { setRuntime, hasRuntime } from '../src/runtime';
import { bunRuntime } from '../../runtime-bun/src';
import { closeDatabase, resetDatabaseSingleton, getDatabase } from '../src/database';
import { LocalMessagesStorage } from '../src/messages/storage/local-storage';
import type { AssistantMessage } from '../src/messages/storage/local-storage';

if (!hasRuntime()) setRuntime(bunRuntime);

let tempDir: string;
let storage: LocalMessagesStorage;
let origDir: string | undefined;

beforeEach(() => {
  origDir = process.env.ASSISTANTS_DIR;
  tempDir = mkdtempSync(join(tmpdir(), 'msgs-test-'));
  process.env.ASSISTANTS_DIR = tempDir;
  closeDatabase();
  resetDatabaseSingleton();
  const db = getDatabase();
  storage = new LocalMessagesStorage({ db });
});

afterEach(() => {
  closeDatabase();
  resetDatabaseSingleton();
  if (origDir === undefined) delete process.env.ASSISTANTS_DIR;
  else process.env.ASSISTANTS_DIR = origDir;
  rmSync(tempDir, { recursive: true, force: true });
});

function makeMsg(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  const now = new Date().toISOString();
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    assistantId: 'agent-1',
    fromAddress: 'sender@example.com',
    subject: 'Test message',
    body: 'Hello body',
    receivedAt: now,
    createdAt: now,
    status: 'unread',
    priority: 'normal',
    threadId: 'thread_default',
    fromAssistantId: 'sender-agent',
    fromAssistantName: 'Sender',
    toAssistantId: 'agent-1',
    toAssistantName: 'Agent One',
    ...overrides,
  };
}

// ─── registerAssistant / getAssistantById / listAssistants ────────────────────

describe('registerAssistant / getAssistantById / listAssistants', () => {
  test('registerAssistant + getAssistantById', async () => {
    await storage.registerAssistant('a1', 'Agent One');
    const found = await storage.getAssistantById('a1');
    expect(found).not.toBeNull();
    expect(found?.name).toBe('Agent One');
  });

  test('getAssistantById returns null for unknown', async () => {
    expect(await storage.getAssistantById('nobody')).toBeNull();
  });

  test('findAssistantByName finds registered assistant', async () => {
    await storage.registerAssistant('a2', 'Agent Two');
    const found = await storage.findAssistantByName('Agent Two');
    expect(found).not.toBeNull();
    expect(found?.id).toBe('a2');
  });

  test('findAssistantByName returns null for unknown', async () => {
    expect(await storage.findAssistantByName('Ghost')).toBeNull();
  });

  test('listAssistants returns registered assistants', async () => {
    await storage.registerAssistant('a3', 'Alpha');
    await storage.registerAssistant('a4', 'Beta');
    const list = await storage.listAssistants();
    const ids = list.map(a => a.id);
    expect(ids).toContain('a3');
    expect(ids).toContain('a4');
  });

  test('listAssistants returns empty initially', async () => {
    expect(await storage.listAssistants()).toHaveLength(0);
  });
});

// ─── saveMessage / loadMessage / listMessages ─────────────────────────────────

describe('saveMessage / loadMessage / listMessages', () => {
  test('saveMessage + loadMessage round-trip', async () => {
    const msg = makeMsg({ subject: 'Hello Test' });
    await storage.saveMessage(msg);
    const loaded = await storage.loadMessage('agent-1', msg.id);
    expect(loaded?.subject).toBe('Hello Test');
  });

  test('loadMessage returns null for unknown', async () => {
    expect(await storage.loadMessage('agent-1', 'no-such-id')).toBeNull();
  });

  test('listMessages returns saved messages', async () => {
    await storage.saveMessage(makeMsg({ assistantId: 'a5', toAssistantId: 'a5' }));
    await storage.saveMessage(makeMsg({ assistantId: 'a5', toAssistantId: 'a5' }));
    const msgs = await storage.listMessages('a5');
    expect(msgs.length).toBeGreaterThanOrEqual(2);
  });

  test('listMessages returns empty for new assistant', async () => {
    const msgs = await storage.listMessages('new-agent');
    expect(msgs).toHaveLength(0);
  });
});

// ─── updateMessageStatus / deleteMessage ─────────────────────────────────────

describe('updateMessageStatus / deleteMessage', () => {
  test('updateMessageStatus changes status', async () => {
    const msg = makeMsg({ status: 'unread' });
    await storage.saveMessage(msg);
    await storage.updateMessageStatus('agent-1', msg.id, 'read');
    const loaded = await storage.loadMessage('agent-1', msg.id);
    expect(loaded?.status).toBe('read');
  });

  test('deleteMessage removes message', async () => {
    const msg = makeMsg();
    await storage.saveMessage(msg);
    const deleted = await storage.deleteMessage('agent-1', msg.id);
    expect(deleted).toBe(true);
    expect(await storage.loadMessage('agent-1', msg.id)).toBeNull();
  });

  test('deleteMessage returns false for unknown', async () => {
    expect(await storage.deleteMessage('agent-1', 'ghost-id')).toBe(false);
  });
});
