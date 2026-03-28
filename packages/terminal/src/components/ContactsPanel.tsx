import React, { useState, useEffect, useCallback } from 'react';
import {
  listContacts as sdkListContacts,
  getContact as sdkGetContact,
  updateContact as sdkUpdateContact,
  deleteContact as sdkDeleteContact,
  searchContacts as sdkSearchContacts,
  createContact as sdkCreateContact,
  listGroups as sdkListGroups,
  listContactsInGroup as sdkListContactsInGroup,
} from '@hasna/assistants-core';
import type { ContactWithDetails, Group } from '@hasna/assistants-core';
import { useSafeInput as useInput } from '../hooks/useSafeInput';
import { themeColor } from '../theme/colors';

interface ContactsPanelProps {
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

/** Slim list item projected from ContactWithDetails */
interface ContactListEntry {
  id: string;
  name: string;
  company?: string;
  primaryEmail?: string;
  primaryPhone?: string;
  favorite: boolean;
  tags: string[];
}

function toListEntry(c: ContactWithDetails): ContactListEntry {
  return {
    id: c.id,
    name: c.display_name || `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || c.id,
    company: (c as any).company?.name,
    primaryEmail: c.emails?.[0]?.address,
    primaryPhone: c.phones?.[0]?.number,
    favorite: c.is_favorite ?? false,
    tags: c.tags?.map((t: any) => typeof t === 'string' ? t : t.name) ?? [],
  };
}

export function ContactsPanel({ onClose }: ContactsPanelProps) {
  const [mode, setMode] = useState<Mode>('list');
  const [contacts, setContacts] = useState<ContactListEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // View state
  const [viewContact, setViewContact] = useState<ContactWithDetails | null>(null);

  // Create wizard state
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createCompany, setCreateCompany] = useState('');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Groups state
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
  const [viewGroup, setViewGroup] = useState<Group | null>(null);
  const [groupMembers, setGroupMembers] = useState<ContactListEntry[]>([]);

  const loadContacts = useCallback(async () => {
    try {
      setLoading(true);
      const result = await sdkListContacts({ limit: 100 });
      const list = (result.contacts ?? result).map(toListEntry);
      setContacts(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadGroups = useCallback(async () => {
    try {
      const list = await sdkListGroups();
      setGroups(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

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
        sdkGetContact(c.id).then((full) => {
          if (full) {
            setViewContact(full);
            setMode('view');
          }
        });
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
        sdkGetContact(c.id).then((full) => {
          if (full) {
            const newFav = !(full.is_favorite ?? false);
            sdkUpdateContact(c.id, { is_favorite: newFav } as any).then(() => {
              setStatusMessage(newFav ? `Favorited ${c.name}` : `Unfavorited ${c.name}`);
              loadContacts();
            });
          }
        });
      } else if (input === 'r') {
        loadContacts().then(() => setStatusMessage('Refreshed'));
      }
    } else if (mode === 'view') {
      if (input === 'f' && viewContact) {
        const newFav = !(viewContact.is_favorite ?? false);
        sdkUpdateContact(viewContact.id, { is_favorite: newFav } as any).then(() => {
          sdkGetContact(viewContact.id).then((updated) => {
            if (updated) setViewContact(updated);
          });
          loadContacts();
        });
      }
    } else if (mode === 'delete-confirm') {
      if (input === 'y' && contacts.length > 0) {
        const c = contacts[selectedIndex];
        sdkDeleteContact(c.id).then((deleted) => {
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
        });
      } else if (input === 'n') {
        setMode('list');
      }
    } else if (mode === 'create-confirm') {
      if (input === 'y') {
        sdkCreateContact({
          display_name: createName,
          emails: createEmail ? [{ address: createEmail, is_primary: true }] : undefined,
          phones: createPhone ? [{ number: createPhone, is_primary: true }] : undefined,
        }).then((contact) => {
          setStatusMessage(`Created ${contact.display_name}`);
          setMode('list');
          loadContacts();
        }).catch((err) => {
          setStatusMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
          setMode('list');
        });
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
        sdkListContactsInGroup(g.id).then((members) => {
          setGroupMembers(members.map(toListEntry));
          setMode('group-view');
        });
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
    <box borderStyle="rounded" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} marginBottom={1}>
      <text fg={themeColor('secondary')}><b>Contacts</b></text>
      <text fg={themeColor('muted')}> | </text>
      <text fg={themeColor('muted')}>{getHeaderHints()}</text>
      {loading && <text fg={themeColor('warning')}> (loading...)</text>}
    </box>
  );

  const statusBar = statusMessage ? (
    <box marginBottom={1}>
      <text fg={themeColor('warning')}>{statusMessage}</text>
    </box>
  ) : null;

  const errorBar = error ? (
    <box marginBottom={1}>
      <text fg={themeColor('error')}>Error: {error}</text>
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
                  sdkSearchContacts(searchQuery.trim()).then((results) => {
                    setContacts(results.map(toListEntry));
                    setSelectedIndex(0);
                    setStatusMessage(`Found ${results.length} contact(s)`);
                    setMode('list');
                  });
                } else {
                  loadContacts().then(() => {
                    setStatusMessage(null);
                    setMode('list');
                  });
                }
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
    const displayName = viewContact.display_name || `${viewContact.first_name ?? ''} ${viewContact.last_name ?? ''}`.trim() || viewContact.id;
    const isFav = viewContact.is_favorite ?? false;
    return (
      <box flexDirection="column">
        {header}
        <box paddingX={1} flexDirection="column">
          <text fg={themeColor('secondary')}><b>
            {isFav ? '* ' : ''}{displayName}
          </b></text>
          <text fg={themeColor('muted')}>ID: {viewContact.id}</text>
          <text> </text>
          {(viewContact as any).company?.name && <text>Company: {(viewContact as any).company.name}</text>}
          {viewContact.job_title && <text>Title: {viewContact.job_title}</text>}
          {viewContact.birthday && <text>Birthday: {viewContact.birthday}</text>}
          {viewContact.emails && viewContact.emails.length > 0 && (
            <>
              <text> </text>
              <text><b>Emails:</b></text>
              {viewContact.emails.map((e: any, i: number) => (
                <text key={i}>  {e.address} ({e.label || 'personal'}){e.is_primary ? ' [primary]' : ''}</text>
              ))}
            </>
          )}
          {viewContact.phones && viewContact.phones.length > 0 && (
            <>
              <text> </text>
              <text><b>Phones:</b></text>
              {viewContact.phones.map((p: any, i: number) => (
                <text key={i}>  {p.number} ({p.label || 'mobile'}){p.is_primary ? ' [primary]' : ''}</text>
              ))}
            </>
          )}
          {viewContact.addresses && viewContact.addresses.length > 0 && (
            <>
              <text> </text>
              <text><b>Addresses:</b></text>
              {viewContact.addresses.map((a: any, i: number) => {
                const parts = [a.street, a.city, a.state, a.postal_code, a.country].filter(Boolean);
                return <text key={i}>  {parts.join(', ')} ({a.label || 'home'})</text>;
              })}
            </>
          )}
          {viewContact.social_profiles && viewContact.social_profiles.length > 0 && (
            <>
              <text> </text>
              <text><b>Social:</b></text>
              {viewContact.social_profiles.map((s: any, i: number) => (
                <text key={i}>  {s.platform}: {s.handle || s.url}</text>
              ))}
            </>
          )}
          {viewContact.tags && viewContact.tags.length > 0 && (
            <>
              <text> </text>
              <text>Tags: {viewContact.tags.map((t: any) => typeof t === 'string' ? t : t.name).join(', ')}</text>
            </>
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
          <text fg={themeColor('error')}><b>Delete contact?</b></text>
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
            <text fg={themeColor('muted')}>No groups. Groups can be created via the AI assistant.</text>
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
                {g.description && <text fg={themeColor('muted')}> - {g.description}</text>}
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
          <text fg={themeColor('secondary')}><b>{viewGroup.name}</b></text>
          {viewGroup.description && <text fg={themeColor('muted')}>{viewGroup.description}</text>}
          <text> </text>
          {groupMembers.length === 0 ? (
            <text fg={themeColor('muted')}>No members in this group.</text>
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
          <text fg={themeColor('muted')}>No contacts. Press 'c' to create one, or ask the AI to add contacts.</text>
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
              <text fg={themeColor('muted')}>
                {' '}{truncate(c.company || '', 14).padEnd(14)}
              </text>
              <text>
                {' '}{truncate(c.primaryEmail || '', 24).padEnd(24)}
              </text>
              {c.tags.length > 0 && (
                <text fg={themeColor('muted')}> [{c.tags.join(', ')}]</text>
              )}
            </box>
          ))}
        </box>
      )}
    </box>
  );
}
