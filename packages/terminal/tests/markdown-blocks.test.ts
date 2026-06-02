import React from 'react';
import { describe, expect, test } from 'bun:test';
import { Markdown } from '../src/components/Markdown';
import { renderInk } from './utils/ink-test-harness';

describe('Markdown block rendering (Ink native)', () => {
  test('renders markdown content via upstream Ink', async () => {
    const harness = await renderInk(
      React.createElement(Markdown, { content: '# Hello\n\nWorld' }),
      { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('Hello');
      expect(frame).toContain('# Hello');
      expect(frame).toContain('World');
    } finally {
      await harness.cleanup();
    }
  });

  test('renders null for empty content', () => {
    const result = Markdown({ content: '' });
    expect(result).toBeNull();
  });

  test('accepts supported maxWidth prop without error', async () => {
    const harness = await renderInk(
      React.createElement(Markdown, { content: 'hello', maxWidth: 40 }),
      { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('hello');
      expect(frame).toContain('hello');
    } finally {
      await harness.cleanup();
    }
  });
});
