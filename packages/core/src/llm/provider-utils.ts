import { existsSync, readFileSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { getProviderInfo, type LLMProvider } from '@hasna/assistants-shared';

function getSecretsPath(): string {
  const envHome = process.env.HOME || process.env.USERPROFILE;
  const homeDir = envHome && envHome.trim().length > 0 ? envHome : homedir();
  return join(homeDir, '.secrets');
}

function getSecretsFiles(): string[] {
  const secretsPath = getSecretsPath();
  if (!existsSync(secretsPath)) return [];
  try {
    if (statSync(secretsPath).isDirectory()) {
      return [join(secretsPath, 'hasna', 'assistants', 'live.env')];
    }
    return [secretsPath];
  } catch {
    return [];
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function loadApiKeyFromSecrets(envName: string): string | undefined {
  for (const secretsFile of getSecretsFiles()) {
    if (!existsSync(secretsFile)) continue;
    try {
      const content = readFileSync(secretsFile, 'utf-8');
      const match = content.match(new RegExp(`export\\s+${escapeRegExp(envName)}\\s*=\\s*['\\\"]?([^'\\\"\\n]+)['\\\"]?`));
      if (match) return match[1];
    } catch {
      continue;
    }
  }
  return undefined;
}

export function resolveApiKey(provider: LLMProvider, override?: string): string | undefined {
  if (override) return override;
  const info = getProviderInfo(provider);
  const envName = info?.apiKeyEnv;
  if (!envName) return undefined;
  return process.env[envName] || loadApiKeyFromSecrets(envName);
}

export function resolveBaseUrl(provider: LLMProvider, override?: string): string | undefined {
  if (override) return override;
  const info = getProviderInfo(provider);
  return info?.defaultBaseUrl;
}
