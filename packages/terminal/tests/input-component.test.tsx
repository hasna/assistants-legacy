import React from 'react';
import { describe, expect, test } from 'bun:test';
import { Box, Text } from '../src/ui/ink';
import { Input, normalizePromptInputKey, type InputHandle } from '../src/components/Input';
import { renderInk } from './utils/ink-test-harness';
import type { CommandHistory } from '@hasna/assistants-core';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForRef(ref: React.RefObject<InputHandle | null>): Promise<InputHandle> {
  const start = Date.now();
  while (!ref.current) {
    if (Date.now() - start > 250) {
      throw new Error('Input ref was not attached in time');
    }
    await wait(5);
  }
  return ref.current;
}

async function waitForValue(ref: React.RefObject<InputHandle | null>, expected: string): Promise<void> {
  const start = Date.now();
  while (ref.current?.getValue() !== expected) {
    if (Date.now() - start > 500) {
      throw new Error(`Expected input value ${JSON.stringify(expected)}, got ${JSON.stringify(ref.current?.getValue())}`);
    }
    await wait(5);
  }
}

function createFakeHistory(entries: string[]): CommandHistory {
  let index = -1;
  let currentInput = '';
  const values = [...entries];

  return {
    async load() {},
    async add(command: string) {
      const trimmed = command.trim();
      if (trimmed) values.push(trimmed);
      index = -1;
    },
    resetIndex(input = '') {
      index = -1;
      currentInput = input;
    },
    previous() {
      if (values.length === 0) return null;
      const nextIndex = index === -1 ? values.length - 1 : Math.max(0, index - 1);
      if (nextIndex === index && index === 0) return null;
      index = nextIndex;
      return values[index];
    },
    next() {
      if (index === -1) return null;
      const nextIndex = index + 1;
      if (nextIndex >= values.length) {
        index = -1;
        return currentInput;
      }
      index = nextIndex;
      return values[index];
    },
    isNavigating() {
      return index !== -1;
    },
    get length() {
      return values.length;
    },
    getAll() {
      return [...values];
    },
  } as unknown as CommandHistory;
}

