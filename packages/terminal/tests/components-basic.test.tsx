import React from 'react';
import { describe, expect, test } from 'bun:test';
import { AskUserPanel } from '../src/components/AskUserPanel';
import { ErrorBanner } from '../src/components/ErrorBanner';
import { Spinner } from '../src/components/Spinner';
import { WelcomeBanner } from '../src/components/WelcomeBanner';
import { QueueIndicator } from '../src/components/QueueIndicator';
import { EnergyBar } from '../src/components/EnergyBar';
import { ProcessingIndicator } from '../src/components/ProcessingIndicator';
import { Status } from '../src/components/Status';
import { ThinkingBlock } from '../src/components/ThinkingBlock';
import { PanelErrorBoundary } from '../src/components/PanelErrorBoundary';
import { renderInk } from './utils/ink-test-harness';

describe('terminal basic components', () => {
  test('AskUserPanel renders question and options', async () => {
    const harness = await renderInk(
      <AskUserPanel
        sessionId="session-1"
        request={{
          id: 'req-1',
          title: 'Questionnaire',
          description: 'Please answer',
          questions: [
            { id: 'q1', question: 'What is your name?', options: ['Ada', 'Grace'], multiline: true },
          ],
        } as any}
        question={{ id: 'q1', question: 'What is your name?', options: ['Ada', 'Grace'], multiline: true } as any}
        index={0}
        total={1}
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('Questionnaire');
      expect(frame).toContain('What is your name?');
      expect(frame).toContain('Ada');
      expect(frame).toContain('Multi-line answer allowed');
      expect(frame).toContain('session-1');
    } finally {
      await harness.cleanup();
    }
  });

  test('ErrorBanner parses codes and suggestions', async () => {
    const harness = await renderInk(
      <ErrorBanner
        error={'RATE_LIMITED: Too many requests\nSuggestion: try later'}
        showErrorCodes
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('RATE_LIMITED: Too many requests');
      expect(frame).toContain('RATE_LIMITED: Too many requests');
      expect(frame).toContain('Suggestion: try later');
    } finally {
      await harness.cleanup();
    }
  });

  test('Spinner renders label when provided', async () => {
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    globalThis.setInterval = (() => 1 as any) as any;
    globalThis.clearInterval = (() => {}) as any;

    const harness = await renderInk(<Spinner label="Loading" />, { width: 80, height: 24 });
    try {
      const frame = await harness.waitForText('Loading');
      expect(frame).toContain('Loading');
    } finally {
      await harness.cleanup();
      globalThis.setInterval = originalSetInterval;
      globalThis.clearInterval = originalClearInterval;
    }
  });

  test('WelcomeBanner renders branding', async () => {
    const harness = await renderInk(<WelcomeBanner />, { width: 80, height: 24 });
    try {
      const frame = await harness.waitForText('hasna');
      expect(frame).toContain('hasna');
    } finally {
      await harness.cleanup();
    }
  });

  test('WelcomeBanner first Ink render is nonblank and centered by parent-safe layout', async () => {
    const harness = await renderInk(<WelcomeBanner />, { width: 40, height: 6 });
    try {
      const frame = await harness.waitForText('hasna');
      expect(frame.trim().length).toBeGreaterThan(0);
      expect(frame).toContain('hasna');
    } finally {
      await harness.cleanup();
    }
  });

  test('QueueIndicator summarizes queued messages', async () => {
    const harness = await renderInk(
      <QueueIndicator
        messages={[
          { id: 'm1', content: 'first', mode: 'inline', queuedAt: 1 },
          { id: 'm2', content: 'second', mode: 'queued', queuedAt: 2 },
          { id: 'm3', content: 'third message is quite long'.repeat(5), mode: 'queued', queuedAt: 3 },
          { id: 'm4', content: 'fourth', mode: 'queued', queuedAt: 4 },
        ]}
        maxPreview={2}
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('+2 more');
      expect(frame).toContain('queued');
      expect(frame).toContain('in-stream');
      expect(frame).toContain('+2 more');
    } finally {
      await harness.cleanup();
    }
  });

  test('EnergyBar renders percentage and color segments', async () => {
    const harness = await renderInk(<EnergyBar current={3} max={10} />, { width: 80, height: 24 });
    try {
      const frame = await harness.waitForText('30%');
      expect(frame).toContain('30%');
    } finally {
      await harness.cleanup();
    }
  });

  test('ProcessingIndicator renders when active', async () => {
    const originalNow = Date.now;
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    Date.now = () => 6000;
    globalThis.setInterval = ((cb: () => void) => {
      cb();
      return 1 as any;
    }) as any;
    globalThis.clearInterval = (() => {}) as any;

    const harness = await renderInk(
      <ProcessingIndicator isProcessing startTime={1000} tokenCount={1200} isThinking />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('tokens');
      expect(frame).toContain('esc');
      expect(frame).toContain('1.2k');
      expect(frame).toContain('tokens');
    } finally {
      await harness.cleanup();
      Date.now = originalNow;
      globalThis.setInterval = originalSetInterval;
      globalThis.clearInterval = originalClearInterval;
    }
  });

  test('Status shows context, queue, session, and verbose state', async () => {
    const originalNow = Date.now;
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    Date.now = () => 9000;
    globalThis.setInterval = ((cb: () => void) => {
      cb();
      return 1 as any;
    }) as any;
    globalThis.clearInterval = (() => {}) as any;

    const harness = await renderInk(
      <Status
        isProcessing
        cwd="/tmp"
        queueLength={2}
        tokenUsage={{ inputTokens: 10, outputTokens: 10, totalTokens: 20, maxContextTokens: 40 }}
        sessionIndex={0}
        sessionCount={2}
        backgroundProcessingCount={1}
        sessionId="s1"
        processingStartTime={1000}
        verboseTools
        voiceState={{ enabled: true, isListening: true } as any}
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('50%');
      expect(frame).toContain('50%');
      expect(frame).toContain('Assistant');
    } finally {
      await harness.cleanup();
      Date.now = originalNow;
      globalThis.setInterval = originalSetInterval;
      globalThis.clearInterval = originalClearInterval;
    }
  });

  test('ThinkingBlock renders idle, active, and content states', async () => {
    const idle = await renderInk(<ThinkingBlock />, { width: 80, height: 24 });
    try {
      expect(await idle.waitForText('Thinking')).toContain('Thinking');
    } finally {
      await idle.cleanup();
    }

    const active = await renderInk(<ThinkingBlock isActive />, { width: 80, height: 24 });
    try {
      expect(await active.waitForText('Thinking...')).toContain('Thinking...');
    } finally {
      await active.cleanup();
    }

    const withContent = await renderInk(<ThinkingBlock content="checking context" />, { width: 80, height: 24 });
    try {
      const frame = await withContent.waitForText('checking context');
      expect(frame).toContain('Thinking:');
      expect(frame).toContain('checking context');
    } finally {
      await withContent.cleanup();
    }
  });

  test('PanelErrorBoundary renders a recoverable Ink fallback', async () => {
    const originalError = console.error;
    console.error = () => {};

    function ThrowingPanel() {
      throw new Error('panel exploded');
    }

    const harness = await renderInk(
      <PanelErrorBoundary panelName="Docs">
        <ThrowingPanel />
      </PanelErrorBoundary>,
      { width: 80, height: 24 },
    );

    try {
      const frame = await harness.waitForText('Docs Error');
      expect(frame).toContain('panel exploded');
      expect(frame).toContain('Press');
    } finally {
      await harness.cleanup();
      console.error = originalError;
    }
  });
});
