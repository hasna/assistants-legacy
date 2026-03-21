/**
 * Secrets tools — backed by @hasna/secrets SDK adapter
 *
 * Uses the same SQLite vault as the @hasna/secrets CLI (~/.open-secrets/vault.db).
 * No more internal SecretsManager or AWS client dependency.
 */

import type { Tool } from '@hasna/assistants-shared';
import type { ToolExecutor, ToolRegistry } from '../tools/registry';
import {
  listSecrets,
  getSecret,
  getSecretAnyScope,
  setSecret,
  deleteSecret,
  searchSecrets,
  getAuditLog,
  pruneExpiredSecrets,
  type SecretScope,
  type SecretType,
} from './sdk-adapter';

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const secretsListTool: Tool = {
  name: 'secrets_list',
  description: 'List all secrets (names only, no values). Returns secret names, types, labels, and namespaces. Use secrets_get to retrieve a value.',
  parameters: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        description: 'Filter by scope: "global" for shared secrets, "assistant" for assistant-scoped secrets, or "all" for both. Default: all',
        enum: ['global', 'assistant', 'all'],
      },
    },
  },
};

export const secretsGetTool: Tool = {
  name: 'secrets_get',
  description: 'Get a secret value by name. If scope is omitted, checks assistant scope first then global.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Secret name or key (e.g. "GITHUB_TOKEN", "openai/api_key")' },
      scope: {
        type: 'string',
        description: 'Secret scope: "global" or "assistant". Omit to search both.',
        enum: ['global', 'assistant'],
      },
      format: {
        type: 'string',
        description: 'Output format: "plain" (just the value), "metadata" (full info as JSON), "env" (NAME=value). Default: plain',
        enum: ['plain', 'metadata', 'env'],
      },
    },
    required: ['name'],
  },
};

export const secretsSetTool: Tool = {
  name: 'secrets_set',
  description: 'Store or update a secret. Use for API keys, passwords, tokens, and credentials.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Secret key (e.g. "GITHUB_TOKEN", "openai/api_key")' },
      value: { type: 'string', description: 'Secret value' },
      type: {
        type: 'string',
        description: 'Secret type. Default: other',
        enum: ['api_key', 'password', 'token', 'credential', 'other'],
      },
      label: { type: 'string', description: 'Optional human-readable label' },
      scope: {
        type: 'string',
        description: 'Storage scope: "global" (shared across all assistants) or "assistant" (this assistant only). Default: assistant',
        enum: ['global', 'assistant'],
      },
      ttl: { type: 'string', description: 'Optional expiry: 30d, 24h, 60m' },
    },
    required: ['name', 'value'],
  },
};

export const secretsDeleteTool: Tool = {
  name: 'secrets_delete',
  description: 'Delete a secret.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Secret name to delete' },
      scope: {
        type: 'string',
        description: 'Secret scope: "global" or "assistant". Default: assistant',
        enum: ['global', 'assistant'],
      },
    },
    required: ['name'],
  },
};

export const secretsSearchTool: Tool = {
  name: 'secrets_search',
  description: 'Search secrets by name, label, or type.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
    },
    required: ['query'],
  },
};

export const secretsAuditTool: Tool = {
  name: 'secrets_audit',
  description: 'View the audit log of recent secret access (get/set/delete operations).',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Filter by secret name (optional)' },
      limit: { type: 'number', description: 'Max entries to return. Default: 20' },
    },
  },
};

// ─── Executors ────────────────────────────────────────────────────────────────

