import React from 'react';
import { describe, expect, test } from 'bun:test';
import type { Message } from '@hasna/assistants-shared';
import { Box, Text } from '../src/ui/ink';
import { Input, type InputHandle } from '../src/components/Input';
import {
  handlePanelSlashCommand,
  type SlashCommandContext,
} from '../src/components/appSlashCommands';
import { renderInk } from './utils/ink-test-harness';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForRef(ref: React.RefObject<InputHandle | null>): Promise<InputHandle> {
  const start = Date.now();
  while (!ref.current) {
    if (Date.now() - start > 250) {
      throw new Error('Input ref was not attached in time');
    }
    await wait(5);
  }
  return ref.current;
}

async function waitForValue(ref: React.RefObject<InputHandle | null>, expected: string): Promise<void> {
  const start = Date.now();
  while (ref.current?.getValue() !== expected) {
    if (Date.now() - start > 500) {
      throw new Error(`Expected input value ${JSON.stringify(expected)}, got ${JSON.stringify(ref.current?.getValue())}`);
    }
    await wait(5);
  }
}

async function waitForFrame(
  renderOnce: () => Promise<void>,
  captureFrame: () => string,
  predicate: (frame: string) => boolean,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start <= 500) {
    await renderOnce();
    const frame = captureFrame();
    if (predicate(frame)) return frame;
    await wait(5);
  }
  const frame = captureFrame();
  throw new Error(`Timed out waiting for expected frame.\n${frame}`);
}

type SlashHarness = {
  ctx: SlashCommandContext;
  calls: Record<string, unknown[]>;
  getError: () => string | null;
  getMessages: () => Message[];
};

function createSlashHarness(active = true): SlashHarness {
  const calls: Record<string, unknown[]> = {};
  const record = (name: string) => (value: unknown) => {
    calls[name] = [...(calls[name] || []), value];
  };
  let error: string | null = null;
  let messages: Message[] = [];
  const activeSession = active
    ? ({
        id: 'session-1',
        cwd: '/tmp/open-assistants-test',
        client: {
          getActiveProjectId: () => undefined,
          getSkills: async () => [],
        },
      } as any)
    : null;

  const ctx: SlashCommandContext = {
    cwd: '/tmp/open-assistants-test',
    activeSession,
    registry: { getActiveSession: () => activeSession },
    setShowDocsPanel: record('showDocsPanel'),
    setConnectorsPanelInitial: record('connectorsPanelInitial'),
    setShowConnectorsPanel: record('showConnectorsPanel'),
    setHooksConfig: record('hooksConfig'),
    setShowHooksPanel: record('showHooksPanel'),
    setShowConfigPanel: record('showConfigPanel'),
    setShowModelPanel: record('showModelPanel'),
    setIdentityPanelIntent: record('identityPanelIntent'),
    setShowIdentityPanel: record('showIdentityPanel'),
    setShowOnboardingPanel: record('showOnboardingPanel'),
    setMemoryError: record('memoryError'),
    setShowMemoryPanel: record('showMemoryPanel'),
    setGuardrailsConfig: record('guardrailsConfig'),
    setGuardrailsPolicies: record('guardrailsPolicies'),
    setShowGuardrailsPanel: record('showGuardrailsPanel'),
    setShowSwarmPanel: record('showSwarmPanel'),
    setTasksList: record('tasksList'),
    setTasksPaused: record('tasksPaused'),
    setShowTasksPanel: record('showTasksPanel'),
    setSchedulesList: record('schedulesList'),
    setShowSchedulesPanel: record('showSchedulesPanel'),
    setShowJobsPanel: record('showJobsPanel'),
    setSkillsList: record('skillsList'),
    setShowSkillsPanel: record('showSkillsPanel'),
    setShowAssistantsPanel: record('showAssistantsPanel'),
    setProjectsList: record('projectsList'),
    setActiveProjectId: record('activeProjectId'),
    setShowProjectsPanel: record('showProjectsPanel'),
    setPlansProject: record('plansProject'),
    setShowPlansPanel: record('showPlansPanel'),
    setMessagesList: record('messagesList'),
    setMessagesPanelError: record('messagesPanelError'),
    setInboxEnabled: record('inboxEnabled'),
    setInboxEmails: record('inboxEmails'),
    setInboxError: record('inboxError'),
    setShowMessagesPanel: record('showMessagesPanel'),
    setShowWalletPanel: record('showWalletPanel'),
    setShowSecretsPanel: record('showSecretsPanel'),
    setError: (value) => { error = value; },
    setMessages: (updater) => {
      messages = typeof updater === 'function' ? updater(messages) : updater;
    },
    hookStoreRef: { current: null },
    guardrailsStoreRef: { current: null },
    openBudgetsPanel: async () => { record('openBudgetsPanel')(true); },
    openWalletPanel: async (mode) => { record('openWalletPanel')(mode); },
    openSecretsPanel: async (mode) => { record('openSecretsPanel')(mode); },
    loadConfigFiles: async () => { record('loadConfigFiles')(true); },
  };

  return {
    ctx,
    calls,
    getError: () => error,
    getMessages: () => messages,
  };
}

