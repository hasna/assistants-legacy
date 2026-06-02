import React from 'react';
import { describe, expect, test } from 'bun:test';
import type { Person, PersonListItem } from '@hasna/assistants-core';
import { PeoplePanel } from '../src/components/PeoplePanel';
import { renderInk } from './utils/ink-test-harness';

function createPeopleManagerStub(initialPeople: Person[] = []) {
  let people = [...initialPeople];
  let activeId: string | null = initialPeople.find((person) => person.status === 'active')?.id ?? null;
  let createdInput: any = null;

  const toListItem = (person: Person): PersonListItem => ({
    id: person.id,
    name: person.name,
    email: person.email,
    phone: person.phone,
    role: person.role,
    status: person.status,
    isActive: person.id === activeId,
  });

  return {
    get createdInput() {
      return createdInput;
    },
    manager: {
      listPeople: () => people.map(toListItem),
      getPerson: (id: string) => people.find((person) => person.id === id) ?? null,
      createPerson: async (input: any) => {
        createdInput = input;
        const now = '2026-05-28T10:00:00.000Z';
        const person: Person = {
          id: 'person_created',
          name: input.name,
          email: input.email,
          phone: input.phone,
          role: input.role,
          notes: input.notes,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        };
        people = [person, ...people];
        return person;
      },
      setActivePerson: async (id: string) => {
        const person = people.find((entry) => entry.id === id);
        if (!person) throw new Error(`Missing person ${id}`);
        activeId = id;
        return person;
      },
      logout: async () => {
        activeId = null;
      },
      deletePerson: async (id: string) => {
        people = people.filter((person) => person.id !== id);
      },
    },
  };
}

describe('PeoplePanel', () => {
  test('renders empty state with Ink', async () => {
    const stub = createPeopleManagerStub();
    const harness = await renderInk(
      <PeoplePanel manager={stub.manager as any} onClose={() => {}} />,
      { width: 100, height: 24 }
    );

    try {
      const frame = await harness.waitForText('No people registered.');
      expect(frame).toContain('People');
      expect(frame).toContain("Press 'c' to create one.");
    } finally {
      await harness.cleanup();
    }
  });

  test('creates and logs in a person with Ink TextInput', async () => {
    const stub = createPeopleManagerStub();
    const harness = await renderInk(
      <PeoplePanel manager={stub.manager as any} onClose={() => {}} />,
      { width: 120, height: 24 }
    );

    try {
      await harness.waitForText('No people registered.');
      harness.typeText('c');
      await harness.waitForText('Create Person');

      harness.typeText('Jane Smith');
      await harness.waitForText('Jane Smith');
      harness.pressEnter();

      await harness.waitForText('Email:');
      harness.typeText('jane@example.com');
      await harness.waitForText('jane@example.com');
      harness.pressEnter();

      await harness.waitForText('Phone:');
      harness.typeText('+15551234567');
      await harness.waitForText('+15551234567');
      harness.pressEnter();

      await harness.waitForText('Role:');
      harness.typeText('Developer');
      await harness.waitForText('Developer');
      harness.pressEnter();

      await harness.waitForText('Notes:');
      harness.typeText('Prefers async updates');
      await harness.waitForText('Prefers async updates');
      harness.pressEnter();

      await harness.waitForText('Confirm Person Creation');
      harness.typeText('y');
      const frame = await harness.waitForText('Created and logged in as Jane Smith');

      expect(frame).toContain('Jane Smith');
      expect(stub.createdInput).toEqual({
        name: 'Jane Smith',
        email: 'jane@example.com',
        phone: '+15551234567',
        role: 'Developer',
        notes: 'Prefers async updates',
      });
    } finally {
      await harness.cleanup();
    }
  });
});
