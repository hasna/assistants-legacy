import React from 'react';
import { describe, expect, test } from 'bun:test';
import { Select, type SelectOption } from '../src/ui/ink';
import { renderInk } from './utils/ink-test-harness';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const OPTIONS: SelectOption<string>[] = [
  { value: 'alpha', label: 'Alpha', description: 'First option' },
  { value: 'beta', label: 'Beta', description: 'Disabled option', disabled: true },
  { value: 'gamma', label: 'Gamma', description: 'Third option' },
];

describe('Ink Select component', () => {
  test('renders options with descriptions and stable focus marker', async () => {
    const harness = await renderInk(<Select options={OPTIONS} visibleOptionCount={3} />);

    try {
      const frame = await harness.waitForText('Alpha');
      expect(frame).toContain('> ');
      expect(frame).toContain('First option');
      expect(frame).toContain('Beta');
      expect(frame).toContain('Disabled option');
    } finally {
      await harness.cleanup();
    }
  });

  test('arrow navigation skips disabled options and enter selects', async () => {
    const selected: string[] = [];
    const focused: string[] = [];
    const harness = await renderInk(
      <Select
        options={OPTIONS}
        visibleOptionCount={3}
        onSelect={(value) => selected.push(value)}
        onFocus={(value) => focused.push(value)}
      />,
    );

    try {
      harness.pressDown();
      await harness.waitForText('Gamma');
      harness.pressEnter();
      await harness.renderOnce();
      expect(selected).toEqual(['gamma']);
      expect(focused).toContain('gamma');
    } finally {
      await harness.cleanup();
    }
  });

  test('escape cancels selection', async () => {
    let canceled = 0;
    const harness = await renderInk(<Select options={OPTIONS} onCancel={() => { canceled += 1; }} />);

    try {
      harness.pressEscape();
      await delay(30);
      await harness.renderOnce();
      expect(canceled).toBe(1);
    } finally {
      await harness.cleanup();
    }
  });

  test('filterText narrows options and numeric selection uses the visible list', async () => {
    const selected: string[] = [];
    const harness = await renderInk(
      <Select options={OPTIONS} filterText="gam" onSelect={(value) => selected.push(value)} />,
    );

    try {
      const frame = await harness.waitForText('Gamma');
      expect(frame).not.toContain('Alpha');
      harness.pressKey('1');
      await harness.renderOnce();
      expect(selected).toEqual(['gamma']);
    } finally {
      await harness.cleanup();
    }
  });

  test('inline input options collect and submit text', async () => {
    const changes: string[] = [];
    const submissions: string[] = [];
    const options: SelectOption<string>[] = [
      {
        type: 'input',
        value: 'custom',
        label: 'Custom',
        initialValue: 'seed',
        onInputChange: (value) => changes.push(value),
        onInputSubmit: (value) => submissions.push(value),
      },
    ];
    const harness = await renderInk(<Select options={options} />);

    try {
      harness.pressEnter();
      await harness.waitForText('seed|');
      harness.typeText('x');
      await harness.waitForText('seedx|');
      harness.pressEnter();
      await harness.renderOnce();
      expect(changes).toContain('seedx');
      expect(submissions).toEqual(['seedx']);
    } finally {
      await harness.cleanup();
    }
  });
});

