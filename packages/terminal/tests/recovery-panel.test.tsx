import React from 'react';
import { describe, expect, test } from 'bun:test';
import type { RecoverableSession } from '@hasna/assistants-core';
import { RecoveryPanel } from '../src/components/RecoveryPanel';
import { renderInk } from './utils/ink-test-harness';

function createSession(overrides: Partial<RecoverableSession> = {}): RecoverableSession {
  const timestamp = new Date(Date.now() - 120_000).toISOString();
  return {
    sessionId: 'session_1',
    heartbeat: {
      sessionId: 'session_1',
      timestamp,
      state: 'waiting_input',
      lastActivity: timestamp,
      stats: {
        messagesProcessed: 3,
        toolCallsExecuted: 2,
        errorsEncountered: 0,
        uptimeSeconds: 120,
      },
    },
    state: {
      sessionId: 'session_1',
      heartbeat: {
        sessionId: 'session_1',
        timestamp,
        state: 'waiting_input',
        lastActivity: timestamp,
        stats: {
          messagesProcessed: 3,
          toolCallsExecuted: 2,
          errorsEncountered: 0,
          uptimeSeconds: 120,
        },
      },
      context: {
        cwd: '/home/hasna/workspace/hasna/opensource/open-assistants',
        lastMessage: 'Continue the Ink migration',
      },
      timestamp,
    },
    sessionPath: '/tmp/session_1.json',
    cwd: '/home/hasna/workspace/hasna/opensource/open-assistants',
    lastActivity: new Date(Date.now() - 120_000),
    messageCount: 3,
    lastMessage: 'Continue the Ink migration',
    model: 'claude-sonnet-4-6',
    label: 'Ink migration',
    ...overrides,
  };
}

describe('RecoveryPanel', () => {
  test('starts fresh when the default option is selected', async () => {
    let startedFresh = false;
    const harness = await renderInk(
      <RecoveryPanel
        sessions={[createSession()]}
        onRecover={() => {}}
        onStartFresh={() => {
          startedFresh = true;
        }}
      />,
      { width: 100, height: 24 }
    );

    try {
      await harness.waitForText('Session Recovery');
      harness.pressEnter();
      await harness.renderOnce();

      expect(startedFresh).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });

  test('selects and recovers a session with Ink keyboard input', async () => {
    let recovered: RecoverableSession | null = null;
    const session = createSession();
    const harness = await renderInk(
      <RecoveryPanel
        sessions={[session]}
        onRecover={(nextSession) => {
          recovered = nextSession;
        }}
        onStartFresh={() => {}}
      />,
      { width: 110, height: 24 }
    );

    try {
      await harness.waitForText('Start fresh');
      harness.pressDown();
      const frame = await harness.waitForText('Selected:');

      expect(frame).toContain('Ink migration');
      expect(frame).toContain('waiting for input');
      expect(frame).toContain('3 messages');
      expect(frame).toContain('Continue the Ink migration');

      harness.pressEnter();
      await harness.renderOnce();

      expect(recovered?.sessionId).toBe('session_1');
    } finally {
      await harness.cleanup();
    }
  });
});
