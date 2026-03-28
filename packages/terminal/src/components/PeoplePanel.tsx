import React, { useState, useEffect } from 'react';
import type { PeopleManager, PersonListItem, Person } from '@hasna/assistants-core';
import { useSafeInput as useInput } from '../hooks/useSafeInput';
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

    if (key.escape || (input === 'q' && !isTextEntry)) {
      if (mode === 'list') {
        onClose();
      } else if (mode === 'view') {
        setMode('list');
        setViewPerson(null);
      } else if (key.escape) {
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
    <box borderStyle="rounded" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} marginBottom={1}>
      <text fg={themeColor('success')}><b>People</b></text>
      <text fg={themeColor('muted')}> | </text>
      <text fg={themeColor('muted')}>{getHeaderHints()}</text>
    </box>
  );

  // Status message
  const statusBar = statusMessage ? (
    <box marginBottom={1}>
      <text fg={themeColor('warning')}>{statusMessage}</text>
    </box>
  ) : null;

  // Error bar
  const errorBar = error ? (
    <box marginBottom={1}>
      <text fg={themeColor('error')}>Error: {error}</text>
    </box>
  ) : null;

  // View person detail
  if (mode === 'view' && viewPerson) {
    return (
      <box flexDirection="column">
        {header}
        <box paddingX={1} flexDirection="column">
          <text fg={themeColor('success')}><b>{viewPerson.name}</b></text>
          <text fg={themeColor('muted')}>ID: {viewPerson.id}</text>
          <text>{' '}</text>
          {viewPerson.email && <text>Email:  {viewPerson.email}</text>}
          {viewPerson.phone && <text>Phone:  {viewPerson.phone}</text>}
          {viewPerson.role && <text>Role:   {viewPerson.role}</text>}
          <text>Status: {viewPerson.status}</text>
          {viewPerson.notes && (
            <box flexDirection="column" marginTop={1}>
              <text><b>Notes:</b></text>
              <text>  {viewPerson.notes}</text>
            </box>
          )}
          <text>{' '}</text>
          <text fg={themeColor('muted')}>Created: {viewPerson.createdAt}</text>
          <text fg={themeColor('muted')}>Updated: {viewPerson.updatedAt}</text>
        </box>
      </box>
    );
  }

  // List view
  if (mode === 'list') {
    return (
      <box flexDirection="column">
        {header}
        {statusBar}
        {errorBar}
        {people.length === 0 ? (
          <box paddingX={1}>
            <text fg={themeColor('muted')}>No people registered. Press 'c' to create one.</text>
          </box>
        ) : (
          <box flexDirection="column" paddingX={1}>
            {people.map((p) => (
              <box key={p.id}>
                <text fg={p.id === people[selectedIndex]?.id ? themeColor('success') : undefined}>
                  {p.id === people[selectedIndex]?.id ? '> ' : '  '}
                </text>
                <text attributes={p.id === people[selectedIndex]?.id ? 1 : undefined} fg={p.id === people[selectedIndex]?.id ? themeColor('success') : undefined}><b>
                  {p.name}
                </b></text>
                {p.role && <text fg={themeColor('muted')}> ({p.role})</text>}
                {p.email && <text fg={themeColor('muted')}> &lt;{p.email}&gt;</text>}
                {p.phone && <text fg={themeColor('muted')}> {p.phone}</text>}
                {p.isActive && <text fg={themeColor('info')}> (active)</text>}
              </box>
            ))}
          </box>
        )}
      </box>
    );
  }

  // Delete confirm
  if (mode === 'delete-confirm' && people.length > 0) {
    const person = people[selectedIndex];
    return (
      <box flexDirection="column">
        {header}
        <box paddingX={1} flexDirection="column">
          <text fg={themeColor('error')}><b>Delete person?</b></text>
          <text>{' '}</text>
          <text>This will permanently delete {person.name} ({person.id})</text>
          <text>{' '}</text>
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
          <text><b>Create Person</b></text>
          <text>{' '}</text>
          <box>
            <text>Name: </text>
            <input
              value={createName}
              onChange={setCreateName}
              onSubmit={() => {
                if (createName.trim()) setMode('create-email');
              }}
              focused
              placeholder="e.g., Jane Smith"
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
          <text><b>Create Person</b></text>
          <text>Name: {createName}</text>
          <text>{' '}</text>
          <box>
            <text>Email: </text>
            <input
              value={createEmail}
              onChange={setCreateEmail}
              onSubmit={() => setMode('create-phone')}
              focused
              placeholder="(optional) e.g., jane@example.com"
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
          <text><b>Create Person</b></text>
          <text>Name: {createName}</text>
          {createEmail && <text>Email: {createEmail}</text>}
          <text>{' '}</text>
          <box>
            <text>Phone: </text>
            <input
              value={createPhone}
              onChange={setCreatePhone}
              onSubmit={() => setMode('create-role')}
              focused
              placeholder="(optional) e.g., +1-555-123-4567"
            />
          </box>
        </box>
      </box>
    );
  }

  // Create wizard: role
  if (mode === 'create-role') {
    return (
      <box flexDirection="column">
        {header}
        <box paddingX={1} flexDirection="column">
          <text><b>Create Person</b></text>
          <text>Name:  {createName}</text>
          {createEmail && <text>Email: {createEmail}</text>}
          {createPhone && <text>Phone: {createPhone}</text>}
          <text>{' '}</text>
          <box>
            <text>Role: </text>
            <input
              value={createRole}
              onChange={setCreateRole}
              onSubmit={() => setMode('create-notes')}
              focused
              placeholder="(optional) e.g., Developer, Manager"
            />
          </box>
        </box>
      </box>
    );
  }

  // Create wizard: notes
  if (mode === 'create-notes') {
    return (
      <box flexDirection="column">
        {header}
        <box paddingX={1} flexDirection="column">
          <text><b>Create Person</b></text>
          <text>Name:  {createName}</text>
          {createEmail && <text>Email: {createEmail}</text>}
          {createPhone && <text>Phone: {createPhone}</text>}
          {createRole && <text>Role:  {createRole}</text>}
          <text>{' '}</text>
          <box>
            <text>Notes: </text>
            <input
              value={createNotes}
              onChange={setCreateNotes}
              onSubmit={() => setMode('create-confirm')}
              focused
              placeholder="(optional) Any notes about this person"
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
          <text><b>Confirm Person Creation</b></text>
          <text>{' '}</text>
          <text>Name:  {createName}</text>
          {createEmail && <text>Email: {createEmail}</text>}
          {createPhone && <text>Phone: {createPhone}</text>}
          {createRole && <text>Role:  {createRole}</text>}
          {createNotes && <text>Notes: {createNotes}</text>}
          <text>{' '}</text>
          <text>Press 'y' to create, 'n' to cancel.</text>
        </box>
      </box>
    );
  }

  return (
    <box flexDirection="column">
      {header}
      <text fg={themeColor('muted')}>Loading...</text>
    </box>
  );
}
