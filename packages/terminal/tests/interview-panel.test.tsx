import React from 'react';
import { describe, expect, test } from 'bun:test';
import type { InterviewRequest, InterviewResponse } from '@hasna/assistants-shared';
import { renderInk } from './utils/ink-test-harness';

const { InterviewPanel } = await import('../src/components/InterviewPanel');

function createRequest(overrides: Partial<InterviewRequest> = {}): InterviewRequest {
  return {
    title: 'Setup interview',
    description: 'Choose how to continue.',
    questions: [
      {
        id: 'mode',
        header: 'Mode',
        question: 'How should the assistant work?',
        options: [
          { label: 'Fast', description: 'Prioritize speed.' },
          { label: 'Careful', description: 'Prioritize verification.' },
        ],
      },
    ],
    ...overrides,
  };
}

describe('InterviewPanel', () => {
  test('submits a selected option through upstream Ink input', async () => {
    let completed: InterviewResponse | null = null;
    const harness = await renderInk(
      <InterviewPanel
        request={createRequest()}
        isActive
        onComplete={(response) => {
          completed = response;
        }}
        onCancel={() => {}}
      />, { width: 100, height: 30 }
    );

    try {
      await harness.waitForText('How should the assistant work?');
      harness.pressEnter();
      await harness.waitForText('Ready to submit your answers?');
      harness.pressEnter();
      await harness.renderOnce();

      expect(completed).toEqual({
        answers: {
          mode: 'Fast',
        },
      });
    } finally {
      await harness.cleanup();
    }
  });

  test('captures Other text and returns to review', async () => {
    let completed: InterviewResponse | null = null;
    const harness = await renderInk(
      <InterviewPanel
        request={createRequest()}
        isActive
        onComplete={(response) => {
          completed = response;
        }}
        onCancel={() => {}}
      />, { width: 100, height: 30 }
    );

    try {
      await harness.waitForText('Type something.');
      harness.pressDown();
      await harness.waitForText('❯ 2. Careful');
      harness.pressDown();
      await harness.waitForText('❯ 3. Type something.');
      harness.pressEnter();
      await harness.renderOnce();

      harness.typeText('Custom workflow');
      await harness.waitForText('Custom workflow');
      harness.pressEnter();

      await harness.waitForText('Ready to submit your answers?');
      expect(harness.captureFrame()).toContain('Custom workflow');
      harness.pressEnter();
      await harness.renderOnce();

      expect(completed).toEqual({
        answers: {
          mode: 'Custom workflow',
        },
      });
    } finally {
      await harness.cleanup();
    }
  });

  test('raw escape cancels the active interview', async () => {
    let cancelled = false;
    const harness = await renderInk(
      <InterviewPanel
        request={createRequest()}
        isActive
        onComplete={() => {}}
        onCancel={() => {
          cancelled = true;
        }}
      />, { width: 100, height: 30 }
    );

    try {
      await harness.waitForText('How should the assistant work?');
      harness.pressEscape();
      const started = Date.now();
      while (!cancelled && Date.now() - started < 600) {
        await harness.renderOnce();
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(cancelled).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });
});
