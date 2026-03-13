import type { Command } from './types';
import { getConfigDir } from '../config';
import { VerificationSessionStore } from '../sessions/verification';
import { nativeHookRegistry } from '../hooks';

/**
 * /guardrails - Manage security guardrails and policies
 */
export function guardrailsCommand(): Command {
  return {
    name: 'guardrails',
    description: 'View and manage security guardrails and policies',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      // Import guardrails modules
      const {
        PolicyEvaluator,
        DEFAULT_GUARDRAILS_CONFIG,
        PERMISSIVE_POLICY,
        RESTRICTIVE_POLICY,
      } = await import('../guardrails');

      const [action, ...rest] = args.trim().toLowerCase().split(/\s+/);
      const target = rest.join(' ');

      // Create evaluator instance
      const evaluator = new PolicyEvaluator(context.guardrailsConfig);

      // /guardrails help
      if (action === 'help') {
        let message = '\n## Guardrails Commands\n\n';
        message += '/guardrails                       Open interactive panel\n';
        message += '/guardrails ui                    Open interactive panel\n';
        message += '/guardrails status                Show text status summary\n';
        message += '/guardrails enable                Enable guardrails enforcement\n';
        message += '/guardrails disable               Disable guardrails enforcement\n';
        message += '/guardrails policies              List all policies\n';
        message += '/guardrails preset <name>         Apply a preset (permissive/restrictive)\n';
        message += '/guardrails add-rule <pattern> <action>   Add a tool rule\n';
        message += '/guardrails remove-rule <pattern>         Remove a tool rule\n';
        message += '/guardrails check <tool>          Check if a tool is allowed\n';
        message += '/guardrails help                  Show this help\n';
        message += '\n**Presets:**\n';
        message += '  - `permissive`: Allow most operations, deny only dangerous commands\n';
        message += '  - `restrictive`: Require approval for most operations, deny shell\n';
        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      // /guardrails enable
      if (action === 'enable') {
        if (context.setGuardrailsEnabled) {
          context.setGuardrailsEnabled(true);
          context.emit('text', '\n✓ Guardrails enforcement **enabled**\n');
        } else {
          context.emit('text', '\n⚠ Guardrails control not available in this context\n');
        }
        context.emit('done');
        return { handled: true };
      }

      // /guardrails disable
      if (action === 'disable') {
        if (context.setGuardrailsEnabled) {
          context.setGuardrailsEnabled(false);
          context.emit('text', '\n✓ Guardrails enforcement **disabled**\n');
        } else {
          context.emit('text', '\n⚠ Guardrails control not available in this context\n');
        }
        context.emit('done');
        return { handled: true };
      }

      // /guardrails preset <name>
      if (action === 'preset') {
        if (!target) {
          context.emit('text', '\nUsage: /guardrails preset <permissive|restrictive>\n');
          context.emit('done');
          return { handled: true };
        }

        if (target === 'permissive') {
          if (context.addGuardrailsPolicy) {
            context.addGuardrailsPolicy(PERMISSIVE_POLICY);
            context.emit('text', '\n✓ Applied **permissive** policy preset\n');
            context.emit('text', '  - Most operations allowed\n');
            context.emit('text', '  - Only dangerous commands denied\n');
          } else {
            context.emit('text', '\n⚠ Cannot add policy in this context\n');
          }
        } else if (target === 'restrictive') {
          if (context.addGuardrailsPolicy) {
            context.addGuardrailsPolicy(RESTRICTIVE_POLICY);
            context.emit('text', '\n✓ Applied **restrictive** policy preset\n');
            context.emit('text', '  - Most operations require approval\n');
            context.emit('text', '  - Shell commands denied\n');
            context.emit('text', '  - Rate limits enforced\n');
          } else {
            context.emit('text', '\n⚠ Cannot add policy in this context\n');
          }
        } else {
          context.emit('text', `\n⚠ Unknown preset: ${target}\n`);
          context.emit('text', 'Available presets: permissive, restrictive\n');
        }
        context.emit('done');
        return { handled: true };
      }

      // /guardrails policies
      if (action === 'policies') {
        const config = evaluator.getConfig();
        let message = '\n**Guardrails Policies**\n\n';

        if (config.policies.length === 0) {
          message += 'No policies configured.\n';
        } else {
          for (const policy of config.policies) {
            const status = policy.enabled ? '✓' : '○';
            message += `${status} **${policy.name || policy.id || 'Unnamed'}** (${policy.scope})\n`;

            if (policy.tools?.rules && policy.tools.rules.length > 0) {
              message += `    Tool rules: ${policy.tools.rules.length}\n`;
            }
            if (policy.depth) {
              message += `    Max depth: ${policy.depth.maxDepth}\n`;
            }
            if (policy.rateLimits) {
              message += `    Rate limits: ${policy.rateLimits.toolCallsPerMinute || '-'} tool/min\n`;
            }
          }
        }

        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      // /guardrails add-rule <pattern> <action>
      if (action === 'add-rule') {
        const parts = target.split(/\s+/);
        if (parts.length < 2) {
          context.emit('text', '\nUsage: /guardrails add-rule <pattern> <allow|deny|warn|require_approval>\n');
          context.emit('text', '\nExamples:\n');
          context.emit('text', '  /guardrails add-rule bash:* deny\n');
          context.emit('text', '  /guardrails add-rule file:write warn\n');
          context.emit('text', '  /guardrails add-rule connector:* require_approval\n');
          context.emit('done');
          return { handled: true };
        }

        const pattern = parts[0];
        const ruleAction = parts[1] as 'allow' | 'deny' | 'warn' | 'require_approval';

        if (!['allow', 'deny', 'warn', 'require_approval'].includes(ruleAction)) {
          context.emit('text', `\n⚠ Invalid action: ${ruleAction}\n`);
          context.emit('text', 'Valid actions: allow, deny, warn, require_approval\n');
          context.emit('done');
          return { handled: true };
        }

        if (context.addGuardrailsPolicy) {
          // Add a new session policy with this rule
          const policy = {
            id: `session-rule-${Date.now()}`,
            name: `Rule: ${pattern} → ${ruleAction}`,
            scope: 'session' as const,
            enabled: true,
            tools: {
              defaultAction: 'allow' as const,
              rules: [
                {
                  pattern,
                  action: ruleAction,
                  reason: 'Added via /guardrails command',
                },
              ],
            },
          };
          context.addGuardrailsPolicy(policy);
          context.emit('text', `\n✓ Added rule: ${pattern} → **${ruleAction}**\n`);
        } else {
          context.emit('text', '\n⚠ Cannot add rules in this context\n');
        }
        context.emit('done');
        return { handled: true };
      }

      // /guardrails remove-rule <pattern>
      if (action === 'remove-rule') {
        if (!target) {
          context.emit('text', '\nUsage: /guardrails remove-rule <pattern>\n');
          context.emit('done');
          return { handled: true };
        }

        if (context.removeGuardrailsPolicy) {
          // Try to find and remove policy with matching rule
          const config = evaluator.getConfig();
          let removed = false;
          for (const policy of config.policies) {
            if (policy.tools?.rules?.some((r) => r.pattern === target)) {
              context.removeGuardrailsPolicy(policy.id || '');
              removed = true;
              break;
            }
          }

          if (removed) {
            context.emit('text', `\n✓ Removed rule for pattern: ${target}\n`);
          } else {
            context.emit('text', `\n⚠ No rule found matching pattern: ${target}\n`);
          }
        } else {
          context.emit('text', '\n⚠ Cannot remove rules in this context\n');
        }
        context.emit('done');
        return { handled: true };
      }

      // /guardrails check <tool>
      if (action === 'check') {
        if (!target) {
          context.emit('text', '\nUsage: /guardrails check <tool-name>\n');
          context.emit('text', '\nExamples:\n');
          context.emit('text', '  /guardrails check bash\n');
          context.emit('text', '  /guardrails check file:write\n');
          context.emit('text', '  /guardrails check connector:notion\n');
          context.emit('done');
          return { handled: true };
        }

        const result = evaluator.evaluateToolUse({ toolName: target });

        let message = `\n**Guardrails Check: ${target}**\n\n`;
        message += `Status: ${result.allowed ? '✓ **ALLOWED**' : '✗ **DENIED**'}\n`;
        message += `Action: ${result.action}\n`;

        if (result.requiresApproval) {
          message += `⚠ Requires approval\n`;
          if (result.approvalDetails?.timeout) {
            message += `  Timeout: ${Math.round(result.approvalDetails.timeout / 1000)}s\n`;
          }
        }

        if (result.warnings.length > 0) {
          message += `\nWarnings:\n`;
          for (const warning of result.warnings) {
            message += `  - ${warning}\n`;
          }
        }

        if (result.reasons.length > 0) {
          message += `\nReasons:\n`;
          for (const reason of result.reasons) {
            message += `  - ${reason}\n`;
          }
        }

        if (result.matchedRules.length > 0) {
          message += `\nMatched rules:\n`;
          for (const match of result.matchedRules) {
            const rule = match.rule;
            if ('pattern' in rule) {
              message += `  - ${rule.pattern} → ${rule.action}`;
              if ('reason' in rule && rule.reason) message += ` (${rule.reason})`;
              message += `\n`;
            }
          }
        }

        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      // /guardrails - Show interactive panel
      if (!action || action === 'ui') {
        context.emit('done');
        return { handled: true, showPanel: 'guardrails' };
      }

      // /guardrails status - Show text status
      const config = evaluator.getConfig();
      let message = '\n**Guardrails Status**\n\n';
      message += `Enforcement: ${config.enabled ? '**enabled**' : 'disabled'}\n`;
      message += `Default action: ${config.defaultAction}\n`;
      message += `Policies: ${config.policies.length}\n`;

      // Show active policies summary
      const activePolicies = config.policies.filter((p) => p.enabled);
      if (activePolicies.length > 0) {
        message += '\n## Active Policies\n';
        for (const policy of activePolicies) {
          message += `  - ${policy.name || policy.id || 'Unnamed'} (${policy.scope})\n`;
        }
      }

      // Show summary of rules
      let totalRules = 0;
      let denyRules = 0;
      let approvalRules = 0;
      let warnRules = 0;

      for (const policy of activePolicies) {
        if (policy.tools?.rules) {
          for (const rule of policy.tools.rules) {
            totalRules++;
            if (rule.action === 'deny') denyRules++;
            if (rule.action === 'require_approval') approvalRules++;
            if (rule.action === 'warn') warnRules++;
          }
        }
      }

      if (totalRules > 0) {
        message += '\n## Rule Summary\n';
        message += `  Total rules: ${totalRules}\n`;
        if (denyRules > 0) message += `  Deny: ${denyRules}\n`;
        if (approvalRules > 0) message += `  Require approval: ${approvalRules}\n`;
        if (warnRules > 0) message += `  Warn: ${warnRules}\n`;
      }

      // Check depth limits
      const depthPolicies = activePolicies.filter((p) => p.depth);
      if (depthPolicies.length > 0) {
        const minDepth = Math.min(...depthPolicies.map((p) => p.depth!.maxDepth));
        message += `\n## Depth Limits\n`;
        message += `  Max assistant depth: ${minDepth}\n`;
      }

      // Check rate limits
      const rateLimitPolicies = activePolicies.filter((p) => p.rateLimits);
      if (rateLimitPolicies.length > 0) {
        message += `\n## Rate Limits\n`;
        const first = rateLimitPolicies[0].rateLimits!;
        if (first.toolCallsPerMinute) message += `  Tool calls: ${first.toolCallsPerMinute}/min\n`;
        if (first.llmCallsPerMinute) message += `  LLM calls: ${first.llmCallsPerMinute}/min\n`;
        if (first.externalRequestsPerMinute) message += `  External requests: ${first.externalRequestsPerMinute}/min\n`;
      }

      message += '\n*Use `/guardrails help` for available commands*\n';

      context.emit('text', message);
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /verification - Manage scope verification feature
 */
export function verificationCommand(): Command {
  return {
    name: 'verification',
    description: 'Manage scope verification (list/view/enable/disable)',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const arg = args.trim().toLowerCase();
      const store = new VerificationSessionStore(context.getStorageDir?.() || getConfigDir());

      if (arg === 'disable' || arg === 'off') {
        nativeHookRegistry.setConfig({
          ...nativeHookRegistry.getConfig(),
          scopeVerification: {
            ...nativeHookRegistry.getConfig().scopeVerification,
            enabled: false,
          },
        });
        context.emit('text', 'Scope verification disabled.\n');
        context.emit('done');
        return { handled: true };
      }

      if (arg === 'enable' || arg === 'on') {
        nativeHookRegistry.setConfig({
          ...nativeHookRegistry.getConfig(),
          scopeVerification: {
            ...nativeHookRegistry.getConfig().scopeVerification,
            enabled: true,
          },
        });
        context.emit('text', 'Scope verification enabled.\n');
        context.emit('done');
        return { handled: true };
      }

      if (arg === 'status') {
        const config = nativeHookRegistry.getConfig();
        const enabled = config.scopeVerification?.enabled !== false;
        const maxRetries = config.scopeVerification?.maxRetries ?? 2;
        context.emit('text', `Scope verification: ${enabled ? 'enabled' : 'disabled'}\n`);
        context.emit('text', `Max retries: ${maxRetries}\n`);
        context.emit('done');
        return { handled: true };
      }

      if (arg === '' || arg === 'list') {
        const sessions = store.listRecent(10);
        if (sessions.length === 0) {
          context.emit('text', 'No verification sessions found.\n');
          context.emit('done');
          return { handled: true };
        }

        context.emit('text', 'Recent verification sessions:\n\n');
        for (const session of sessions) {
          const date = new Date(session.createdAt).toLocaleString();
          const status = session.result === 'pass' ? '✓' : session.result === 'force-continue' ? '→' : '✗';
          context.emit('text', `${status} ${session.id.slice(0, 8)} - ${date} - ${session.result}\n`);
          context.emit('text', `  Goals: ${session.goals.slice(0, 2).join(', ')}${session.goals.length > 2 ? '...' : ''}\n`);
        }
        context.emit('text', '\nUse /verification <id> to view details.\n');
        context.emit('done');
        return { handled: true };
      }

      // Try to find a session by ID (partial match)
      const sessions = store.listRecent(100);
      const match = sessions.find((s) => s.id.startsWith(arg) || s.id === arg);

      if (!match) {
        context.emit('text', `No verification session found matching "${arg}".\n`);
        context.emit('done');
        return { handled: true };
      }

      // Display session details
      context.emit('text', `\n=== Verification Session ${match.id} ===\n\n`);
      context.emit('text', `Created: ${new Date(match.createdAt).toLocaleString()}\n`);
      context.emit('text', `Parent Session: ${match.parentSessionId}\n`);
      context.emit('text', `Result: ${match.result}\n\n`);

      context.emit('text', `Goals:\n`);
      for (const goal of match.goals) {
        context.emit('text', `  • ${goal}\n`);
      }

      context.emit('text', `\nAnalysis:\n`);
      for (const analysis of match.verificationResult.goalsAnalysis) {
        const icon = analysis.met ? '✓' : '✗';
        context.emit('text', `  ${icon} ${analysis.goal}\n`);
        context.emit('text', `    ${analysis.evidence}\n`);
      }

      context.emit('text', `\nReason: ${match.reason}\n`);

      if (match.suggestions && match.suggestions.length > 0) {
        context.emit('text', `\nSuggestions:\n`);
        for (const suggestion of match.suggestions) {
          context.emit('text', `  • ${suggestion}\n`);
        }
      }

      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /logs - Show recent security events (interactive panel)
 */
export function securityLogCommand(): Command {
  return {
    name: 'logs',
    aliases: ['security-log'],
    description: 'View security event logs with filtering and navigation',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (_args, _context) => {
      return { handled: true, showPanel: 'logs' as const };
    },
  };
}
