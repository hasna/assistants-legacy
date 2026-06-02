/**
 * Regression test for inline styled text rendering through the Ink facade.
 */
import React from 'react';
import { describe, expect, test } from 'bun:test';
import { Inline, Text } from '../src/ui/ink';
import { renderInkStatic } from './utils/ink-test-harness';

async function firstLine(node: React.ReactElement): Promise<string> {
  return renderInkStatic(node, { columns: 80 }).split('\n')[0] ?? '';
}

describe('inline styled text', () => {
  test('Inline inside Text renders inline and keeps its content', async () => {
    const line = await firstLine(
      <Text>Install with: <Inline fg="#56b6c2">bun-add-skills</Inline> now</Text>,
    );
    expect(line).toContain('Install with:');
    expect(line).toContain('bun-add-skills');
    expect(line).toContain('now');
  });

  test('nested Text also keeps inner content under Ink', async () => {
    const line = await firstLine(
      <Text>Install with: <Text fg="#56b6c2">VISIBLE</Text> now</Text>,
    );
    expect(line).toContain('VISIBLE');
  });
});
