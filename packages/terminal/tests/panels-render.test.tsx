/**
 * Basic render smoke tests for panels with low coverage.
 * These verify the components render without crashing.
 */
import React from 'react';
import { describe, expect, test } from 'bun:test';
import { GuardrailsPanel } from '../src/components/GuardrailsPanel';
import { ResumePanel } from '../src/components/ResumePanel';
import { EmptyState } from '../src/components/EmptyState';
import { DeleteConfirmation } from '../src/components/DeleteConfirmation';
import { PanelHeader } from '../src/components/PanelHeader';
import { EnergyBar } from '../src/components/EnergyBar';
import { ErrorBanner } from '../src/components/ErrorBanner';
import { CodeBlock } from '../src/components/CodeBlock';
import { renderInk } from './utils/ink-test-harness';

const wait = () => new Promise(r => setTimeout(r, 50));

describe('panel render smoke tests', () => {
  test('EmptyState renders message', async () => {
    const harness = await renderInk(
      <EmptyState message="Nothing here yet" />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('Nothing here yet');
      expect(frame).toContain('Nothing here yet');
    } finally {
      await harness.cleanup();
    }
  });

  test('EmptyState renders with hint', async () => {
    const harness = await renderInk(
      <EmptyState message="No items" hint="Press n to create one" />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('No items');
      expect(frame).toContain('Press n to create one');
    } finally {
      await harness.cleanup();
    }
  });

  test('DeleteConfirmation renders item name and title', async () => {
    const harness = await renderInk(
      <DeleteConfirmation itemName="my-session" />,
      { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('my-session');
      expect(frame).toContain('Delete');
      expect(frame).toContain('my-session');
    } finally {
      await harness.cleanup();
    }
  });

  test('PanelHeader renders title', async () => {
    const harness = await renderInk(
      <PanelHeader title="My Panel" />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('My Panel');
      expect(frame).toContain('My Panel');
    } finally {
      await harness.cleanup();
    }
  });

  test('PanelHeader renders title with hints', async () => {
    const harness = await renderInk(
      <PanelHeader title="Tasks" hints="5 items" />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('Tasks');
      expect(frame).toContain('Tasks');
      expect(frame).toContain('5 items');
    } finally {
      await harness.cleanup();
    }
  });

  test('EnergyBar renders', async () => {
    const harness = await renderInk(
      <EnergyBar current={3} max={4} />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('75%');
      expect(frame).toContain('75%');
    } finally {
      await harness.cleanup();
    }
  });

  test('ErrorBanner renders error message', async () => {
    const harness = await renderInk(
      <ErrorBanner error="Something went wrong" />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('Something went wrong');
      expect(frame).toContain('Something went wrong');
    } finally {
      await harness.cleanup();
    }
  });

  test('ErrorBanner renders with error code', async () => {
    const harness = await renderInk(
      <ErrorBanner error="RATE_LIMITED: Too many requests\nSuggestion: retry later" showErrorCodes />,
      { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('RATE_LIMITED');
      expect(frame).toContain('RATE_LIMITED');
    } finally {
      await harness.cleanup();
    }
  });

  test('GuardrailsPanel renders empty state', async () => {
    const harness = await renderInk(
      <GuardrailsPanel
        config={{ enabled: false, defaultAction: 'allow' } as any}
        policies={[]}
        onToggleEnabled={() => {}}
        onTogglePolicy={() => {}}
        onSetPreset={() => {}}
        onAddPolicy={() => {}}
        onRemovePolicy={() => {}}
        onUpdatePolicy={() => {}}
        onCancel={() => {}}
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('Guardrails');
      expect(frame).toContain('Disabled');
    } finally {
      await harness.cleanup();
    }
  });

  test('ResumePanel renders with sessions', async () => {
    const sessions = [
      { id: 's1', cwd: '/home/user/project', updatedAt: new Date().toISOString(), messageCount: 3 },
    ];
    const harness = await renderInk(
      <ResumePanel
        sessions={sessions as any}
        activeCwd="/home/user/project"
        onResume={() => {}}
        onRefresh={async () => {}}
        onClose={() => {}}
      />,
      { width: 80, height: 24 }
    );
    try {
      await wait();
      const frame = await harness.waitForText('Resume Sessions');
      expect(frame).toContain('/home/user/project');
    } finally {
      await harness.cleanup();
    }
  });

  test('CodeBlock renders code content', async () => {
    const harness = await renderInk(
      <CodeBlock language="typescript" code="const x = 1;" />,
      { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('const x = 1;');
      expect(frame).toContain('const x = 1;');
    } finally {
      await harness.cleanup();
    }
  });
});
