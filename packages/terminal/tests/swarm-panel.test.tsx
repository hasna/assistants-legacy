import React from 'react';
import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_SWARM_CONFIG,
  type SerializableSwarmState,
} from '@hasna/assistants-core';
import { SwarmPanel } from '../src/components/SwarmPanel';
import { renderInk } from './utils/ink-test-harness';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSwarmState(overrides: Partial<SerializableSwarmState> = {}): SerializableSwarmState {
  return {
    id: 'swarm_1',
    status: 'executing',
    sessionId: 'session_1',
    plan: {
      id: 'plan_1',
      goal: 'Migrate terminal UI to Ink',
      createdAt: 1_779_960_000_000,
      approved: true,
      version: 1,
      tasks: [
        {
          id: 'task_1',
          description: 'Gather requirements for the Ink migration',
          status: 'completed',
          role: 'planner',
          priority: 1,
          dependsOn: [],
          assignedAssistantId: 'assistant_planner',
          createdAt: 1_779_960_000_000,
        },
        {
          id: 'task_2',
          description: 'Convert the active swarm panel to upstream Ink primitives',
          status: 'running',
          role: 'worker',
          priority: 2,
          dependsOn: ['task_1'],
          assignedAssistantId: 'assistant_worker',
          createdAt: 1_779_960_001_000,
          startedAt: 1_779_960_002_000,
        },
      ],
    },
    taskResults: {},
    activeAssistants: ['assistant_worker'],
    errors: ['Worker retry exceeded transient budget'],
    startedAt: 1_779_960_000_000,
    metrics: {
      totalTasks: 2,
      completedTasks: 1,
      failedTasks: 0,
      runningTasks: 1,
      tokensUsed: 12_345,
      llmCalls: 7,
      toolCalls: 11,
      replans: 1,
    },
    ...overrides,
  };
}

describe('SwarmPanel', () => {
  test('renders empty state and closes with q using Ink input', async () => {
    let cancelled = false;
    const harness = await renderInk(
      <SwarmPanel
        state={null}
        config={null}
        onStop={() => {}}
        onCancel={() => {
          cancelled = true;
        }}
      />,
      { width: 100 }
    );

    try {
      const frame = await harness.waitForText('No swarm currently running');

      expect(frame).toContain('Swarm');
      expect(frame).toContain('Use /swarm <goal> to start.');
      expect(frame).toContain('[q]uit');

      harness.pressKey('q');
      await harness.renderOnce();

      expect(cancelled).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });

  test('renders running swarm state and stops with s using Ink input', async () => {
    let stopped = false;
    let cancelled = false;
    const harness = await renderInk(
      <SwarmPanel
        state={createSwarmState()}
        config={{ ...DEFAULT_SWARM_CONFIG, tokenBudget: 50_000 }}
        memoryStats={{ totalEntries: 2, byCategory: { architecture: 1, bug: 1 } }}
        onStop={() => {
          stopped = true;
        }}
        onCancel={() => {
          cancelled = true;
        }}
      />,
      { width: 120 }
    );

    try {
      const frame = await harness.waitForText('EXECUTING');

      expect(frame).toContain('Goal:');
      expect(frame).toContain('Migrate terminal UI to Ink');
      expect(frame).toContain('Tasks (1/2):');
      expect(frame).toContain('Gather requirements for the Ink migration');
      expect(frame).toContain('Convert the active swarm panel to upstream Ink primitives');
      expect(frame).toContain('LLM Calls:');
      expect(frame).toContain('7');
      expect(frame).toContain('Tokens Used:');
      expect(frame).toContain('12,345');
      expect(frame).toContain('/ 50,000');
      expect(frame).toContain('Active workers:');
      expect(frame).toContain('Shared Memory: 2 entries');
      expect(frame).toContain('Errors:');
      expect(frame).toContain('[s]top [q]uit');

      harness.pressKey('s');
      await harness.renderOnce();
      expect(stopped).toBe(true);

      harness.pressEscape();
      await delay(30);
      await harness.renderOnce();
      expect(cancelled).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });
});
