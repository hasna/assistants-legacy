import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { resolveSecretsEnvFile, upsertSecretExport } from '../src/lib/secrets-env';

describe('secrets env persistence', () => {
  test('writes onboarding keys into directory-based ~/.secrets layout', () => {
    const home = mkdtempSync(join(tmpdir(), 'assistants-secrets-dir-'));
    try {
      mkdirSync(join(home, '.secrets'));
      upsertSecretExport({
        homeDir: home,
        envName: 'ANTHROPIC_API_KEY',
        value: 'test-key',
      });

      const secretsFile = join(home, '.secrets', 'hasna', 'assistants', 'live.env');
      expect(statSync(secretsFile).isFile()).toBe(true);
      expect(readFileSync(secretsFile, 'utf-8')).toContain('export ANTHROPIC_API_KEY="test-key"');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('updates legacy ~/.secrets file without creating a directory', () => {
    const home = mkdtempSync(join(tmpdir(), 'assistants-secrets-file-'));
    try {
      upsertSecretExport({
        homeDir: home,
        envName: 'ANTHROPIC_API_KEY',
        value: 'first',
      });
      upsertSecretExport({
        homeDir: home,
        envName: 'ANTHROPIC_API_KEY',
        value: 'second',
      });

      const secretsFile = join(home, '.secrets');
      expect(statSync(secretsFile).isFile()).toBe(true);
      expect(readFileSync(secretsFile, 'utf-8')).toBe('export ANTHROPIC_API_KEY="second"\n');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('uses HOME when no explicit home directory is passed', () => {
    const home = mkdtempSync(join(tmpdir(), 'assistants-secrets-home-'));
    const originalHome = process.env.HOME;
    try {
      process.env.HOME = home;
      mkdirSync(join(home, '.secrets'));

      expect(resolveSecretsEnvFile()).toBe(join(home, '.secrets', 'hasna', 'assistants', 'live.env'));
      upsertSecretExport({
        envName: 'ANTHROPIC_API_KEY',
        value: 'home-key',
      });

      const secretsFile = join(home, '.secrets', 'hasna', 'assistants', 'live.env');
      expect(readFileSync(secretsFile, 'utf-8')).toBe('export ANTHROPIC_API_KEY="home-key"\n');
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
      rmSync(home, { recursive: true, force: true });
    }
  });
});
