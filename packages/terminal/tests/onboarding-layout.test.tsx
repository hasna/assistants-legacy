/**
 * Regression tests for OnboardingPanel layout.
 *
 * Bug: opentui <box> defaults to flexDirection="column", so a box holding several
 * inline <text> children stacks them on separate lines. The onboarding progress bar
 * ("Step N of M [====   ] NN%") and the intro feature rows ("> label") were missing
 * flexDirection="row" and rendered broken across multiple lines / invisible.
 *
 * These tests assert the row content stays on a SINGLE rendered line.
 */
import React from 'react';
import { describe, expect, test } from 'bun:test';
import { testRender } from '@opentui/react/test-utils';
import { ProgressBar } from '../src/components/OnboardingPanel';

const wait = () => new Promise((r) => setTimeout(r, 50));

/** Find the single rendered line that contains `needle`, or '' if none. */
function lineContaining(frame: string, needle: string): string {
  return frame.split('\n').find((l) => l.includes(needle)) ?? '';
}

describe('OnboardingPanel ProgressBar layout', () => {
  test('renders the whole bar on one line (flexDirection row)', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ProgressBar step={2} total={9} />,
      { width: 80, height: 6 },
    );
    await renderOnce();
    await wait();
    const frame = captureCharFrame();

    // The opening bracket, the fill, the closing bracket and the percentage must
    // all live on the SAME line. With the column-default bug they split apart.
    const line = lineContaining(frame, 'Step 2 of 9');
    expect(line).toContain('[');
    expect(line).toContain(']');
    expect(line).toContain('22%');
    expect(line).toContain('='); // filled portion is inline, not on its own row
  });

  test('percentage scales with step', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ProgressBar step={9} total={9} />,
      { width: 80, height: 6 },
    );
    await renderOnce();
    await wait();
    const line = lineContaining(captureCharFrame(), 'Step 9 of 9');
    expect(line).toContain('100%');
  });
});
