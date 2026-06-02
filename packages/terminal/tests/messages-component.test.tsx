import React from 'react';
import { describe, expect, test } from 'bun:test';
import type { Message, ToolCall, ToolResult } from '@hasna/assistants-shared';
import { Messages } from '../src/components/Messages';
import type { DisplayMessage } from '../src/components/messageLines';
import { renderInk } from './utils/ink-test-harness';

describe('Messages component', () => {
  test('renders user and assistant messages with tool panels', async () => {
    const user: DisplayMessage = {
      id: 'u1',
      role: 'user',
      content: 'Run command',
      timestamp: 0,
      toolResults: [{ toolCallId: 't1', toolName: 'bash', content: 'ok', isError: false } as any],
    };
    const assistant: DisplayMessage = {
      id: 'a1',
      role: 'assistant',
      content: 'Here you go',
      timestamp: 0,
      toolCalls: [{ id: 't1', name: 'bash', input: { command: 'ls' }, type: 'tool' } as any],
      toolResults: [{ toolCallId: 't1', toolName: 'bash', content: 'done', isError: false } as any],
    };

    const activityLog = [
      { id: 'act1', type: 'text' as const, content: 'Thinking', timestamp: 0 },
      { id: 'act2', type: 'tool_call' as const, toolCall: { id: 't2', name: 'read', input: { path: 'file' }, type: 'tool' } as ToolCall, timestamp: 0 },
      { id: 'act3', type: 'tool_result' as const, toolResult: { toolCallId: 't2', toolName: 'read', content: 'data', isError: false } as ToolResult, timestamp: 1000 },
    ];

    const harness = await renderInk(
      <Messages
        messages={[user, assistant]}
        currentResponse="Streaming response"
        activityLog={activityLog}
        queuedMessageIds={new Set(['u1'])}
      />, { width: 80, height: 24 }
    );

    await harness.renderOnce();
    const frame = harness.captureFrame();
    expect(frame).toContain('Run command');
    expect(frame).toContain('Bash');
    expect(frame).toContain('ok');
    await harness.cleanup();
  });

  test('renders streaming messages list', async () => {
    const streaming: DisplayMessage = {
      id: 's1',
      role: 'assistant',
      content: 'partial',
      timestamp: 0,
    };

    const harness = await renderInk(
      <Messages
        messages={[]}
        streamingMessages={[streaming]}
      />, { width: 80, height: 24 }
    );

    const frame = await harness.waitForText('partial');
    expect(frame).toContain('partial');
    await harness.cleanup();
  });

  test('renders listening draft label for draft messages', async () => {
    const draft: DisplayMessage = {
      id: 'listening-draft',
      role: 'user',
      content: 'dictating now',
      timestamp: 0,
    };

    const harness = await renderInk(
      <Messages
        messages={[]}
        streamingMessages={[draft]}
      />, { width: 80, height: 24 }
    );

    const frame = await harness.waitForText('Live dictation');
    expect(frame).toContain('Live dictation');
    expect(frame).toContain('dictating now');
    await harness.cleanup();
  });
});
