import React from 'react';
import { describe, expect, test } from 'bun:test';
import type { BudgetLimits } from '@hasna/assistants-shared';
import type { BudgetScope, BudgetStatus } from '@hasna/assistants-core';
import { renderInk } from './utils/ink-test-harness';

const { BudgetPanel } = await import('../src/components/BudgetPanel');

const status = (overrides: Partial<BudgetStatus> = {}): BudgetStatus => ({
  scope: 'session',
  limits: {
    maxTotalTokens: 1000,
    maxLlmCalls: 10,
    maxToolCalls: 5,
    maxDurationMs: 60_000,
  },
  usage: {
    inputTokens: 4,
    outputTokens: 6,
    totalTokens: 10,
    llmCalls: 1,
    toolCalls: 2,
    durationMs: 5_000,
  },
  checks: {},
  overallExceeded: false,
  warningsCount: 0,
  ...overrides,
});

describe('BudgetPanel', () => {
  test('edits and saves a numeric session limit with Ink input', async () => {
    const saved: Array<{ scope: BudgetScope; limits: Partial<BudgetLimits> }> = [];

    const harness = await renderInk(
      <BudgetPanel
        config={{
          enabled: true,
          onExceeded: 'warn',
          session: {
            maxTotalTokens: 1000,
            maxLlmCalls: 10,
            maxToolCalls: 5,
            maxDurationMs: 60_000,
          },
        }}
        sessionStatus={status()}
        swarmStatus={status({ scope: 'swarm', limits: {}, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, llmCalls: 0, toolCalls: 0, durationMs: 0 } })}
        onToggleEnabled={() => {}}
        onReset={() => {}}
        onSetLimits={(scope, limits) => {
          saved.push({ scope, limits });
        }}
        onSetOnExceeded={() => {}}
        onCancel={() => {}}
      />,
      { width: 100, height: 28 }
    );

    try {
      await harness.waitForText('Session Usage', 1200);
      harness.pressKey('i');
      await harness.waitForText('Edit Budget Limits', 1200);
      harness.pressKey('c');
      await harness.renderOnce();
      harness.pressEnter();
      await harness.waitForText('| tokens', 1200);
      harness.pasteText('5000');
      harness.pressEnter();
      await harness.waitForText('5000 tokens', 1200);
      harness.pressKey('s');
      await harness.waitForText('Session Usage', 1200);

      expect(saved).toHaveLength(1);
      expect(saved[0].scope).toBe('session');
      expect(saved[0].limits.maxTotalTokens).toBe(5000);
    } finally {
      await harness.cleanup();
    }
  });

  test('applies a selected preset with Ink navigation', async () => {
    const toggles: boolean[] = [];
    const saved: Array<{ scope: BudgetScope; limits: Partial<BudgetLimits> }> = [];

    const harness = await renderInk(
      <BudgetPanel
        config={{ enabled: false, onExceeded: 'warn', session: {} }}
        sessionStatus={status({ limits: {}, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, llmCalls: 0, toolCalls: 0, durationMs: 0 } })}
        swarmStatus={status({ scope: 'swarm', limits: {}, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, llmCalls: 0, toolCalls: 0, durationMs: 0 } })}
        onToggleEnabled={(enabled) => {
          toggles.push(enabled);
        }}
        onReset={() => {}}
        onSetLimits={(scope, limits) => {
          saved.push({ scope, limits });
        }}
        onSetOnExceeded={() => {}}
        onCancel={() => {}}
      />,
      { width: 100, height: 28 }
    );

    try {
      await harness.waitForText('Disabled', 1200);
      harness.pressKey('p');
      await harness.waitForText('Select Budget Preset', 1200);
      harness.pressDown();
      await harness.waitForText('Moderate', 1200);
      harness.pressEnter();
      await harness.waitForText('Session Usage', 1200);

      expect(saved).toHaveLength(1);
      expect(saved[0].scope).toBe('session');
      expect(saved[0].limits.maxTotalTokens).toBe(200000);
      expect(toggles).toEqual([true]);
    } finally {
      await harness.cleanup();
    }
  });
});
