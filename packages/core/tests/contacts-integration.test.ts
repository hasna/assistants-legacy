import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { ContactsStore } from '../src/contacts/store';
import { ContactsManager } from '../src/contacts/manager';
import { createContactsToolExecutors } from '../src/contacts/tools';
import { createTestDatabase } from './fixtures/test-db';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

describe('ContactsStore', () => {
  let store: ContactsStore;

  beforeAll(() => {
    store = new ContactsStore(createTestDatabase());
  });

  afterAll(() => {
    store.close();
  });

  it('creates a contact with all fields', () => {
    const contact = store.createContact('John Doe', {
      company: 'Acme Corp',
      title: 'Engineer',
      birthday: '1990-05-15',
      relationship: 'colleague',
      favorite: true,
      emails: [{ email: 'john@acme.com', label: 'work', isPrimary: true }],
      phones: [{ phone: '+1-555-0100', label: 'mobile', isPrimary: true }],
      addresses: [{ street: '123 Main St', city: 'Springfield', state: 'IL', postalCode: '62701', country: 'US', label: 'home' }],
      social: [{ platform: 'github', handle: 'johndoe' }],
      tags: ['engineering', 'team-lead'],
    });

    expect(contact.id).toStartWith('ct_');
    expect(contact.name).toBe('John Doe');
    expect(contact.company).toBe('Acme Corp');
    expect(contact.title).toBe('Engineer');
    expect(contact.birthday).toBe('1990-05-15');
    expect(contact.relationship).toBe('colleague');
    expect(contact.favorite).toBe(true);
    expect(contact.emails).toHaveLength(1);
    expect(contact.emails[0].email).toBe('john@acme.com');
    expect(contact.emails[0].isPrimary).toBe(true);
    expect(contact.phones).toHaveLength(1);
    expect(contact.phones[0].phone).toBe('+1-555-0100');
    expect(contact.addresses).toHaveLength(1);
    expect(contact.addresses[0].city).toBe('Springfield');
    expect(contact.social).toHaveLength(1);
    expect(contact.social[0].platform).toBe('github');
    expect(contact.tags).toEqual(['engineering', 'team-lead']);
  });

  it('gets a contact by ID', () => {
    const list = store.listContacts();
    expect(list.length).toBeGreaterThan(0);
    const contact = store.getContact(list[0].id);
    expect(contact).not.toBeNull();
    expect(contact!.name).toBe('John Doe');
  });

  it('updates a contact', () => {
    const list = store.listContacts();
    const updated = store.updateContact(list[0].id, {
      company: 'New Corp',
      tags: ['engineering', 'mentor'],
    });
    expect(updated).not.toBeNull();
    expect(updated!.company).toBe('New Corp');
    expect(updated!.tags).toEqual(['engineering', 'mentor']);
  });

  it('lists contacts', () => {
    const list = store.listContacts();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('John Doe');
    expect(list[0].primaryEmail).toBe('john@acme.com');
    expect(list[0].favorite).toBe(true);
  });

  it('searches contacts', () => {
    const results = store.searchContacts('John');
    expect(results).toHaveLength(1);
    const noResults = store.searchContacts('nonexistent');
    expect(noResults).toHaveLength(0);
  });

  it('creates and manages groups', () => {
    const contact2 = store.createContact('Jane Smith', {
      emails: [{ email: 'jane@test.com', isPrimary: true }],
    });

    const group = store.createGroup('Engineering', 'Engineering team');
    expect(group.id).toStartWith('grp_');
    expect(group.name).toBe('Engineering');

    const list = store.listContacts();
    store.addGroupMember(group.id, list[0].id);
    store.addGroupMember(group.id, contact2.id);

    const groups = store.listGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].memberCount).toBe(2);

    const members = store.getGroupMembers(group.id);
    expect(members).toHaveLength(2);

    // Filter by group
    const filtered = store.listContacts({ group: group.id });
    expect(filtered).toHaveLength(2);

    // Remove member
    store.removeGroupMember(group.id, contact2.id);
    const membersAfter = store.getGroupMembers(group.id);
    expect(membersAfter).toHaveLength(1);

    // Delete group
    store.deleteGroup(group.id);
    expect(store.listGroups()).toHaveLength(0);

    // Clean up
    store.deleteContact(contact2.id);
  });

  it('filters by tag', () => {
    const results = store.listContacts({ tag: 'mentor' });
    expect(results).toHaveLength(1);
  });

  it('filters by favorite', () => {
    const results = store.listContacts({ favorite: true });
    expect(results).toHaveLength(1);
    const nonFav = store.listContacts({ favorite: false });
    expect(nonFav).toHaveLength(0);
  });

  it('filters by relationship', () => {
    const results = store.listContacts({ relationship: 'colleague' });
    expect(results).toHaveLength(1);
    const none = store.listContacts({ relationship: 'family' });
    expect(none).toHaveLength(0);
  });

  it('deletes a contact', () => {
    const list = store.listContacts();
    const deleted = store.deleteContact(list[0].id);
    expect(deleted).toBe(true);
    expect(store.listContacts()).toHaveLength(0);
  });
});

