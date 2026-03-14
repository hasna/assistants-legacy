import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { setRuntime, hasRuntime } from '../src/runtime';
import { bunRuntime } from '../../runtime-bun/src';
import { closeDatabase, resetDatabaseSingleton, getDatabase } from '../src/database';
import { ChannelStore } from '../src/channels/store';

if (!hasRuntime()) setRuntime(bunRuntime);

let tempDir: string;
let store: ChannelStore;
let origDir: string | undefined;

beforeEach(() => {
  origDir = process.env.ASSISTANTS_DIR;
  tempDir = mkdtempSync(join(tmpdir(), 'ch-test-'));
  process.env.ASSISTANTS_DIR = tempDir;
  closeDatabase();
  resetDatabaseSingleton();
  store = new ChannelStore(getDatabase());
});

afterEach(() => {
  closeDatabase();
  resetDatabaseSingleton();
  if (origDir === undefined) delete process.env.ASSISTANTS_DIR;
  else process.env.ASSISTANTS_DIR = origDir;
  rmSync(tempDir, { recursive: true, force: true });
});

// Helper: create and return channel ID
function mkCh(name: string): string {
  const r = store.createChannel(name, null, 'a1', 'Agent1');
  expect(r.success).toBe(true);
  return r.channelId!;
}

// ─── createChannel ────────────────────────────────────────────────────────────

describe('createChannel', () => {
  test('succeeds and returns channelId', () => {
    const r = store.createChannel('general', null, 'a1', 'Agent1');
    expect(r.success).toBe(true);
    expect(r.channelId).toBeDefined();
    expect(r.channelId).toMatch(/^ch_/);
  });

  test('fails on duplicate name', () => {
    mkCh('dup');
    const r = store.createChannel('dup', null, 'a1', 'Agent1');
    expect(r.success).toBe(false);
  });

  test('normalizes name to lowercase', () => {
    const r = store.createChannel('General', null, 'a1', 'Agent1');
    expect(r.success).toBe(true);
    const ch = store.getChannel(r.channelId!);
    expect(ch?.name).toBe('general');
  });

  test('creator is auto-added as owner', () => {
    const id = mkCh('team');
    expect(store.isMember(id, 'a1')).toBe(true);
  });
});

// ─── getChannel / getChannelByName / resolveChannel ──────────────────────────

describe('getChannel / getChannelByName / resolveChannel', () => {
  test('getChannel returns channel by ID', () => {
    const id = mkCh('dev');
    expect(store.getChannel(id)?.name).toBe('dev');
  });

  test('getChannel returns null for unknown', () => {
    expect(store.getChannel('no-such')).toBeNull();
  });

  test('getChannelByName finds by name', () => {
    mkCh('backend');
    expect(store.getChannelByName('backend')?.name).toBe('backend');
  });

  test('resolveChannel finds by ID or name', () => {
    const id = mkCh('resolve-test');
    expect(store.resolveChannel(id)?.id).toBe(id);
    expect(store.resolveChannel('resolve-test')?.name).toBe('resolve-test');
  });
});

// ─── listChannels / archiveChannel ───────────────────────────────────────────

describe('listChannels / archiveChannel', () => {
  test('empty initially', () => {
    expect(store.listChannels()).toHaveLength(0);
  });

  test('returns all active channels', () => {
    mkCh('ch1'); mkCh('ch2');
    expect(store.listChannels()).toHaveLength(2);
  });

  test('archiveChannel marks as archived', () => {
    const id = mkCh('old');
    expect(store.archiveChannel(id)).toBe(true);
    expect(store.getChannel(id)?.status).toBe('archived');
  });

  test('archiveChannel returns false for unknown', () => {
    expect(store.archiveChannel('none')).toBe(false);
  });
});

// ─── addMember / removeMember / isMember / getMembers ────────────────────────

describe('Membership', () => {
  test('addMember + isMember', () => {
    const id = mkCh('team');
    store.addMember(id, 'a2', 'Agent2');
    expect(store.isMember(id, 'a2')).toBe(true);
  });

  test('isMember false for non-member', () => {
    const id = mkCh('private');
    expect(store.isMember(id, 'stranger')).toBe(false);
  });

  test('getMembers returns members', () => {
    const id = mkCh('group');
    store.addMember(id, 'a2', 'Agent2');
    const members = store.getMembers(id);
    const ids = members.map(m => m.assistantId);
    expect(ids).toContain('a1'); // creator
    expect(ids).toContain('a2');
  });

  test('removeMember removes member', () => {
    const id = mkCh('rm-test');
    store.addMember(id, 'ax', 'AgentX');
    store.removeMember(id, 'ax');
    expect(store.isMember(id, 'ax')).toBe(false);
  });
});

// ─── sendMessage / getMessages ────────────────────────────────────────────────

describe('sendMessage / getMessages', () => {
  test('sendMessage returns message ID', () => {
    const id = mkCh('chat');
    const msgId = store.sendMessage(id, 'a1', 'Agent1', 'Hello');
    expect(msgId).toMatch(/^cmsg_/);
  });

  test('getMessages returns sent messages', () => {
    const id = mkCh('msgs');
    store.sendMessage(id, 'a1', 'Agent1', 'First');
    store.sendMessage(id, 'a1', 'Agent1', 'Second');
    const msgs = store.getMessages(id);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toBe('First');
    expect(msgs[1].content).toBe('Second');
  });

  test('getMessages returns empty for new channel', () => {
    const id = mkCh('empty');
    expect(store.getMessages(id)).toHaveLength(0);
  });
});

// ─── Unread tracking ─────────────────────────────────────────────────────────

describe('Unread tracking', () => {
  test('new messages show as unread for other members', () => {
    const id = mkCh('unread-ch');
    store.addMember(id, 'reader', 'Reader');
    store.sendMessage(id, 'a1', 'Agent1', 'New message');
    const unread = store.getUnreadMessages(id, 'reader');
    expect(unread.length).toBeGreaterThanOrEqual(1);
  });

  test('markRead clears unread', () => {
    const id = mkCh('mark-read');
    store.addMember(id, 'reader', 'Reader');
    store.sendMessage(id, 'a1', 'Agent1', 'Message');
    store.markRead(id, 'reader');
    expect(store.getUnreadMessages(id, 'reader')).toHaveLength(0);
  });

  test('getUnreadCounts returns a Map', () => {
    expect(store.getUnreadCounts('any-agent') instanceof Map).toBe(true);
  });

  test('getAllUnreadMessages returns array', () => {
    const id = mkCh('all-unread');
    store.addMember(id, 'ag', 'Ag');
    store.sendMessage(id, 'a1', 'Agent1', 'Hi');
    const msgs = store.getAllUnreadMessages('ag');
    expect(Array.isArray(msgs)).toBe(true);
  });
});
