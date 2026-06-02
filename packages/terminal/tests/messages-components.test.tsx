/**
 * Tests for the per-type message components (plan 8d98da29 P4.2).
 * Pure helpers + render checks for the role dispatcher and renderers.
 */
import React from 'react';
import { describe, expect, test } from 'bun:test';
import { stripAnsi, normalizeUserDisplay, startsWithListOrTable } from '../src/components/message-parts/helpers';
import { MessageBubble, UserMessage, AssistantMessage } from '../src/components/message-parts';
import type { DisplayMessage } from '../src/components/messageLines';
import { renderInk } from './utils/ink-test-harness';

async function frame(node: React.ReactElement, width = 60, height = 8): Promise<string> {
  const harness = await renderInk(node, { width, height });
  await harness.renderOnce();
  const output = harness.captureFrame();
  await harness.cleanup();
  return output;
}

const msg = (over: Partial<DisplayMessage>): DisplayMessage =>
  ({ id: 'm1', role: 'user', content: '', timestamp: Date.now(), ...over } as DisplayMessage);

describe('helpers', () => {
  test('stripAnsi removes SGR escapes', () => {
    expect(stripAnsi('\x1B[31mred\x1B[0m')).toBe('red');
  });
  test('normalizeUserDisplay collapses spaces/blank lines outside code fences', () => {
    expect(normalizeUserDisplay('a\r\nb')).toBe('a\nb');
    expect(normalizeUserDisplay('x    y')).toBe('x y');
    expect(normalizeUserDisplay('a\n\n\nb')).toBe('a\nb');
  });
  test('normalizeUserDisplay preserves whitespace inside code fences', () => {
    const code = '```\n  indented    code\n```';
    expect(normalizeUserDisplay(code)).toContain('  indented    code');
  });
  test('startsWithListOrTable detects lists, tables, fences', () => {
    expect(startsWithListOrTable('- item')).toBe(true);
    expect(startsWithListOrTable('1. item')).toBe(true);
    expect(startsWithListOrTable('| a | b |')).toBe(true);
    expect(startsWithListOrTable('```ts')).toBe(true);
    expect(startsWithListOrTable('just prose')).toBe(false);
  });
});

describe('MessageBubble dispatcher', () => {
  test('renders user content', async () => {
    const out = await frame(<MessageBubble message={msg({ role: 'user', content: 'hello there' })} />);
    expect(out).toContain('hello there');
  });
  test('renders assistant content', async () => {
    const out = await frame(<MessageBubble message={msg({ role: 'assistant', content: 'the answer' })} />);
    expect(out).toContain('the answer');
  });
  test('system messages are not shown', async () => {
    const out = await frame(<MessageBubble message={msg({ role: 'system', content: 'SECRET-SYSTEM' })} />);
    expect(out).not.toContain('SECRET-SYSTEM');
  });
});

describe('role renderers', () => {
  test('UserMessage shows a queued message dimmed but visible', async () => {
    const out = await frame(
      <UserMessage message={msg({ id: 'q1', content: 'queued msg' })} queuedMessageIds={new Set(['q1'])} />,
    );
    expect(out).toContain('queued msg');
  });
  test('AssistantMessage renders markdown text', async () => {
    const out = await frame(<AssistantMessage message={msg({ role: 'assistant', content: 'plain reply' })} />);
    expect(out).toContain('plain reply');
  });
});