describe('ContactsManager', () => {
  let manager: ContactsManager;

  beforeAll(() => {
    manager = new ContactsManager(new ContactsStore(createTestDatabase()));
  });

  afterAll(() => {
    manager.close();
  });

  it('creates a contact with validation', () => {
    const contact = manager.createContact({ name: 'Alice', emails: [{ email: 'alice@test.com' }] });
    expect(contact.name).toBe('Alice');
  });

  it('rejects empty name', () => {
    expect(() => manager.createContact({ name: '' })).toThrow('Contact name is required');
  });

  it('rejects invalid email format', () => {
    expect(() => manager.createContact({ name: 'Bad', emails: [{ email: 'not-an-email' }] })).toThrow('Invalid email format');
  });

  it('rejects invalid birthday format', () => {
    expect(() => manager.createContact({ name: 'Bad', birthday: 'not-a-date' })).toThrow('Birthday must be in ISO format');
  });

  it('rejects invalid relationship', () => {
    expect(() => manager.createContact({ name: 'Bad', relationship: 'unknown' as any })).toThrow('Invalid relationship');
  });

  it('rejects duplicate group names', () => {
    manager.createGroup('TestGroup');
    expect(() => manager.createGroup('TestGroup')).toThrow('already exists');
  });

  it('searches contacts', () => {
    const results = manager.searchContacts('Alice');
    expect(results).toHaveLength(1);
  });
});

describe('ContactsToolExecutors', () => {
  let manager: ContactsManager;
  let executors: Record<string, (input: any) => Promise<string>>;
  let tmpHome: string;
  let savedHome: string | undefined;
  let savedDbPath: string | undefined;

  beforeAll(() => {
    // The contacts tool executors operate on the external @hasna/contacts
    // package's own SQLite store, which roots its data dir at $HOME/.hasna.
    // Point HOME at a fresh temp dir (before the package is first imported on
    // the initial executor call) so contact and group operations share one
    // isolated database and don't accumulate in the developer's real ~/.hasna.
    savedHome = process.env.HOME;
    savedDbPath = process.env.HASNA_CONTACTS_DB_PATH;
    delete process.env.HASNA_CONTACTS_DB_PATH;
    tmpHome = mkdtempSync(join(tmpdir(), 'contacts-home-'));
    process.env.HOME = tmpHome;

    manager = new ContactsManager(new ContactsStore(createTestDatabase()));
    executors = createContactsToolExecutors(() => manager) as any;
  });

  afterAll(() => {
    manager.close();
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    if (savedDbPath === undefined) delete process.env.HASNA_CONTACTS_DB_PATH;
    else process.env.HASNA_CONTACTS_DB_PATH = savedDbPath;
    rmSync(tmpHome, { recursive: true, force: true });
  });

  // The executors operate on the @hasna/contacts SDK store, not the injected
  // manager, so IDs are parsed from executor output and the tests run as an
  // ordered lifecycle (create -> read -> update -> group -> delete).
  const UUID = /\(([0-9a-f-]{36})\)/;
  const contactName = `Bob Tool Test ${randomUUID()}`;
  let contactId: string;
  let groupId: string;

  it('contacts_create creates a contact', async () => {
    const result = await executors.contacts_create({ name: contactName, company: 'Tool Co', emails: [{ email: `${contactName.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@example.com` }] });
    expect(result).toContain(`Contact created: ${contactName}`);
    contactId = result.match(UUID)?.[1] as string;
    expect(contactId).toBeTruthy();
  });

  it('contacts_list lists contacts', async () => {
    const result = await executors.contacts_list({ query: contactName });
    expect(result).toContain(contactName);
    expect(result).toContain('Contacts (1)');
  });

  it('contacts_search finds contacts', async () => {
    const result = await executors.contacts_search({ query: contactName });
    expect(result).toContain(contactName);
  });

  it('contacts_get retrieves contact details', async () => {
    const result = await executors.contacts_get({ id: contactId });
    expect(result).toContain(contactName);
    expect(result).toContain(`ID: ${contactId}`);
  });

  it('contacts_update updates a contact', async () => {
    const result = await executors.contacts_update({ id: contactId, title: 'Engineer' });
    expect(result).toContain(`Updated: ${contactName}`);
  });

  it('contacts_groups_create creates a group', async () => {
    const result = await executors.contacts_groups_create({ name: 'Dev Team', description: 'Developers' });
    expect(result).toContain('Group created: Dev Team');
    groupId = result.match(UUID)?.[1] as string;
    expect(groupId).toBeTruthy();
  });

  it('contacts_groups_list lists groups', async () => {
    const result = await executors.contacts_groups_list({});
    expect(result).toContain('Dev Team');
  });

  it('contacts_groups_add_member adds a member', async () => {
    const result = await executors.contacts_groups_add_member({ group_id: groupId, contact_id: contactId });
    expect(result).toContain('added to group');
  });

  it('contacts_groups_remove_member removes a member', async () => {
    const result = await executors.contacts_groups_remove_member({ group_id: groupId, contact_id: contactId });
    expect(result).toContain('removed from group');
  });

  it('contacts_delete deletes a contact', async () => {
    const result = await executors.contacts_delete({ id: contactId });
    expect(result).toContain('Contact deleted');
  });

  it('contacts_groups_delete deletes a group', async () => {
    const result = await executors.contacts_groups_delete({ id: groupId });
    expect(result).toContain('Group deleted');
  });
});
