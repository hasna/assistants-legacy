import React from 'react';
import { describe, expect, test } from 'bun:test';
import type { BudgetConfig } from '@hasna/assistants-shared';
import type { BudgetStatus } from '@hasna/assistants-core';
import { renderInk } from './utils/ink-test-harness';

const { BudgetsPanel } = await import('../src/components/BudgetsPanel');

const emptyStatus = (scope: 'session' | 'swarm'): BudgetStatus => ({
  scope,
  limits: {},
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    llmCalls: 0,
    toolCalls: 0,
    durationMs: 0,
  },
  checks: {},
  overallExceeded: false,
  warningsCount: 0,
});

describe('BudgetsPanel', () => {
  test('creates a profile through Ink TextInput and nested BudgetPanel action', async () => {
    const created: Array<{ name: string; config: BudgetConfig; description?: string }> = [];

    const harness = await renderInk(
      <BudgetsPanel
        profiles={[]}
        activeProfileId={null}
        sessionStatus={emptyStatus('session')}
        swarmStatus={emptyStatus('swarm')}
        onSelectProfile={() => {}}
        onCreateProfile={async (name, config, description) => {
          created.push({ name, config, description });
        }}
        onDeleteProfile={async () => {}}
        onUpdateProfile={async () => {}}
        onReset={() => {}}
        onCancel={() => {}}
      />,
      { width: 100, height: 28 }
    );

    try {
      await harness.waitForText('No budget profiles. Press n to create one.', 1200);
      harness.pressKey('n');
      await harness.waitForText('Name:', 1200);
      harness.typeText('Deep Work');
      harness.pressEnter();
      await harness.waitForText('Description:', 1200);
      harness.typeText('Long tasks');
      harness.pressEnter();
      await harness.waitForText('Session Usage', 1200);
      harness.pressKey('a');
      await harness.waitForText('No budget profiles. Press n to create one.', 1200);

      expect(created).toHaveLength(1);
      expect(created[0].name).toBe('Deep Work');
      expect(created[0].description).toBe('Long tasks');
      expect(created[0].config).toEqual({});
    } finally {
      await harness.cleanup();
    }
  });
});
