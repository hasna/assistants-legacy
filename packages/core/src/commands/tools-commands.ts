import type { Command } from './types';
import type { CommandLoader } from './loader';
import {
  splitArgs,
  resolveAuthTimeout,
  VERSION,
  parseDisclosureOptions,
  pageItems,
  disclosureHint,
  truncateText,
  type ConnectorAuthTimeoutResolve,
} from './helpers';
import { platform, release, arch } from 'os';
import { nativeHookRegistry, HookStore, HookTester } from '../hooks';
import { createSkill, type SkillScope } from '../skills/create';
import { SkillInstaller } from '../skills/installer';
import { saveFeedbackEntry, type FeedbackType } from '../tools/feedback';
import { buildCommandArgs } from '../utils/command-line';
import { getRuntime } from '../runtime';
import { getConfigDir } from '../config';
import { generateId } from '@hasna/assistants-shared';

/**
 * /hooks - Manage hooks (interactive panel)
 */
export function hooksCommand(): Command {
  return {
    name: 'hooks',
    description: 'View, enable, disable, and manage event hooks (pre/post tool use, etc.)',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const [action, ...rest] = args.trim().split(/\s+/).filter(Boolean);
      const hookId = rest[0];

      // Show interactive panel for no args or 'ui' command
      if (!action || action === 'ui') {
        context.emit('done');
        return { handled: true, showPanel: 'hooks' };
      }

      // Get hooks from context
      const hooks = context.getHooks?.() ?? {};

      // /hooks list - List all hooks
      if (action === 'list') {
        const events = Object.keys(hooks);
        const nativeHooks = nativeHookRegistry.listFlat();

        if (events.length === 0 && nativeHooks.length === 0) {
          context.emit('text', '\nNo hooks configured.\n');
          context.emit('done');
          return { handled: true };
        }

        const outputOptions = parseDisclosureOptions(rest);
        if (outputOptions.error) {
          context.emit('text', `${outputOptions.error}\n`);
          context.emit('done');
          return { handled: true };
        }

        const rows: Array<{
          source: 'native' | 'user';
          event: string;
          id?: string;
          name: string;
          enabled: boolean;
          description?: string;
          matcher?: string;
        }> = [];

        for (const { hook, event, enabled } of nativeHooks) {
          rows.push({
            source: 'native',
            event,
            id: hook.id,
            name: hook.name || hook.id,
            enabled,
            description: hook.description,
          });
        }

        for (const event of events) {
          const matchers = hooks[event] ?? [];
          for (const matcher of matchers) {
            for (const hook of matcher.hooks) {
              rows.push({
                source: 'user',
                event,
                id: hook.id,
                name: hook.name || hook.command?.slice(0, 40) || hook.type,
                enabled: hook.enabled !== false,
                matcher: matcher.matcher,
              });
            }
          }
        }

        const page = pageItems(rows, outputOptions);
        if (outputOptions.json) {
          context.emit('text', JSON.stringify({
            hooks: page.items,
            total: page.total,
            limit: outputOptions.limit,
            cursor: outputOptions.cursor,
            nextCursor: page.nextCursor,
          }, null, 2));
        } else {
          let output = `\n**Hooks** (${page.shown}/${page.total})\n\n`;
          for (const row of page.items) {
            const status = row.enabled ? '[on]' : '[off]';
            const matcher = row.matcher ? ` @${truncateText(row.matcher, 30)}` : '';
            const id = row.id ? ` id:${row.id}` : '';
            output += `  ${status} ${truncateText(row.name, outputOptions.verbose ? 80 : 40)} (${row.source}/${row.event})${matcher}${id}\n`;
            if (outputOptions.verbose && row.description) {
              output += `       ${truncateText(row.description, 120)}\n`;
            }
          }
          output += disclosureHint(outputOptions, page.total, page.shown, '/hooks test <id>');
          context.emit('text', output);
        }
        context.emit('done');
        return { handled: true };
      }

      // /hooks enable <id> - Enable a hook
      if (action === 'enable') {
        if (!hookId) {
          context.emit('text', 'Usage: /hooks enable <hook-id>\n');
          context.emit('done');
          return { handled: true };
        }
        // Try native hooks first
        if (nativeHookRegistry.getHook(hookId)) {
          nativeHookRegistry.setEnabled(hookId, true);
          context.emit('text', `Native hook ${hookId} enabled.\n`);
          context.emit('done');
          return { handled: true };
        }
        // Fall back to user hooks
        const result = await context.setHookEnabled?.(hookId, true);
        if (result) {
          context.emit('text', `Hook ${hookId} enabled.\n`);
        } else {
          context.emit('text', `Hook ${hookId} not found.\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /hooks disable <id> - Disable a hook
      if (action === 'disable') {
        if (!hookId) {
          context.emit('text', 'Usage: /hooks disable <hook-id>\n');
          context.emit('done');
          return { handled: true };
        }
        // Try native hooks first
        if (nativeHookRegistry.getHook(hookId)) {
          nativeHookRegistry.setEnabled(hookId, false);
          context.emit('text', `Native hook ${hookId} disabled.\n`);
          context.emit('done');
          return { handled: true };
        }
        // Fall back to user hooks
        const result = await context.setHookEnabled?.(hookId, false);
        if (result) {
          context.emit('text', `Hook ${hookId} disabled.\n`);
        } else {
          context.emit('text', `Hook ${hookId} not found.\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /hooks test <id> - Test a hook with sample input
      if (action === 'test') {
        if (!hookId) {
          context.emit('text', 'Usage: /hooks test <hook-id>\n');
          context.emit('done');
          return { handled: true };
        }

        // Find the hook by ID
        const store = new HookStore();
        const hookInfo = store.getHook(hookId);

        if (!hookInfo) {
          context.emit('text', `Hook '${hookId}' not found.\n`);
          context.emit('done');
          return { handled: true };
        }

        // Test the hook
        const tester = new HookTester(context.cwd, context.sessionId);
        context.emit('text', `\n**Testing hook:** ${hookInfo.handler.name || hookId} (${hookInfo.event})\n`);
        context.emit('text', `${'━'.repeat(50)}\n`);

        const sampleInput = HookTester.getSampleInput(hookInfo.event);
        context.emit('text', `**Input:** ${JSON.stringify(sampleInput, null, 2)}\n\n`);

        const result = await tester.test(hookInfo.handler, hookInfo.event);

        context.emit('text', `**Exit code:** ${result.exitCode ?? 'N/A'}\n`);
        if (result.stdout) {
          context.emit('text', `**Stdout:**\n\`\`\`\n${result.stdout}\n\`\`\`\n`);
        } else {
          context.emit('text', `**Stdout:** (empty)\n`);
        }
        if (result.stderr) {
          context.emit('text', `**Stderr:**\n\`\`\`\n${result.stderr}\n\`\`\`\n`);
        } else {
          context.emit('text', `**Stderr:** (empty)\n`);
        }
        context.emit('text', `\n**Result:** ${result.action}\n`);
        if (result.reason) {
          context.emit('text', `**Reason:** ${result.reason}\n`);
        }
        if (result.error) {
          context.emit('text', `**Error:** ${result.error}\n`);
        }
        context.emit('text', `**Duration:** ${result.durationMs}ms\n`);

        context.emit('done');
        return { handled: true };
      }

      // /hooks help
      if (action === 'help') {
        context.emit('text', '\n## Hook Commands\n\n');
        context.emit('text', '/hooks                        Open interactive hooks panel\n');
        context.emit('text', '/hooks list                   List all hooks\n');
        context.emit('text', '/hooks enable <id>            Enable a hook\n');
        context.emit('text', '/hooks disable <id>           Disable a hook\n');
        context.emit('text', '/hooks test <id>              Test a hook with sample input\n');
        context.emit('text', '/hooks help                   Show this help\n');
        context.emit('done');
        return { handled: true };
      }

      context.emit('text', 'Unknown /hooks command. Use /hooks help for options.\n');
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /connectors - List and manage connectors
 *
 * Usage:
 *   /connectors              - Open interactive panel (default)
 *   /connectors <name>       - Open panel at specific connector
 *   /connectors --list       - Show text-based table (non-interactive)
 *   /connectors --list <name> - Show text-based detail for specific connector
 *   /connectors refresh      - Refresh connector cache and re-discover
 *   /connectors status       - Show connector cache status
 */
export function connectorsCommand(): Command {
  return {
    name: 'connectors',
    description: 'Browse and search connectors interactively (view commands, refresh)',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const trimmedArgs = args.trim();
      const tokens = splitArgs(trimmedArgs);
      const firstArg = tokens[0]?.toLowerCase();

      // Handle refresh subcommand
      if (firstArg === 'refresh') {
        if (!context.refreshConnectors) {
          context.emit('text', 'Connector refresh is not available.\n');
          context.emit('done');
          return { handled: true };
        }

        context.emit('text', 'Refreshing connectors...\n');
        try {
          const result = await context.refreshConnectors();
          context.emit('text', `✓ Discovered ${result.count} connector(s).\n`);
          if (result.names.length > 0) {
            context.emit('text', `  ${result.names.join(', ')}\n`);
          }
        } catch (error) {
          context.emit('text', `✗ Refresh failed: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // Handle status subcommand
      if (firstArg === 'status') {
        const count = context.connectors.length;
        const connectorNames = context.connectors.map((c) => c.name);
        const shownNames = connectorNames.slice(0, 20);
        context.emit('text', '\n**Connector Status**\n\n');
        context.emit('text', `Loaded: ${count} connector(s)\n`);
        if (count > 0) {
          context.emit('text', `Names: ${shownNames.join(', ')}${count > shownNames.length ? `, ... (+${count - shownNames.length} more)` : ''}\n`);
        }
        context.emit('text', '\n**Commands:**\n');
        context.emit('text', '  `/connectors refresh` - Clear cache and re-discover connectors\n');
        context.emit('text', '  `/connectors --list [--limit n --cursor n --verbose --json]` - Show connector list\n');
        context.emit('done');
        return { handled: true };
      }

      const hasListFlag = tokens.includes('--list');

      // Interactive mode (default): open the connectors panel
      if (!hasListFlag) {
        context.emit('done');
        return {
          handled: true,
          showPanel: 'connectors' as const,
          panelValue: firstArg && !firstArg.startsWith('--') ? trimmedArgs : undefined,
        };
      }

      // Text-based mode with --list flag
      const outputOptions = parseDisclosureOptions(tokens.filter((token) => token !== '--list'));
      if (outputOptions.error) {
        context.emit('text', `${outputOptions.error}\n`);
        context.emit('done');
        return { handled: true };
      }
      const connectorName = outputOptions.args.join(' ').toLowerCase();

      // If a specific connector is requested, show details
      if (connectorName) {
        let connector: typeof context.connectors[number] | undefined;
        for (const item of context.connectors) {
          if (item.name.toLowerCase() === connectorName) {
            connector = item;
            break;
          }
        }

        if (!connector) {
          context.emit('text', `\nConnector "${connectorName}" not found.\n`);
          context.emit('text', `Use /connectors --list to see available connectors.\n`);
          context.emit('done');
          return { handled: true };
        }

        // Show detailed info for this connector
        const cli = connector.cli || `connect-${connector.name}`;
        const description = connector.description?.trim() || 'No description provided.';
        const commands = connector.commands || [];
        const commandPage = pageItems(commands, outputOptions);
        if (outputOptions.json) {
          context.emit('text', JSON.stringify({
            connector: {
              ...connector,
              description,
            },
            commands: commandPage.items,
            totalCommands: commandPage.total,
            limit: outputOptions.limit,
            cursor: outputOptions.cursor,
            nextCursor: commandPage.nextCursor,
          }, null, 2));
          context.emit('done');
          return { handled: true };
        }

        let message = `\n**${connector.name}** Connector\n\n`;
        message += `CLI: \`${cli}\`\n`;
        message += `Description: ${truncateText(description, outputOptions.verbose ? 200 : 96)}\n\n`;

        // Check auth status
        try {
          let timeoutId: ReturnType<typeof setTimeout> | null = null;
          const timeoutPromise = new Promise<{ exitCode: number; stdout: { toString: () => string } }>((resolve) => {
            timeoutId = setTimeout(resolveAuthTimeout, 1000, resolve);
          });

          const runtime = getRuntime();
          const cli = connector.cli || `connect-${connector.name}`;
          const execPromise = (async () => {
            const cmdParts = buildCommandArgs(cli, ['auth', 'status', '--format', 'json']);
            const proc = runtime.spawn(cmdParts, {
              cwd: process.cwd(),
              stdin: 'ignore',
              stdout: 'pipe',
              stderr: 'ignore',
            });
            const stdout = proc.stdout ? await new Response(proc.stdout).text() : '';
            const exitCode = await proc.exited;
            return { exitCode, stdout: { toString: () => stdout } };
          })();
          const result = await Promise.race([execPromise, timeoutPromise]);

          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          if (result.exitCode === 0) {
            const status = JSON.parse(result.stdout.toString());
            message += `**Auth Status:** ${status.authenticated ? '✓ Authenticated' : '○ Not authenticated'}\n`;
            if (status.user || status.email) {
              message += `**Account:** ${status.user || status.email}\n`;
            }
          } else {
            message += `**Auth Status:** ○ Not authenticated\n`;
          }
        } catch {
          message += `**Auth Status:** ? Unable to check\n`;
        }

        message += `\n**Available Commands** (${commandPage.shown}/${commandPage.total}):\n`;
        if (commands.length === 0) {
          message += '  (no commands discovered)\n';
        } else {
          for (const cmd of commandPage.items) {
            message += `  ${truncateText(cmd.name, 40)} - ${truncateText(cmd.description, outputOptions.verbose ? 140 : 72)}\n`;
          }
        }
        message += disclosureHint(outputOptions, commandPage.total, commandPage.shown, '/connectors --list <name> --verbose');

        message += `\n**Usage:**\n`;
        message += `  Ask the AI to use ${connector.name} (e.g., "list my ${connector.name} items")\n`;
        message += `  Or run directly: \`${connector.cli} <command>\`\n`;

        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      // List all connectors (text mode)
      let message = '\n**Available Connectors**\n\n';

      if (context.connectors.length === 0) {
        if (outputOptions.json) {
          context.emit('text', JSON.stringify({ connectors: [], total: 0, limit: outputOptions.limit, cursor: outputOptions.cursor, nextCursor: null }, null, 2));
          context.emit('done');
          return { handled: true };
        }
        message += 'No connectors found.\n\n';
        message += 'Install connectors using the `connectors` CLI:\n';
        message += '  `connectors install <name>` (e.g. `connectors install gmail`)\n\n';
        message += 'Browse available connectors:\n';
        message += '  `connectors list` or `connectors search <query>`\n\n';
        message += 'Then run `/connectors` again to verify it is detected.\n';
      } else {
        // Check auth status for each
        const checkAuth = async (connector: typeof context.connectors[number]): Promise<string> => {
          let status = '○';
          let timeoutId: ReturnType<typeof setTimeout> | null = null;
          try {
            const cli = connector.cli || `connect-${connector.name}`;
            const timeoutPromise = new Promise<{ exitCode: number; stdout: { toString: () => string } }>((resolve) => {
              timeoutId = setTimeout(resolveAuthTimeout, 1000, resolve);
            });

            const runtime = getRuntime();
            const execPromise = (async () => {
              const cmdParts = buildCommandArgs(cli, ['auth', 'status', '--format', 'json']);
              const proc = runtime.spawn(cmdParts, {
                cwd: process.cwd(),
                stdin: 'ignore',
                stdout: 'pipe',
                stderr: 'ignore',
              });
              const stdout = proc.stdout ? await new Response(proc.stdout).text() : '';
              const exitCode = await proc.exited;
              return { exitCode, stdout: { toString: () => stdout } };
            })();
            const result = await Promise.race([execPromise, timeoutPromise]);

            if (result.exitCode === 0) {
              try {
                const parsed = JSON.parse(result.stdout.toString());
                status = parsed.authenticated ? '✓' : '○';
              } catch {
                status = '○';
              }
            }
          } catch {
            status = '?';
          } finally {
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
          }
          return status;
        };

        const page = pageItems(context.connectors, outputOptions);
        if (outputOptions.json) {
          context.emit('text', JSON.stringify({
            connectors: page.items,
            total: page.total,
            limit: outputOptions.limit,
            cursor: outputOptions.cursor,
            nextCursor: page.nextCursor,
          }, null, 2));
          context.emit('done');
          return { handled: true };
        }

        const statuses = await Promise.all(page.items.map((connector) => checkAuth(connector)));

        const escapeCell = (value: string) => value.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
        message += '| Status | Connector | Commands |\n';
        message += '|--------|-----------|----------|\n';

        for (let i = 0; i < page.items.length; i++) {
          const connector = page.items[i];
          const status = statuses[i];
          const cmdCount = connector.commands?.length ?? 0;
          message += `| ${status} | ${escapeCell(truncateText(connector.name, outputOptions.verbose ? 80 : 40))} | ${cmdCount} commands |\n`;
        }

        message += `\n${page.shown}/${page.total} connector(s) shown.\n`;
        message += disclosureHint(outputOptions, page.total, page.shown, '/connectors --list <name>');
        message += '**Legend:** ✓ authenticated | ○ not authenticated | ? unknown\n\n';
        message += '**Commands:**\n';
        message += '  `/connectors` - Open interactive browser\n';
        message += '  `/connectors <name>` - Open browser at specific connector\n';
        message += '  `/connectors --list <name> --verbose` - Show connector command details\n';
        message += '  `connectors auth <name>` - Authenticate a connector\n';
      }

      context.emit('text', message);
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /skills - Interactive skills panel (merged with /skill create)
 */
export function skillsCommand(loader: CommandLoader): Command {
  return {
    name: 'skills',
    aliases: ['skill'],
    description: 'Browse, create, delete, and execute skills interactively',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const tokens = splitArgs(args || '');
      const subcommand = tokens.shift()?.toLowerCase();

      // /skills create <name> [options] - create flow (from old /skill command)
      if (subcommand === 'create') {
        let name: string | undefined;
        let scope: SkillScope | undefined;
        let description: string | undefined;
        let argumentHint: string | undefined;
        let content: string | undefined;
        let overwrite = false;
        let yes = false;
        let interactive = false;
        let allowedTools: string[] | undefined;

        for (let i = 0; i < tokens.length; i += 1) {
          const token = tokens[i];
          if (!token) continue;
          if (token.startsWith('--')) {
            switch (token) {
              case '--project':
                scope = 'project';
                break;
              case '--global':
                scope = 'global';
                break;
              case '--desc':
              case '--description':
                description = tokens[i + 1];
                i += 1;
                break;
              case '--tools': {
                const list = tokens[i + 1] || '';
                allowedTools = list
                  .split(',')
                  .map((tool) => tool.trim())
                  .filter(Boolean);
                i += 1;
                break;
              }
              case '--hint':
                argumentHint = tokens[i + 1];
                i += 1;
                break;
              case '--content':
                content = tokens[i + 1];
                i += 1;
                break;
              case '--interactive':
              case '--ask':
              case '--interview':
                interactive = true;
                break;
              case '--force':
              case '--overwrite':
                overwrite = true;
                break;
              case '--yes':
                yes = true;
                break;
              default:
                break;
            }
          } else if (!name) {
            name = token;
          }
        }

        if (!name) {
          context.emit('text', 'Usage: /skills create <name> [--project|--global]\n');
          context.emit('done');
          return { handled: true };
        }

        if (interactive || (!scope && !yes)) {
          const known: string[] = [];
          if (scope) known.push(`scope: ${scope}`);
          if (description) known.push(`description: ${description}`);
          if (content) known.push(`content: provided`);
          if (allowedTools && allowedTools.length > 0) known.push(`allowed_tools: ${allowedTools.join(', ')}`);
          if (argumentHint) known.push(`argument_hint: ${argumentHint}`);

          const missing: string[] = [];
          if (!scope) missing.push('scope (project/global, default project)');
          if (!description) missing.push('description');
          if (!content) missing.push('content (multi-line allowed)');
          if (!allowedTools || allowedTools.length === 0) missing.push('allowed tools (optional)');
          if (!argumentHint) missing.push('argument hint (optional)');

          const knownBlock = known.length > 0 ? `Known values:\\n- ${known.join('\\n- ')}\\n\\n` : '';
          const missingBlock = missing.length > 0 ? `Ask for:\\n- ${missing.join('\\n- ')}\\n\\n` : '';

          context.emit('done');
          return {
            handled: false,
            prompt: `We are creating a new skill named \"${name}\".\\n\\n${knownBlock}${missingBlock}` +
              'Use the ask_user tool to interview the user and collect missing fields. ' +
              'Then call skill_create with name, scope, and any provided fields. ' +
              'If the user leaves optional fields blank, omit them. ' +
              'If scope is not specified, default to project.',
          };
        }

        const finalScope: SkillScope = scope ?? 'project';

        try {
          const result = await createSkill({
            name,
            scope: finalScope,
            description,
            allowedTools,
            argumentHint,
            content,
            cwd: context.cwd,
            overwrite,
          });

          await context.refreshSkills?.();

          let message = `\nCreated skill \"${result.name}\" (${result.scope}).\n`;
          message += `Location: ${result.filePath}\n`;
          message += `Invoke with: $${result.name} [args] or /${result.name} [args]\n`;
          if (!scope) {
            message += 'Defaulted to project scope. Use --global for a global skill.\n';
          }
          context.emit('text', message);
          context.emit('done');
          return { handled: true };
        } catch (error) {
          context.emit('text', `Failed to create skill: ${error instanceof Error ? error.message : String(error)}\n`);
          context.emit('done');
          return { handled: true };
        }
      }

      // /skills install <name> [--global]
      if (subcommand === 'install') {
        const nameToken = tokens.shift()?.trim();
        if (!nameToken) {
          context.emit('text', 'Usage: /skills install <name> [--global]\n');
          context.emit('done');
          return { handled: true };
        }
        const installScope = tokens.includes('--global') ? 'global' as const : 'project' as const;
        try {
          const result = await SkillInstaller.install({ name: nameToken, scope: installScope, cwd: context.cwd });
          context.emit('text', `\nInstalled skill "${result.name}" (${result.packageName}@${result.version}).\n`);
          context.emit('text', `Location: ${result.skillDir}\n`);
          context.emit('text', `Scope: ${installScope}\n`);
          await context.refreshSkills?.();
        } catch (error) {
          context.emit('text', `Failed to install skill: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /skills uninstall <name> [--global]
      if (subcommand === 'uninstall' || subcommand === 'remove') {
        const nameToken = tokens.shift()?.trim();
        if (!nameToken) {
          context.emit('text', 'Usage: /skills uninstall <name> [--global]\n');
          context.emit('done');
          return { handled: true };
        }
        const uninstallScope = tokens.includes('--global') ? 'global' as const : 'project' as const;
        try {
          await SkillInstaller.uninstall(nameToken, uninstallScope, context.cwd);
          context.emit('text', `\nUninstalled skill "${nameToken}" from ${uninstallScope} scope.\n`);
          await context.refreshSkills?.();
        } catch (error) {
          context.emit('text', `Failed to uninstall skill: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /skills list
      if (subcommand === 'list' || subcommand === 'ls') {
        const outputOptions = parseDisclosureOptions(tokens);
        if (outputOptions.error) {
          context.emit('text', `${outputOptions.error}\n`);
          context.emit('done');
          return { handled: true };
        }
        const installedRows: Array<{ scope: 'project' | 'global'; packageName: string; version: string }> = [];
        for (const scope of ['project', 'global'] as const) {
          const installed = await SkillInstaller.listInstalled(scope, context.cwd);
          installedRows.push(...installed.map((pkg) => ({
            scope,
            packageName: pkg.packageName,
            version: pkg.version,
          })));
        }
        const page = pageItems(installedRows, outputOptions);
        if (outputOptions.json) {
          context.emit('text', JSON.stringify({
            skills: page.items,
            total: page.total,
            limit: outputOptions.limit,
            cursor: outputOptions.cursor,
            nextCursor: page.nextCursor,
          }, null, 2));
        } else if (installedRows.length === 0) {
          context.emit('text', '\nNo npm skills installed.\n');
        } else {
          const lines: string[] = [`\n**Installed skills** (${page.shown}/${page.total})\n`];
          for (const pkg of page.items) {
            lines.push(`  [${pkg.scope}] ${truncateText(pkg.packageName, outputOptions.verbose ? 96 : 48)} ${pkg.version}`);
          }
          lines.push(disclosureHint(outputOptions, page.total, page.shown, '/skills install <name>'));
          context.emit('text', lines.join('\n') + '\n');
          context.emit('done');
          return { handled: true };
        }
        context.emit('done');
        return { handled: true };
      }

      // /skills help
      if (subcommand === 'help') {
        let message = '\n**/skills commands**\n\n';
        message += '/skills                    Open interactive skills panel\n';
        message += '/skills create <name>      Create a new skill\n';
        message += '/skills install <name>     Install npm skill (@hasnaxyz/skill-*)\n';
        message += '/skills uninstall <name>   Uninstall npm skill\n';
        message += '/skills list [flags]       List installed npm skills\n';
        message += '\nList flags: --limit <n> --cursor <n> --verbose --json\n';
        message += '\nOptions for create:\n';
        message += '  --project            Create in project (.skill/)\n';
        message += '  --global             Create globally (~/.skill/)\n';
        message += '  --desc "..."         Description\n';
        message += '  --tools a,b,c        Allowed tools list\n';
        message += '  --hint "..."         Argument hint\n';
        message += '  --content "..."      Skill body content\n';
        message += '  --interactive         Ask follow-up questions\n';
        message += '  --force              Overwrite existing skill\n';
        message += '  --yes                Accept default (project) scope\n';
        message += '\nOptions for install/uninstall:\n';
        message += '  --global             Use global scope (~/.skill/)\n';
        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      // /skills (no args or unknown) → open interactive panel
      if (!subcommand) {
        context.emit('done');
        return { handled: true, showPanel: 'skills' };
      }

      context.emit('text', `Unknown /skills subcommand: ${subcommand}\n`);
      context.emit('text', 'Use /skills help for available commands.\n');
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /feedback - Submit feedback or report issues
 */
export function feedbackCommand(): Command {
  return {
    name: 'feedback',
    description: 'Submit feedback (good/bad/bug/idea) or report an issue on GitHub',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const rawArgs = args.trim();
      const [maybeType, ...rest] = rawArgs.split(/\s+/);
      const normalizedType = maybeType?.toLowerCase();
      const typeMap: Record<string, FeedbackType> = {
        bug: 'bug',
        issue: 'bug',
        feature: 'feature',
        request: 'feature',
        feedback: 'feedback',
      };
      const typeToken = normalizedType && typeMap[normalizedType] ? normalizedType : null;
      const feedbackType: FeedbackType = typeToken ? typeMap[typeToken] : 'feedback';
      const summary = typeToken ? rest.join(' ').trim() : rawArgs;

      // Collect system info
      const runtime = getRuntime();
      const systemInfo = {
        version: VERSION,
        platform: platform(),
        release: release(),
        arch: arch(),
        nodeVersion: process.version,
        runtimeName: runtime.name,
        runtimeVersion: runtime.version,
      };

      // GitHub repo URL
      const repoUrl = 'https://github.com/hasna/assistants';

      // Build issue body template
      const issueBody = `## Description

<!-- Describe the issue or feedback here -->

## Steps to Reproduce (if bug)

1.
2.
3.

## Expected Behavior

<!-- What did you expect to happen? -->

## Actual Behavior

<!-- What actually happened? -->

## System Information

- **assistants version**: ${systemInfo.version}
- **Platform**: ${systemInfo.platform} ${systemInfo.release} (${systemInfo.arch})
- **Runtime**: ${systemInfo.runtimeName} ${systemInfo.runtimeVersion}
- **Node version**: ${systemInfo.nodeVersion}

## Additional Context

<!-- Add any other context about the problem here -->
`;

      // Determine issue template based on feedback type
      let issueTitle = '';
      let labels = '';

      if (feedbackType === 'bug') {
        issueTitle = '[Bug] ';
        labels = 'bug';
      } else if (feedbackType === 'feature') {
        issueTitle = '[Feature Request] ';
        labels = 'enhancement';
      } else {
        issueTitle = '[Feedback] ';
        labels = 'feedback';
      }

      // Save locally
      const localEntry = {
        id: generateId(),
        createdAt: new Date().toISOString(),
        type: feedbackType,
        title: summary || (feedbackType === 'bug' ? 'Bug report' : feedbackType === 'feature' ? 'Feature request' : 'Feedback'),
        description: summary || 'Submitted via /feedback',
        source: 'command',
        metadata: {
          cwd: context.cwd,
        },
      };
      let localPath = '';
      try {
        const saved = saveFeedbackEntry(localEntry, context.cwd);
        localPath = saved.path;
      } catch {
        localPath = '';
      }

      // Build GitHub new issue URL
      const issueUrl = new URL(`${repoUrl}/issues/new`);
      issueUrl.searchParams.set('title', issueTitle);
      issueUrl.searchParams.set('body', issueBody);
      if (labels) {
        issueUrl.searchParams.set('labels', labels);
      }

      // Truncate URL if too long (GitHub has limits)
      let finalUrl = issueUrl.toString();
      if (finalUrl.length > 8000) {
        // Shorten the body if URL is too long
        const shortBody = `## Description

<!-- Describe the issue or feedback here -->

## System Information

- **assistants version**: ${systemInfo.version}
- **Platform**: ${systemInfo.platform} (${systemInfo.arch})
- **Runtime**: ${systemInfo.runtimeName} ${systemInfo.runtimeVersion}
`;
        const shortUrl = new URL(`${repoUrl}/issues/new`);
        shortUrl.searchParams.set('title', issueTitle);
        shortUrl.searchParams.set('body', shortBody);
        if (labels) {
          shortUrl.searchParams.set('labels', labels);
        }
        finalUrl = shortUrl.toString();
      }

      // Open browser
      try {
        const openCmd = platform() === 'darwin' ? 'open' :
                       platform() === 'win32' ? 'start' : 'xdg-open';

        const runtime = getRuntime();
        await runtime.shell`${openCmd} ${finalUrl}`.quiet();

        let message = '\n**Opening GitHub to submit feedback...**\n\n';
        message += 'A browser window should open with a pre-filled issue template.\n';
        message += 'Please fill in the details and submit.\n\n';
        if (localPath) {
          message += `Saved locally: ${localPath}\n\n`;
        }
        message += `If the browser doesn't open, visit:\n${repoUrl}/issues/new\n`;

        context.emit('text', message);
      } catch {
        let message = '\n**Submit Feedback**\n\n';
        message += `Please visit: ${repoUrl}/issues/new\n\n`;
        if (localPath) {
          message += `Saved locally: ${localPath}\n\n`;
        }
        message += '**System Information:**\n';
        message += `- assistants version: ${systemInfo.version}\n`;
        message += `- Platform: ${systemInfo.platform} ${systemInfo.release}\n`;
        message += `- Runtime: ${systemInfo.runtimeName} ${systemInfo.runtimeVersion}\n`;

        context.emit('text', message);
      }

      context.emit('done');
      return { handled: true };
    },
  };
}
