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
import { Box, Text, TextInput, useInput } from '../ui/ink';
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

/**
 * Favorites are stored in the contact's `custom_fields` bag — the @hasna/contacts
 * data model has no first-class favorite column.
 */
type WithCustomFields = { custom_fields?: Record<string, unknown> | null };
function isFavorite(c: WithCustomFields): boolean {
  return c.custom_fields?.is_favorite === true;
}
function withFavorite(c: WithCustomFields, fav: boolean): Record<string, unknown> {
  return { ...(c.custom_fields ?? {}), is_favorite: fav };
}

function toListEntry(c: ContactWithDetails): ContactListEntry {
  return {
    id: c.id,
    name: c.display_name || `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || c.id,
    company: (c as any).company?.name,
    primaryEmail: c.emails?.[0]?.address,
    primaryPhone: c.phones?.[0]?.number,
    favorite: isFavorite(c),
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

    if (key.escape || input === '\x1b' || (input === 'q' && !isTextEntry)) {
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
      } else if (key.escape || input === '\x1b') {
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
            const newFav = !isFavorite(full);
            sdkUpdateContact(c.id, { custom_fields: withFavorite(full, newFav) }).then(() => {
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
        const newFav = !isFavorite(viewContact);
        sdkUpdateContact(viewContact.id, { custom_fields: withFavorite(viewContact, newFav) }).then(() => {
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
    <Box borderStyle="round" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} marginBottom={1}>
      <Text fg={themeColor('secondary')} bold>Contacts</Text>
      <Text fg={themeColor('muted')}> | </Text>
      <Text fg={themeColor('muted')}>{getHeaderHints()}</Text>
      {loading && <Text fg={themeColor('warning')}> (loading...)</Text>}
    </Box>
  );

  const statusBar = statusMessage ? (
    <Box marginBottom={1}>
      <Text fg={themeColor('warning')}>{statusMessage}</Text>
    </Box>
  ) : null;

  const errorBar = error ? (
    <Box marginBottom={1}>
      <Text fg={themeColor('error')}>Error: {error}</Text>
    </Box>
  ) : null;

  // Search mode
  if (mode === 'search') {
    return (
      <Box flexDirection="column">
        {header}
        <Box paddingX={1} flexDirection="column">
          <Text bold>Search Contacts</Text>
          <Text> </Text>
          <Box>
            <Text>Query: </Text>
            <TextInput
              value={searchQuery}
              onChange={setSearchQuery}
              onSubmit={(value) => {
                const query = value.trim();
                if (query) {
                  sdkSearchContacts(query).then((results) => {
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
              onCancel={() => setMode('list')}
              focus
              allowEmptySubmit
              placeholder="Search by name, email, company..."
            />
          </Box>
        </Box>
      </Box>
    );
  }

  // View contact detail
  if (mode === 'view' && viewContact) {
    const displayName = viewContact.display_name || `${viewContact.first_name ?? ''} ${viewContact.last_name ?? ''}`.trim() || viewContact.id;
    const isFav = isFavorite(viewContact);
    return (
      <Box flexDirection="column">
        {header}
        <Box paddingX={1} flexDirection="column">
          <Text fg={themeColor('secondary')} bold>
            {isFav ? '* ' : ''}{displayName}
          </Text>
          <Text fg={themeColor('muted')}>ID: {viewContact.id}</Text>
          <Text> </Text>
          {(viewContact as any).company?.name && <Text>Company: {(viewContact as any).company.name}</Text>}
          {viewContact.job_title && <Text>Title: {viewContact.job_title}</Text>}
          {viewContact.birthday && <Text>Birthday: {viewContact.birthday}</Text>}
          {viewContact.emails && viewContact.emails.length > 0 && (
            <>
              <Text> </Text>
              <Text bold>Emails:</Text>
              {viewContact.emails.map((e: any, i: number) => (
                <Text key={i}>  {e.address} ({e.label || 'personal'}){e.is_primary ? ' [primary]' : ''}</Text>
              ))}
            </>
          )}
          {viewContact.phones && viewContact.phones.length > 0 && (
            <>
              <Text> </Text>
              <Text bold>Phones:</Text>
              {viewContact.phones.map((p: any, i: number) => (
                <Text key={i}>  {p.number} ({p.label || 'mobile'}){p.is_primary ? ' [primary]' : ''}</Text>
              ))}
            </>
          )}
          {viewContact.addresses && viewContact.addresses.length > 0 && (
            <>
              <Text> </Text>
              <Text bold>Addresses:</Text>
              {viewContact.addresses.map((a: any, i: number) => {
                const parts = [a.street, a.city, a.state, a.postal_code, a.country].filter(Boolean);
                return <Text key={i}>  {parts.join(', ')} ({a.label || 'home'})</Text>;
              })}
            </>
          )}
          {viewContact.social_profiles && viewContact.social_profiles.length > 0 && (
            <>
              <Text> </Text>
              <Text bold>Social:</Text>
              {viewContact.social_profiles.map((s: any, i: number) => (
                <Text key={i}>  {s.platform}: {s.handle || s.url}</Text>
              ))}
            </>
          )}
          {viewContact.tags && viewContact.tags.length > 0 && (
            <>
              <Text> </Text>
              <Text>Tags: {viewContact.tags.map((t: any) => typeof t === 'string' ? t : t.name).join(', ')}</Text>
            </>
          )}
          {viewContact.notes && (
            <>
              <Text> </Text>
              <Text>Notes: {viewContact.notes}</Text>
            </>
          )}
        </Box>
      </Box>
    );
  }

  // Delete confirm
  if (mode === 'delete-confirm' && contacts.length > 0) {
    const c = contacts[selectedIndex];
    return (
      <Box flexDirection="column">
        {header}
        <Box paddingX={1} flexDirection="column">
          <Text fg={themeColor('error')} bold>Delete contact?</Text>
          <Text> </Text>
          <Text>This will permanently delete {c.name} ({c.id})</Text>
          <Text> </Text>
          <Text>Press 'y' to confirm, 'n' to cancel.</Text>
        </Box>
      </Box>
    );
  }

  // Create wizard: name
  if (mode === 'create-name') {
    return (
      <Box flexDirection="column">
        {header}
        <Box paddingX={1} flexDirection="column">
          <Text bold>Create Contact</Text>
          <Text> </Text>
          <Box>
            <Text>Name: </Text>
            <TextInput
              value={createName}
              onChange={setCreateName}
              onSubmit={(value) => {
                const name = value.trim();
                if (name) {
                  setCreateName(name);
                  setMode('create-email');
                }
              }}
              onCancel={() => setMode('list')}
              focus
              placeholder="e.g., John Doe"
            />
          </Box>
        </Box>
      </Box>
    );
  }

  // Create wizard: email
  if (mode === 'create-email') {
    return (
      <Box flexDirection="column">
        {header}
        <Box paddingX={1} flexDirection="column">
          <Text bold>Create Contact</Text>
          <Text>Name: {createName}</Text>
          <Text> </Text>
          <Box>
            <Text>Email: </Text>
            <TextInput
              value={createEmail}
              onChange={setCreateEmail}
              onSubmit={(value) => {
                setCreateEmail(value.trim());
                setMode('create-phone');
              }}
              onCancel={() => setMode('create-name')}
              focus
              allowEmptySubmit
              placeholder="(optional) e.g., john@example.com"
            />
          </Box>
        </Box>
      </Box>
    );
  }

  // Create wizard: phone
  if (mode === 'create-phone') {
    return (
      <Box flexDirection="column">
        {header}
        <Box paddingX={1} flexDirection="column">
          <Text bold>Create Contact</Text>
          <Text>Name: {createName}</Text>
          {createEmail && <Text>Email: {createEmail}</Text>}
          <Text> </Text>
          <Box>
            <Text>Phone: </Text>
            <TextInput
              value={createPhone}
              onChange={setCreatePhone}
              onSubmit={(value) => {
                setCreatePhone(value.trim());
                setMode('create-company');
              }}
              onCancel={() => setMode('create-email')}
              focus
              allowEmptySubmit
              placeholder="(optional) e.g., +1-555-123-4567"
            />
          </Box>
        </Box>
      </Box>
    );
  }

  // Create wizard: company
  if (mode === 'create-company') {
    return (
      <Box flexDirection="column">
        {header}
        <Box paddingX={1} flexDirection="column">
          <Text bold>Create Contact</Text>
          <Text>Name: {createName}</Text>
          {createEmail && <Text>Email: {createEmail}</Text>}
          {createPhone && <Text>Phone: {createPhone}</Text>}
          <Text> </Text>
          <Box>
            <Text>Company: </Text>
            <TextInput
              value={createCompany}
              onChange={setCreateCompany}
              onSubmit={(value) => {
                setCreateCompany(value.trim());
                setMode('create-confirm');
              }}
              onCancel={() => setMode('create-phone')}
              focus
              allowEmptySubmit
              placeholder="(optional) e.g., Acme Corp"
            />
          </Box>
        </Box>
      </Box>
    );
  }

  // Create wizard: confirm
  if (mode === 'create-confirm') {
    return (
      <Box flexDirection="column">
        {header}
        <Box paddingX={1} flexDirection="column">
          <Text bold>Confirm Contact Creation</Text>
          <Text> </Text>
          <Text>Name:    {createName}</Text>
          {createEmail && <Text>Email:   {createEmail}</Text>}
          {createPhone && <Text>Phone:   {createPhone}</Text>}
          {createCompany && <Text>Company: {createCompany}</Text>}
          <Text> </Text>
          <Text>Press 'y' to create, 'n' to cancel.</Text>
        </Box>
      </Box>
    );
  }

  // Groups list
  if (mode === 'groups') {
    return (
      <Box flexDirection="column">
        {header}
        {statusBar}
        {groups.length === 0 ? (
          <Box paddingX={1}>
            <Text fg={themeColor('muted')}>No groups. Groups can be created via the AI assistant.</Text>
          </Box>
        ) : (
          <Box flexDirection="column" paddingX={1}>
            {groups.map((g, i) => (
              <Box key={g.id}>
                <Text fg={i === selectedGroupIndex ? themeColor('accent') : undefined}>
                  {i === selectedGroupIndex ? '> ' : '  '}
                </Text>
                <Text bold={i === selectedGroupIndex} fg={i === selectedGroupIndex ? themeColor('accent') : undefined}>
                  {g.name}
                </Text>
                {g.description && <Text fg={themeColor('muted')}> - {g.description}</Text>}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    );
  }

  // Group view
  if (mode === 'group-view' && viewGroup) {
    return (
      <Box flexDirection="column">
        {header}
        <Box paddingX={1} flexDirection="column">
          <Text fg={themeColor('secondary')} bold>{viewGroup.name}</Text>
          {viewGroup.description && <Text fg={themeColor('muted')}>{viewGroup.description}</Text>}
          <Text> </Text>
          {groupMembers.length === 0 ? (
            <Text fg={themeColor('muted')}>No members in this group.</Text>
          ) : (
            groupMembers.map((m) => {
              const email = m.primaryEmail ? ` <${m.primaryEmail}>` : '';
              const company = m.company ? ` @ ${m.company}` : '';
              return (
                <Text key={m.id}>  - {m.name}{company}{email}</Text>
              );
            })
          )}
        </Box>
      </Box>
    );
  }

  // List view (default)
  return (
    <Box flexDirection="column">
      {header}
      {statusBar}
      {errorBar}
      {contacts.length === 0 ? (
        <Box paddingX={1}>
          <Text fg={themeColor('muted')}>No contacts. Press 'c' to create one, or ask the AI to add contacts.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" paddingX={1}>
          {contacts.map((c, i) => (
            <Box key={c.id}>
              <Text fg={i === selectedIndex ? themeColor('accent') : undefined}>
                {i === selectedIndex ? '> ' : '  '}
              </Text>
              <Text bold={i === selectedIndex} fg={i === selectedIndex ? themeColor('accent') : undefined}>
                {c.favorite ? '* ' : ''}{truncate(c.name, 16).padEnd(16)}
              </Text>
              <Text fg={themeColor('muted')}>
                {' '}{truncate(c.company || '', 14).padEnd(14)}
              </Text>
              <Text>
                {' '}{truncate(c.primaryEmail || '', 24).padEnd(24)}
              </Text>
              {c.tags.length > 0 && (
                <Text fg={themeColor('muted')}> [{c.tags.join(', ')}]</Text>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
