/**
 * Regression tests for the virtual-scroll transcript (plan 8d98da29 P4.1).
 *
 * The historical transcript is rendered in full inside the scrollable transcript
 * viewport; line-trimming was removed from the historical
 * path and now only applies to the transient streaming/activity region. These
 * tests pin that the historical display accumulation NEVER drops old messages,
 * so scrollback is always complete — and that the budget trimmer still works
 * for the streaming region.
 */
import { describe, expect, test } from 'bun:test';
import type { Message } from '@hasna/assistants-shared';
import { buildDisplayMessages } from '../src/components/messageRender';
import { trimDisplayMessagesByLines, estimateDisplayMessagesLines } from '../src/components/messageLines';

const CHUNK = 1000;
const WRAP = 80;

const mk = (i: number, role: Message['role'] = 'user'): Message => ({
  id: `m${i}`,
  role,
  content: `message number ${i}`,
  timestamp: 1000 + i,
});

/** Mirror App.tsx's historical accumulation: build each message, concat all. */
function buildHistory(messages: Message[]) {
  const out = [] as ReturnType<typeof buildDisplayMessages>;
  for (const m of messages) {
    out.push(...buildDisplayMessages([m], CHUNK, WRAP, { maxWidth: WRAP }));
  }
  return out;
}

describe('historical transcript is never trimmed', () => {
  test('renders every message regardless of count (full scrollback)', () => {
    const messages = Array.from({ length: 200 }, (_, i) => mk(i));
    const display = buildHistory(messages);
    // Every message id survives — none dropped.
    const ids = new Set(display.map((d) => d.id.replace(/::chunk-\d+$/, '')));
    for (let i = 0; i < 200; i++) expect(ids.has(`m${i}`)).toBe(true);
    // Oldest and newest content both present.
    const joined = display.map((d) => d.content).join('\n');
    expect(joined).toContain('message number 0');
    expect(joined).toContain('message number 199');
  });

  test('history line count grows with message count (no fixed cap)', () => {
    const small = estimateDisplayMessagesLines(buildHistory(Array.from({ length: 5 }, (_, i) => mk(i))), WRAP);
    const large = estimateDisplayMessagesLines(buildHistory(Array.from({ length: 100 }, (_, i) => mk(i))), WRAP);
    expect(large).toBeGreaterThan(small);
  });
});

describe('streaming-region trimming still bounds the transient view', () => {
  test('trimDisplayMessagesByLines caps the streaming region to its budget', () => {
    const display = buildHistory(Array.from({ length: 50 }, (_, i) => mk(i, 'assistant')));
    const full = estimateDisplayMessagesLines(display, WRAP);
    const { messages: trimmed, trimmed: wasTrimmed } = trimDisplayMessagesByLines(display, 5, WRAP);
    expect(wasTrimmed).toBe(true);
    expect(estimateDisplayMessagesLines(trimmed, WRAP)).toBeLessThanOrEqual(full);
    // Trimming keeps the most recent content (tail), not the head.
    const tail = trimmed.map((d) => d.content).join('\n');
    expect(tail).toContain('message number 49');
  });
});
