import React from 'react';
import { describe, expect, test } from 'bun:test';
import { CommandPalette } from '../src/components/CommandPalette';
import { Sidebar } from '../src/components/Sidebar';
import { renderInk } from './utils/ink-test-harness';

describe('Ink shared components', () => {
  test('Sidebar renders session, context, diagnostics, and app metadata', async () => {
    const harness = await renderInk(
      <Sidebar
        title="Planning session"
        cwd="/tmp/open-assistants"
        diagnosticsCount={2}
        tokenUsage={{
          totalTokens: 12_345,
          maxContextTokens: 100_000,
          inputTokens: 8_000,
          outputTokens: 4_345,
        }}
        gitBranch="ink"
        appVersion="2.3.4"
      />,
      { width: 100, height: 24 },
    );

    try {
      const frame = await harness.waitForText('Planning session');
      expect(frame).toContain('Context');
      expect(frame).toContain('12.3K tokens');
      expect(frame).toContain('12% used');
      expect(frame).toContain('2 diagnostics');
      expect(frame).toContain('/tmp/open-assistants:ink');
      expect(frame).toContain('2.3.4');
    } finally {
      await harness.cleanup();
    }
  });

  test('CommandPalette filters commands with typed input', async () => {
    const harness = await renderInk(
      <CommandPalette
        visible
        commands={[
          { id: 'model', label: 'Switch Model', handler: () => {} },
          { id: 'tasks', label: 'Tasks', description: 'Open task panel', handler: () => {} },
        ]}
        onClose={() => {}}
      />,
      { width: 100, height: 24 },
    );

    try {
      await harness.waitForText('Switch Model');
      harness.typeText('task');
      const frame = await harness.waitForText('Tasks');
      expect(frame).toContain('Tasks');
      expect(frame).not.toContain('Switch Model');
    } finally {
      await harness.cleanup();
    }
  });

  test('CommandPalette navigates and executes the selected command', async () => {
    const selected: string[] = [];
    let closed = false;
    const harness = await renderInk(
      <CommandPalette
        visible
        commands={[
          { id: 'model', label: 'Switch Model', handler: () => selected.push('model') },
          { id: 'tasks', label: 'Tasks', handler: () => selected.push('tasks') },
        ]}
        onClose={() => {
          closed = true;
        }}
      />,
      { width: 100, height: 24 },
    );

    try {
      await harness.waitForText('Switch Model');
      harness.pressDown();
      await harness.waitForText('> Tasks');
      harness.pressEnter();
      await harness.renderOnce();
      expect(selected).toEqual(['tasks']);
      expect(closed).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });
});
