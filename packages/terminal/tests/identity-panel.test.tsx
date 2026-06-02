import React from 'react';
import { describe, expect, test } from 'bun:test';
import type { CreateIdentityOptions, Identity } from '@hasna/assistants-core';
import { renderInk } from './utils/ink-test-harness';

const { IdentityPanel } = await import('../src/components/IdentityPanel');

function createIdentity(overrides: Partial<Identity> = {}): Identity {
  return {
    id: 'id-1',
    name: 'primary',
    isDefault: true,
    profile: {
      displayName: 'Ada Lovelace',
      title: 'Engineer',
      company: 'Analytical Engines',
      timezone: 'UTC',
      locale: 'en-US',
    },
    contacts: {
      emails: [{ value: 'ada@example.com', isPrimary: true }],
      phones: [],
      addresses: [],
      virtualAddresses: [],
    },
    preferences: {
      language: 'en',
      dateFormat: 'YYYY-MM-DD',
      communicationStyle: 'professional',
      responseLength: 'balanced',
      custom: {},
    },
    context: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Identity;
}

function noopProps(overrides: Partial<React.ComponentProps<typeof IdentityPanel>> = {}) {
  return {
    identities: [],
    templates: [],
    onSwitch: async () => {},
    onCreate: async () => {},
    onCreateFromTemplate: async () => {},
    onUpdate: async () => {},
    onSetDefault: async () => {},
    onDelete: async () => {},
    onClose: () => {},
    ...overrides,
  };
}

describe('IdentityPanel', () => {
  test('opens creation from the empty state and submits Ink TextInput values', async () => {
    let created: CreateIdentityOptions | null = null;
    const harness = await renderInk(
      <IdentityPanel
        {...noopProps({
          onCreate: async (options) => {
            created = options;
          },
        })}
      />, { width: 100, height: 32 }
    );

    try {
      await harness.waitForText('No identities found.');
      harness.pressKey('n');
      await harness.waitForText('Create Identity');
      harness.pressEnter();

      await harness.waitForText('Name:');
      harness.typeText('repo-helper');
      await harness.waitForText('repo-helper');
      harness.pressEnter();

      await harness.waitForText('Display Name:');
      harness.typeText('Repo Helper');
      await harness.waitForText('Repo Helper');
      harness.pressEnter();

      for (const label of [
        'Role:',
        'Company:',
        'Email:',
        'Phone:',
        'Address (Street):',
        'Address (City):',
        'Address (State):',
        'Address (Postal):',
        'Address (Country):',
        'Virtual Address:',
      ]) {
        await harness.waitForText(label);
        harness.pressEnter();
      }

      await harness.waitForText('Communication Style:');
      harness.pressEnter();
      await harness.waitForText('Response Length:');
      harness.pressEnter();

      await harness.waitForText('Context:');
      harness.typeText('Use concise repository context.');
      await harness.waitForText('Use concise repository context.');
      harness.pressEnter();

      await harness.renderOnce();
      expect(created).toMatchObject({
        name: 'repo-helper',
        profile: {
          displayName: 'Repo Helper',
        },
        contacts: {
          emails: [],
          phones: [],
          addresses: [],
          virtualAddresses: [],
        },
        preferences: {
          communicationStyle: 'professional',
          responseLength: 'balanced',
        },
        context: 'Use concise repository context.',
      });
    } finally {
      await harness.cleanup();
    }
  });

  test('opens detail view and returns with raw escape', async () => {
    const harness = await renderInk(
      <IdentityPanel
        {...noopProps({
          identities: [createIdentity()],
          activeIdentityId: 'id-1',
        })}
      />, { width: 100, height: 32 }
    );

    try {
      await harness.waitForText('Ada Lovelace');
      harness.pressEnter();
      await harness.waitForText('Timezone: UTC');
      harness.pressEscape();
      const frame = await harness.waitForText('Legend:');
      expect(frame).toContain('primary');
    } finally {
      await harness.cleanup();
    }
  });
});
