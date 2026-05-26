/**
 * Regression test for inline styled text rendering.
 *
 * Bug: `<text>` maps to a block-level TextRenderable, so nesting `<text>` inside
 * `<text>` (to colour part of a line) dropped the inner content entirely — e.g.
 * "Install with: <text>cmd</text>" rendered as "Install with: ". The correct
 * primitive for inline styled runs is `<span>` (SpanRenderable). All such sites
 * were converted from nested `<text>` to `<span>`.
 *
 * This test pins the behaviour: a `<span>` inside `<text>` stays inline AND keeps
 * its content; a nested `<text>` does NOT (documenting why we use span).
 */
import React from 'react';
import { describe, expect, test } from 'bun:test';
import { testRender } from '@opentui/react/test-utils';

const wait = () => new Promise((r) => setTimeout(r, 60));
async function firstLine(node: React.ReactElement): Promise<string> {
  const { captureCharFrame, renderOnce } = await testRender(node, { width: 80, height: 4 });
  await renderOnce();
  await wait();
  return captureCharFrame().split('\n')[0];
}

describe('inline styled text', () => {
  test('<span> inside <text> renders inline and keeps its content', async () => {
    const line = await firstLine(
      <text>Install with: <span fg="#56b6c2">bun-add-skills</span> now</text>,
    );
    expect(line).toContain('Install with:');
    expect(line).toContain('bun-add-skills');
    expect(line).toContain('now');
  });

  test('nested <text> drops inner content (why we use <span>)', async () => {
    const line = await firstLine(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <text>Install with: <text fg="#56b6c2">DROPPED</text> now</text> as any,
    );
    // Documents the OpenTUI limitation this fix works around.
    expect(line).not.toContain('DROPPED');
  });
});
