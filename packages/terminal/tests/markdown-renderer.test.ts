import React from 'react';
import { describe, expect, test } from 'bun:test';
import { testRender } from '@opentui/react/test-utils';
import { Markdown, renderMarkdown } from '../src/components/Markdown';

describe('terminal Markdown renderer', () => {
  test('Markdown component returns null for empty content', () => {
    const result = Markdown({ content: '' });
    expect(result).toBeNull();
  });

  test('Markdown component renders with OpenTUI intrinsic', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      React.createElement(Markdown, { content: 'hello' }),
      { width: 80, height: 24 }
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(typeof frame).toBe('string');
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
    const { captureCharFrame, renderOnce } = await testRender(
      React.createElement(Markdown, { content }),
      { width: 80, height: 24 }
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(typeof frame).toBe('string');
  });

  test('renderMarkdown returns trimmed raw text for sizing', () => {
    const output = renderMarkdown('# Header\n\n**Bold** text  \n', { maxWidth: 50 });
    expect(output).toBe('# Header\n\n**Bold** text');
  });

  test('renderMarkdown preserves markdown syntax', () => {
    const output = renderMarkdown('```js\nconsole.log("x");\n```\nInline `code`');
    expect(output).toContain('console.log');
    expect(output).toContain('`code`');
  });
});
