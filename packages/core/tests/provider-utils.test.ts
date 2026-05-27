import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  loadApiKeyFromSecrets,
  resolveApiKey,
  resolveBaseUrl,
} from '../src/llm/provider-utils';

const ENV_KEYS = ['HOME', 'USERPROFILE', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY'];

describe('provider-utils', () => {
  let tmpHome: string;
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    tmpHome = mkdtempSync(join(tmpdir(), 'provutils-'));
    process.env.HOME = tmpHome;
    delete process.env.USERPROFILE;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.XAI_API_KEY;
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    rmSync(tmpHome, { recursive: true, force: true });
  });

  function writeSecrets(content: string) {
    writeFileSync(join(tmpHome, '.secrets'), content, 'utf-8');
  }

  describe('loadApiKeyFromSecrets', () => {
    test('returns undefined when secrets file is absent', () => {
      expect(loadApiKeyFromSecrets('ANTHROPIC_API_KEY')).toBeUndefined();
    });

    test('extracts an unquoted export value', () => {
      writeSecrets('export ANTHROPIC_API_KEY=sk-plain-123\n');
      expect(loadApiKeyFromSecrets('ANTHROPIC_API_KEY')).toBe('sk-plain-123');
    });

    test('extracts a double-quoted export value', () => {
      writeSecrets('export OPENAI_API_KEY="sk-quoted-456"\n');
      expect(loadApiKeyFromSecrets('OPENAI_API_KEY')).toBe('sk-quoted-456');
    });

    test('extracts a single-quoted export value', () => {
      writeSecrets("export XAI_API_KEY='xai-789'\n");
      expect(loadApiKeyFromSecrets('XAI_API_KEY')).toBe('xai-789');
    });

    test('returns undefined when the key is not present', () => {
      writeSecrets('export SOMETHING_ELSE=value\n');
      expect(loadApiKeyFromSecrets('ANTHROPIC_API_KEY')).toBeUndefined();
    });

    test('finds the right key among many lines', () => {
      writeSecrets(
        [
          'export OPENAI_API_KEY=openai-val',
          'export ANTHROPIC_API_KEY=anthropic-val',
          'export XAI_API_KEY=xai-val',
        ].join('\n')
      );
      expect(loadApiKeyFromSecrets('ANTHROPIC_API_KEY')).toBe('anthropic-val');
    });

    test('reads directory-based Hasna secrets layout', () => {
      const secretsDir = join(tmpHome, '.secrets', 'hasna', 'assistants');
      mkdirSync(secretsDir, { recursive: true });
      writeFileSync(join(secretsDir, 'live.env'), 'export ANTHROPIC_API_KEY=directory-secret\n', 'utf-8');
      expect(loadApiKeyFromSecrets('ANTHROPIC_API_KEY')).toBe('directory-secret');
    });
  });

  describe('resolveApiKey', () => {
    test('override always wins', () => {
      process.env.ANTHROPIC_API_KEY = 'env-key';
      expect(resolveApiKey('anthropic', 'override-key')).toBe('override-key');
    });

    test('reads from process.env when no override', () => {
      process.env.ANTHROPIC_API_KEY = 'env-key';
      expect(resolveApiKey('anthropic')).toBe('env-key');
    });

    test('falls back to secrets file when env is unset', () => {
      writeSecrets('export ANTHROPIC_API_KEY=secret-file-key\n');
      expect(resolveApiKey('anthropic')).toBe('secret-file-key');
    });

    test('env var takes precedence over secrets file', () => {
      process.env.OPENAI_API_KEY = 'env-wins';
      writeSecrets('export OPENAI_API_KEY=file-loses\n');
      expect(resolveApiKey('openai')).toBe('env-wins');
    });

    test('returns undefined for an unknown provider', () => {
      expect(resolveApiKey('does-not-exist' as any)).toBeUndefined();
    });
  });

  describe('resolveBaseUrl', () => {
    test('override always wins', () => {
      expect(resolveBaseUrl('anthropic', 'https://proxy.local')).toBe('https://proxy.local');
    });

    test('returns the provider default base url', () => {
      expect(resolveBaseUrl('anthropic')).toBe('https://api.anthropic.com/v1');
      expect(resolveBaseUrl('openai')).toBe('https://api.openai.com/v1');
    });

    test('returns undefined for an unknown provider with no override', () => {
      expect(resolveBaseUrl('nope' as any)).toBeUndefined();
    });
  });
});
