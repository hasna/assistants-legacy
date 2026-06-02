import { afterEach, describe, expect, mock, test } from 'bun:test';

// Capture the options passed to streamText so we can assert on the onError handler.
let lastStreamTextOptions: any = null;

mock.module('ai', () => ({
  // Minimal stubs for the named imports client.ts pulls from 'ai'.
  jsonSchema: (schema: unknown) => schema,
  stepCountIs: (n: number) => n,
  streamText: (options: any) => {
    lastStreamTextOptions = options;
    return {
      // The agent only consumes fullStream. Emit a provider-style error part,
      // exactly like a 401 authentication failure would surface.
      fullStream: (async function* () {
        yield { type: 'error', error: new Error('AI_APICallError: invalid x-api-key') };
      })(),
    };
  },
}));

// Imported AFTER the mock so client.ts binds to the mocked streamText.
const { AISDKClient } = await import('../src/llm/client');

describe('AISDKClient stream error handling (regression: no raw stack-trace dump)', () => {
  afterEach(() => {
    lastStreamTextOptions = null;
    delete process.env.ASSISTANTS_DEBUG;
    delete process.env.DEBUG;
  });

  test('passes an explicit onError to streamText that does NOT console.error by default', async () => {
    const client = new AISDKClient({ model: 'anthropic:claude-sonnet-4-5', apiKey: 'test-key' });

    // Drain the stream so streamText() is invoked and options are captured.
    const chunks: Array<{ type: string }> = [];
    for await (const chunk of client.chat([{ role: 'user', content: 'hi' }] as any)) {
      chunks.push(chunk as { type: string });
    }

    // The bug: streamText was called without onError, so the AI SDK's default
    // (`console.error(error)`) dumped a raw stack trace into the Ink TUI.
    expect(typeof lastStreamTextOptions?.onError).toBe('function');

    // Invoking our onError without a debug flag must stay silent.
    const errorSpy = mock(() => {});
    const original = console.error;
    console.error = errorSpy as unknown as typeof console.error;
    try {
      delete process.env.ASSISTANTS_DEBUG;
      delete process.env.DEBUG;
      lastStreamTextOptions.onError({ error: new Error('boom') });
    } finally {
      console.error = original;
    }
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test('surfaces the failure as an error chunk instead of crashing', async () => {
    const client = new AISDKClient({ model: 'anthropic:claude-sonnet-4-5', apiKey: 'test-key' });

    const chunks: Array<{ type: string; error?: string }> = [];
    for await (const chunk of client.chat([{ role: 'user', content: 'hi' }] as any)) {
      chunks.push(chunk as { type: string; error?: string });
    }

    const errorChunk = chunks.find((c) => c.type === 'error');
    expect(errorChunk).toBeDefined();
    expect(errorChunk?.error).toContain('invalid x-api-key');
  });

  test('onError DOES log through console.error when a debug flag is set', async () => {
    const client = new AISDKClient({ model: 'anthropic:claude-sonnet-4-5', apiKey: 'test-key' });
    for await (const _chunk of client.chat([{ role: 'user', content: 'hi' }] as any)) {
      // drain to capture options
    }
    expect(typeof lastStreamTextOptions?.onError).toBe('function');

    const errorSpy = mock(() => {});
    const original = console.error;
    console.error = errorSpy as unknown as typeof console.error;
    try {
      process.env.ASSISTANTS_DEBUG = '1';
      lastStreamTextOptions.onError({ error: new Error('boom') });
    } finally {
      console.error = original;
    }
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
