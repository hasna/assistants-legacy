/**
 * Regression tests for OnboardingPanel layout.
 *
 * Bug: layout regressions can split adjacent text nodes across lines. The onboarding progress bar
 * ("Step N of M [====   ] NN%") and the intro feature rows ("> label") were missing
 * flexDirection="row" and rendered broken across multiple lines / invisible.
 *
 * These tests assert the row content stays on a SINGLE rendered line.
 */
import React from 'react';
import { describe, expect, test } from 'bun:test';
import { ProgressBar } from '../src/components/OnboardingPanel';
import { renderInkStatic } from './utils/ink-test-harness';

/** Find the single rendered line that contains `needle`, or '' if none. */
function lineContaining(frame: string, needle: string): string {
  return frame.split('\n').find((l) => l.includes(needle)) ?? '';
}

describe('OnboardingPanel ProgressBar layout', () => {
  test('renders the whole bar on one line (flexDirection row)', () => {
    const frame = renderInkStatic(<ProgressBar step={2} total={9} />, { columns: 80 });

    // The opening bracket, the fill, the closing bracket and the percentage must
    // all live on the SAME line. With the column-default bug they split apart.
    const line = lineContaining(frame, 'Step 2 of 9');
    expect(line).toContain('[');
    expect(line).toContain(']');
    expect(line).toContain('22%');
    expect(line).toContain('='); // filled portion is inline, not on its own row
  });

  test('percentage scales with step', () => {
    const line = lineContaining(renderInkStatic(<ProgressBar step={9} total={9} />, { columns: 80 }), 'Step 9 of 9');
    expect(line).toContain('100%');
  });
});
