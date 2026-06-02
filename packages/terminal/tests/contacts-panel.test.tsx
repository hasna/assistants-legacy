import React from 'react';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { renderInk } from './utils/ink-test-harness';

let contacts: any[] = [];
let groups: any[] = [];
let groupMembers = new Map<string, any[]>();
let createdInput: any = null;

const listContactsMock = mock(async () => ({ contacts }));
const getContactMock = mock(async (id: string) => contacts.find((contact) => contact.id === id) ?? null);
const updateContactMock = mock(async (id: string, input: any) => {
  const contact = contacts.find((item) => item.id === id);
  if (contact) {
    Object.assign(contact, input);
  }
  return contact;
});
const deleteContactMock = mock(async (id: string) => {
  const before = contacts.length;
  contacts = contacts.filter((contact) => contact.id !== id);
  return contacts.length !== before;
});
const searchContactsMock = mock(async (query: string) => {
  const lowerQuery = query.toLowerCase();
  return contacts.filter((contact) => contact.display_name.toLowerCase().includes(lowerQuery));
});
const createContactMock = mock(async (input: any) => {
  createdInput = input;
  const contact = {
    id: `contact-${contacts.length + 1}`,
    display_name: input.display_name,
    first_name: null,
    last_name: null,
    emails: input.emails ?? [],
    phones: input.phones ?? [],
    tags: [],
    custom_fields: {},
  };
  contacts = [contact, ...contacts];
  return contact;
});
const listGroupsMock = mock(async () => groups);
const listContactsInGroupMock = mock(async (groupId: string) => groupMembers.get(groupId) ?? []);

mock.module('@hasna/assistants-core', () => ({
  listContacts: listContactsMock,
  getContact: getContactMock,
  updateContact: updateContactMock,
  deleteContact: deleteContactMock,
  searchContacts: searchContactsMock,
  createContact: createContactMock,
  listGroups: listGroupsMock,
  listContactsInGroup: listContactsInGroupMock,
}));

const { ContactsPanel } = await import('../src/components/ContactsPanel');

function resetContactsState() {
  contacts = [
    {
      id: 'contact-1',
      display_name: 'Jane Smith',
      first_name: 'Jane',
      last_name: 'Smith',
      emails: [{ address: 'jane@example.com', label: 'work', is_primary: true }],
      phones: [{ number: '+15551234567', label: 'mobile', is_primary: true }],
      tags: [{ name: 'vip' }],
      custom_fields: {},
      company: { name: 'Acme' },
      notes: 'Prefers email',
    },
    {
      id: 'contact-2',
      display_name: 'Alex Rivera',
      first_name: 'Alex',
      last_name: 'Rivera',
      emails: [{ address: 'alex@example.com', label: 'work', is_primary: true }],
      phones: [],
      tags: [],
      custom_fields: {},
    },
  ];
  groups = [
    { id: 'group-1', name: 'Customers', description: 'Customer contacts' },
  ];
  groupMembers = new Map([['group-1', [contacts[0]]]]);
  createdInput = null;
  listContactsMock.mockClear();
  getContactMock.mockClear();
  updateContactMock.mockClear();
  deleteContactMock.mockClear();
  searchContactsMock.mockClear();
  createContactMock.mockClear();
  listGroupsMock.mockClear();
  listContactsInGroupMock.mockClear();
}

describe('ContactsPanel', () => {
  beforeEach(() => {
    resetContactsState();
  });

  test('renders contacts and opens a detail view with Ink input', async () => {
    const harness = await renderInk(<ContactsPanel onClose={() => {}} />, { width: 100, height: 30 });

    try {
      const listFrame = await harness.waitForText('Jane Smith');
      expect(listFrame).toContain('jane@example.com');

      harness.pressEnter();
      const detailFrame = await harness.waitForText('Prefers email');
      expect(detailFrame).toContain('Emails:');
      expect(getContactMock).toHaveBeenCalledWith('contact-1');
    } finally {
      await harness.cleanup();
    }
  });

  test('creates a contact with submitted Ink TextInput values', async () => {
    const harness = await renderInk(<ContactsPanel onClose={() => {}} />, { width: 100, height: 30 });

    try {
      await harness.waitForText('Jane Smith');
      harness.pressKey('c');
      await harness.waitForText('Name:');

      harness.typeText('Taylor Kim');
      await harness.waitForText('Taylor Kim');
      harness.pressEnter();

      await harness.waitForText('Email:');
      harness.typeText('taylor@example.com');
      await harness.waitForText('taylor@example.com');
      harness.pressEnter();

      await harness.waitForText('Phone:');
      harness.typeText('+15550002222');
      await harness.waitForText('+15550002222');
      harness.pressEnter();

      await harness.waitForText('Company:');
      harness.pressEnter();

      await harness.waitForText('Confirm Contact Creation');
      harness.pressKey('y');

      await harness.waitForText('Created Taylor Kim');
      expect(createdInput).toEqual({
        display_name: 'Taylor Kim',
        emails: [{ address: 'taylor@example.com', is_primary: true }],
        phones: [{ number: '+15550002222', is_primary: true }],
      });
    } finally {
      await harness.cleanup();
    }
  });

  test('searches contacts through Ink TextInput', async () => {
    const harness = await renderInk(<ContactsPanel onClose={() => {}} />, { width: 100, height: 30 });

    try {
      await harness.waitForText('Jane Smith');
      harness.pressKey('/');
      await harness.waitForText('Search Contacts');

      harness.typeText('Alex');
      await harness.waitForText('Alex');
      harness.pressEnter();

      const resultFrame = await harness.waitForText('Found 1 contact(s)');
      expect(resultFrame).toContain('Alex Rivera');
      expect(resultFrame).not.toContain('Jane Smith');
      expect(searchContactsMock).toHaveBeenCalledWith('Alex');
    } finally {
      await harness.cleanup();
    }
  });
});
