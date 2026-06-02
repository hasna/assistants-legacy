import React, { useState, useEffect } from 'react';
import type { PeopleManager, PersonListItem, Person } from '@hasna/assistants-core';
import { Box, Text, TextInput, useInput } from '../ui/ink';
import { themeColor } from '../theme/colors';

interface PeoplePanelProps {
  manager: PeopleManager;
  onClose: () => void;
}

type Mode =
  | 'list'
  | 'view'
  | 'create-name'
  | 'create-email'
  | 'create-phone'
  | 'create-role'
  | 'create-notes'
  | 'create-confirm'
  | 'delete-confirm';

export function PeoplePanel({ manager, onClose }: PeoplePanelProps) {
  const [mode, setMode] = useState<Mode>('list');
  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // View state
  const [viewPerson, setViewPerson] = useState<Person | null>(null);

  // Create wizard state
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createRole, setCreateRole] = useState('');
  const [createNotes, setCreateNotes] = useState('');

  const loadPeople = () => {
    try {
      const list = manager.listPeople();
      setPeople(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    loadPeople();
  }, []);

  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, people.length - 1)));
  }, [people.length]);

  useEffect(() => {
    if (mode === 'delete-confirm' && people.length === 0) {
      setMode('list');
    }
  }, [mode, people.length]);

  useInput((input, key) => {
    const isTextEntry = mode === 'create-name' || mode === 'create-email' ||
      mode === 'create-phone' || mode === 'create-role' || mode === 'create-notes';
    const isEscape = key.escape || input === '\x1b';

    if (isEscape || (input === 'q' && !isTextEntry)) {
      if (mode === 'list') {
        onClose();
      } else if (mode === 'view') {
        setMode('list');
        setViewPerson(null);
      } else if (isEscape) {
        setMode('list');
        setStatusMessage(null);
      }
      return;
    }

    // Don't handle other keys during text entry - let TextInput receive them
    if (isTextEntry) return;

    if (mode === 'list') {
      if (key.upArrow || input === 'k') {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow || input === 'j') {
        if (people.length === 0) {
          setSelectedIndex(0);
        } else {
          setSelectedIndex((prev) => Math.min(people.length - 1, prev + 1));
        }
      } else if (key.return && people.length > 0) {
        const person = people[selectedIndex];
        const full = manager.getPerson(person.id);
        if (full) {
          setViewPerson(full);
          setMode('view');
        }
      } else if (input === 'a') {
        // 'a' for activate/login
        if (people.length > 0) {
          const person = people[selectedIndex];
          manager.setActivePerson(person.id).then(() => {
            setStatusMessage(`Logged in as ${person.name}`);
            loadPeople();
          }).catch((err: Error) => {
            setStatusMessage(`Error: ${err.message}`);
          });
        }
      } else if (input === 'c') {
        setCreateName('');
        setCreateEmail('');
        setCreatePhone('');
        setCreateRole('');
        setCreateNotes('');
        setMode('create-name');
      } else if (input === 'l') {
        manager.logout().then(() => {
          setStatusMessage('Logged out');
          loadPeople();
        });
      } else if (input === 'd' && people.length > 0) {
        setMode('delete-confirm');
      } else if (input === 'r') {
        loadPeople();
        setStatusMessage('Refreshed');
      }
    } else if (mode === 'view') {
      if (input === 'a' && viewPerson) {
        manager.setActivePerson(viewPerson.id).then(() => {
          setStatusMessage(`Logged in as ${viewPerson.name}`);
          loadPeople();
          setMode('list');
          setViewPerson(null);
        }).catch((err: Error) => {
          setStatusMessage(`Error: ${err.message}`);
        });
      }
    } else if (mode === 'delete-confirm') {
      if (input === 'y' && people.length > 0) {
        const person = people[selectedIndex];
        manager.deletePerson(person.id).then(() => {
          setStatusMessage(`Deleted ${person.name}`);
          setMode('list');
          loadPeople();
          if (selectedIndex >= people.length - 1) {
            setSelectedIndex(Math.max(0, selectedIndex - 1));
          }
        }).catch((err: Error) => {
          setStatusMessage(`Error: ${err.message}`);
          setMode('list');
        });
      } else if (input === 'n') {
        setMode('list');
      }
    } else if (mode === 'create-confirm') {
      if (input === 'y') {
        manager.createPerson({
          name: createName,
          email: createEmail || undefined,
          phone: createPhone || undefined,
          role: createRole || undefined,
          notes: createNotes || undefined,
        }).then((person) => {
          return manager.setActivePerson(person.id).then(() => {
            setStatusMessage(`Created and logged in as ${person.name}`);
            setMode('list');
            loadPeople();
          });
        }).catch((err: Error) => {
          setStatusMessage(`Error: ${err.message}`);
          setMode('list');
        });
      } else if (input === 'n') {
        setMode('list');
      }
    }
  });

  // Header
  const getHeaderHints = () => {
    switch (mode) {
      case 'list': return 'q:close c:create enter:view a:login l:logout d:delete r:refresh';
      case 'view': return 'q:back a:login';
      case 'delete-confirm': return 'y:confirm n:cancel';
      case 'create-confirm': return 'y:confirm n:cancel';
      default: return 'Enter to continue, Esc to cancel';
    }
  };

  const header = (
    <Box borderStyle="round" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} marginBottom={1}>
      <Text fg={themeColor('success')} bold>People</Text>
      <Text fg={themeColor('muted')}> | </Text>
      <Text fg={themeColor('muted')}>{getHeaderHints()}</Text>
    </Box>
  );

  // Status message
  const statusBar = statusMessage ? (
    <Box marginBottom={1}>
      <Text fg={themeColor('warning')}>{statusMessage}</Text>
    </Box>
  ) : null;

  // Error bar
  const errorBar = error ? (
    <Box marginBottom={1}>
      <Text fg={themeColor('error')}>Error: {error}</Text>
    </Box>
  ) : null;

  // View person detail
  if (mode === 'view' && viewPerson) {
    return (
      <Box flexDirection="column">
        {header}
        <Box paddingX={1} flexDirection="column">
          <Text fg={themeColor('success')} bold>{viewPerson.name}</Text>
          <Text fg={themeColor('muted')}>ID: {viewPerson.id}</Text>
          <Text>{' '}</Text>
          {viewPerson.email && <Text>Email:  {viewPerson.email}</Text>}
          {viewPerson.phone && <Text>Phone:  {viewPerson.phone}</Text>}
          {viewPerson.role && <Text>Role:   {viewPerson.role}</Text>}
          <Text>Status: {viewPerson.status}</Text>
          {viewPerson.notes && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold>Notes:</Text>
              <Text>  {viewPerson.notes}</Text>
            </Box>
          )}
          <Text>{' '}</Text>
          <Text fg={themeColor('muted')}>Created: {viewPerson.createdAt}</Text>
          <Text fg={themeColor('muted')}>Updated: {viewPerson.updatedAt}</Text>
        </Box>
      </Box>
    );
  }

  // List view
  if (mode === 'list') {
    return (
      <Box flexDirection="column">
        {header}
        {statusBar}
        {errorBar}
        {people.length === 0 ? (
          <Box paddingX={1}>
            <Text fg={themeColor('muted')}>No people registered. Press 'c' to create one.</Text>
          </Box>
        ) : (
          <Box flexDirection="column" paddingX={1}>
            {people.map((p) => (
              <Box key={p.id}>
                <Text fg={p.id === people[selectedIndex]?.id ? themeColor('success') : undefined}>
                  {p.id === people[selectedIndex]?.id ? '> ' : '  '}
                </Text>
                <Text bold={p.id === people[selectedIndex]?.id} fg={p.id === people[selectedIndex]?.id ? themeColor('success') : undefined}>
                  {p.name}
                </Text>
                {p.role && <Text fg={themeColor('muted')}> ({p.role})</Text>}
                {p.email && <Text fg={themeColor('muted')}> &lt;{p.email}&gt;</Text>}
                {p.phone && <Text fg={themeColor('muted')}> {p.phone}</Text>}
                {p.isActive && <Text fg={themeColor('info')}> (active)</Text>}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    );
  }

  // Delete confirm
  if (mode === 'delete-confirm' && people.length > 0) {
    const person = people[selectedIndex];
    return (
      <Box flexDirection="column">
        {header}
        <Box paddingX={1} flexDirection="column">
          <Text fg={themeColor('error')} bold>Delete person?</Text>
          <Text>{' '}</Text>
          <Text>This will permanently delete {person.name} ({person.id})</Text>
          <Text>{' '}</Text>
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
          <Text bold>Create Person</Text>
          <Text>{' '}</Text>
          <Box>
            <Text>Name: </Text>
            <TextInput
              value={createName}
              onChange={setCreateName}
              onSubmit={(nextName) => {
                setCreateName(nextName);
                if (nextName.trim()) setMode('create-email');
              }}
              focus
              placeholder="e.g., Jane Smith"
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
          <Text bold>Create Person</Text>
          <Text>Name: {createName}</Text>
          <Text>{' '}</Text>
          <Box>
            <Text>Email: </Text>
            <TextInput
              value={createEmail}
              onChange={setCreateEmail}
              onSubmit={(nextEmail) => {
                setCreateEmail(nextEmail);
                setMode('create-phone');
              }}
              focus
              placeholder="(optional) e.g., jane@example.com"
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
          <Text bold>Create Person</Text>
          <Text>Name: {createName}</Text>
          {createEmail && <Text>Email: {createEmail}</Text>}
          <Text>{' '}</Text>
          <Box>
            <Text>Phone: </Text>
            <TextInput
              value={createPhone}
              onChange={setCreatePhone}
              onSubmit={(nextPhone) => {
                setCreatePhone(nextPhone);
                setMode('create-role');
              }}
              focus
              placeholder="(optional) e.g., +1-555-123-4567"
            />
          </Box>
        </Box>
      </Box>
    );
  }

  // Create wizard: role
  if (mode === 'create-role') {
    return (
      <Box flexDirection="column">
        {header}
        <Box paddingX={1} flexDirection="column">
          <Text bold>Create Person</Text>
          <Text>Name:  {createName}</Text>
          {createEmail && <Text>Email: {createEmail}</Text>}
          {createPhone && <Text>Phone: {createPhone}</Text>}
          <Text>{' '}</Text>
          <Box>
            <Text>Role: </Text>
            <TextInput
              value={createRole}
              onChange={setCreateRole}
              onSubmit={(nextRole) => {
                setCreateRole(nextRole);
                setMode('create-notes');
              }}
              focus
              placeholder="(optional) e.g., Developer, Manager"
            />
          </Box>
        </Box>
      </Box>
    );
  }

  // Create wizard: notes
  if (mode === 'create-notes') {
    return (
      <Box flexDirection="column">
        {header}
        <Box paddingX={1} flexDirection="column">
          <Text bold>Create Person</Text>
          <Text>Name:  {createName}</Text>
          {createEmail && <Text>Email: {createEmail}</Text>}
          {createPhone && <Text>Phone: {createPhone}</Text>}
          {createRole && <Text>Role:  {createRole}</Text>}
          <Text>{' '}</Text>
          <Box>
            <Text>Notes: </Text>
            <TextInput
              value={createNotes}
              onChange={setCreateNotes}
              onSubmit={(nextNotes) => {
                setCreateNotes(nextNotes);
                setMode('create-confirm');
              }}
              focus
              placeholder="(optional) Any notes about this person"
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
          <Text bold>Confirm Person Creation</Text>
          <Text>{' '}</Text>
          <Text>Name:  {createName}</Text>
          {createEmail && <Text>Email: {createEmail}</Text>}
          {createPhone && <Text>Phone: {createPhone}</Text>}
          {createRole && <Text>Role:  {createRole}</Text>}
          {createNotes && <Text>Notes: {createNotes}</Text>}
          <Text>{' '}</Text>
          <Text>Press 'y' to create, 'n' to cancel.</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {header}
      <Text fg={themeColor('muted')}>Loading...</Text>
    </Box>
  );
}