function createSecretsExecutors(): Record<string, ToolExecutor> {
  return {
    secrets_list: async (input) => {
      try {
        const scope = String(input.scope || 'all').toLowerCase() as SecretScope | 'all';
        const entries = listSecrets(scope);

        if (entries.length === 0) {
          return 'No secrets stored. Use secrets_set to store a secret.';
        }

        const global_ = entries.filter(e => e.namespace === 'global');
        const assistant_ = entries.filter(e => e.namespace !== 'global');
        const lines: string[] = [`## Secrets (${entries.length})`];

        if (global_.length > 0) {
          lines.push('\n### Global');
          for (const e of global_) {
            const expiry = e.expires_at ? ` [expires ${new Date(e.expires_at).toLocaleDateString()}]` : '';
            lines.push(`- **${e.name}** [${e.type}]${e.label ? ` — ${e.label}` : ''}${expiry}`);
          }
        }
        if (assistant_.length > 0) {
          lines.push('\n### Assistant');
          for (const e of assistant_) {
            const expiry = e.expires_at ? ` [expires ${new Date(e.expires_at).toLocaleDateString()}]` : '';
            lines.push(`- **${e.name}** [${e.type}]${e.label ? ` — ${e.label}` : ''}${expiry}`);
          }
        }

        return lines.join('\n');
      } catch (e) {
        return `Error listing secrets: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    secrets_get: async (input) => {
      const name = String(input.name || '').trim();
      if (!name) return 'Error: Secret name is required.';

      const scope = input.scope ? String(input.scope).toLowerCase() as SecretScope : undefined;
      const format = String(input.format || 'plain').toLowerCase();

      try {
        const entry = scope ? getSecret(name, scope) : getSecretAnyScope(name);
        if (!entry) {
          return `Secret "${name}" not found${scope ? ` in ${scope} scope` : ''}.`;
        }

        if (format === 'metadata') {
          return JSON.stringify({
            name: entry.name,
            key: entry.key,
            value: entry.value,
            type: entry.type,
            label: entry.label,
            namespace: entry.namespace,
            expires_at: entry.expires_at,
            created_at: entry.created_at,
            updated_at: entry.updated_at,
          }, null, 2);
        }

        if (format === 'env') {
          const envName = entry.name.replace(/[^A-Z0-9_]/gi, '_').toUpperCase();
          return `${envName}=${entry.value}`;
        }

        return entry.value;
      } catch (e) {
        return `Error retrieving secret: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    secrets_set: async (input) => {
      const name = String(input.name || '').trim();
      const value = String(input.value || '');
      if (!name) return 'Error: Secret name is required.';
      if (!value) return 'Error: Secret value is required.';

      const scope = String(input.scope || 'assistant').toLowerCase() as SecretScope;
      const type = String(input.type || 'other').toLowerCase() as SecretType;
      const label = input.label ? String(input.label).trim() : undefined;
      const ttl = input.ttl ? String(input.ttl).trim() : undefined;

      try {
        setSecret(name, value, { scope, type, label, ttl });
        const expiry = ttl ? ` (expires in ${ttl})` : '';
        return `Secret "${name}" saved (scope: ${scope}, type: ${type})${expiry}.`;
      } catch (e) {
        return `Error saving secret: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    secrets_delete: async (input) => {
      const name = String(input.name || '').trim();
      if (!name) return 'Error: Secret name is required.';
      const scope = String(input.scope || 'assistant').toLowerCase() as SecretScope;

      try {
        const deleted = deleteSecret(name, scope);
        if (!deleted) return `Secret "${name}" not found in ${scope} scope.`;
        return `Secret "${name}" deleted from ${scope} scope.`;
      } catch (e) {
        return `Error deleting secret: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    secrets_search: async (input) => {
      const query = String(input.query || '').trim();
      if (!query) return 'Error: Search query is required.';

      try {
        const results = searchSecrets(query);
        if (results.length === 0) return `No secrets found matching "${query}".`;
        const lines = results.map(e => `- **${e.name}** [${e.type}]${e.label ? ` — ${e.label}` : ''} (${e.namespace})`);
        return `## Search: "${query}" (${results.length})\n\n${lines.join('\n')}`;
      } catch (e) {
        return `Error searching secrets: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    secrets_audit: async (input) => {
      const name = input.name ? String(input.name).trim() : undefined;
      const limit = Math.min(Number(input.limit || 20), 100);

      try {
        const entries = getAuditLog(name, limit);
        if (entries.length === 0) return 'No audit entries found.';
        const lines = entries.map(e => `[${e.timestamp}] ${e.action.toUpperCase().padEnd(6)} ${e.key} — ${e.agent}`);
        return `## Audit Log (${entries.length})\n\n${lines.join('\n')}`;
      } catch (e) {
        return `Error reading audit log: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };
}

// ─── Registration ─────────────────────────────────────────────────────────────

export const secretsTools: Tool[] = [
  secretsListTool,
  secretsGetTool,
  secretsSetTool,
  secretsDeleteTool,
  secretsSearchTool,
  secretsAuditTool,
];

export function registerSecretsTools(registry: ToolRegistry): void {
  const executors = createSecretsExecutors();
  for (const tool of secretsTools) {
    registry.register(tool, executors[tool.name]);
  }
}

// Keep backward-compatible export signature that accepts an optional manager getter
// (called from loop.ts — can pass undefined/null since SDK manages its own state)
export function createSecretsToolExecutors(
  _getManager?: () => unknown
): Record<string, ToolExecutor> {
  return createSecretsExecutors();
}
