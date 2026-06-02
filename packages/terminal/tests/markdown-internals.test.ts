import React from 'react';
import { describe, expect, test } from 'bun:test';
import { Markdown, renderMarkdown } from '../src/components/Markdown';
import { renderInk } from './utils/ink-test-harness';

describe('Markdown internals (Ink native)', () => {
  test('renderMarkdown returns trimmed text for line estimation', () => {
    const result = renderMarkdown('Hello world  \n', { maxWidth: 40 });
    expect(result).toBe('Hello world');
  });

  test('renderMarkdown emits formatted plain text for line estimation', () => {
    const result = renderMarkdown('# Header\n\n**bold** and *italic*');
    expect(result).toContain('# Header');
    expect(result).toContain('bold and italic');
    expect(result).not.toContain('**bold**');
  });

  test('Markdown component renders tables through Ink', async () => {
    const table = '| Name | Value |\n| --- | --- |\n| A | 1 |';
    const harness = await renderInk(
      React.createElement(Markdown, { content: table }),
      { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('| Name');
      expect(frame).toContain('| A');
    } finally {
      await harness.cleanup();
    }
  });

  test('Markdown component renders code blocks through Ink', async () => {
    const content = '```js\nconsole.log("hello");\n```';
    const harness = await renderInk(
      React.createElement(Markdown, { content }),
      { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('console.log("hello");');
      expect(frame).toContain('console.log("hello");');
    } finally {
      await harness.cleanup();
    }
  });
});
