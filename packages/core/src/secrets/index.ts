/**
 * Secrets module — backed by @hasna/secrets SDK adapter
 *
 * Storage: ~/.open-secrets/vault.db (same DB as the @hasna/secrets CLI).
 * No internal SecretsManager or AWS client needed.
 *
 * Backward-compatible stubs for loop.ts (createSecretsManager / SecretsManager).
 */

// SDK adapter (primary storage)
export {
  listSecrets,
  getSecret,
  getSecretAnyScope,
  setSecret,
  deleteSecret,
  searchSecrets,
  getAuditLog,
  pruneExpiredSecrets,
  exportSecrets,
} from './sdk-adapter';

export type { SecretEntry, SecretScope, SecretType, AuditEntry } from './sdk-adapter';

// Tools
export {
  secretsTools,
  secretsListTool,
  secretsGetTool,
  secretsSetTool,
  secretsDeleteTool,
  secretsSearchTool,
  secretsAuditTool,
  createSecretsToolExecutors,
  registerSecretsTools,
} from './tools';

// ─── Backward-compatible stubs for agent loop ─────────────────────────────────
// loop.ts imports SecretsManager and createSecretsManager.
// The SDK adapter manages its own state, so we return null from createSecretsManager.

/** @deprecated Use sdk-adapter functions directly. Kept for loop.ts compatibility. */
export type SecretsManager = null;

/** @deprecated SDK adapter manages state. Returns null — registerSecretsTools no longer needs it. */
export function createSecretsManager(
  _assistantId?: string,
  _config?: unknown,
  _storageDir?: string,
): null {
  return null;
}

/** @deprecated Kept for backward compat with old type imports. */
export function isValidSecretName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9/_-]*$/.test(name);
}
