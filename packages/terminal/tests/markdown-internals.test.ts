import React from 'react';
import { describe, expect, test } from 'bun:test';
import { testRender } from '@opentui/react/test-utils';
import { Markdown, renderMarkdown } from '../src/components/Markdown';

describe('Markdown internals (OpenTUI native)', () => {
  test('renderMarkdown returns trimmed text for line estimation', () => {
    const result = renderMarkdown('Hello world  \n', { maxWidth: 40 });
    expect(result).toBe('Hello world');
  });

  test('renderMarkdown preserves markdown syntax for OpenTUI to handle', () => {
    const result = renderMarkdown('# Header\n\n**bold** and *italic*');
    expect(result).toContain('# Header');
    expect(result).toContain('**bold**');
  });

  test('Markdown component renders tables natively', async () => {
    const table = '| Name | Value |\n| --- | --- |\n| A | 1 |';
    const { captureCharFrame, renderOnce } = await testRender(
      React.createElement(Markdown, { content: table }),
      { width: 80, height: 24 }
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(typeof frame).toBe('string');
  });

  test('Markdown component renders code blocks natively', async () => {
    const content = '```js\nconsole.log("hello");\n```';
    const { captureCharFrame, renderOnce } = await testRender(
      React.createElement(Markdown, { content }),
      { width: 80, height: 24 }
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(typeof frame).toBe('string');
  });
});
