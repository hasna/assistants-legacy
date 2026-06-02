import React from 'react';
import { describe, expect, test } from 'bun:test';
import type { Assistant, CreateAssistantOptions } from '@hasna/assistants-core';
import { renderInk } from './utils/ink-test-harness';

const { AssistantsPanel } = await import('../src/components/AssistantsPanel');

const baseAssistant = (overrides: Partial<Assistant> = {}): Assistant => ({
  id: 'assistant_1',
  name: 'Researcher',
  description: 'Finds sources and summarizes them',
  settings: {
    model: 'claude-sonnet-4-6',
    temperature: 0.7,
    backend: 'ai-sdk',
  },
  isSystem: false,
  createdAt: '2026-05-01T10:00:00.000Z',
  updatedAt: '2026-05-01T10:00:00.000Z',
  ...overrides,
});

describe('AssistantsPanel', () => {
  test('renders assistant list and selects with Ink input', async () => {
    const selected: string[] = [];
    const assistants = [
      baseAssistant({ id: 'assistant_1', name: 'Researcher' }),
      baseAssistant({ id: 'assistant_2', name: 'Writer', description: 'Drafts copy' }),
    ];

    const harness = await renderInk(
      <AssistantsPanel
        assistants={assistants}
        activeAssistantId="assistant_1"
        onSelect={(assistantId) => selected.push(assistantId)}
        onCreate={async () => {}}
        onUpdate={async () => {}}
        onDelete={async () => {}}
        onCancel={() => {}}
      />,
      { width: 100, height: 24 }
    );

    try {
      let frame = await harness.waitForText('Researcher', 1200);
      expect(frame).toContain('Writer');
      harness.pressDown();
      frame = await harness.waitForText('Drafts copy', 1200);
      expect(frame).toContain('Writer');
      harness.pressEnter();
      await harness.renderOnce();
      expect(selected).toEqual(['assistant_2']);
    } finally {
      await harness.cleanup();
    }
  });

  test('creates an assistant with submitted Ink TextInput values', async () => {
    const created: CreateAssistantOptions[] = [];

    const harness = await renderInk(
      <AssistantsPanel
        assistants={[]}
        onSelect={() => {}}
        onCreate={async (options) => {
          created.push(options);
        }}
        onUpdate={async () => {}}
        onDelete={async () => {}}
        onCancel={() => {}}
      />,
      { width: 100, height: 28 }
    );

    try {
      await harness.waitForText('No assistants yet. Press n to create one.', 1200);
      harness.pressKey('n');
      await harness.waitForText('Name:', 1200);
      harness.typeText('Planner');
      harness.pressEnter();
      await harness.waitForText('Description:', 1200);
      harness.typeText('Plans multi-step work');
      harness.pressEnter();
      await harness.waitForText('Model', 1200);
      harness.pressEnter();
      await harness.waitForText('Temperature:', 1200);
      harness.pressEnter();
      await harness.waitForText('Instructions:', 1200);
      harness.typeText('Break work into verified steps.');
      harness.pressEnter();
      await harness.waitForText('No assistants yet. Press n to create one.', 1200);

      expect(created).toHaveLength(1);
      expect(created[0].name).toBe('Planner');
      expect(created[0].description).toBe('Plans multi-step work');
      expect(created[0].settings?.systemPromptAddition).toBe('Break work into verified steps.');
    } finally {
      await harness.cleanup();
    }
  });

  test('confirms deletion with Ink input', async () => {
    const deleted: string[] = [];

    const harness = await renderInk(
      <AssistantsPanel
        assistants={[baseAssistant({ id: 'assistant_delete', name: 'Disposable' })]}
        activeAssistantId="assistant_delete"
        onSelect={() => {}}
        onCreate={async () => {}}
        onUpdate={async () => {}}
        onDelete={async (assistantId) => {
          deleted.push(assistantId);
        }}
        onCancel={() => {}}
      />,
      { width: 100, height: 24 }
    );

    try {
      await harness.waitForText('Disposable', 1200);
      harness.pressKey('d');
      await harness.waitForText('Delete Assistant', 1200);
      harness.pressKey('y');
      await harness.waitForText('+ New assistant (n)', 1200);
      expect(deleted).toEqual(['assistant_delete']);
    } finally {
      await harness.cleanup();
    }
  });
});
