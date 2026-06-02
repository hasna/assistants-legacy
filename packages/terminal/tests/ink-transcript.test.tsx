import React from 'react';
import { describe, expect, test } from 'bun:test';
import {
  Transcript,
  buildTranscriptItems,
  estimateTranscriptItemHeight,
  type TranscriptItem,
} from '../src/components/Transcript';
import type { DisplayMessage } from '../src/components/messageLines';
import type { ActivityEntry } from '../src/components/message-parts';
import { renderInk } from './utils/ink-test-harness';

function msg(partial: Partial<DisplayMessage>): DisplayMessage {
  return {
    id: partial.id ?? 'm1',
    role: partial.role ?? 'assistant',
    content: partial.content ?? '',
    timestamp: partial.timestamp ?? 0,
    ...partial,
  };
}

describe('Ink Transcript', () => {
  test('buildTranscriptItems preserves history, grouped tools, activity, streaming, and finish rows', () => {
    const items = buildTranscriptItems({
      messages: [
        msg({ id: 'u1', role: 'user', content: 'hello' }),
        msg({ id: 't1', role: 'assistant', toolCalls: [{ id: 'call-1', name: 'read', input: {}, type: 'tool' } as any] }),
        msg({ id: 't2', role: 'assistant', toolCalls: [{ id: 'call-2', name: 'write', input: {}, type: 'tool' } as any] }),
        msg({ id: 'a1', role: 'assistant', content: 'done' }),
      ],
      activityLog: [
        { id: 'act-text', type: 'text', content: 'thinking', timestamp: 0 } as ActivityEntry,
        { id: 'act-call', type: 'tool_call', toolCall: { id: 'call-3', name: 'bash', input: {}, type: 'tool' } as any, timestamp: 0 } as ActivityEntry,
        { id: 'act-result', type: 'tool_result', toolResult: { toolCallId: 'call-3', toolName: 'bash', content: 'ok', isError: false } as any, timestamp: 1 } as ActivityEntry,
      ],
      streamingMessages: [msg({ id: 's1', content: 'partial' })],
      currentResponse: 'ignored because streaming is present',
      finishInfo: { variant: 'Build', modelName: 'model', duration: '1s' },
    });

    expect(items.map((item) => item.kind)).toEqual([
      'message',
      'grouped',
      'message',
      'activity_text',
      'activity_tools',
      'streaming',
      'finish',
    ]);
    expect(items.find((item) => item.kind === 'grouped')).toMatchObject({ id: 't1' });
    expect(items.some((item) => item.kind === 'current_response')).toBe(false);
  });

  test('buildTranscriptItems includes current response when no streaming chunk exists', () => {
    const items = buildTranscriptItems({
      messages: [],
      currentResponse: 'streaming text',
    });

    expect(items).toEqual([
      { kind: 'current_response', id: 'current-response', content: 'streaming text' },
    ]);
  });

  test('estimateTranscriptItemHeight uses message and activity line estimates', () => {
    const messageItem: TranscriptItem = {
      kind: 'message',
      id: 'm1',
      message: msg({ id: 'm1', content: 'hello', __lineCount: 3 }),
    };
    const activityItem: TranscriptItem = {
      kind: 'activity_text',
      id: 'act',
      entry: { id: 'act', type: 'text', content: 'one two three four five six', timestamp: 0 } as ActivityEntry,
    };

    expect(estimateTranscriptItemHeight(messageItem, 80, 80)).toBeGreaterThanOrEqual(3);
    expect(estimateTranscriptItemHeight(activityItem, 8, 8)).toBeGreaterThan(1);
  });

  test('renders finish-only transcript through the Ink virtual list', async () => {
    const harness = await renderInk(
      <Transcript
        height={4}
        messages={[]}
        finishInfo={{ variant: 'Build', modelName: 'Claude', duration: '2s' }}
      />,
      { width: 80, height: 8 },
    );

    const frame = harness.captureFrame();
    expect(frame).toContain('Build');
    expect(frame).toContain('Claude');
    expect(frame).toContain('2s');

    await harness.cleanup();
  });
});
