import React from 'react';
import { describe, expect, test } from 'bun:test';
import {
  Markdown,
  MarkdownTable,
  renderMarkdown,
  renderMarkdownTableLines,
} from '../src/ui/ink';
import { renderInk, renderInkStatic } from './utils/ink-test-harness';

describe('Ink Markdown component', () => {
  test('returns null for empty content', () => {
    expect(Markdown({ content: '' })).toBeNull();
    expect(Markdown({ content: '   \n\t ' })).toBeNull();
  });

  test('renders common markdown blocks with upstream Ink', async () => {
    const content = `# Header

**Bold** and *italic* text.

- bullet one
- bullet two

\`inline code\`

| Name | Value |
| --- | ---: |
| Alpha | 1 |
`;

    const harness = await renderInk(<Markdown content={content} maxWidth={72} />, { width: 80, height: 24 });
    const frame = await harness.waitForText('Header');

    expect(frame).toContain('# Header');
    expect(frame).toContain('Bold');
    expect(frame).toContain('italic');
    expect(frame).toContain('- bullet one');
    expect(frame).toContain('inline code');
    expect(frame).toContain('| Name');
    expect(frame).toContain('Alpha');

    await harness.cleanup();
  });

  test('renders markdown table lines with alignment and wrapping', () => {
    const lines = renderMarkdownTableLines({
      header: ['File', 'Status'],
      rows: [
        ['packages/terminal/src/components/Markdown.tsx', 'migrated to upstream Ink'],
        ['README.md', 'unchanged'],
      ],
      align: ['left', 'right'],
      maxWidth: 48,
    });

    expect(lines[0]).toContain('| File');
    expect(lines[0]).toContain('Status |');
    expect(lines.join('\n')).toContain('Markdown.tsx');
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(48);
  });

  test('MarkdownTable renders as Ink text', () => {
    const output = renderInkStatic(
      <MarkdownTable
        header={['Name', 'Count']}
        rows={[
          ['Alpha', '12'],
          ['Beta', '3'],
        ]}
        align={['left', 'right']}
      />,
      { columns: 80 }
    );

    expect(output).toContain('| Name');
    expect(output).toContain('Count |');
    expect(output).toContain('Alpha');
    expect(output).toContain('  12 |');
  });

  test('renderMarkdown emits formatted plain text for line estimation', () => {
    const output = renderMarkdown('# Header\n\n**Bold** text\n\n```js\nconsole.log("x");\n```', {
      maxWidth: 50,
    });

    expect(output).toContain('# Header');
    expect(output).toContain('Bold text');
    expect(output).toContain('console.log("x");');
    expect(output).not.toContain('**Bold**');
  });
});
