import React from 'react';
import { describe, expect, test } from 'bun:test';
import { Markdown, renderMarkdown } from '../src/components/Markdown';
import { renderInk } from './utils/ink-test-harness';

describe('terminal Markdown renderer', () => {
  test('Markdown component returns null for empty content', () => {
    const result = Markdown({ content: '' });
    expect(result).toBeNull();
  });

  test('Markdown component renders with upstream Ink', async () => {
    const harness = await renderInk(
      React.createElement(Markdown, { content: 'hello' }),
      { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('hello');
      expect(frame).toContain('hello');
    } finally {
      await harness.cleanup();
    }
  });

  test('Markdown component handles complex markdown content', async () => {
    const content = `# Header

**Bold** and *italic* text.

- bullet one
- bullet two

\`inline code\`

| Name | Value |
| --- | --- |
| Alpha | 1 |
`;
    const harness = await renderInk(
      React.createElement(Markdown, { content }),
      { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('Header');
      expect(frame).toContain('# Header');
      expect(frame).toContain('Bold');
      expect(frame).toContain('italic');
      expect(frame).toContain('- bullet one');
      expect(frame).toContain('inline code');
      expect(frame).toContain('| Name');
    } finally {
      await harness.cleanup();
    }
  });

  test('renderMarkdown returns formatted plain text for sizing', () => {
    const output = renderMarkdown('# Header\n\n**Bold** text  \n', { maxWidth: 50 });
    expect(output).toBe('# Header\n\nBold text');
  });

  test('renderMarkdown emits code and inline-code text', () => {
    const output = renderMarkdown('```js\nconsole.log("x");\n```\nInline `code`');
    expect(output).toContain('console.log');
    expect(output).toContain('Inline code');
  });
});
