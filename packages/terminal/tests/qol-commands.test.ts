/**
 * Tests for the pure quality-of-life commands (plan 8d98da29 P6.1 backfill).
 * Covers /replay and /templates, which derive their output purely from inputs.
 */
import { describe, expect, test } from 'bun:test';
import type { Message } from '@hasna/assistants-shared';
import { handleReplay, handleTemplates } from '../src/commands/qolCommands';

const mk = (role: Message['role'], content: string): Message =>
  ({ id: Math.random().toString(36).slice(2), role, content, timestamp: Date.now() });

describe('handleReplay', () => {
  test('replays the last N conversation messages', () => {
    const msgs: Message[] = [
      mk('user', 'first'),
      mk('assistant', 'reply one'),
      mk('user', 'second'),
      mk('assistant', 'reply two'),
    ];
    const out = handleReplay('2', msgs).content;
    expect(out).toContain('Replay (last 2 messages)');
    expect(out).toContain('reply two');
    expect(out).toContain('**You:** second');
    expect(out).not.toContain('first'); // only the last 2
  });

  test('defaults to 3 and reports when there is nothing to replay', () => {
    expect(handleReplay('', []).content).toContain('No messages to replay.');
    const out = handleReplay('xyz', [mk('user', 'a'), mk('assistant', 'b')]).content;
    expect(out).toContain('Replay (last 2 messages)'); // bad count → default 3, only 2 exist
  });

  test('truncates long message content', () => {
    const long = 'x'.repeat(600);
    const out = handleReplay('1', [mk('assistant', long)]).content;
    expect(out).toContain('…');
    expect(out).not.toContain('x'.repeat(600));
  });

  test('ignores system messages', () => {
    const out = handleReplay('5', [mk('system', 'SYSPROMPT'), mk('user', 'hi')]).content;
    expect(out).not.toContain('SYSPROMPT');
    expect(out).toContain('hi');
  });
});

describe('handleTemplates', () => {
  test('lists the built-in templates', () => {
    const out = handleTemplates().content;
    expect(out).toContain('coding');
    expect(out).toContain('research');
    expect(out).toContain('writing');
    expect(out).toContain('/new');
  });
});