describe('Input component', () => {
  test('normalizes raw terminal control bytes used by pty input', () => {
    expect(normalizePromptInputKey('\r', {}).return).toBe(true);
    expect(normalizePromptInputKey('\n', {}).return).toBe(true);
    expect(normalizePromptInputKey('\r\n', {}).return).toBe(true);
    expect(normalizePromptInputKey('m', { ctrl: true }).return).toBe(true);
    expect(normalizePromptInputKey('\x1b', {}).escape).toBe(true);
    expect(normalizePromptInputKey('\t', {}).tab).toBe(true);
  });

  test('shows default placeholder', async () => {
    const harness = await renderInk(<Input onSubmit={() => {}} />, { width: 80, height: 24 });
    try {
      const frame = await harness.waitForText('Type a message');
      expect(frame).toContain('Type a message');
    } finally {
      await harness.cleanup();
    }
  });

  test('shows processing placeholder with queue', async () => {
    const harness = await renderInk(<Input onSubmit={() => {}} isProcessing queueLength={2} />, { width: 80, height: 24 });
    try {
      const frame = await harness.waitForText('Enter=queue next | Tab=queue | Shift+Enter=interrupt');
      expect(frame).toContain('Enter=queue next | Tab=queue | Shift+Enter=interrupt');
    } finally {
      await harness.cleanup();
    }
  });

  test('shows slash commands above a bottom-docked editor pane', async () => {
    const harness = await renderInk(
      <Box flexDirection="column" height={14} width={80}>
        <Box flexDirection="column" height={13} width={80}>
          <Box height={3} width={80}>
            <Text>message history</Text>
          </Box>
          <Box flexDirection="column" height={10} width={80} flexShrink={0}>
            <Input onSubmit={() => {}} />
          </Box>
        </Box>
        <Box height={1} width={80}>
          <Text>status footer</Text>
        </Box>
      </Box>,
      { width: 80, height: 14 },
    );

    try {
      harness.typeText('/');
      const frame = await harness.waitForText('/budget');
      expect(frame).toContain('/budget');
      expect(frame).toContain('manage budget profiles');
      expect(frame).toContain('status footer');
    } finally {
      await harness.cleanup();
    }
  });

  test('keeps bottom editor visible when transcript overflows', async () => {
    const history = Array.from({ length: 80 }, (_, i) => `history line ${i + 1}`);
    const harness = await renderInk(
      <Box flexDirection="column" height={18} width={80}>
        <Box flexDirection="column" height={17} width={80}>
          <Box flexDirection="column" height={14} width={80} overflow="hidden">
            {history.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
          </Box>
          <Box flexDirection="column" height={3} width={80} flexShrink={0}>
            <Input onSubmit={() => {}} />
          </Box>
        </Box>
        <Box height={1} width={80}>
          <Text>status footer</Text>
        </Box>
      </Box>,
      { width: 80, height: 18 },
    );

    try {
      let frame = await harness.waitForText('Type a message');
      expect(frame).toContain('status footer');

      harness.typeText('visible text');
      frame = await harness.waitForText('visible text');
      expect(frame).toContain('visible text');
    } finally {
      await harness.cleanup();
    }
  });

  test('submits normally after opening and closing slash autocomplete', async () => {
    const ref = React.createRef<InputHandle>();
    const submitted: Array<{ value: string; mode: string }> = [];
    const harness = await renderInk(
      <Input
        ref={ref}
        onSubmit={(value, mode) => {
          submitted.push({ value, mode });
        }}
      />,
      { width: 80, height: 24 },
    );

    try {
      harness.typeText('/');
      await harness.waitForText('/budget');
      harness.pressEscape();
      await wait(50);
      harness.typeText('send after slash');
      await waitForValue(ref, 'send after slash');
      harness.pressEnter();
      await wait(50);

      expect(submitted).toEqual([{ value: 'send after slash', mode: 'normal' }]);
    } finally {
      await harness.cleanup();
    }
  });

  test('types a normal prompt, submits it, and clears the editor', async () => {
    const ref = React.createRef<InputHandle>();
    const submitted: Array<{ value: string; mode: string }> = [];
    const harness = await renderInk(
      <Input
        ref={ref}
        history={createFakeHistory([])}
        onSubmit={(value, mode) => {
          submitted.push({ value, mode });
        }}
      />,
      { width: 80, height: 24 },
    );

    try {
      await waitForRef(ref);
      harness.typeText('hello from the prompt');
      await waitForValue(ref, 'hello from the prompt');
      harness.pressEnter();
      await waitForValue(ref, '');

      expect(submitted).toEqual([{ value: 'hello from the prompt', mode: 'normal' }]);
    } finally {
      await harness.cleanup();
    }
  });

  test('does not submit blank input unless blank ask-user answers are allowed', async () => {
    const submitted: Array<{ value: string; mode: string }> = [];
    const harness = await renderInk(
      <Input
        history={createFakeHistory([])}
        onSubmit={(value, mode) => {
          submitted.push({ value, mode });
        }}
      />,
      { width: 80, height: 24 },
    );

    try {
      harness.pressEnter();
      await wait(50);
      expect(submitted).toEqual([]);
    } finally {
      await harness.cleanup();
    }
  });

  test('queues processing input with tab and submits processing enter as inline follow-up', async () => {
    const ref = React.createRef<InputHandle>();
    const submitted: Array<{ value: string; mode: string }> = [];
    const harness = await renderInk(
      <Input
        ref={ref}
        history={createFakeHistory([])}
        isProcessing
        onSubmit={(value, mode) => {
          submitted.push({ value, mode });
        }}
      />,
      { width: 80, height: 24 },
    );

    try {
      const input = await waitForRef(ref);

      input.setValue('queued follow-up');
      await waitForValue(ref, 'queued follow-up');
      harness.pressTab();
      await waitForValue(ref, '');

      input.setValue('inline follow-up');
      await waitForValue(ref, 'inline follow-up');
      harness.pressEnter();
      await waitForValue(ref, '');

      expect(submitted).toEqual([
        { value: 'queued follow-up', mode: 'queue' },
        { value: 'inline follow-up', mode: 'inline' },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  test('preserves multiline pasted content through submit', async () => {
    const ref = React.createRef<InputHandle>();
    const submitted: Array<{ value: string; mode: string }> = [];
    const harness = await renderInk(
      <Input
        ref={ref}
        history={createFakeHistory([])}
        onSubmit={(value, mode) => {
          submitted.push({ value, mode });
        }}
        pasteConfig={{ mode: 'inline' }}
      />,
      { width: 80, height: 24 },
    );

    try {
      await waitForRef(ref);
      harness.pasteText('first line\nsecond line');
      await waitForValue(ref, 'first line\nsecond line');
      harness.pressEnter();
      await waitForValue(ref, '');

      expect(submitted).toEqual([{ value: 'first line\nsecond line', mode: 'normal' }]);
    } finally {
      await harness.cleanup();
    }
  });

  test('large paste placeholder submits the original content', async () => {
    const submitted: Array<{ value: string; mode: string }> = [];
    const largePaste = Array.from({ length: 6 }, (_, i) => `line ${i + 1}`).join('\n');
    const harness = await renderInk(
      <Input
        history={createFakeHistory([])}
        pasteConfig={{ mode: 'placeholder', thresholds: { lines: 3 } }}
        onSubmit={(value, mode) => {
          submitted.push({ value, mode });
        }}
      />,
      { width: 80, height: 24 },
    );

    try {
      harness.pasteText(largePaste);
      const frame = await harness.waitForText('Pasted');
      expect(frame).toContain('Enter to send');

      harness.pressEnter();
      await wait(50);
      expect(submitted).toEqual([{ value: largePaste, mode: 'normal' }]);
    } finally {
      await harness.cleanup();
    }
  });

  test('navigates command history and restores draft input', async () => {
    const ref = React.createRef<InputHandle>();
    const harness = await renderInk(
      <Input
        ref={ref}
        history={createFakeHistory(['first command', 'second command'])}
        onSubmit={() => {}}
      />,
      { width: 80, height: 24 },
    );

    try {
      const input = await waitForRef(ref);
      input.setValue('draft text');
      await waitForValue(ref, 'draft text');

      harness.pressUp();
      await waitForValue(ref, 'second command');
      harness.pressUp();
      await waitForValue(ref, 'first command');
      harness.pressDown();
      await waitForValue(ref, 'second command');
      harness.pressDown();
      await waitForValue(ref, 'draft text');
    } finally {
      await harness.cleanup();
    }
  });

  test('ctrl-c stops processing when callback is provided', async () => {
    let stopped = 0;
    const harness = await renderInk(
      <Input
        onSubmit={() => {}}
        isProcessing
        onStopProcessing={() => {
          stopped += 1;
        }}
      />,
      { width: 80, height: 24 },
    );

    try {
      harness.pressKey('c', { ctrl: true });
      await wait(10);
      expect(stopped).toBe(1);
    } finally {
      await harness.cleanup();
    }
  });

  test('shows ask-user placeholder', async () => {
    const harness = await renderInk(
      <Input onSubmit={() => {}} isAskingUser askPlaceholder="Answer now" />,
      { width: 80, height: 24 },
    );

    try {
      const frame = await harness.waitForText('Answer now');
      expect(frame).toContain('Answer now');
    } finally {
      await harness.cleanup();
    }
  });

  test('shows line count for multiline input', async () => {
    const ref = React.createRef<InputHandle>();
    const harness = await renderInk(<Input ref={ref} onSubmit={() => {}} />, { width: 80, height: 24 });

    try {
      await waitForRef(ref);
      ref.current?.setValue('line one\nline two');
      await waitForValue(ref, 'line one\nline two');
      const frame = await harness.waitForText('(2 lines)');
      expect(frame).toContain('(2 lines)');
    } finally {
      await harness.cleanup();
    }
  });
});
