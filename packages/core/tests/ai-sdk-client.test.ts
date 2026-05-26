import { describe, expect, test } from 'bun:test';
import type { Message, Tool } from '@hasna/assistants-shared';
import { collectSystemMessages, convertMessages, convertTools, formatAIError, parseProviderModel, normalizeModelId, sanitizeToolParameters, supportsOpenAIReasoningEffort } from '../src/llm/client';

describe('AI SDK client helpers', () => {
  test('requires provider-prefixed model ids', () => {
    expect(parseProviderModel('anthropic:claude-sonnet-4-6')).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    });

    expect(() => parseProviderModel('claude-sonnet-4-6')).toThrow('Invalid AI SDK model id');
    expect(() => parseProviderModel('unknown:model')).toThrow('Unsupported AI SDK provider');
  });

  test('normalizeModelId prefixes bare catalog ids (backward compat with old configs)', () => {
    // A bare known model id gets its provider inferred from the catalog so the
    // strict parser accepts it — this is what makes pre-migration configs work.
    expect(normalizeModelId('claude-sonnet-4-6')).toBe('anthropic:claude-sonnet-4-6');
    expect(parseProviderModel(normalizeModelId('claude-sonnet-4-6'))).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    });
    // Already-prefixed ids pass through unchanged.
    expect(normalizeModelId('anthropic:claude-sonnet-4-6')).toBe('anthropic:claude-sonnet-4-6');
    // Unknown bare ids are left as-is (the strict parser then rejects them).
    expect(normalizeModelId('totally-unknown-model')).toBe('totally-unknown-model');
    // Legacy alias without the dated suffix resolves to the full catalog id.
    expect(normalizeModelId('claude-opus-4-5')).toBe('anthropic:claude-opus-4-5-20251101');
  });

  test('sanitizeToolParameters collapses top-level oneOf/anyOf/allOf (Anthropic rejects them)', () => {
    // Top-level union -> permissive object schema, merging branch properties.
    const unionSchema = {
      oneOf: [
        { type: 'object', properties: { a: { type: 'string' } } },
        { type: 'object', properties: { b: { type: 'number' } } },
      ],
    };
    const sanitized = sanitizeToolParameters(unionSchema);
    expect(sanitized.type).toBe('object');
    expect((sanitized.properties as Record<string, unknown>).a).toBeDefined();
    expect((sanitized.properties as Record<string, unknown>).b).toBeDefined();
    expect('oneOf' in sanitized).toBe(false);

    // Already-valid object schemas pass through unchanged.
    const objSchema = { type: 'object', properties: { x: { type: 'string' } } };
    expect(sanitizeToolParameters(objSchema)).toBe(objSchema);

    // Nested oneOf (inside a property) is preserved — only the top level is fixed.
    const nested = { type: 'object', properties: { u: { oneOf: [{ type: 'string' }] } } };
    expect(sanitizeToolParameters(nested)).toBe(nested);

    // Non-object / missing type becomes an object schema.
    expect(sanitizeToolParameters(undefined).type).toBe('object');
    expect(sanitizeToolParameters({ type: 'string' }).type).toBe('object');
  });

  test('converts app tools to AI SDK tool definitions', () => {
    const tools: Tool[] = [
      {
        name: 'read_file',
        description: 'Read a file',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to read' },
          },
          required: ['path'],
        },
      },
    ];

    const converted = convertTools(tools);
    expect(Object.keys(converted)).toEqual(['read_file']);
    expect(converted.read_file.description).toBe('Read a file');
    expect(converted.read_file.inputSchema).toBeDefined();
  });

  test('wraps executable tools for AI SDK tool execution', async () => {
    const converted = convertTools([
      {
        name: 'read_file',
        description: 'Read a file',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
        },
        execute: async (toolCall) => ({
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          content: `read:${toolCall.input.path}`,
        }),
      },
    ]);

    const output = await converted.read_file.execute?.(
      { path: 'README.md' },
      { toolCallId: 'call-1', messages: [], abortSignal: undefined }
    );

    expect(output).toEqual({
      toolCallId: 'call-1',
      toolName: 'read_file',
      content: 'read:README.md',
    });
  });

  test('converts text, tool calls, tool results, and documents to AI SDK model messages', () => {
    const messages: Message[] = [
      {
        id: 'sys',
        role: 'system',
        content: 'System prompt',
        timestamp: 1,
      },
      {
        id: 'user',
        role: 'user',
        content: 'Analyze this',
        timestamp: 2,
        documents: [
          {
            type: 'image',
            name: 'chart.png',
            mediaType: 'image/png',
            source: { type: 'base64', mediaType: 'image/png', data: 'ZmFrZQ==' },
          },
        ],
      },
      {
        id: 'assistant',
        role: 'assistant',
        content: 'I will inspect it.',
        timestamp: 3,
        toolCalls: [
          { id: 'call-1', name: 'read_file', input: { path: 'chart.png' } },
        ],
      },
      {
        id: 'tool',
        role: 'user',
        content: '',
        timestamp: 4,
        toolResults: [
          {
            toolCallId: 'call-1',
            toolName: 'read_file',
            content: 'ok',
            rawContent: '{"ok":true}',
          },
        ],
      },
    ];

    const converted = convertMessages(messages) as Array<Record<string, unknown>>;
    expect(collectSystemMessages(messages)).toBe('System prompt');
    expect(converted[0].role).toBe('user');
    expect(converted[1].role).toBe('assistant');
    expect(converted[2].role).toBe('tool');
    expect((converted[2].content as Array<Record<string, unknown>>)[0].output).toEqual({
      type: 'json',
      value: { ok: true },
    });
    expect(converted.some((message) => message.role === 'system')).toBe(false);
  });

  test('converts plain and error tool results to AI SDK v6 tool output parts', () => {
    const converted = convertMessages([
      {
        id: 'tool',
        role: 'user',
        content: '',
        timestamp: 1,
        toolResults: [
          {
            toolCallId: 'call-1',
            toolName: 'bash',
            content: 'hello',
          },
          {
            toolCallId: 'call-2',
            toolName: 'bash',
            content: 'denied',
            isError: true,
          },
        ],
      },
    ]) as Array<Record<string, unknown>>;

    expect(converted).toHaveLength(1);
    const content = converted[0].content as Array<Record<string, unknown>>;
    expect(content[0].output).toEqual({ type: 'text', value: 'hello' });
    expect(content[1].output).toEqual({ type: 'error-text', value: 'denied' });
  });

  test('formats structured provider errors without object placeholders', () => {
    expect(formatAIError({ message: 'Quota exceeded', code: 'insufficient_quota' }))
      .toBe('Quota exceeded (insufficient_quota)');
    expect(formatAIError({ error: { message: 'API key invalid', code: 400 } }))
      .toBe('API key invalid (400)');
    expect(formatAIError({ reason: 'unknown' })).toBe('{"reason":"unknown"}');
  });

  test('only marks reasoning-capable OpenAI models for reasoning effort options', () => {
    expect(supportsOpenAIReasoningEffort('o3')).toBe(true);
    expect(supportsOpenAIReasoningEffort('o4-mini')).toBe(true);
    expect(supportsOpenAIReasoningEffort('gpt-5')).toBe(true);
    expect(supportsOpenAIReasoningEffort('gpt-5-mini')).toBe(true);
    expect(supportsOpenAIReasoningEffort('gpt-4.1-mini')).toBe(false);
    expect(supportsOpenAIReasoningEffort('gpt-4o')).toBe(false);
  });
});