describe('slash command prompt discovery', () => {
  test('filters registered slash commands in the prompt menu', async () => {
    const harness = await renderInk(
      <Box flexDirection="column" height={12} width={80}>
        <Box height={2} width={80}>
          <Text>message history</Text>
        </Box>
        <Box flexDirection="column" height={9} width={80} flexShrink={0}>
          <Input
            commands={[
              { name: '/webhooks', description: 'manage webhook endpoints' },
              { name: '/wallet', description: 'manage wallet cards' },
            ]}
            onSubmit={() => {}}
          />
        </Box>
        <Box height={1} width={80}>
          <Text>status footer</Text>
        </Box>
      </Box>,
      { width: 80, height: 12 },
    );

    try {
      harness.typeText('/web');

      const frame = await waitForFrame(
        () => harness.renderOnce(),
        () => harness.captureFrame(),
        (candidate) => candidate.includes('/webhooks') && candidate.includes('manage webhook endpoints'),
      );
      expect(frame).toContain('/webhooks');
      expect(frame).not.toContain('/wallet');
    } finally {
      await harness.cleanup();
    }
  });

  test('tab-completes a registered command and exact submit sends that command', async () => {
    const ref = React.createRef<InputHandle>();
    const submitted: Array<{ value: string; mode: string }> = [];
    const harness = await renderInk(
      <Input
        ref={ref}
        commands={[
          { name: '/webhooks', description: 'manage webhook endpoints' },
          { name: '/workspace', description: 'manage workspace scope' },
        ]}
        onSubmit={(value, mode) => submitted.push({ value, mode })}
      />,
      { width: 80, height: 24 },
    );

    try {
      const input = await waitForRef(ref);

      harness.typeText('/web');
      await waitForValue(ref, '/web');
      await wait(50);
      await harness.renderOnce();
      harness.pressTab();
      await waitForValue(ref, '/webhooks ');

      input.clearValue();
      await waitForValue(ref, '');
      await harness.renderOnce();
      harness.typeText('/webhooks');
      await waitForValue(ref, '/webhooks');
      harness.pressEnter();
      await waitForValue(ref, '');

      expect(submitted).toEqual([{ value: '/webhooks', mode: 'normal' }]);
    } finally {
      await harness.cleanup();
    }
  });
});

describe('terminal slash command execution routing', () => {
  test('opens docs without requiring an active session', async () => {
    const harness = createSlashHarness(false);

    await expect(handlePanelSlashCommand('/docs', harness.ctx)).resolves.toBe(true);
    expect(harness.calls.showDocsPanel).toEqual([true]);
  });

  test('opens panel commands locally instead of falling through to the LLM', async () => {
    const harness = createSlashHarness(true);

    await expect(handlePanelSlashCommand('/connectors', harness.ctx)).resolves.toBe(true);
    expect(harness.calls.connectorsPanelInitial).toEqual([undefined]);
    expect(harness.calls.showConnectorsPanel).toEqual([true]);

    await expect(handlePanelSlashCommand('/model', harness.ctx)).resolves.toBe(true);
    expect(harness.calls.showModelPanel).toEqual([true]);
  });

  test('handles unsupported model arguments with a local error', async () => {
    const harness = createSlashHarness(true);

    await expect(handlePanelSlashCommand('/model anthropic:claude-sonnet-4-6', harness.ctx)).resolves.toBe(true);
    expect(harness.getError()).toBe('Models are tied to agents. Use /agents to switch agent (and model).');
    expect(harness.getMessages()).toEqual([]);
  });

  test('returns false for unknown slash commands so the caller can decide', async () => {
    const harness = createSlashHarness(true);

    await expect(handlePanelSlashCommand('/not-a-real-command', harness.ctx)).resolves.toBe(false);
    expect(harness.calls.showDocsPanel).toBeUndefined();
    expect(harness.getError()).toBeNull();
  });
});
