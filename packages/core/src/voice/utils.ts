import { spawnSync } from 'child_process';
import { loadApiKeyFromSecrets as loadSecretExport } from '../llm/provider-utils';

export function loadApiKeyFromSecrets(key: string): string | undefined {
  return loadSecretExport(key);
}

export function findExecutable(name: string): string | null {
  const command = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(command, [name], { encoding: 'utf-8' });
  if (result.status === 0 && result.stdout) {
    const output = result.stdout.trim().split('\n')[0]?.trim();
    return output || null;
  }
  return null;
}
