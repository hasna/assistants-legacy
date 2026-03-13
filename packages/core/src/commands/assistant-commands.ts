import type { Command } from './types';
import { splitArgs } from './helpers';
import { listTemplates, createIdentityFromTemplate } from '../identity/templates';

/**
 * /assistants - Manage assistants
 */
export function assistantCommand(): Command {
  return {
    name: 'assistants',
    description: 'Manage assistants (list, create, switch, delete)',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const manager = context.getAssistantManager?.();
      if (!manager) {
        context.emit('text', 'Assistant manager not available.\n');
        context.emit('done');
        return { handled: true };
      }

      const [action, ...rest] = args.trim().split(/\s+/).filter(Boolean);
      const target = rest.join(' ');
      const switchAssistantInContext = async (assistantId: string) => {
        if (context.switchAssistant) {
          await context.switchAssistant(assistantId);
          return;
        }
        await manager.switchAssistant(assistantId);
        await context.refreshIdentityContext?.();
      };

      // Show interactive panel for no args or 'ui' command
      if (!action || action === 'ui') {
        context.emit('done');
        return { handled: true, showPanel: 'assistants' };
      }

      // Show current assistant info (text output for scripting)
      if (action === 'show' || action === 'info') {
        const active = manager.getActive();
        if (!active) {
          context.emit('text', 'No active assistant.\n');
        } else {
          context.emit('text', `Current assistant: ${active.name}\n`);
          context.emit('text', `ID: ${active.id}\n`);
          if (active.description) context.emit('text', `Description: ${active.description}\n`);
          context.emit('text', `Model: ${active.settings.model}\n`);
          if (active.settings.temperature !== undefined) {
            context.emit('text', `Temperature: ${active.settings.temperature}\n`);
          }
        }
        context.emit('done');
        return { handled: true };
      }

      if (action === 'list') {
        const assistants = manager.listAssistants();
        if (assistants.length === 0) {
          context.emit('text', 'No assistants found.\n');
        } else {
          context.emit('text', '\nAssistants:\n');
          for (const assistant of assistants) {
            const marker = manager.getActiveId() === assistant.id ? '*' : ' ';
            context.emit('text', ` ${marker} ${assistant.name} (${assistant.id})\n`);
          }
        }
        context.emit('done');
        return { handled: true };
      }

      if (action === 'create') {
        if (!target) {
          context.emit('text', 'Usage: /assistants create <name>\n');
          context.emit('done');
          return { handled: true };
        }
        const created = await manager.createAssistant({ name: target });
        await switchAssistantInContext(created.id);
        context.emit('text', `Created assistant ${created.name} (${created.id}).\n`);
        context.emit('done');
        return { handled: true };
      }

      if (action === 'switch') {
        if (!target) {
          context.emit('text', 'Usage: /assistants switch <name|id>\n');
          context.emit('done');
          return { handled: true };
        }
        const assistants = manager.listAssistants();
        const match = assistants.find((assistant) =>
          assistant.id === target || assistant.name.toLowerCase() === target.toLowerCase()
        );
        if (!match) {
          context.emit('text', `Assistant not found: ${target}\n`);
          context.emit('done');
          return { handled: true };
        }
        await switchAssistantInContext(match.id);
        context.emit('text', `Switched to ${match.name}.\n`);
        context.emit('done');
        return { handled: true };
      }

      if (action === 'delete') {
        if (!target) {
          context.emit('text', 'Usage: /assistants delete <name|id>\n');
          context.emit('done');
          return { handled: true };
        }
        const assistants = manager.listAssistants();
        if (assistants.length <= 1) {
          context.emit('text', 'Cannot delete the last remaining assistant.\n');
          context.emit('done');
          return { handled: true };
        }
        const match = assistants.find((assistant) =>
          assistant.id === target || assistant.name.toLowerCase() === target.toLowerCase()
        );
        if (!match) {
          context.emit('text', `Assistant not found: ${target}\n`);
          context.emit('done');
          return { handled: true };
        }
        const activeBeforeDelete = manager.getActiveId();
        await manager.deleteAssistant(match.id);
        if (activeBeforeDelete === match.id) {
          const nextActiveId = manager.getActiveId();
          if (nextActiveId) {
            await switchAssistantInContext(nextActiveId);
          }
        }
        context.emit('text', `Deleted assistant ${match.name}.\n`);
        context.emit('done');
        return { handled: true };
      }

      if (action === 'settings') {
        const active = manager.getActive();
        if (!active) {
          context.emit('text', 'No active assistant.\n');
          context.emit('done');
          return { handled: true };
        }
        context.emit('text', `Assistant settings for ${active.name}:\n`);
        context.emit('text', JSON.stringify(active.settings, null, 2) + '\n');
        context.emit('done');
        return { handled: true };
      }

      // /assistants prompt <text> - Set the assistant's system prompt addition
      if (action === 'prompt') {
        const active = manager.getActive();
        if (!active) {
          context.emit('text', 'No active assistant.\n');
          context.emit('done');
          return { handled: true };
        }

        if (!target) {
          // Show current prompt
          if (active.settings.systemPromptAddition) {
            context.emit('text', `Current system prompt for ${active.name}:\n`);
            context.emit('text', active.settings.systemPromptAddition + '\n');
          } else {
            context.emit('text', `No system prompt set for ${active.name}.\n`);
            context.emit('text', 'Usage: /assistants prompt <text>\n');
          }
          context.emit('done');
          return { handled: true };
        }

        // Set the prompt
        await manager.updateAssistant(active.id, {
          settings: {
            ...active.settings,
            systemPromptAddition: target,
          },
        });
        await context.refreshIdentityContext?.();
        context.emit('text', `System prompt updated for ${active.name}.\n`);
        context.emit('done');
        return { handled: true };
      }

      // /assistants prompt-clear - Clear the assistant's system prompt addition
      if (action === 'prompt-clear') {
        const active = manager.getActive();
        if (!active) {
          context.emit('text', 'No active assistant.\n');
          context.emit('done');
          return { handled: true };
        }

        const { systemPromptAddition, ...restSettings } = active.settings;
        await manager.updateAssistant(active.id, {
          settings: restSettings,
        });
        await context.refreshIdentityContext?.();
        context.emit('text', `System prompt cleared for ${active.name}.\n`);
        context.emit('done');
        return { handled: true };
      }

      if (action === 'update') {
        context.emit('text', 'To update assistants, run:\n');
        context.emit('text', '  bun install -g @hasna/assistants\n');
        context.emit('done');
        return { handled: true };
      }

      // /assistants help
      if (action === 'help') {
        context.emit('text', '\n## Assistant Commands\n\n');
        context.emit('text', '/assistants                   Open interactive assistant panel\n');
        context.emit('text', '/assistants show               Show current assistant info\n');
        context.emit('text', '/assistants list               List all assistants\n');
        context.emit('text', '/assistants create <name>      Create new assistant\n');
        context.emit('text', '/assistants switch <name|id>   Switch to assistant\n');
        context.emit('text', '/assistants delete <name|id>   Delete assistant\n');
        context.emit('text', '/assistants settings           Show assistant settings\n');
        context.emit('text', '/assistants prompt [text]      Get/set assistant system prompt\n');
        context.emit('text', '/assistants prompt-clear       Clear assistant system prompt\n');
        context.emit('text', '/assistants update             Update CLI via bun install -g\n');
        context.emit('text', '/assistants help               Show this help\n');
        context.emit('done');
        return { handled: true };
      }

      context.emit('text', 'Unknown /assistants command. Use /assistants help for options.\n');
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /identity - Manage identities
 */
export function identityCommand(): Command {
  return {
    name: 'identity',
    description: 'Manage identities for the current assistant',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const manager = context.getIdentityManager?.();
      if (!manager) {
        context.emit('text', 'Identity manager not available.\n');
        context.emit('done');
        return { handled: true };
      }

      const [action, ...rest] = args.trim().split(/\s+/).filter(Boolean);
      const target = rest.join(' ');

      if (!action || action === 'ui') {
        context.emit('done');
        return { handled: true, showPanel: 'identity' };
      }

      if (action === 'list') {
        const identities = manager.listIdentities();
        if (identities.length === 0) {
          context.emit('text', 'No identities found.\n');
        } else {
          context.emit('text', '\nIdentities:\n');
          for (const identity of identities) {
            const marker = manager.getActive()?.id === identity.id ? '*' : ' ';
            context.emit('text', ` ${marker} ${identity.name} (${identity.id})\n`);
          }
        }
        context.emit('done');
        return { handled: true };
      }

      if (action === 'create') {
        // Check for --template flag
        const templateIndex = rest.indexOf('--template');
        if (templateIndex !== -1) {
          const templateName = rest[templateIndex + 1];
          if (!templateName) {
            context.emit('text', 'Usage: /identity create --template <template-name>\n');
            context.emit('text', 'Use /identity templates to see available templates.\n');
            context.emit('done');
            return { handled: true };
          }
          const createOptions = createIdentityFromTemplate(templateName);
          if (!createOptions) {
            context.emit('text', `Template not found: ${templateName}\n`);
            context.emit('text', 'Use /identity templates to see available templates.\n');
            context.emit('done');
            return { handled: true };
          }
          const created = await manager.createIdentity(createOptions);
          await context.refreshIdentityContext?.();
          context.emit('text', `Created identity "${created.name}" from template "${templateName}" (${created.id}).\n`);
          context.emit('done');
          return { handled: true };
        }

        if (!target) {
          context.emit('text', 'Usage: /identity create <name>\n');
          context.emit('text', 'Or: /identity create --template <template-name>\n');
          context.emit('done');
          return { handled: true };
        }
        const created = await manager.createIdentity({ name: target });
        await context.refreshIdentityContext?.();
        context.emit('text', `Created identity ${created.name} (${created.id}).\n`);
        context.emit('done');
        return { handled: true };
      }

      if (action === 'switch') {
        if (!target) {
          context.emit('text', 'Usage: /identity switch <name|id>\n');
          context.emit('done');
          return { handled: true };
        }
        const identities = manager.listIdentities();
        const match = identities.find((identity) =>
          identity.id === target || identity.name.toLowerCase() === target.toLowerCase()
        );
        if (!match) {
          context.emit('text', `Identity not found: ${target}\n`);
          context.emit('done');
          return { handled: true };
        }
        await context.switchIdentity?.(match.id);
        context.emit('text', `Switched to ${match.name}.\n`);
        context.emit('done');
        return { handled: true };
      }

      if (action === 'delete') {
        if (!target) {
          context.emit('text', 'Usage: /identity delete <name|id>\n');
          context.emit('done');
          return { handled: true };
        }
        const identities = manager.listIdentities();
        const match = identities.find((identity) =>
          identity.id === target || identity.name.toLowerCase() === target.toLowerCase()
        );
        if (!match) {
          context.emit('text', `Identity not found: ${target}\n`);
          context.emit('done');
          return { handled: true };
        }
        await manager.deleteIdentity(match.id);
        await context.refreshIdentityContext?.();
        context.emit('text', `Deleted identity ${match.name}.\n`);
        context.emit('done');
        return { handled: true };
      }

      // /identity templates - List available templates
      if (action === 'templates') {
        const templates = listTemplates();
        context.emit('text', '\n## Identity Templates\n\n');
        for (const t of templates) {
          context.emit('text', `**${t.name}** - ${t.description}\n`);
        }
        context.emit('text', '\nUsage: /identity create --template <name>\n');
        context.emit('done');
        return { handled: true };
      }

      // /identity edit <name|id> - Open identity panel for editing
      // /identity show <name|id> - Show identity details
      if (action === 'edit' || action === 'show') {
        if (!target) {
          context.emit('text', `Usage: /identity ${action} <name|id>\n`);
          context.emit('done');
          return { handled: true };
        }
        const identities = manager.listIdentities();
        const match = identities.find((identity) =>
          identity.id === target || identity.name.toLowerCase() === target.toLowerCase()
        );
        if (!match) {
          context.emit('text', `Identity not found: ${target}\n`);
          context.emit('done');
          return { handled: true };
        }
        if (action === 'edit') {
          context.emit('done');
          return { handled: true, showPanel: 'identity', panelValue: `edit:${match.id}` };
        }
        context.emit('text', '\n## Identity Details\n\n');
        context.emit('text', `**Name:** ${match.name}\n`);
        context.emit('text', `**ID:** ${match.id}\n`);
        context.emit('text', `**Display Name:** ${match.profile.displayName}\n`);
        if (match.profile.title) context.emit('text', `**Title:** ${match.profile.title}\n`);
        if (match.profile.company) context.emit('text', `**Company:** ${match.profile.company}\n`);
        context.emit('text', `**Timezone:** ${match.profile.timezone}\n`);
        context.emit('text', `**Locale:** ${match.profile.locale}\n`);
        context.emit('text', `**Communication Style:** ${match.preferences.communicationStyle}\n`);
        context.emit('text', `**Response Length:** ${match.preferences.responseLength}\n`);
        if (match.context) {
          context.emit('text', `**Context:**\n${match.context}\n`);
        }
        context.emit('text', `**Default:** ${match.isDefault ? 'Yes' : 'No'}\n`);
        context.emit('text', '\nTo update fields, use the web UI or edit the identity file directly.\n');
        context.emit('done');
        return { handled: true };
      }

      // /identity set-default <name|id> - Set as default
      if (action === 'set-default' || action === 'default') {
        if (!target) {
          context.emit('text', 'Usage: /identity set-default <name|id>\n');
          context.emit('done');
          return { handled: true };
        }
        const identities = manager.listIdentities();
        const match = identities.find((identity) =>
          identity.id === target || identity.name.toLowerCase() === target.toLowerCase()
        );
        if (!match) {
          context.emit('text', `Identity not found: ${target}\n`);
          context.emit('done');
          return { handled: true };
        }
        // Remove default from all, set on this one
        for (const identity of identities) {
          if (identity.isDefault && identity.id !== match.id) {
            await manager.updateIdentity(identity.id, { isDefault: false });
          }
        }
        await manager.updateIdentity(match.id, { isDefault: true });
        context.emit('text', `Set ${match.name} as default identity.\n`);
        context.emit('done');
        return { handled: true };
      }

      // /identity help - Show help
      if (action === 'help') {
        context.emit('text', '\n## Identity Commands\n\n');
        context.emit('text', '/identity                        Show current identity\n');
        context.emit('text', '/identity list                   List all identities\n');
        context.emit('text', '/identity create <name>          Create new identity\n');
        context.emit('text', '/identity create --template <t>  Create from template\n');
        context.emit('text', '/identity switch <name|id>       Switch to identity\n');
        context.emit('text', '/identity show <name|id>         Show identity details\n');
        context.emit('text', '/identity edit <name|id>         Edit identity in panel\n');
        context.emit('text', '/identity set-default <name|id>  Set as default\n');
        context.emit('text', '/identity delete <name|id>       Delete identity\n');
        context.emit('text', '/identity templates              List available templates\n');
        context.emit('text', '/identity help                   Show this help\n');
        context.emit('done');
        return { handled: true };
      }

      context.emit('text', 'Unknown /identity command. Use /identity help for options.\n');
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /registry - View and manage registered assistants (runtime instances)
 */
export function assistantsCommand(): Command {
  return {
    name: 'registry',
    description: 'View and manage registered assistants (runtime instances)',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      // Import registry service
      const { getGlobalRegistry } = await import('../registry');

      const action = args.trim().toLowerCase();
      const registry = getGlobalRegistry();

      // /registry help
      if (action === 'help') {
        let message = '\n## Registry Commands\n\n';
        message += '/registry                         List all registered assistants\n';
        message += '/registry list                    List all registered assistants\n';
        message += '/registry status                  Show registry statistics\n';
        message += '/registry cleanup                 Remove stale/offline assistants\n';
        message += '/registry help                    Show this help\n';
        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      // /assistants list - Show all assistants
      if (action === 'list') {
        const assistants = registry.list();
        if (assistants.length === 0) {
          context.emit('text', '\nNo assistants currently registered.\n');
          context.emit('done');
          return { handled: true };
        }

        let message = '\n**Registered Assistants**\n\n';
        for (const entry of assistants) {
          const state = entry.status.state;
          const stateIcon = state === 'idle' ? '●' :
            state === 'processing' ? '◐' :
            state === 'error' ? '✗' :
            state === 'offline' ? '○' : '◌';
          const stateColor = state === 'idle' ? 'green' :
            state === 'processing' ? 'yellow' :
            state === 'error' ? 'red' : 'gray';

          message += `${stateIcon} **${entry.name}** (${entry.type})\n`;
          message += `   ID: ${entry.id.slice(0, 16)}...\n`;
          message += `   State: ${state}\n`;
          if (entry.status.currentTask) {
            message += `   Task: ${entry.status.currentTask}\n`;
          }
          message += `   Tools: ${entry.capabilities.tools.length} | Skills: ${entry.capabilities.skills.length}\n`;
          message += `   Load: ${entry.load.activeTasks} active, ${entry.load.queuedTasks} queued\n\n`;
        }
        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      // /assistants status - Show registry stats
      if (action === 'status') {
        const stats = registry.getStats();
        let message = '\n**Assistant Registry Status**\n\n';
        message += `Total Assistants: ${stats.totalAssistants}\n`;
        message += `Stale: ${stats.staleCount}\n`;
        message += `Average Load: ${(stats.averageLoad * 100).toFixed(0)}%\n`;
        message += `Uptime: ${Math.floor(stats.uptime / 60)} minutes\n\n`;

        message += '**By Type:**\n';
        message += `  Assistants: ${stats.byType.assistant}\n`;
        message += `  Subassistants: ${stats.byType.subassistant}\n`;
        message += `  Coordinators: ${stats.byType.coordinator}\n`;
        message += `  Workers: ${stats.byType.worker}\n\n`;

        message += '**By State:**\n';
        message += `  Idle: ${stats.byState.idle}\n`;
        message += `  Processing: ${stats.byState.processing}\n`;
        message += `  Waiting: ${stats.byState.waiting_input}\n`;
        message += `  Error: ${stats.byState.error}\n`;
        message += `  Offline: ${stats.byState.offline}\n`;

        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      // /assistants cleanup - Clean up stale assistants
      if (action === 'cleanup') {
        const beforeCount = registry.list().length;
        registry.cleanupStaleAssistants();
        const afterCount = registry.list().length;
        const removed = beforeCount - afterCount;

        if (removed > 0) {
          context.emit('text', `\n✓ Removed ${removed} stale assistant${removed > 1 ? 's' : ''}\n`);
        } else {
          context.emit('text', '\n✓ No stale assistants to clean up\n');
        }
        context.emit('done');
        return { handled: true };
      }

      // /registry with no args - show list
      if (!action) {
        // Fall through to list
        const assistantsList = registry.list();
        if (assistantsList.length === 0) {
          context.emit('text', '\nNo assistants currently registered.\n');
        } else {
          let message = '\n**Registered Assistants**\n\n';
          for (const entry of assistantsList) {
            const state = entry.status.state;
            const stateIcon = state === 'idle' ? '●' :
              state === 'processing' ? '◐' :
              state === 'error' ? '✗' :
              state === 'offline' ? '○' : '◌';
            message += `${stateIcon} **${entry.name}** (${entry.type})\n`;
            message += `   ID: ${entry.id.slice(0, 16)}...\n`;
            message += `   State: ${state}\n`;
            if (entry.status.currentTask) {
              message += `   Task: ${entry.status.currentTask}\n`;
            }
            message += `   Tools: ${entry.capabilities.tools.length} | Skills: ${entry.capabilities.skills.length}\n`;
            message += `   Load: ${entry.load.activeTasks} active, ${entry.load.queuedTasks} queued\n\n`;
          }
          context.emit('text', message);
        }
        context.emit('done');
        return { handled: true };
      }

      // Unknown subcommand
      context.emit('text', `\n⚠ Unknown command: /registry ${action}\n`);
      context.emit('text', 'Use /registry help for available commands.\n');
      context.emit('done');
      return { handled: true };
    },
  };
}
