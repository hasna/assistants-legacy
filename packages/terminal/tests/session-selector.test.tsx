import React from 'react';
import { describe, expect, test } from 'bun:test';
import { testRender } from '@opentui/react/test-utils';
import { SessionSelector } from '../src/components/SessionSelector';

describe('SessionSelector', () => {
  test('renders sessions with active marker and abbreviated path', async () => {
    const originalHome = process.env.HOME;
    process.env.HOME = '/home/tester';

    const { captureCharFrame, renderOnce } = await testRender(
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

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain('Switch Session');
    expect(frame).toContain('~/project');
    expect(frame).toContain('*');
    expect(frame).toContain('Esc');

    process.env.HOME = originalHome;
  });
});
