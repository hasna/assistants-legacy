import React, { useState } from 'react';
import { describe, expect, test } from 'bun:test';
import { Text, TextInput } from '../src/ui/ink';
import { renderInk } from './utils/ink-test-harness';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ControlledTextInput({
  initialValue = '',
  cursorOffset,
  onSubmit,
  onCancel,
  onValidationFailure,
  validate,
  validationMode,
}: {
  initialValue?: string;
  cursorOffset?: number;
  onSubmit?: (value: string) => void;
  onCancel?: () => void;
  onValidationFailure?: (message: string, value: string) => void;
  validate?: (value: string) => string | null;
  validationMode?: 'always' | 'on-submit';
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <TextInput
      value={value}
      onChange={setValue}
      onSubmit={onSubmit}
      onCancel={onCancel}
      onValidationFailure={onValidationFailure}
      validate={validate}
      validationMode={validationMode}
      cursorOffset={cursorOffset}
      columns={20}
      cursorChar="|"
      placeholder="Ask me"
    />
  );
}

describe('Ink TextInput component', () => {
  test('renders placeholder with a visible cursor when empty', async () => {
    const harness = await renderInk(<ControlledTextInput />);

    try {
      const frame = await harness.waitForText('|Ask me');
      expect(frame).toContain('|Ask me');
    } finally {
      await harness.cleanup();
    }
  });

  test('updates controlled value and submits on enter', async () => {
    const submitted: string[] = [];
    const harness = await renderInk(<ControlledTextInput onSubmit={(value) => submitted.push(value)} />);

    try {
      harness.typeText('hello');
      await harness.waitForText('hello|');
      harness.pressEnter();
      await harness.renderOnce();
      expect(submitted).toEqual(['hello']);
    } finally {
      await harness.cleanup();
    }
  });

  test('blocks submit and renders validation failures', async () => {
    const submitted: string[] = [];
    const failures: string[] = [];
    const harness = await renderInk(
      <ControlledTextInput
        onSubmit={(value) => submitted.push(value)}
        onValidationFailure={(message) => failures.push(message)}
        validate={(value) => (value.length >= 3 ? null : 'Too short')}
        validationMode="on-submit"
        cursorChar="|"
      />,
    );

    try {
      harness.typeText('hi');
      await harness.waitForText('hi|');
      harness.pressEnter();
      await harness.waitForText('Too short');
      expect(submitted).toEqual([]);
      expect(failures).toEqual(['Too short']);
    } finally {
      await harness.cleanup();
    }
  });

  test('respects controlled cursor offset', async () => {
    const harness = await renderInk(<ControlledTextInput initialValue="abcd" cursorOffset={2} />);

    try {
      const frame = await harness.waitForText('ab|cd');
      expect(frame).toContain('ab|cd');
    } finally {
      await harness.cleanup();
    }
  });

  test('renders argument hint for slash command input', async () => {
    const harness = await renderInk(
      <TextInput
        value="/commit"
        onChange={() => {}}
        argumentHint="[message]"
        columns={20}
        cursorChar="|"
      />,
    );

    try {
      const frame = await harness.waitForText(' [message]');
      expect(frame).toContain('/commit|');
      expect(frame).toContain(' [message]');
    } finally {
      await harness.cleanup();
    }
  });

  test('calls cancel on escape when empty', async () => {
    let canceled = 0;
    const harness = await renderInk(<ControlledTextInput onCancel={() => { canceled += 1; }} />);

    try {
      harness.pressEscape();
      await delay(30);
      await harness.renderOnce();
      expect(canceled).toBe(1);
    } finally {
      await harness.cleanup();
    }
  });
});

test('Ink TextInput component supports custom placeholder elements', async () => {
  const harness = await renderInk(
    <TextInput value="" onChange={() => {}} placeholderElement={<Text>Custom empty state</Text>} />,
  );

  try {
    const frame = await harness.waitForText('Custom empty state');
    expect(frame).toContain('Custom empty state');
  } finally {
    await harness.cleanup();
  }
});
