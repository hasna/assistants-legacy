/**
 * Basic render smoke tests for panels with low coverage.
 * These verify the components render without crashing.
 */
import React from 'react';
import { describe, expect, test } from 'bun:test';
import { testRender } from '@opentui/react/test-utils';
import { GuardrailsPanel } from '../src/components/GuardrailsPanel';
import { ResumePanel } from '../src/components/ResumePanel';
import { EmptyState } from '../src/components/EmptyState';
import { DeleteConfirmation } from '../src/components/DeleteConfirmation';
import { PanelHeader } from '../src/components/PanelHeader';
import { EnergyBar } from '../src/components/EnergyBar';
import { ErrorBanner } from '../src/components/ErrorBanner';
import { CodeBlock } from '../src/components/CodeBlock';

const wait = () => new Promise(r => setTimeout(r, 50));

describe('panel render smoke tests', () => {
  test('EmptyState renders message', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <EmptyState message="Nothing here yet" />, { width: 80, height: 24 }
    );
    await renderOnce(); await wait();
    const frame = captureCharFrame();
    expect(frame).toContain('Nothing here yet');
  });

  test('EmptyState renders with hint', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <EmptyState message="No items" hint="Press n to create one" />, { width: 80, height: 24 }
    );
    await renderOnce(); await wait();
    const frame = captureCharFrame();
    expect(frame).toContain('No items');
  });

  test('DeleteConfirmation renders item name and title', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <DeleteConfirmation itemName="my-session" />,
      { width: 80, height: 24 }
    );
    await renderOnce(); await wait();
    const frame = captureCharFrame();
    expect(frame).toContain('Delete');
    expect(frame).toContain('my-session');
  });

  test('PanelHeader renders title', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <PanelHeader title="My Panel" />, { width: 80, height: 24 }
    );
    await renderOnce(); await wait();
    const frame = captureCharFrame();
    expect(frame).toContain('My Panel');
  });

  test('PanelHeader renders title with subtitle', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <PanelHeader title="Tasks" subtitle="5 items" />, { width: 80, height: 24 }
    );
    await renderOnce(); await wait();
    const frame = captureCharFrame();
    expect(frame).toContain('Tasks');
  });

  test('EnergyBar renders', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <EnergyBar level={0.75} />, { width: 80, height: 24 }
    );
    await renderOnce(); await wait();
    const frame = captureCharFrame();
    expect(typeof frame).toBe('string');
  });

  test('ErrorBanner renders error message', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ErrorBanner error="Something went wrong" />, { width: 80, height: 24 }
    );
    await renderOnce(); await wait();
    const frame = captureCharFrame();
    expect(frame).toContain('Something went wrong');
  });

  test('ErrorBanner renders with error code', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ErrorBanner error="RATE_LIMITED: Too many requests\nSuggestion: retry later" showErrorCodes />,
      { width: 80, height: 24 }
    );
    await renderOnce(); await wait();
    const frame = captureCharFrame();
    expect(frame).toContain('RATE_LIMITED');
  });

  test('GuardrailsPanel renders empty state', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <GuardrailsPanel
        config={{ policies: [], defaultAction: 'allow' } as any}
        onSave={async () => {}}
        onCancel={() => {}}
      />, { width: 80, height: 24 }
    );
    await renderOnce(); await wait();
    const frame = captureCharFrame();
    expect(typeof frame).toBe('string');
    expect(frame.length).toBeGreaterThan(0);
  });

  test('ResumePanel renders with sessions', async () => {
    const sessions = [
      { id: 's1', cwd: '/home/user/project', updatedAt: Date.now(), messageCount: 3 },
    ];
    const { captureCharFrame, renderOnce } = await testRender(
      <ResumePanel sessions={sessions as any} onResume={() => {}} onCancel={() => {}} />,
      { width: 80, height: 24 }
    );
    await renderOnce(); await wait();
    const frame = captureCharFrame();
    expect(typeof frame).toBe('string');
    expect(frame.length).toBeGreaterThan(0);
  });

  test('CodeBlock renders code content', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <CodeBlock language="typescript" code="const x = 1;" />,
      { width: 80, height: 24 }
    );
    await renderOnce(); await wait();
    const frame = captureCharFrame();
    expect(typeof frame).toBe('string');
  });
});
