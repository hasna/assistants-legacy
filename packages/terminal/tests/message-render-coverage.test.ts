import { describe, expect, test } from 'bun:test';
import { buildDisplayMessages } from '../src/components/messageRender';
import type { Message } from '@hasna/assistants-shared';

const msg = (role: 'user' | 'assistant', content: string, id = 'msg1'): Message =>
  ({ id, role, content, toolCalls: [], toolResults: [] } as any);

describe('buildDisplayMessages', () => {
  test('empty message list returns empty array', () => {
    expect(buildDisplayMessages([], 20, 80)).toEqual([]);
  });

  test('short user message passes through unchanged', () => {
    const result = buildDisplayMessages([msg('user', 'hello')], 20, 80);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('hello');
    expect(result[0].role).toBe('user');
  });

  test('message with empty content passes through without chunking', () => {
    const result = buildDisplayMessages([msg('user', '')], 20, 80);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('');
  });

  test('message with whitespace-only content passes through', () => {
    const result = buildDisplayMessages([msg('user', '   ')], 20, 80);
    expect(result).toHaveLength(1);
  });

  test('long user message gets chunked', () => {
    const longContent = Array(30).fill('This is a line of text.').join('\n');
    const result = buildDisplayMessages([msg('user', longContent)], 10, 80);
    expect(result.length).toBeGreaterThan(1);
    // All chunks preserve role and original id prefix
    for (const r of result) {
      expect(r.role).toBe('user');
    }
  });

  test('chunked messages have correct chunk id format', () => {
    const longContent = Array(30).fill('line').join('\n');
    const result = buildDisplayMessages([msg('user', longContent, 'u1')], 5, 80);
    expect(result.length).toBeGreaterThan(1);
    expect(result[0].id).toContain('u1');
    expect(result[1].id).toContain('u1::chunk-');
  });

  test('tool calls only attached to last chunk', () => {
    const longContent = Array(30).fill('line').join('\n');
    const toolCalls = [{ id: 'tc1', name: 'bash', input: {} }] as any;
    const m: Message = { id: 'u1', role: 'user', content: longContent, toolCalls, toolResults: [] } as any;
    const result = buildDisplayMessages([m], 5, 80);
    expect(result.length).toBeGreaterThan(1);
    // Only last chunk has toolCalls
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].toolCalls).toBeUndefined();
    }
    expect(result[result.length - 1].toolCalls).toBeDefined();
  });

  test('short assistant message renders without chunking', () => {
    const result = buildDisplayMessages([msg('assistant', 'Short reply.')], 50, 80);
    expect(result).toHaveLength(1);
    expect(result[0].__rendered).toBe(true);
  });

  test('long assistant message gets chunked', () => {
    const longContent = Array(60).fill('This is a long assistant response line.').join('\n');
    const result = buildDisplayMessages([msg('assistant', longContent)], 10, 80);
    expect(result.length).toBeGreaterThan(1);
    for (const r of result) {
      expect(r.role).toBe('assistant');
      expect(r.__rendered).toBe(true);
    }
  });

  test('handles multiple messages', () => {
    const messages = [
      msg('user', 'Hello', 'u1'),
      msg('assistant', 'Hi there', 'a1'),
      msg('user', 'How are you?', 'u2'),
    ];
    const result = buildDisplayMessages(messages, 50, 80);
    expect(result).toHaveLength(3);
    expect(result[0].role).toBe('user');
    expect(result[1].role).toBe('assistant');
    expect(result[2].role).toBe('user');
  });

  test('user message wraps at wrapChars boundary', () => {
    const longLine = 'word '.repeat(40).trim(); // ~200 chars on one line
    const result = buildDisplayMessages([msg('user', longLine)], 50, 40);
    expect(result).toHaveLength(1);
    // Content should be wrapped
    expect(result[0].content).toBeDefined();
  });

  test('options.maxWidth passed to assistant rendering', () => {
    const result = buildDisplayMessages(
      [msg('assistant', 'Hello world')],
      50,
      80,
      { maxWidth: 60 }
    );
    expect(result).toHaveLength(1);
    expect(result[0].__rendered).toBe(true);
  });
});
