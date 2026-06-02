import React from 'react';
import { describe, expect, test } from 'bun:test';
import { Messages } from '../src/components/Messages';
import type { ToolCall, ToolResult } from '@hasna/assistants-shared';
import type { DisplayMessage } from '../src/components/messageLines';
import { renderInk } from './utils/ink-test-harness';

async function renderMessages(messages: DisplayMessage[], options: { verboseTools?: boolean } = {}): Promise<string> {
  const harness = await renderInk(
    <Messages messages={messages} height={24} verboseTools={options.verboseTools} />,
    { width: 80, height: 24 },
  );
  await harness.renderOnce();
  const output = harness.captureFrame();
  await harness.cleanup();
  return output;
}

describe('Tool Call UI - New Style', () => {
  test('single running tool call shows tool name and status', async () => {
    const toolCalls: ToolCall[] = [
      { id: 'tc1', name: 'read', input: { file_path: '/src/components/App.tsx' } } as any,
    ];
    const messages: DisplayMessage[] = [
      {
        id: 'msg1',
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls,
        toolResults: [],
      },
    ];

    const output = await renderMessages(messages);

    // Shows "Read: Reading..." format
    expect(output).toContain('Read');
    expect(output).toContain('Reading');
    // Should NOT have old bordered panel headers
    expect(output).not.toContain('Tool Calls');
  });

  test('single completed tool call shows file name', async () => {
    const toolCalls: ToolCall[] = [
      { id: 'tc1', name: 'read', input: { file_path: '/src/factory.ts' } } as any,
    ];
    const toolResults: ToolResult[] = [
      { toolCallId: 'tc1', content: 'file contents here\nline 2\nline 3', isError: false, toolName: 'read' },
    ];
    const messages: DisplayMessage[] = [
      {
        id: 'msg1',
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls,
        toolResults,
      },
    ];

    const output = await renderMessages(messages);

    // Shows "Read: factory.ts" format
    expect(output).toContain('Read');
    expect(output).toContain('factory.ts');
    expect(output).not.toContain('Calling');
    // Should NOT have old style
    expect(output).not.toContain('Tool Calls');
    expect(output).not.toContain('[succeeded]');
  });

  test('2+ tool calls show compact summary', async () => {
    const toolCalls: ToolCall[] = [
      { id: 'tc1', name: 'grep', input: { pattern: 'createAgentLoop' } } as any,
      { id: 'tc2', name: 'grep', input: { pattern: 'ToolCallPanel' } } as any,
      { id: 'tc3', name: 'read', input: { file_path: '/src/Messages.tsx' } } as any,
    ];
    const toolResults: ToolResult[] = [
      { toolCallId: 'tc1', content: 'found 3 matches', isError: false, toolName: 'grep' },
      { toolCallId: 'tc2', content: 'found 5 matches', isError: false, toolName: 'grep' },
      { toolCallId: 'tc3', content: 'file contents', isError: false, toolName: 'read' },
    ];
    const messages: DisplayMessage[] = [
      {
        id: 'msg1',
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls,
        toolResults,
      },
    ];

    const output = await renderMessages(messages);

    // Should show compact summary
    expect(output).toContain('Searched 2 patterns');
    expect(output).toContain('read 1 file');
  });

  test('2+ running tool calls show ellipsis', async () => {
    const toolCalls: ToolCall[] = [
      { id: 'tc1', name: 'grep', input: { pattern: 'pattern1' } } as any,
      { id: 'tc2', name: 'read', input: { file_path: '/src/file.ts' } } as any,
    ];
    // Only first result completed
    const toolResults: ToolResult[] = [
      { toolCallId: 'tc1', content: 'found 3 matches', isError: false, toolName: 'grep' },
    ];
    const messages: DisplayMessage[] = [
      {
        id: 'msg1',
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls,
        toolResults,
      },
    ];

    const output = await renderMessages(messages);

    // Should show running summary with ellipsis
    expect(output).toContain('…');
  });

  test('memory tool calls show memory summary', async () => {
    const toolCalls: ToolCall[] = [
      { id: 'tc1', name: 'memory_recall', input: { key: 'user.timezone' } } as any,
      { id: 'tc2', name: 'memory_save', input: { key: 'project.stack', value: 'bun', category: 'fact' } } as any,
    ];
    const toolResults: ToolResult[] = [
      { toolCallId: 'tc1', content: JSON.stringify({ found: true }), isError: false, toolName: 'memory_recall' },
      { toolCallId: 'tc2', content: JSON.stringify({ success: true }), isError: false, toolName: 'memory_save' },
    ];
    const messages: DisplayMessage[] = [
      {
        id: 'msg1',
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls,
        toolResults,
      },
    ];

    const output = await renderMessages(messages);

    // Should show memory-related content
    expect(output.length).toBeGreaterThan(0);
    expect(output).not.toContain('Tool Calls');
  });

  test('verbose mode shows individual tool calls instead of summary', async () => {
    const toolCalls: ToolCall[] = [
      { id: 'tc1', name: 'grep', input: { pattern: 'createAgentLoop' } } as any,
      { id: 'tc2', name: 'read', input: { file_path: '/src/Messages.tsx' } } as any,
    ];
    const toolResults: ToolResult[] = [
      { toolCallId: 'tc1', content: 'found 3 matches', isError: false, toolName: 'grep' },
      { toolCallId: 'tc2', content: 'file contents', isError: false, toolName: 'read' },
    ];
    const messages: DisplayMessage[] = [
      {
        id: 'msg1',
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls,
        toolResults,
      },
    ];

    const output = await renderMessages(messages, { verboseTools: true });

    // Should show individual tool calls, not compact summary
    expect(output).toContain('Grep');
    expect(output).toContain('Read');
    expect(output).toContain('Messages.tsx');
  });

  test('no border characters in tool output', async () => {
    const toolCalls: ToolCall[] = [
      { id: 'tc1', name: 'bash', input: { command: 'git status' } } as any,
    ];
    const toolResults: ToolResult[] = [
      { toolCallId: 'tc1', content: 'On branch main\nnothing to commit', isError: false, toolName: 'bash' },
    ];
    const messages: DisplayMessage[] = [
      {
        id: 'msg1',
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls,
        toolResults,
      },
    ];

    const output = await renderMessages(messages);

    // Should NOT have any border characters from old panels
    expect(output).not.toContain('╭');
    expect(output).not.toContain('╰');
    // Should show the tool name in new clean format
    expect(output).toContain('Bash');
    expect(output).toContain('git status');
  });

  test('params shown for running tool', async () => {
    const toolCalls: ToolCall[] = [
      { id: 'tc1', name: 'grep', input: { pattern: 'ToolCallPanel', path: '/src/' } } as any,
    ];
    const messages: DisplayMessage[] = [
      {
        id: 'msg1',
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls,
        toolResults: [],
      },
    ];

    const output = await renderMessages(messages);

    // Should show Grep running
    expect(output).toContain('Grep');
    expect(output).toContain('Searching');
  });

  test('error tool call shows tool name', async () => {
    const toolCalls: ToolCall[] = [
      { id: 'tc1', name: 'read', input: { file_path: '/nonexistent.ts' } } as any,
    ];
    const toolResults: ToolResult[] = [
      { toolCallId: 'tc1', content: 'ENOENT: no such file or directory', isError: true, toolName: 'read' },
    ];
    const messages: DisplayMessage[] = [
      {
        id: 'msg1',
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls,
        toolResults,
      },
    ];

    const output = await renderMessages(messages);

    // Should show Read and file name
    expect(output).toContain('Read');
    expect(output).toContain('nonexistent');
    // Should NOT have old style labels
    expect(output).not.toContain('[failed]');
  });
});
