import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';

const DIRECTORY_SECRET_ENV_PATH = ['.secrets', 'hasna', 'assistants', 'live.env'];

interface UpsertSecretExportOptions {
  envName: string;
  value: string;
  homeDir?: string;
}

function quoteEnvValue(value: string): string {
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exportLine(envName: string, value: string): string {
  return `export ${envName}=${quoteEnvValue(value)}`;
}

function resolveHomeDir(): string {
  const envHome = process.env.HOME || process.env.USERPROFILE;
  return envHome && envHome.trim().length > 0 ? envHome : homedir();
}

export function resolveSecretsEnvFile(homeDir: string = resolveHomeDir()): string {
  const legacyPath = join(homeDir, '.secrets');
  if (existsSync(legacyPath) && statSync(legacyPath).isDirectory()) {
    return join(homeDir, ...DIRECTORY_SECRET_ENV_PATH);
  }
  return legacyPath;
}

export function upsertSecretExport({ envName, value, homeDir }: UpsertSecretExportOptions): string {
  const filePath = resolveSecretsEnvFile(homeDir);
  mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });

  const nextLine = exportLine(envName, value);
  let content = '';
  if (existsSync(filePath)) {
    content = readFileSync(filePath, 'utf-8');
  }

  const pattern = new RegExp(`^export\\s+${escapeRegExp(envName)}\\s*=.*$`, 'm');
  const nextContent = pattern.test(content)
    ? content.replace(pattern, nextLine)
    : `${content.trimEnd()}${content.trimEnd() ? '\n' : ''}${nextLine}`;

  writeFileSync(filePath, `${nextContent.trimEnd()}\n`, { encoding: 'utf-8', mode: 0o600 });
  return filePath;
}
