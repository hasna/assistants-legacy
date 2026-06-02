import React from 'react';
import { describe, expect, test } from 'bun:test';
import {
  ALL_MODELS,
  LLM_PROVIDER_IDS,
  getProviderLabel,
  getProviderModelId,
} from '@hasna/assistants-shared';
import { ModelPicker } from '../src/components/ModelPicker';
import { ResumePanel } from '../src/components/ResumePanel';
import { SessionSelector } from '../src/components/SessionSelector';
import { renderInk } from './utils/ink-test-harness';

describe('SessionSelector', () => {
  test('renders sessions with active marker and abbreviated path', async () => {
    const originalHome = process.env.HOME;
    process.env.HOME = '/home/tester';

    const harness = await renderInk(
      <SessionSelector
        sessions={[
          { id: 's1', cwd: '/home/tester/project', updatedAt: Date.now(), isProcessing: false } as any,
          { id: 's2', cwd: '/tmp/other', updatedAt: Date.now(), isProcessing: true } as any,
        ]}
        activeSessionId="s2"
        onSelect={() => {}}
        onNew={() => {}}
        onCancel={() => {}}
      />, { width: 80, height: 24 }
    );

    try {
      const frame = await harness.waitForText('Switch Session');
      expect(frame).toContain('~/project');
      expect(frame).toContain('*');
      expect(frame).toContain('Esc');
    } finally {
      process.env.HOME = originalHome;
      await harness.cleanup();
    }
  });

  test('selects sessions and supports n for new session', async () => {
    const selected: string[] = [];
    let newSessions = 0;
    const harness = await renderInk(
      <SessionSelector
        sessions={[
          { id: 's1', cwd: '/tmp/one', updatedAt: Date.now(), isProcessing: false } as any,
          { id: 's2', cwd: '/tmp/two', updatedAt: Date.now(), isProcessing: false } as any,
        ]}
        activeSessionId="s1"
        onSelect={(id) => selected.push(id)}
        onNew={() => { newSessions += 1; }}
        onCancel={() => {}}
      />, { width: 80, height: 24 }
    );

    try {
      await harness.waitForText('/tmp/one');
      harness.pressDown();
      await harness.waitForText('/tmp/two');
      harness.pressEnter();
      await harness.renderOnce();
      expect(selected).toEqual(['s2']);

      harness.pressKey('n');
      await harness.renderOnce();
      expect(newSessions).toBe(1);
    } finally {
      await harness.cleanup();
    }
  });
});

describe('ModelPicker', () => {
  test('renders the current provider models and selects with Ink Select', async () => {
    const provider = LLM_PROVIDER_IDS[0];
    const model = ALL_MODELS.find((candidate) => candidate.provider === provider);
    expect(model).toBeDefined();

    const selected: string[] = [];
    let closed = 0;
    const modelId = getProviderModelId(model!);
    const harness = await renderInk(
      <ModelPicker
        visible
        currentModelId={modelId}
        onSelectModel={(id) => selected.push(id)}
        onClose={() => { closed += 1; }}
      />, { width: 100, height: 30 }
    );

    try {
      const frame = await harness.waitForText(`Select ${getProviderLabel(provider)} Model`);
      expect(frame).toContain(model!.name);
      expect(frame).toContain('Enter select');

      harness.pressEnter();
      await harness.renderOnce();
      expect(selected).toEqual([modelId]);
      expect(closed).toBe(1);
    } finally {
      await harness.cleanup();
    }
  });
});

describe('ResumePanel', () => {
  test('renders saved sessions and resumes the focused session', async () => {
    const resumed: string[] = [];
    const harness = await renderInk(
      <ResumePanel
        sessions={[
          { id: 'r1', cwd: '/tmp/project', updatedAt: new Date().toISOString(), messageCount: 3, assistantId: 'default' } as any,
          { id: 'r2', cwd: '/tmp/project', updatedAt: new Date().toISOString(), messageCount: 4, assistantId: 'work' } as any,
        ]}
        activeCwd="/tmp/project"
        initialFilter="cwd"
        onResume={(session) => resumed.push(session.id)}
        onRefresh={async () => {}}
        onClose={() => {}}
      />, { width: 100, height: 30 }
    );

    try {
      const frame = await harness.waitForText('Resume Sessions');
      expect(frame).toContain('r1');
      expect(frame).toContain('/tmp/project');

      harness.pressDown();
      await harness.waitForText('r2');
      harness.pressEnter();
      await harness.renderOnce();
      expect(resumed).toEqual(['r2']);
    } finally {
      await harness.cleanup();
    }
  });
});
