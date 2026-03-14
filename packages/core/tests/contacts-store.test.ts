import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { setRuntime, hasRuntime } from '../src/runtime';
import { bunRuntime } from '../../runtime-bun/src';
import { closeDatabase, resetDatabaseSingleton, getDatabase } from '../src/database';
import { ContactsStore } from '../src/contacts/store';

if (!hasRuntime()) setRuntime(bunRuntime);

let tempDir: string;
let store: ContactsStore;
let origAssistantsDir: string | undefined;

beforeEach(() => {
  origAssistantsDir = process.env.ASSISTANTS_DIR;
  tempDir = mkdtempSync(join(tmpdir(), 'contacts-test-'));
  process.env.ASSISTANTS_DIR = tempDir;
  closeDatabase();
  resetDatabaseSingleton();
  const db = getDatabase();
  store = new ContactsStore(db);
});

afterEach(() => {
  closeDatabase();
  resetDatabaseSingleton();
  if (origAssistantsDir === undefined) delete process.env.ASSISTANTS_DIR;
  else process.env.ASSISTANTS_DIR = origAssistantsDir;
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── createContact / getContact ───────────────────────────────────────────────

describe('createContact / getContact', () => {
  test('creates a contact and returns it', () => {
    const c = store.createContact('Alice Smith');
    expect(c.id).toMatch(/^ct_/);
    expect(c.name).toBe('Alice Smith');
  });

  test('getContact returns created contact', () => {
    const c = store.createContact('Bob');
    const found = store.getContact(c.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Bob');
  });

  test('getContact returns null for unknown ID', () => {
    expect(store.getContact('nonexistent')).toBeNull();
  });

  test('creates contact with email', () => {
    const c = store.createContact('Carol', {
      emails: [{ email: 'carol@example.com', isPrimary: true }],
    });
    const found = store.getContact(c.id);
    expect(found?.emails?.some(e => e.email === 'carol@example.com')).toBe(true);
  });

  test('creates contact with phone', () => {
    const c = store.createContact('Dan', {
      phones: [{ phone: '+1-555-0100', isPrimary: true }],
    });
    const found = store.getContact(c.id);
    expect(found?.phones?.some(p => p.phone === '+1-555-0100')).toBe(true);
  });

  test('creates contact with notes', () => {
    const c = store.createContact('Eve', { notes: 'VIP contact' });
    const found = store.getContact(c.id);
    expect(found?.notes).toBe('VIP contact');
  });

  test('unique IDs for each contact', () => {
    const c1 = store.createContact('A');
    const c2 = store.createContact('B');
    expect(c1.id).not.toBe(c2.id);
  });
});

// ─── updateContact ────────────────────────────────────────────────────────────

describe('updateContact', () => {
  test('updates contact name', () => {
    const c = store.createContact('Old Name');
    store.updateContact(c.id, { name: 'New Name' });
    expect(store.getContact(c.id)!.name).toBe('New Name');
  });

  test('returns null for non-existent ID', () => {
    const result = store.updateContact('no-such', { name: 'X' });
    expect(result).toBeNull();
  });
});

// ─── deleteContact ────────────────────────────────────────────────────────────

describe('deleteContact', () => {
  test('deletes an existing contact', () => {
    const c = store.createContact('To Delete');
    expect(store.deleteContact(c.id)).toBe(true);
    expect(store.getContact(c.id)).toBeNull();
  });

  test('returns false for non-existent ID', () => {
    expect(store.deleteContact('nonexistent')).toBe(false);
  });
});

// ─── listContacts ─────────────────────────────────────────────────────────────

describe('listContacts', () => {
  test('returns empty array initially', () => {
    expect(store.listContacts()).toHaveLength(0);
  });

  test('returns all contacts', () => {
    store.createContact('Alice');
    store.createContact('Bob');
    store.createContact('Carol');
    expect(store.listContacts()).toHaveLength(3);
  });

  test('limit option restricts results', () => {
    for (let i = 0; i < 10; i++) store.createContact(`Contact ${i}`);
    const results = store.listContacts({ limit: 3 });
    expect(results).toHaveLength(3);
  });

  test('items have name field', () => {
    store.createContact('Test Person');
    const results = store.listContacts();
    expect(results[0].name).toBeDefined();
  });
});

// ─── searchContacts ───────────────────────────────────────────────────────────

describe('searchContacts', () => {
  test('finds contact by name', () => {
    store.createContact('Alice Wonderland');
    store.createContact('Bob Builder');
    const results = store.searchContacts('Alice');
    expect(results.some(r => r.name === 'Alice Wonderland')).toBe(true);
  });

  test('returns empty for no match', () => {
    store.createContact('Alice');
    expect(store.searchContacts('xyzzy12345')).toHaveLength(0);
  });

  test('empty query returns results', () => {
    store.createContact('Test');
    const results = store.searchContacts('');
    expect(Array.isArray(results)).toBe(true);
  });
});

// ─── Groups ───────────────────────────────────────────────────────────────────

describe('createGroup / listGroups / deleteGroup', () => {
  test('creates a group', () => {
    const g = store.createGroup('Team Alpha', 'Core team');
    expect(g.id).toMatch(/^grp_/);
    expect(g.name).toBe('Team Alpha');
    expect(g.description).toBe('Core team');
  });

  test('getGroup returns created group', () => {
    const g = store.createGroup('Team Beta');
    const found = store.getGroup(g.id);
    expect(found?.name).toBe('Team Beta');
  });

  test('getGroupByName finds group by name', () => {
    store.createGroup('Marketing');
    const found = store.getGroupByName('Marketing');
    expect(found?.name).toBe('Marketing');
  });

  test('listGroups returns all groups', () => {
    store.createGroup('G1');
    store.createGroup('G2');
    expect(store.listGroups()).toHaveLength(2);
  });

  test('deleteGroup removes the group', () => {
    const g = store.createGroup('To Remove');
    expect(store.deleteGroup(g.id)).toBe(true);
    expect(store.getGroup(g.id)).toBeNull();
  });

  test('deleteGroup returns false for unknown', () => {
    expect(store.deleteGroup('no-such')).toBe(false);
  });
});

// ─── Group membership ─────────────────────────────────────────────────────────

describe('Group membership', () => {
  test('addGroupMember + getGroupMembers', () => {
    const g = store.createGroup('Team');
    const c = store.createContact('Alice');
    store.addGroupMember(g.id, c.id);
    const members = store.getGroupMembers(g.id);
    expect(members.some(m => m.name === 'Alice')).toBe(true);
  });

  test('removeGroupMember removes a member', () => {
    const g = store.createGroup('Team');
    const c = store.createContact('Bob');
    store.addGroupMember(g.id, c.id);
    store.removeGroupMember(g.id, c.id);
    const members = store.getGroupMembers(g.id);
    expect(members.some(m => m.name === 'Bob')).toBe(false);
  });

  test('getGroupMembers returns empty for new group', () => {
    const g = store.createGroup('Empty');
    expect(store.getGroupMembers(g.id)).toHaveLength(0);
  });
});
