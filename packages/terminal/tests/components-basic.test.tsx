import React from 'react';
import { describe, expect, test } from 'bun:test';
import { testRender } from '@opentui/react/test-utils';
import { PassThrough } from 'stream';
import { AskUserPanel } from '../src/components/AskUserPanel';
import { ErrorBanner } from '../src/components/ErrorBanner';
import { Spinner } from '../src/components/Spinner';
import { WelcomeBanner } from '../src/components/WelcomeBanner';
import { QueueIndicator } from '../src/components/QueueIndicator';
import { EnergyBar } from '../src/components/EnergyBar';
import { ProcessingIndicator } from '../src/components/ProcessingIndicator';
import { Status } from '../src/components/Status';

const stripAnsi = (text: string) => text.replace(/\x1B\[[0-9;]*m/g, '');

describe('terminal basic components', () => {
  test('AskUserPanel renders question and options', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
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

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain('Questionnaire');
    expect(frame).toContain('What is your name?');
    expect(frame).toContain('Ada');
    expect(frame).toContain('Multi-line answer allowed');
    expect(frame).toContain('session-1');
    // cleanup handled by testRender
  });

  test('ErrorBanner parses codes and suggestions', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ErrorBanner
        error={'RATE_LIMITED: Too many requests\nSuggestion: try later'}
        showErrorCodes
      />, { width: 80, height: 24 }
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain('RATE_LIMITED: Too many requests');
    expect(frame).toContain('Suggestion: try later');
    // cleanup handled by testRender
  });

  test('Spinner renders label when provided', async () => {
    const { captureCharFrame, renderOnce } = await testRender(<Spinner label="Loading" />, { width: 80, height: 24 });
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain('Loading');
    // cleanup handled by testRender
  });

  test('WelcomeBanner renders branding', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <WelcomeBanner version="1.2.3" model="gpt" directory="/home/tester/project" />, { width: 80, height: 24 }
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain('hasna');
    // cleanup handled by testRender
  });

  test('WelcomeBanner renders with model prop', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <WelcomeBanner version="1.0.0" model="claude-sonnet-4-20250514" directory="/tmp" />, { width: 80, height: 24 }
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain('hasna');
    // cleanup handled by testRender
  });

  test('WelcomeBanner renders with unknown model prop', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <WelcomeBanner version="1.0.0" model="custom-model-xyz" directory="/tmp" />, { width: 80, height: 24 }
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain('hasna');
    // cleanup handled by testRender
  });

  test('QueueIndicator summarizes queued messages', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
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
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain('queued');
    expect(frame).toContain('in-stream');
    expect(frame).toContain('+2 more');
    // cleanup handled by testRender
  });

  test('EnergyBar renders percentage and color segments', async () => {
    const { captureCharFrame, renderOnce } = await testRender(<EnergyBar current={3} max={10} />, { width: 80, height: 24 });
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain('30%');
    // cleanup handled by testRender
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

    const { captureCharFrame, renderOnce } = await testRender(
      <ProcessingIndicator isProcessing startTime={1000} tokenCount={1200} isThinking />, { width: 80, height: 24 }
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain('esc');
    expect(frame).toContain('1.2k');
    expect(frame).toContain('tokens');
    // cleanup handled by testRender

    Date.now = originalNow;
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
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

    const { captureCharFrame, renderOnce } = await testRender(
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
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain('50%');
    expect(frame).toContain('Assistant');
    // cleanup handled by testRender

    Date.now = originalNow;
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  });
});
