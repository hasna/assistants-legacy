import React, { useState, useEffect } from 'react';
import type { ContactsManager, ContactListItem, Contact, ContactGroup, ContactGroupRef } from '@hasna/assistants-core';
import { useSafeInput as useInput } from '../hooks/useSafeInput';

interface ContactsPanelProps {
  manager: ContactsManager;
  onClose: () => void;
}

type Mode =
  | 'list'
  | 'view'
  | 'create-name'
  | 'create-email'
  | 'create-phone'
  | 'create-company'
  | 'create-confirm'
  | 'delete-confirm'
  | 'search'
  | 'groups'
  | 'group-view';

export function ContactsPanel({ manager, onClose }: ContactsPanelProps) {
  const [mode, setMode] = useState<Mode>('list');
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // View state
  const [viewContact, setViewContact] = useState<Contact | null>(null);

  // Create wizard state
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createCompany, setCreateCompany] = useState('');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Groups state
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
  const [viewGroup, setViewGroup] = useState<ContactGroup | null>(null);
  const [groupMembers, setGroupMembers] = useState<ContactListItem[]>([]);

  const loadContacts = () => {
    try {
      const list = manager.listContacts({ limit: 100 });
      setContacts(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const loadGroups = () => {
    try {
      const list = manager.listGroups();
      setGroups(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    loadContacts();
  }, []);

  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, contacts.length - 1)));
  }, [contacts.length]);

  useInput((input, key) => {
    const isTextEntry = mode === 'create-name' || mode === 'create-email' ||
      mode === 'create-phone' || mode === 'create-company' || mode === 'search';

    if (key.escape || (input === 'q' && !isTextEntry)) {
      if (mode === 'list') {
        onClose();
      } else if (mode === 'view') {
        setMode('list');
        setViewContact(null);
      } else if (mode === 'groups') {
        setMode('list');
      } else if (mode === 'group-view') {
        setMode('groups');
        setViewGroup(null);
        setGroupMembers([]);
      } else if (key.escape) {
        setMode('list');
        setStatusMessage(null);
      }
      return;
    }

    if (isTextEntry) return;

    if (mode === 'list') {
      if (key.upArrow || input === 'k') {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow || input === 'j') {
        if (contacts.length > 0) {
          setSelectedIndex((prev) => Math.min(contacts.length - 1, prev + 1));
        }
      } else if (key.return && contacts.length > 0) {
        const c = contacts[selectedIndex];
        const full = manager.getContact(c.id);
        if (full) {
          setViewContact(full);
          setMode('view');
        }
      } else if (input === 'c') {
        setCreateName('');
        setCreateEmail('');
        setCreatePhone('');
        setCreateCompany('');
        setMode('create-name');
      } else if (input === 'd' && contacts.length > 0) {
        setMode('delete-confirm');
      } else if (input === 's' || input === '/') {
        setSearchQuery('');
        setMode('search');
      } else if (input === 'g') {
        loadGroups();
        setSelectedGroupIndex(0);
        setMode('groups');
      } else if (input === 'f' && contacts.length > 0) {
        const c = contacts[selectedIndex];
        const full = manager.getContact(c.id);
        if (full) {
          manager.updateContact(c.id, { favorite: !full.favorite });
          setStatusMessage(full.favorite ? `Unfavorited ${c.name}` : `Favorited ${c.name}`);
          loadContacts();
        }
      } else if (input === 'r') {
        loadContacts();
        setStatusMessage('Refreshed');
      }
    } else if (mode === 'view') {
      if (input === 'f' && viewContact) {
        manager.updateContact(viewContact.id, { favorite: !viewContact.favorite });
        const updated = manager.getContact(viewContact.id);
        if (updated) setViewContact(updated);
        loadContacts();
      }
    } else if (mode === 'delete-confirm') {
      if (input === 'y' && contacts.length > 0) {
        const c = contacts[selectedIndex];
        const deleted = manager.deleteContact(c.id);
        if (deleted) {
          setStatusMessage(`Deleted ${c.name}`);
          loadContacts();
          if (selectedIndex >= contacts.length - 1) {
            setSelectedIndex(Math.max(0, selectedIndex - 1));
          }
        } else {
          setStatusMessage('Error deleting contact');
        }
        setMode('list');
      } else if (input === 'n') {
        setMode('list');
      }
    } else if (mode === 'create-confirm') {
      if (input === 'y') {
        try {
          const contact = manager.createContact({
            name: createName,
            company: createCompany || undefined,
            emails: createEmail ? [{ email: createEmail, label: 'personal', isPrimary: true }] : undefined,
            phones: createPhone ? [{ phone: createPhone, label: 'mobile', isPrimary: true }] : undefined,
          });
          setStatusMessage(`Created ${contact.name}`);
          setMode('list');
          loadContacts();
        } catch (err) {
          setStatusMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
          setMode('list');
        }
      } else if (input === 'n') {
        setMode('list');
      }
    } else if (mode === 'groups') {
      if (key.upArrow || input === 'k') {
        setSelectedGroupIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow || input === 'j') {
        if (groups.length > 0) {
          setSelectedGroupIndex((prev) => Math.min(groups.length - 1, prev + 1));
        }
      } else if (key.return && groups.length > 0) {
        const g = groups[selectedGroupIndex];
        setViewGroup(g);
        const members = manager.getGroupMembers(g.id);
        setGroupMembers(members);
        setMode('group-view');
      }
    }
  });

  // Helpers
  const truncate = (str: string, max: number) => str.length > max ? str.slice(0, max - 1) + '~' : str;

  // Header
  const getHeaderHints = () => {
    switch (mode) {
      case 'list': return 'q:close c:create enter:view d:delete s:search g:groups f:fav r:refresh';
      case 'view': return 'q:back f:toggle-fav';
      case 'delete-confirm': return 'y:confirm n:cancel';
      case 'create-confirm': return 'y:confirm n:cancel';
      case 'groups': return 'q:back enter:view';
      case 'group-view': return 'q:back';
      default: return 'Enter to continue, Esc to cancel';
    }
  };

  const header = (
    <box borderStyle="rounded" borderColor="#d4d4d8" border={["top", "bottom"]} paddingX={1} marginBottom={1}>
      <text fg="blue"><b>Contacts</b></text>
      <text fg="gray"> | </text>
      <text fg="gray">{getHeaderHints()}</text>
    </box>
  );

  const statusBar = statusMessage ? (
    <box marginBottom={1}>
      <text fg="yellow">{statusMessage}</text>
    </box>
  ) : null;

  const errorBar = error ? (
    <box marginBottom={1}>
      <text fg="red">Error: {error}</text>
    </box>
  ) : null;

  // Search mode
  if (mode === 'search') {
    return (
      <box flexDirection="column">
        {header}
        <box paddingX={1} flexDirection="column">
          <text><b>Search Contacts</b></text>
          <text> </text>
          <box>
            <text>Query: </text>
            <input
              value={searchQuery}
              onChange={setSearchQuery}
              onSubmit={() => {
                if (searchQuery.trim()) {
                  const results = manager.searchContacts(searchQuery.trim());
                  setContacts(results);
                  setSelectedIndex(0);
                  setStatusMessage(`Found ${results.length} contact(s)`);
                } else {
                  loadContacts();
                  setStatusMessage(null);
                }
                setMode('list');
              }}
              focused
              placeholder="Search by name, email, company..."
            />
          </box>
        </box>
      </box>
    );
  }

  // View contact detail
  if (mode === 'view' && viewContact) {
    return (
      <box flexDirection="column">
        {header}
        <box paddingX={1} flexDirection="column">
          <text fg="blue"><b>
            {viewContact.favorite ? '* ' : ''}{viewContact.name}
          </b></text>
          <text fg="gray">ID: {viewContact.id}</text>
          <text> </text>
          {viewContact.company && <text>Company: {viewContact.company}</text>}
          {viewContact.title && <text>Title: {viewContact.title}</text>}
          {viewContact.birthday && <text>Birthday: {viewContact.birthday}</text>}
          <text>Relationship: {viewContact.relationship}</text>
          {viewContact.emails.length > 0 && (
            <>
              <text> </text>
              <text><b>Emails:</b></text>
              {viewContact.emails.map((e, i) => (
                <text key={i}>  {e.email} ({e.label}){e.isPrimary ? ' [primary]' : ''}</text>
              ))}
            </>
          )}
          {viewContact.phones.length > 0 && (
            <>
              <text> </text>
              <text><b>Phones:</b></text>
              {viewContact.phones.map((p, i) => (
                <text key={i}>  {p.phone} ({p.label}){p.isPrimary ? ' [primary]' : ''}</text>
              ))}
            </>
          )}
          {viewContact.addresses.length > 0 && (
            <>
              <text> </text>
              <text><b>Addresses:</b></text>
              {viewContact.addresses.map((a, i) => {
                const parts = [a.street, a.city, a.state, a.postalCode, a.country].filter(Boolean);
                return <text key={i}>  {parts.join(', ')} ({a.label})</text>;
              })}
            </>
          )}
          {viewContact.social.length > 0 && (
            <>
              <text> </text>
              <text><b>Social:</b></text>
              {viewContact.social.map((s, i) => (
                <text key={i}>  {s.platform}: {s.handle}</text>
              ))}
            </>
          )}
          {viewContact.tags.length > 0 && (
            <>
              <text> </text>
              <text>Tags: {viewContact.tags.join(', ')}</text>
            </>
          )}
          {viewContact.groups.length > 0 && (
            <text>Groups: {viewContact.groups.map((g: ContactGroupRef) => g.name).join(', ')}</text>
          )}
          {viewContact.notes && (
            <>
              <text> </text>
              <text>Notes: {viewContact.notes}</text>
            </>
          )}
        </box>
      </box>
    );
  }

  // Delete confirm
  if (mode === 'delete-confirm' && contacts.length > 0) {
    const c = contacts[selectedIndex];
    return (
      <box flexDirection="column">
        {header}
        <box paddingX={1} flexDirection="column">
          <text fg="red"><b>Delete contact?</b></text>
          <text> </text>
          <text>This will permanently delete {c.name} ({c.id})</text>
          <text> </text>
          <text>Press 'y' to confirm, 'n' to cancel.</text>
        </box>
      </box>
    );
  }

  // Create wizard: name
  if (mode === 'create-name') {
    return (
      <box flexDirection="column">
        {header}
        <box paddingX={1} flexDirection="column">
          <text><b>Create Contact</b></text>
          <text> </text>
          <box>
            <text>Name: </text>
            <input
              value={createName}
              onChange={setCreateName}
              onSubmit={() => {
                if (createName.trim()) setMode('create-email');
              }}
              focused
              placeholder="e.g., John Doe"
            />
          </box>
        </box>
      </box>
    );
  }

  // Create wizard: email
  if (mode === 'create-email') {
    return (
      <box flexDirection="column">
        {header}
        <box paddingX={1} flexDirection="column">
          <text><b>Create Contact</b></text>
          <text>Name: {createName}</text>
          <text> </text>
          <box>
            <text>Email: </text>
            <input
              value={createEmail}
              onChange={setCreateEmail}
              onSubmit={() => setMode('create-phone')}
              focused
              placeholder="(optional) e.g., john@example.com"
            />
          </box>
        </box>
      </box>
    );
  }

  // Create wizard: phone
  if (mode === 'create-phone') {
    return (
      <box flexDirection="column">
        {header}
        <box paddingX={1} flexDirection="column">
          <text><b>Create Contact</b></text>
          <text>Name: {createName}</text>
          {createEmail && <text>Email: {createEmail}</text>}
          <text> </text>
          <box>
            <text>Phone: </text>
            <input
              value={createPhone}
              onChange={setCreatePhone}
              onSubmit={() => setMode('create-company')}
              focused
              placeholder="(optional) e.g., +1-555-123-4567"
            />
          </box>
        </box>
      </box>
    );
  }

  // Create wizard: company
  if (mode === 'create-company') {
    return (
      <box flexDirection="column">
        {header}
        <box paddingX={1} flexDirection="column">
          <text><b>Create Contact</b></text>
          <text>Name: {createName}</text>
          {createEmail && <text>Email: {createEmail}</text>}
          {createPhone && <text>Phone: {createPhone}</text>}
          <text> </text>
          <box>
            <text>Company: </text>
            <input
              value={createCompany}
              onChange={setCreateCompany}
              onSubmit={() => setMode('create-confirm')}
              focused
              placeholder="(optional) e.g., Acme Corp"
            />
          </box>
        </box>
      </box>
    );
  }

  // Create wizard: confirm
  if (mode === 'create-confirm') {
    return (
      <box flexDirection="column">
        {header}
        <box paddingX={1} flexDirection="column">
          <text><b>Confirm Contact Creation</b></text>
          <text> </text>
          <text>Name:    {createName}</text>
          {createEmail && <text>Email:   {createEmail}</text>}
          {createPhone && <text>Phone:   {createPhone}</text>}
          {createCompany && <text>Company: {createCompany}</text>}
          <text> </text>
          <text>Press 'y' to create, 'n' to cancel.</text>
        </box>
      </box>
    );
  }

  // Groups list
  if (mode === 'groups') {
    return (
      <box flexDirection="column">
        {header}
        {statusBar}
        {groups.length === 0 ? (
          <box paddingX={1}>
            <text fg="gray">No groups. Groups can be created via the AI assistant.</text>
          </box>
        ) : (
          <box flexDirection="column" paddingX={1}>
            {groups.map((g, i) => (
              <box key={g.id}>
                <text fg={i === selectedGroupIndex ? 'blue' : undefined}>
                  {i === selectedGroupIndex ? '> ' : '  '}
                </text>
                <text attributes={i === selectedGroupIndex ? 1 : undefined} fg={i === selectedGroupIndex ? 'blue' : undefined}><b>
                  {g.name}
                </b></text>
                <text fg="gray"> ({g.memberCount} members)</text>
                {g.description && <text fg="gray"> - {g.description}</text>}
              </box>
            ))}
          </box>
        )}
      </box>
    );
  }

  // Group view
  if (mode === 'group-view' && viewGroup) {
    return (
      <box flexDirection="column">
        {header}
        <box paddingX={1} flexDirection="column">
          <text fg="blue"><b>{viewGroup.name}</b></text>
          {viewGroup.description && <text fg="gray">{viewGroup.description}</text>}
          <text fg="gray">{viewGroup.memberCount} members</text>
          <text> </text>
          {groupMembers.length === 0 ? (
            <text fg="gray">No members in this group.</text>
          ) : (
            groupMembers.map((m) => {
              const email = m.primaryEmail ? ` <${m.primaryEmail}>` : '';
              const company = m.company ? ` @ ${m.company}` : '';
              return (
                <text key={m.id}>  - {m.name}{company}{email}</text>
              );
            })
          )}
        </box>
      </box>
    );
  }

  // List view (default)
  return (
    <box flexDirection="column">
      {header}
      {statusBar}
      {errorBar}
      {contacts.length === 0 ? (
        <box paddingX={1}>
          <text fg="gray">No contacts. Press 'c' to create one, or ask the AI to add contacts.</text>
        </box>
      ) : (
        <box flexDirection="column" paddingX={1}>
          {contacts.map((c, i) => (
            <box key={c.id}>
              <text fg={i === selectedIndex ? 'blue' : undefined}>
                {i === selectedIndex ? '> ' : '  '}
              </text>
              <text attributes={i === selectedIndex ? 1 : undefined} fg={i === selectedIndex ? 'blue' : undefined}><b>
                {c.favorite ? '* ' : ''}{truncate(c.name, 16).padEnd(16)}
              </b></text>
              <text fg="gray">
                {' '}{truncate(c.company || '', 14).padEnd(14)}
              </text>
              <text>
                {' '}{truncate(c.primaryEmail || '', 24).padEnd(24)}
              </text>
              {c.tags.length > 0 && (
                <text fg="gray"> [{c.tags.join(', ')}]</text>
              )}
            </box>
          ))}
        </box>
      )}
    </box>
  );
}
