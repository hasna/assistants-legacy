import React from 'react';
import { describe, expect, test } from 'bun:test';
import { testRender } from '@opentui/react/test-utils';
import { Markdown } from '../src/components/Markdown';

describe('Markdown block rendering (OpenTUI native)', () => {
  test('renders markdown content via OpenTUI intrinsic', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      React.createElement(Markdown, { content: '# Hello\n\nWorld' }),
      { width: 80, height: 24 }
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(typeof frame).toBe('string');
  });

  test('renders null for empty content', () => {
    const result = Markdown({ content: '' });
    expect(result).toBeNull();
  });

  test('accepts deprecated preRendered prop without error', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      React.createElement(Markdown, { content: 'hello', preRendered: true } as any),
      { width: 80, height: 24 }
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(typeof frame).toBe('string');
  });
});
