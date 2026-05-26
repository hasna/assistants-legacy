import { describe, expect, test, spyOn, beforeEach, afterEach } from 'bun:test';
import type { LLMConfig } from '@hasna/assistants-shared';
import { createLLMClient, parseProviderModel } from '../src/llm/client';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('createLLMClient', () => {
  let consoleWarnSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('provider-prefixed models', () => {
    test('builds a client for each supported provider and reports the configured model', async () => {
      const cases: Array<[string, string]> = [
        ['anthropic', 'anthropic:claude-opus-4-5-20251101'],
        ['openai', 'openai:gpt-4o'],
        ['google', 'google:gemini-2.5-pro'],
        ['xai', 'xai:grok-4'],
        ['mistral', 'mistral:mistral-large-latest'],
      ];
      for (const [, modelId] of cases) {
        // An explicit apiKey avoids any dependence on the environment.
        const client = await createLLMClient({ model: modelId, apiKey: 'test-key' } as LLMConfig);
        expect(client.getModel()).toBe(modelId);
      }
    });

    test('preserves colons in the model portion of the id', async () => {
      const client = await createLLMClient({ model: 'openai:ft:gpt-4o:custom', apiKey: 'k' } as LLMConfig);
      expect(client.getModel()).toBe('openai:ft:gpt-4o:custom');
    });

    test('exposes the effort level (defaults to medium)', async () => {
      const client = await createLLMClient({ model: 'anthropic:claude-opus-4-5-20251101', apiKey: 'k' } as LLMConfig);
      expect(client.getEffortLevel()).toBe('medium');
      client.setEffortLevel('high');
      expect(client.getEffortLevel()).toBe('high');
    });
  });

  describe('error handling', () => {
    test('throws when an unknown model id has no provider prefix', async () => {
      // Unknown bare ids can't be inferred from the catalog, so they still fail.
      await expect(
        createLLMClient({ model: 'no-such-bare-model', apiKey: 'k' } as LLMConfig)
      ).rejects.toThrow(/provider-prefixed/);
    });

    test('accepts a known bare model id by inferring its provider (backward compat)', async () => {
      // Older configs store bare ids like "claude-opus-4-5-20251101"; these are
      // normalized to "anthropic:..." so existing setups keep working.
      const client = await createLLMClient({ model: 'claude-opus-4-5-20251101', apiKey: 'k' } as LLMConfig);
      expect(client.getModel()).toBe('anthropic:claude-opus-4-5-20251101');
    });

    test('throws for an unsupported provider prefix', async () => {
      await expect(
        createLLMClient({ model: 'unsupported:some-model', apiKey: 'k' } as LLMConfig)
      ).rejects.toThrow(/Unsupported AI SDK provider/);
    });

    test('throws a helpful error when no API key is available', async () => {
      // Key resolution checks env vars and then ~/.secrets, so isolate both:
      // clear the env var and point HOME at a dir with no .secrets file.
      const savedKey = process.env.MISTRAL_API_KEY;
      const savedHome = process.env.HOME;
      delete process.env.MISTRAL_API_KEY;
      process.env.HOME = mkdtempSync(join(tmpdir(), 'llm-nokey-'));
      try {
        await expect(
          createLLMClient({ model: 'mistral:mistral-large-latest' } as LLMConfig)
        ).rejects.toThrow(/MISTRAL_API_KEY not found/);
      } finally {
        if (savedKey === undefined) delete process.env.MISTRAL_API_KEY;
        else process.env.MISTRAL_API_KEY = savedKey;
        if (savedHome === undefined) delete process.env.HOME;
        else process.env.HOME = savedHome;
      }
    });
  });
});

describe('parseProviderModel', () => {
  test('splits a provider-prefixed model id', () => {
    expect(parseProviderModel('anthropic:claude-sonnet-4-6')).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    });
  });

  test('keeps colons that appear inside the model portion', () => {
    expect(parseProviderModel('openai:gpt-4o:2024')).toEqual({
      provider: 'openai',
      model: 'gpt-4o:2024',
    });
  });

  test('throws when no provider prefix is present', () => {
    expect(() => parseProviderModel('claude-sonnet-4-6')).toThrow(/provider-prefixed/);
  });

  test('throws when the prefix is empty or the model is empty', () => {
    expect(() => parseProviderModel(':model')).toThrow(/provider-prefixed/);
    expect(() => parseProviderModel('anthropic:')).toThrow(/provider-prefixed/);
  });

  test('throws for an unsupported provider', () => {
    expect(() => parseProviderModel('madeup:some-model')).toThrow(/Unsupported AI SDK provider/);
  });
});
