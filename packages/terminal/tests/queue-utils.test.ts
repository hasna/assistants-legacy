import { describe, expect, test } from 'bun:test';
import { testRender } from '@opentui/react/test-utils';
import { takeNextQueuedMessage } from '../src/components/queueUtils';
import type { QueuedMessage } from '../src/components/appTypes';

describe('takeNextQueuedMessage', () => {
  test('returns first queued item for the active session and removes it', () => {
    const queue: QueuedMessage[] = [
      { id: 'a1', sessionId: 's1', content: 'first', queuedAt: 1, mode: 'queued' },
      { id: 'b1', sessionId: 's2', content: 'other', queuedAt: 2, mode: 'queued' },
      { id: 'a2', sessionId: 's1', content: 'second', queuedAt: 3, mode: 'queued' },
    ];
    const result = takeNextQueuedMessage(queue, 's1');
    expect(result.next?.id).toBe('a1');
    expect(result.remaining.map((m) => m.id)).toEqual(['b1', 'a2']);
  });

  test('inline follow-ups are dispatched through the same queue', () => {
    const queue: QueuedMessage[] = [
      { id: 'a1', sessionId: 's1', content: 'inline follow-up', queuedAt: 1, mode: 'inline' },
      { id: 'a2', sessionId: 's1', content: 'queued follow-up', queuedAt: 2, mode: 'queued' },
    ];
    const result = takeNextQueuedMessage(queue, 's1');
    expect(result.next).toEqual(queue[0]);
    expect(result.remaining.map((m) => m.id)).toEqual(['a2']);
  });

  test('returns null and leaves queue unchanged when session has no queued items', () => {
    const queue: QueuedMessage[] = [
      { id: 'b1', sessionId: 's2', content: 'other', queuedAt: 2, mode: 'queued' },
    ];
    const result = takeNextQueuedMessage(queue, 's1');
    expect(result.next).toBeNull();
    expect(result.remaining).toEqual(queue);
  });
});
