import React from 'react';
import { describe, expect, test } from 'bun:test';
import type { RegisteredAssistant, RegistryStats } from '@hasna/assistants-core';
import { renderInk } from './utils/ink-test-harness';

const { AssistantsRegistryPanel } = await import('../src/components/AssistantsRegistryPanel');

const stats: RegistryStats = {
  totalAssistants: 2,
  byType: {
    assistant: 1,
    subassistant: 0,
    coordinator: 1,
    worker: 0,
  },
  byState: {
    idle: 1,
    processing: 1,
    waiting_input: 0,
    error: 0,
    stopped: 0,
    offline: 0,
  },
  staleCount: 0,
  averageLoad: 0.4,
  uptime: 7200,
};

const assistant = (overrides: Partial<RegisteredAssistant> = {}): RegisteredAssistant => ({
  id: 'assistant_alpha_123456',
  name: 'Alpha',
  description: 'Primary coordinator',
  type: 'coordinator',
  childIds: [],
  capabilities: {
    tools: ['read', 'bash'],
    skills: ['planning'],
    models: ['claude-sonnet-4-6'],
    tags: ['coordination'],
    maxDepth: 3,
  },
  status: {
    state: 'processing',
    currentTask: 'Planning migration',
    uptime: 3600,
    messagesProcessed: 12,
    toolCallsExecuted: 5,
    errorsCount: 0,
  },
  load: {
    activeTasks: 1,
    queuedTasks: 2,
    tokensUsed: 1234,
    llmCalls: 4,
    currentDepth: 1,
  },
  heartbeat: {
    lastHeartbeat: new Date().toISOString(),
    intervalMs: 15000,
    isStale: false,
    missedCount: 0,
  },
  registeredAt: '2026-05-28T10:00:00.000Z',
  updatedAt: '2026-05-28T10:10:00.000Z',
  ...overrides,
});

describe('AssistantsRegistryPanel', () => {
  test('renders overview and refreshes with Ink input', async () => {
    let refreshes = 0;
    const harness = await renderInk(
      <AssistantsRegistryPanel
        assistants={[assistant()]}
        stats={stats}
        onRefresh={() => {
          refreshes += 1;
        }}
        onCancel={() => {}}
      />,
      { width: 100, height: 30 }
    );

    try {
      const frame = await harness.waitForText('Assistant Registry', 1200);
      expect(frame).toContain('Total Assistants');
      expect(frame).toContain('Recent Assistants');
      harness.pressKey('r');
      await harness.renderOnce();
      expect(refreshes).toBe(1);
    } finally {
      await harness.cleanup();
    }
  });

  test('opens list and details with Ink navigation', async () => {
    const assistants = [
      assistant({ id: 'assistant_older_123456', name: 'Older', registeredAt: '2026-05-28T09:00:00.000Z', status: { ...assistant().status, state: 'idle' } }),
      assistant({ id: 'assistant_newer_123456', name: 'Newer', registeredAt: '2026-05-28T11:00:00.000Z' }),
    ];

    const harness = await renderInk(
      <AssistantsRegistryPanel
        assistants={assistants}
        stats={stats}
        onRefresh={() => {}}
        onCancel={() => {}}
      />,
      { width: 100, height: 34 }
    );

    try {
      await harness.waitForText('Assistant Registry', 1200);
      harness.pressKey('a');
      let frame = await harness.waitForText('Registered Assistants', 1200);
      expect(frame).toContain('Newer');
      harness.pressDown();
      await harness.waitForText('Older', 1200);
      harness.pressKey('d');
      frame = await harness.waitForText('Assistant Details', 1200);
      expect(frame).toContain('Older');
      expect(frame).toContain('Capabilities');
      expect(frame).toContain('Load');
    } finally {
      await harness.cleanup();
    }
  });
});
