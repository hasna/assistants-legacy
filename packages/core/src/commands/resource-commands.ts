import type { Command } from './types';
import { splitArgs } from './helpers';

/**
 * /exit - Exit assistants
 */
/**
 * /inbox - Manage assistant inbox
 */
/**
 * /wallet - Manage assistant payment cards
 */
export function walletCommand(): Command {
  return {
    name: 'wallet',
    description: 'Manage payment cards in the assistant wallet',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const manager = context.getWalletManager?.();
      if (!manager) {
        context.emit('text', 'Wallet is not enabled. Configure wallet in config.json.\n');
        context.emit('text', '\nTo enable:\n');
        context.emit('text', '```json\n');
        context.emit('text', '{\n');
        context.emit('text', '  "wallet": {\n');
        context.emit('text', '    "enabled": true,\n');
        context.emit('text', '    "storage": {\n');
        context.emit('text', '      "provider": "local"\n');
        context.emit('text', '    }\n');
        context.emit('text', '  }\n');
        context.emit('text', '}\n');
        context.emit('text', '```\n');
        context.emit('text', '\nOptional AWS backend:\n');
        context.emit('text', '```json\n');
        context.emit('text', '{\n');
        context.emit('text', '  "wallet": {\n');
        context.emit('text', '    "enabled": true,\n');
        context.emit('text', '    "storage": { "provider": "aws" },\n');
        context.emit('text', '    "secrets": { "region": "us-east-1" }\n');
        context.emit('text', '  }\n');
        context.emit('text', '}\n');
        context.emit('text', '```\n');
        context.emit('done');
        return { handled: true };
      }

      const parts = splitArgs(args);
      const subcommand = parts[0]?.toLowerCase() || '';

      // Interactive UI mode - default when no args or explicit 'ui'
      if (!subcommand || subcommand === 'ui') {
        context.emit('done');
        return { handled: true, showPanel: 'wallet' as const };
      }

      // /wallet list
      if (subcommand === 'list') {
        try {
          const cards = await manager.list();

          if (cards.length === 0) {
            context.emit('text', 'No cards stored in wallet.\n');
            context.emit('text', 'Use /wallet add to add a card.\n');
          } else {
            context.emit('text', `\n## Wallet (${cards.length} card${cards.length === 1 ? '' : 's'})\n\n`);
            for (const card of cards) {
              context.emit('text', `💳 **${card.name}** (${card.id})\n`);
              context.emit('text', `   **** **** **** ${card.last4}\n`);
              context.emit('text', `   Expires: ${card.expiry}\n\n`);
            }
            const status = manager.getRateLimitStatus();
            context.emit('text', `---\nRate limit: ${status.readsUsed}/${status.maxReads} reads this hour\n`);
          }
        } catch (error) {
          context.emit('text', `Error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /wallet add
      if (subcommand === 'add') {
        context.emit('done');
        return { handled: true, showPanel: 'wallet', panelValue: 'add' };
      }

      // /wallet remove <id>
      if (subcommand === 'remove') {
        const cardId = parts[1];
        if (!cardId) {
          context.emit('text', 'Usage: /wallet remove <card-id>\n');
          context.emit('done');
          return { handled: true };
        }

        try {
          const result = await manager.remove(cardId);
          if (result.success) {
            context.emit('text', `✓ ${result.message}\n`);
          } else {
            context.emit('text', `Error: ${result.message}\n`);
          }
        } catch (error) {
          context.emit('text', `Error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /wallet status
      if (subcommand === 'status') {
        const status = manager.getRateLimitStatus();
        const credCheck = await manager.checkCredentials();
        const storageMode = typeof (manager as any).getStorageMode === 'function'
          ? (manager as any).getStorageMode()
          : 'unknown';

        context.emit('text', '\n## Wallet Status\n\n');
        context.emit('text', `Storage: ${storageMode}\n`);
        context.emit('text', `Credentials: ${credCheck.valid ? '✓ Valid' : '✗ Invalid'}\n`);
        if (!credCheck.valid && credCheck.error) {
          context.emit('text', `  Error: ${credCheck.error}\n`);
        }
        context.emit('text', `Rate Limit: ${status.readsUsed}/${status.maxReads} reads used\n`);
        context.emit('text', `Window Reset: ${status.windowResetMinutes} minutes\n`);
        context.emit('done');
        return { handled: true };
      }

      // /wallet warning
      if (subcommand === 'warning') {
        context.emit('text', '\n## ⚠️ PCI DSS Compliance Warning\n\n');
        context.emit('text', 'Storing payment card data requires compliance with PCI DSS (Payment Card Industry Data Security Standard).\n\n');
        context.emit('text', '**Before storing cards, ensure:**\n');
        context.emit('text', '1. You have explicit permission to store the card data\n');
        context.emit('text', '2. Your AWS account has appropriate security controls\n');
        context.emit('text', '3. Access is restricted to authorized personnel only\n');
        context.emit('text', '4. You maintain audit logs of card access\n');
        context.emit('text', '5. Cards are encrypted at rest (backend-dependent)\n\n');
        context.emit('text', '**This wallet system provides:**\n');
        context.emit('text', '- Storage backend selection (local or AWS)\n');
        context.emit('text', '- Rate limiting to prevent abuse\n');
        context.emit('text', '- Assistant isolation (cards scoped by assistant ID)\n');
        context.emit('text', '- Local storage under .assistants when configured\n');
        context.emit('text', '- 30-day soft delete for AWS Secrets Manager backend\n\n');
        context.emit('text', '**You are responsible for:**\n');
        context.emit('text', '- Proper AWS IAM policies\n');
        context.emit('text', '- Network security and access controls\n');
        context.emit('text', '- Compliance with applicable regulations\n');
        context.emit('done');
        return { handled: true };
      }

      // /wallet help
      if (subcommand === 'help') {
        context.emit('text', '\n## Wallet Commands\n\n');
        context.emit('text', '/wallet                  Interactive wallet manager\n');
        context.emit('text', '/wallet list             List stored cards\n');
        context.emit('text', '/wallet add              Open add-card form\n');
        context.emit('text', '/wallet remove <id>      Remove a card by ID\n');
        context.emit('text', '/wallet status           Show wallet status and credentials\n');
        context.emit('text', '/wallet warning          Show PCI compliance warning\n');
        context.emit('text', '/wallet help             Show this help\n\n');
        context.emit('text', '## Tools\n\n');
        context.emit('text', 'wallet_list              List cards (safe summaries)\n');
        context.emit('text', 'wallet_add               Add a new card\n');
        context.emit('text', 'wallet_get               Get card details (rate limited)\n');
        context.emit('text', 'wallet_remove            Remove a card\n');
        context.emit('done');
        return { handled: true };
      }

      context.emit('text', `Unknown wallet command: ${subcommand}\n`);
      context.emit('text', 'Use /wallet help for available commands.\n');
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /secrets - Manage assistant secrets (API keys, tokens, passwords)
 */
export function secretsCommand(): Command {
  return {
    name: 'secrets',
    description: 'Manage secrets (API keys, tokens, passwords)',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      // SDK adapter: always available (uses ~/.open-secrets/vault.db)
      const { listSecrets, getSecretAnyScope, deleteSecret, exportSecrets } = await import('../secrets/sdk-adapter');

      const parts = splitArgs(args.trim());
      const subcommand = parts[0]?.toLowerCase() || '';

      // Interactive UI mode - default when no args or explicit 'ui'
      if (!subcommand || subcommand === 'ui') {
        context.emit('done');
        return { handled: true, showPanel: 'secrets' as const };
      }

      // /secrets list [scope]
      if (subcommand === 'list') {
        try {
          const scope = (parts[1]?.toLowerCase() || 'all') as 'global' | 'assistant' | 'all';
          const secrets = listSecrets(scope);

          if (secrets.length === 0) {
            context.emit('text', 'No secrets stored.\nUse /secrets add to add a secret.\n');
          } else {
            context.emit('text', `\n## Secrets (${secrets.length})\n\n`);
            const globalSecrets = secrets.filter(s => s.namespace === 'global');
            const assistantSecrets = secrets.filter(s => s.namespace !== 'global');
            if (globalSecrets.length > 0) {
              context.emit('text', '### Global\n');
              for (const s of globalSecrets) {
                context.emit('text', `- **${s.name}** [${s.type}]${s.label ? ` — ${s.label}` : ''}\n`);
              }
              context.emit('text', '\n');
            }
            if (assistantSecrets.length > 0) {
              context.emit('text', '### Assistant\n');
              for (const s of assistantSecrets) {
                context.emit('text', `- **${s.name}** [${s.type}]${s.label ? ` — ${s.label}` : ''}\n`);
              }
            }
          }
        } catch (error) {
          context.emit('text', `Error listing secrets: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /secrets get <name> [scope]
      if (subcommand === 'get') {
        const name = parts[1];
        if (!name) {
          context.emit('text', 'Usage: /secrets get <name> [scope]\n');
          context.emit('done');
          return { handled: true };
        }
        const scope = parts[2]?.toLowerCase() as 'global' | 'assistant' | undefined;
        try {
          const entry = scope ? (await import('../secrets/sdk-adapter')).getSecret(name, scope) : getSecretAnyScope(name);
          if (!entry) {
            context.emit('text', `Secret "${name}" not found.\n`);
          } else {
            const v = entry.value;
            const masked = v.length <= 8 ? '********' : v.slice(0, 4) + '****' + v.slice(-4);
            context.emit('text', `\n**${name}**: ${masked}\n`);
            context.emit('text', '\nUse secrets_get tool for the full value.\n');
          }
        } catch (error) {
          context.emit('text', `Error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /secrets add|set
      if (subcommand === 'add' || subcommand === 'set') {
        context.emit('done');
        return { handled: true, showPanel: 'secrets', panelValue: 'add' };
      }

      // /secrets delete <name> [scope]
      if (subcommand === 'delete') {
        const name = parts[1];
        if (!name) {
          context.emit('text', 'Usage: /secrets delete <name> [scope]\n');
          context.emit('done');
          return { handled: true };
        }
        const scope = (parts[2]?.toLowerCase() as 'global' | 'assistant') || 'assistant';
        try {
          const deleted = deleteSecret(name, scope);
          context.emit('text', deleted ? `Secret "${name}" deleted.\n` : `Secret "${name}" not found.\n`);
        } catch (error) {
          context.emit('text', `Error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /secrets export
      if (subcommand === 'export') {
        try {
          const exported = exportSecrets(false);
          const keys = Object.keys((exported as any).secrets ?? {});
          if (keys.length === 0) {
            context.emit('text', 'No secrets to export.\n');
          } else {
            context.emit('text', '\n## Secrets Export\n\n```bash\n');
            for (const key of keys) {
              const entry = (exported as any).secrets[key];
              const envName = String(key).replace(/[^A-Z0-9_]/gi, '_').toUpperCase();
              context.emit('text', `${envName}=${entry.value}\n`);
            }
            context.emit('text', '```\n');
          }
        } catch (error) {
          context.emit('text', `Error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /secrets status
      if (subcommand === 'status') {
        try {
          const all = listSecrets('all');
          context.emit('text', '\n## Secrets Status\n\n');
          context.emit('text', `Storage: ~/.open-secrets/vault.db\n`);
          context.emit('text', `Total secrets: ${all.length}\n`);
          context.emit('text', `Global: ${all.filter(s => s.namespace === 'global').length} · Assistant: ${all.filter(s => s.namespace !== 'global').length}\n`);
        } catch {
          context.emit('text', 'Secrets vault not initialized yet.\n');
        }
        context.emit('done');
        return { handled: true };
      }

      // /secrets help
      if (subcommand === 'help') {
        context.emit('text', '\n## Secrets Commands\n\n');
        context.emit('text', '/secrets                  Interactive secrets manager\n');
        context.emit('text', '/secrets list [scope]     List secrets, optionally filtered by scope\n');
        context.emit('text', '/secrets get <name>       Get a secret value (masked)\n');
        context.emit('text', '/secrets add              Open add-secret form\n');
        context.emit('text', '/secrets set              Alias for /secrets add\n');
        context.emit('text', '/secrets delete <name>    Delete a secret\n');
        context.emit('text', '/secrets export [scope]   Export secrets as env format\n');
        context.emit('text', '/secrets status           Show status and credentials\n');
        context.emit('text', '/secrets help             Show this help\n\n');
        context.emit('text', '## Tools\n\n');
        context.emit('text', 'secrets_list              List secrets (names only)\n');
        context.emit('text', 'secrets_get               Get a secret value (rate limited)\n');
        context.emit('text', 'secrets_set               Create or update a secret\n');
        context.emit('text', 'secrets_delete            Delete a secret\n\n');
        context.emit('text', '## Scopes\n\n');
        context.emit('text', 'global - Shared across all assistants\n');
        context.emit('text', 'assistant - Specific to this assistant only\n');
        context.emit('text', 'all       - Both global and assistant (default for list)\n');
        context.emit('done');
        return { handled: true };
      }

      context.emit('text', `Unknown secrets command: ${subcommand}\n`);
      context.emit('text', 'Use /secrets help for available commands.\n');
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /budgets - Show or manage resource budgets
 */
export function budgetCommand(): Command {
  return {
    name: 'budgets',
    aliases: ['budget'],
    description: 'View and manage resource budgets (tokens, calls, duration limits)',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      // Import budget tracker
      const { BudgetTracker } = await import('../budget');

      const rawArgs = args.trim();
      const [actionToken = '', ...actionParts] = rawArgs.length > 0
        ? rawArgs.split(/\s+/)
        : [];
      const action = actionToken.toLowerCase();
      const actionRemainder = rawArgs.length > 0
        ? rawArgs.slice(actionToken.length).trim()
        : '';
      const sessionId = context.sessionId || 'default';

      // Create a tracker instance for this session
      const tracker = new BudgetTracker(sessionId, context.budgetConfig);
      const validScopes = ['session', 'assistant', 'swarm', 'project'] as const;
      type Scope = typeof validScopes[number];

      const parseScope = (value?: string): Scope | null => {
        if (!value) return null;
        const normalized = value.trim().toLowerCase();
        if ((validScopes as readonly string[]).includes(normalized)) {
          return normalized as Scope;
        }
        return null;
      };

      const getCurrentConfig = () => {
        const config = context.budgetConfig || tracker.getConfig();
        return {
          ...config,
          session: config.session ? { ...config.session } : undefined,
          assistant: config.assistant ? { ...config.assistant } : undefined,
          swarm: config.swarm ? { ...config.swarm } : undefined,
          project: config.project ? { ...config.project } : undefined,
        };
      };

      const getSummary = () => context.getBudgetSummary?.() || tracker.getSummary();

      // /budgets help
      if (action === 'help') {
        let message = '\n## Budget Commands\n\n';
        message += '/budgets                      Show current budget status\n';
        message += '/budgets status               Show detailed budget status\n';
        message += '/budgets enable               Enable budget enforcement\n';
        message += '/budgets disable              Disable budget enforcement\n';
        message += '/budgets reset                Reset all usage counters\n';
        message += '/budgets reset session        Reset session usage only\n';
        message += '/budgets limits               Show configured limits\n';
        message += '/budgets resume               Resume from budget pause\n';
        message += '/budgets extend <tokens>      Extend token limit\n';
        message += '/budgets project [name]       Show/set project budget\n';
        message += '/budgets help                 Show this help\n';
        message += '\nAlias: /budget\n';
        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      // /budgets enable
      if (action === 'enable') {
        if (context.setBudgetEnabled) {
          context.setBudgetEnabled(true);
          context.emit('text', '\n✓ Budget enforcement **enabled**\n');
        } else {
          context.emit('text', '\n⚠ Budget control not available in this context\n');
        }
        context.emit('done');
        return { handled: true };
      }

      // /budgets disable
      if (action === 'disable') {
        if (context.setBudgetEnabled) {
          context.setBudgetEnabled(false);
          context.emit('text', '\n✓ Budget enforcement **disabled**\n');
        } else {
          context.emit('text', '\n⚠ Budget control not available in this context\n');
        }
        context.emit('done');
        return { handled: true };
      }

      // /budgets resume
      if (action === 'resume') {
        if (context.resumeBudget) {
          context.resumeBudget();
          context.emit('text', '\n✓ Budget pause lifted - agent will continue\n');
        } else {
          context.emit('text', '\n⚠ Budget resume not available in this context\n');
        }
        context.emit('done');
        return { handled: true };
      }

      // /budgets extend <tokens>
      if (action === 'extend') {
        const tokensStr = actionParts[0];
        if (!tokensStr) {
          context.emit('text', '\nUsage: /budgets extend <tokens>\nExample: /budgets extend 500000\n');
          context.emit('done');
          return { handled: true };
        }
        const tokens = parseInt(tokensStr, 10);
        if (isNaN(tokens) || tokens <= 0) {
          context.emit('text', '\n⚠ Invalid token count. Must be a positive number.\n');
          context.emit('done');
          return { handled: true };
        }
        const nextConfig = getCurrentConfig();
        const currentMax = nextConfig.session?.maxTotalTokens || 0;
        const nextLimit = currentMax + tokens;
        nextConfig.session = {
          ...(nextConfig.session || {}),
          maxTotalTokens: nextLimit,
        };
        if (context.setBudgetConfig) {
          context.setBudgetConfig(nextConfig);
        } else {
          tracker.updateConfig(nextConfig);
        }
        context.emit('text', `\n✓ Extended session token limit by ${tokens.toLocaleString()} (new limit: ${nextLimit.toLocaleString()})\n`);
        context.emit('done');
        return { handled: true };
      }

      // /budgets project [name]
      if (action === 'project') {
        const projectName = actionRemainder;

        if (projectName) {
          // Set active project
          if (context.setActiveProjectId) {
            context.setActiveProjectId(projectName);
          } else {
            tracker.setActiveProject(projectName);
          }
          context.emit('text', `\n✓ Active project set to: ${projectName}\n`);
        } else {
          // Show project budget
          const activeProject = context.getActiveProjectId?.() || tracker.getActiveProject();
          if (activeProject) {
            const summary = getSummary();
            if (summary.project) {
              const projectUsage = summary.project.usage;
              const projectLimits = summary.project.limits;
              let message = `\nActive project: ${activeProject}\n`;
              if (projectLimits.maxTotalTokens) {
                const pct = Math.round((projectUsage.totalTokens / projectLimits.maxTotalTokens) * 100);
                message += `Tokens: ${projectUsage.totalTokens.toLocaleString()} / ${projectLimits.maxTotalTokens.toLocaleString()} (${pct}%)\n`;
              } else {
                message += `Tokens: ${projectUsage.totalTokens.toLocaleString()} (no limit)\n`;
              }
              if (projectLimits.maxLlmCalls) {
                const pct = Math.round((projectUsage.llmCalls / projectLimits.maxLlmCalls) * 100);
                message += `LLM Calls: ${projectUsage.llmCalls} / ${projectLimits.maxLlmCalls} (${pct}%)\n`;
              } else {
                message += `LLM Calls: ${projectUsage.llmCalls} (no limit)\n`;
              }
              context.emit('text', message);
            } else {
              const projectStatus = tracker.formatUsage('project', activeProject);
              context.emit('text', `\n${projectStatus}\n`);
            }
          } else {
            context.emit('text', '\nNo active project. Use /budgets project <name> to set one.\n');
          }
        }
        context.emit('done');
        return { handled: true };
      }

      // /budgets reset [scope]
      if (action === 'reset') {
        const scopeInput = actionParts[0];
        const scope = parseScope(scopeInput);

        if (scopeInput && !scope) {
          context.emit('text', '\n⚠ Invalid scope. Valid scopes: session, assistant, swarm, project.\n');
          context.emit('done');
          return { handled: true };
        }

        if (context.resetBudget) {
          if (scope) {
            context.resetBudget(scope);
            context.emit('text', `\n✓ Reset ${scope} budget usage\n`);
          } else {
            context.resetBudget();
            context.emit('text', '\n✓ Reset all budget usage\n');
          }
        } else {
          if (scope) {
            tracker.resetUsage(scope);
            context.emit('text', `\n✓ Reset ${scope} budget usage\n`);
          } else {
            tracker.resetAll();
            context.emit('text', '\n✓ Reset all budget usage\n');
          }
        }
        context.emit('done');
        return { handled: true };
      }

      // /budgets limits
      if (action === 'limits') {
        const config = getCurrentConfig();
        let message = '\n**Budget Limits**\n\n';

        message += '## Session Limits\n';
        if (config.session) {
          message += `  Max tokens: ${config.session.maxTotalTokens?.toLocaleString() || 'unlimited'}\n`;
          message += `  Max LLM calls: ${config.session.maxLlmCalls?.toLocaleString() || 'unlimited'}\n`;
          message += `  Max tool calls: ${config.session.maxToolCalls?.toLocaleString() || 'unlimited'}\n`;
          const maxDurationMin = config.session.maxDurationMs ? Math.round(config.session.maxDurationMs / 60000) : null;
          message += `  Max duration: ${maxDurationMin ? `${maxDurationMin} min` : 'unlimited'}\n`;
        } else {
          message += '  No limits configured\n';
        }

        message += '\n## Assistant Limits\n';
        if (config.assistant) {
          message += `  Max tokens: ${config.assistant.maxTotalTokens?.toLocaleString() || 'unlimited'}\n`;
          message += `  Max LLM calls: ${config.assistant.maxLlmCalls?.toLocaleString() || 'unlimited'}\n`;
          message += `  Max tool calls: ${config.assistant.maxToolCalls?.toLocaleString() || 'unlimited'}\n`;
          const maxDurationMin = config.assistant.maxDurationMs ? Math.round(config.assistant.maxDurationMs / 60000) : null;
          message += `  Max duration: ${maxDurationMin ? `${maxDurationMin} min` : 'unlimited'}\n`;
        } else {
          message += '  No limits configured\n';
        }

        message += '\n## Swarm Limits\n';
        if (config.swarm) {
          message += `  Max tokens: ${config.swarm.maxTotalTokens?.toLocaleString() || 'unlimited'}\n`;
          message += `  Max LLM calls: ${config.swarm.maxLlmCalls?.toLocaleString() || 'unlimited'}\n`;
          message += `  Max tool calls: ${config.swarm.maxToolCalls?.toLocaleString() || 'unlimited'}\n`;
          const maxDurationMin = config.swarm.maxDurationMs ? Math.round(config.swarm.maxDurationMs / 60000) : null;
          message += `  Max duration: ${maxDurationMin ? `${maxDurationMin} min` : 'unlimited'}\n`;
        } else {
          message += '  No limits configured\n';
        }

        message += '\n## Project Limits\n';
        if (config.project) {
          message += `  Max tokens: ${config.project.maxTotalTokens?.toLocaleString() || 'unlimited'}\n`;
          message += `  Max LLM calls: ${config.project.maxLlmCalls?.toLocaleString() || 'unlimited'}\n`;
          message += `  Max tool calls: ${config.project.maxToolCalls?.toLocaleString() || 'unlimited'}\n`;
          const maxDurationMin = config.project.maxDurationMs ? Math.round(config.project.maxDurationMs / 60000) : null;
          message += `  Max duration: ${maxDurationMin ? `${maxDurationMin} min` : 'unlimited'}\n`;
        } else {
          message += '  No limits configured\n';
        }

        message += `\nOn exceeded: ${config.onExceeded || 'warn'}\n`;
        message += `Persistence: ${config.persist ? 'enabled' : 'disabled'}\n`;

        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      // /budgets - Show interactive panel
      if (!action || action === 'ui') {
        context.emit('done');
        return { handled: true, showPanel: 'budget' };
      }

      // /budgets status - Show text status
      const summary = getSummary();
      let message = '\n**Budget Status**\n\n';
      message += `Enforcement: ${summary.enabled ? '**enabled**' : 'disabled'}\n\n`;

      // Session usage
      message += '## Session\n';
      const sessionUsage = summary.session.usage;
      const sessionLimits = summary.session.limits;
      if (sessionLimits.maxTotalTokens) {
        const pct = Math.round((sessionUsage.totalTokens / sessionLimits.maxTotalTokens) * 100);
        message += `  Tokens: ${sessionUsage.totalTokens.toLocaleString()} / ${sessionLimits.maxTotalTokens.toLocaleString()} (${pct}%)\n`;
      } else {
        message += `  Tokens: ${sessionUsage.totalTokens.toLocaleString()} (no limit)\n`;
      }
      if (sessionLimits.maxLlmCalls) {
        const pct = Math.round((sessionUsage.llmCalls / sessionLimits.maxLlmCalls) * 100);
        message += `  LLM Calls: ${sessionUsage.llmCalls} / ${sessionLimits.maxLlmCalls} (${pct}%)\n`;
      } else {
        message += `  LLM Calls: ${sessionUsage.llmCalls} (no limit)\n`;
      }
      if (sessionLimits.maxToolCalls) {
        const pct = Math.round((sessionUsage.toolCalls / sessionLimits.maxToolCalls) * 100);
        message += `  Tool Calls: ${sessionUsage.toolCalls} / ${sessionLimits.maxToolCalls} (${pct}%)\n`;
      } else {
        message += `  Tool Calls: ${sessionUsage.toolCalls} (no limit)\n`;
      }
      const durationMin = Math.round(sessionUsage.durationMs / 60000);
      if (sessionLimits.maxDurationMs) {
        const limitMin = Math.round(sessionLimits.maxDurationMs / 60000);
        const pct = Math.round((sessionUsage.durationMs / sessionLimits.maxDurationMs) * 100);
        message += `  Duration: ${durationMin} min / ${limitMin} min (${pct}%)\n`;
      } else {
        message += `  Duration: ${durationMin} min (no limit)\n`;
      }

      if (summary.session.overallExceeded) {
        message += '\n  ⚠️ **SESSION BUDGET EXCEEDED**\n';
      } else if (summary.session.warningsCount > 0) {
        message += `\n  ⚡ ${summary.session.warningsCount} warning(s) - approaching limits\n`;
      }

      // Show project budget if active
      if (summary.project) {
        message += '\n## Project\n';
        const projUsage = summary.project.usage;
        const projLimits = summary.project.limits;
        if (projLimits.maxTotalTokens) {
          const pct = Math.round((projUsage.totalTokens / projLimits.maxTotalTokens) * 100);
          message += `  Tokens: ${projUsage.totalTokens.toLocaleString()} / ${projLimits.maxTotalTokens.toLocaleString()} (${pct}%)\n`;
        }
        if (projLimits.maxLlmCalls) {
          const pct = Math.round((projUsage.llmCalls / projLimits.maxLlmCalls) * 100);
          message += `  LLM Calls: ${projUsage.llmCalls} / ${projLimits.maxLlmCalls} (${pct}%)\n`;
        }
        if (summary.project.overallExceeded) {
          message += '\n  ⚠️ **PROJECT BUDGET EXCEEDED**\n';
        }
      }

      // Show assistant count if any
      if (summary.assistantCount > 0) {
        message += `\n## Assistants: ${summary.assistantCount} tracked\n`;
      }

      // Overall status
      if (summary.anyExceeded) {
        message += '\n⚠️ **BUDGET EXCEEDED** - Some limits have been reached\n';
      } else if (summary.totalWarnings > 0) {
        message += `\n⚡ ${summary.totalWarnings} total warning(s)\n`;
      } else {
        message += '\n✓ All budgets within limits\n';
      }

      context.emit('text', message);
      context.emit('done');
      return { handled: true };
    },
  };
}
