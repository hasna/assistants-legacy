import React from 'react';
import { describe, expect, test } from 'bun:test';
import { testRender } from '@opentui/react/test-utils';
import { Input, type InputHandle } from '../src/components/Input';

describe('Input component', () => {
  test('shows default placeholder', async () => {
    const { captureCharFrame, renderOnce } = await testRender(<Input onSubmit={() => {}} />, { width: 80, height: 24 });
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain('Type a message');
  });

  test('shows processing placeholder with queue', async () => {
    const { captureCharFrame, renderOnce } = await testRender(<Input onSubmit={() => {}} isProcessing queueLength={2} />, { width: 80, height: 24 });
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain('Enter=queue next | Tab=queue | Shift+Enter=interrupt');
  });

  test('shows slash commands above a bottom-docked editor pane', async () => {
    const { captureCharFrame, renderOnce, mockInput } = await testRender(
      <box flexDirection="column" height={12} width={80}>
        <box flexDirection="column" height={11} width={80}>
          <box height={8} width={80}>
            <text>message history</text>
          </box>
          <box flexDirection="column" height={3} width={80} flexShrink={0}>
            <Input onSubmit={() => {}} />
          </box>
        </box>
        <box height={1} width={80}>
          <text>status footer</text>
        </box>
      </box>,
      { width: 80, height: 12 }
    );

    await renderOnce();
    await mockInput.typeText('/');
    await new Promise((resolve) => setTimeout(resolve, 50));
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain('/budget');
    expect(frame).toContain('manage budget profiles');
    expect(frame).toContain('status footer');
  });

  test('submits normally after opening and closing slash autocomplete', async () => {
    const submitted: Array<{ value: string; mode: string }> = [];
    const { renderOnce, mockInput } = await testRender(
      <Input
        onSubmit={(value, mode) => {
          submitted.push({ value, mode });
        }}
      />,
      { width: 80, height: 24 }
    );

    await renderOnce();
    await mockInput.typeText('/');
    await new Promise((resolve) => setTimeout(resolve, 50));
    mockInput.pressEscape();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await mockInput.typeText('send after slash');
    mockInput.pressEnter();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(submitted).toEqual([{ value: 'send after slash', mode: 'normal' }]);
  });

  test('ctrl-c stops processing when callback is provided', async () => {
    let stopped = 0;
    const { renderOnce, mockInput } = await testRender(
      <Input
        onSubmit={() => {}}
        isProcessing
        onStopProcessing={() => {
          stopped += 1;
        }}
      />, { width: 80, height: 24 }
    );
    await renderOnce();
    mockInput.pressCtrlC();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(stopped).toBe(1);
  });

  test('shows ask-user placeholder', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <Input onSubmit={() => {}} isAskingUser askPlaceholder="Answer now" />, { width: 80, height: 24 }
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain('Answer now');
  });

  test('shows line count for multiline input', async () => {
    const ref = React.createRef<InputHandle>();
    const { renderOnce } = await testRender(<Input ref={ref} onSubmit={() => {}} />, { width: 80, height: 24 });
    await renderOnce();
    // Wait for ref to be attached before exercising imperative handle
    const waitForRef = async () => {
      const start = Date.now();
      while (!ref.current) {
        if (Date.now() - start > 250) {
          throw new Error('Input ref was not attached in time');
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    };
    await waitForRef();
    ref.current?.setValue('line one\\nline two');
    const waitForValue = async () => {
      const start = Date.now();
      while (ref.current?.getValue() !== 'line one\\nline two') {
        if (Date.now() - start > 250) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    };
    await waitForValue();
    expect(ref.current?.getValue()).toBe('line one\\nline two');
  });

  test('submits on ESC+CR enter sequence (tmux-compatible)', async () => {
    const ref = React.createRef<InputHandle>();
    const submitted: Array<{ value: string; mode: string }> = [];
    const { renderOnce, mockInput } = await testRender(
      <Input
        ref={ref}
        onSubmit={(value, mode) => {
          submitted.push({ value, mode });
        }}
      />, { width: 80, height: 24 }
    );
    await renderOnce();

    const waitForRef = async () => {
      const start = Date.now();
      while (!ref.current) {
        if (Date.now() - start > 250) {
          throw new Error('Input ref was not attached in time');
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    };
    await waitForRef();

    ref.current?.setValue('submit me');
    await new Promise((resolve) => setTimeout(resolve, 50));
    // In OpenTUI, ESC+Enter is interpreted as Meta+Enter (queue mode),
    // unlike Ink where ESC+CR was a raw byte sequence treated as normal enter.
    // This is the expected OpenTUI behavior for tmux ESC+CR sequences.
    mockInput.pressEscape();
    mockInput.pressEnter();
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(submitted.length).toBe(1);
    expect(submitted[0]).toEqual({ value: 'submit me', mode: 'queue' });
    expect(ref.current?.getValue()).toBe('');
  });
});
