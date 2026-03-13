import type { Command } from './types';
import { splitArgs } from './helpers';
import {
  loadAgentDefinitions,
  getAgentDefinition,
  saveAgentDefinition,
  deleteAgentDefinition,
} from '../agents';

/**
 * /swarm - Multi-assistant swarm execution
 */
export function swarmCommand(): Command {
  return {
    name: 'swarm',
    description: 'Execute multi-assistant swarm for complex tasks',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      // Import swarm config
      const { DEFAULT_SWARM_CONFIG } = await import('../swarm');

      const trimmedArgs = args.trim();

      // Get swarm coordinator from context (available when running in full assistant loop)
      const coordinator = context.getSwarmCoordinator?.();

      // /swarm help
      if (trimmedArgs === 'help' || trimmedArgs === '') {
        let message = '\n## Swarm Commands\n\n';
        message += '/swarm <goal>                 Execute swarm for a goal\n';
        message += '/swarm status                 Show swarm status\n';
        message += '/swarm stop                   Stop current swarm\n';
        message += '/swarm memory                 Show shared memory contents\n';
        message += '/swarm config                 Show swarm configuration\n';
        message += '/swarm help                   Show this help\n\n';
        message += '**Example:**\n';
        message += '/swarm Research and summarize the authentication patterns in this codebase\n';
        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      // /swarm config - Show configuration
      if (trimmedArgs === 'config') {
        let message = '\n**Swarm Configuration**\n\n';
        message += `Enabled: ${DEFAULT_SWARM_CONFIG.enabled}\n`;
        message += `Max Concurrent Workers: ${DEFAULT_SWARM_CONFIG.maxConcurrent}\n`;
        message += `Max Tasks: ${DEFAULT_SWARM_CONFIG.maxTasks}\n`;
        message += `Max Depth: ${DEFAULT_SWARM_CONFIG.maxDepth}\n`;
        message += `Task Timeout: ${Math.round(DEFAULT_SWARM_CONFIG.taskTimeoutMs / 1000)}s\n`;
        message += `Swarm Timeout: ${Math.round(DEFAULT_SWARM_CONFIG.swarmTimeoutMs / 1000)}s\n`;
        message += `Auto-Approve Plans: ${DEFAULT_SWARM_CONFIG.autoApprove}\n`;
        message += `Enable Critic: ${DEFAULT_SWARM_CONFIG.enableCritic}\n`;
        message += `Token Budget: ${DEFAULT_SWARM_CONFIG.tokenBudget || 'unlimited'}\n\n`;
        message += '**Default Tools:**\n';
        message += `  Planner: ${DEFAULT_SWARM_CONFIG.plannerTools.join(', ')}\n`;
        message += `  Worker: ${DEFAULT_SWARM_CONFIG.workerTools.join(', ')}\n`;
        message += `  Critic: ${DEFAULT_SWARM_CONFIG.criticTools.join(', ')}\n`;
        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      // /swarm status - Show current swarm status
      if (trimmedArgs === 'status') {
        if (!coordinator) {
          context.emit('text', '\n⚠️ Swarm coordinator not available in this context.\n');
          context.emit('done');
          return { handled: true };
        }

        const state = coordinator.getState();
        if (!state) {
          context.emit('text', '\nNo swarm currently running. Use /swarm <goal> to start.\n');
          context.emit('done');
          return { handled: true };
        }

        let message = '\n**Swarm Status**\n\n';
        message += `ID: ${state.id}\n`;
        message += `Status: ${state.status}\n`;
        if (state.plan) {
          message += `\n**Plan:** ${state.plan.goal}\n`;
          message += `Tasks: ${state.plan.tasks.length}\n`;
          message += `Approved: ${state.plan.approved ? 'Yes' : 'No'}\n`;
        }
        if (state.metrics) {
          message += '\n**Metrics:**\n';
          message += `  Completed: ${state.metrics.completedTasks}/${state.metrics.totalTasks}\n`;
          if (state.metrics.failedTasks > 0) {
            message += `  Failed: ${state.metrics.failedTasks}\n`;
          }
          message += `  Tool Calls: ${state.metrics.toolCalls}\n`;
        }
        if (state.activeAssistants && state.activeAssistants.size > 0) {
          message += `\n**Active Assistants:** ${state.activeAssistants.size}\n`;
        }
        if (state.errors && state.errors.length > 0) {
          message += '\n**Errors:**\n';
          for (const err of state.errors.slice(-3)) {
            message += `  - ${err}\n`;
          }
        }
        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      // /swarm memory - Show shared memory contents
      if (trimmedArgs === 'memory') {
        if (!coordinator) {
          context.emit('text', '\n⚠️ Swarm coordinator not available in this context.\n');
          context.emit('done');
          return { handled: true };
        }

        const memory = coordinator.getMemory();
        if (!memory) {
          context.emit('text', '\nShared memory is not enabled for this swarm.\nEnable it with `enableSharedMemory: true` in swarm config.\n');
          context.emit('done');
          return { handled: true };
        }

        const stats = memory.getStats();
        let message = '\n**Swarm Shared Memory**\n\n';
        message += `Total entries: ${stats.totalEntries}\n`;
        message += `Total access count: ${stats.totalAccessCount}\n\n`;

        if (stats.totalEntries > 0) {
          message += '**By Category:**\n';
          for (const [category, count] of Object.entries(stats.byCategory)) {
            if (count > 0) {
              message += `  ${category}: ${count}\n`;
            }
          }

          message += '\n**Recent Entries:**\n';
          const entries = memory.list();
          const recent = entries.slice(0, 10);
          for (const entry of recent) {
            const preview = entry.content.length > 100 ? entry.content.slice(0, 100) + '...' : entry.content;
            message += `\n- [${entry.category}] ${preview}\n`;
            message += `  Tags: ${entry.tags.join(', ')} | Relevance: ${entry.relevance}\n`;
          }
        } else {
          message += 'No entries in shared memory yet.\n';
        }

        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      // /swarm stop - Stop current swarm
      if (trimmedArgs === 'stop') {
        if (!coordinator) {
          context.emit('text', '\n⚠️ Swarm coordinator not available in this context.\n');
          context.emit('done');
          return { handled: true };
        }

        if (!coordinator.isRunning()) {
          context.emit('text', '\nNo swarm currently running.\n');
          context.emit('done');
          return { handled: true };
        }

        coordinator.stop();
        context.emit('text', '\n✓ Swarm execution stopped.\n');
        context.emit('done');
        return { handled: true };
      }

      // /swarm <goal> - Execute swarm
      if (!coordinator) {
        context.emit('text', '\n⚠️ Swarm coordinator not available.\n');
        context.emit('text', 'Swarm execution requires full assistant context with subassistant support.\n');
        context.emit('text', '\n**Alternatives:**\n');
        context.emit('text', '- Use the `swarm_execute` tool programmatically\n');
        context.emit('text', '- Use the `assistant_delegate` tool for complex tasks\n');
        context.emit('done');
        return { handled: true };
      }

      // Execute the swarm
      context.emit('text', `\n🐝 Starting swarm for goal: ${trimmedArgs}\n\n`);

      try {
        const result = await coordinator.execute({
          goal: trimmedArgs,
          config: {
            autoApprove: true, // Auto-approve for command-line usage
          },
        });

        if (result.success) {
          let message = '\n**✓ Swarm completed successfully**\n\n';
          if (result.result) {
            message += '**Result:**\n';
            message += result.result + '\n\n';
          }
          message += '**Metrics:**\n';
          message += `  Tasks: ${result.metrics.completedTasks}/${result.metrics.totalTasks} completed\n`;
          if (result.metrics.failedTasks > 0) {
            message += `  Failed: ${result.metrics.failedTasks}\n`;
          }
          message += `  Tool calls: ${result.metrics.toolCalls}\n`;
          message += `  Duration: ${Math.round(result.durationMs / 1000)}s\n`;
          context.emit('text', message);
        } else {
          let message = '\n**✗ Swarm execution failed**\n\n';
          message += `Error: ${result.error}\n`;
          if (Object.keys(result.taskResults).length > 0) {
            message += `\nPartial results: ${Object.keys(result.taskResults).length} tasks completed before failure\n`;
          }
          message += '\n**Metrics:**\n';
          message += `  Tasks: ${result.metrics.completedTasks}/${result.metrics.totalTasks}\n`;
          message += `  Failed: ${result.metrics.failedTasks}\n`;
          context.emit('text', message);
        }
      } catch (error) {
        context.emit('text', `\n**✗ Swarm execution error:**\n${error instanceof Error ? error.message : String(error)}\n`);
      }

      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /agents - Manage named subagent definitions
 */
export function agentsCommand(): Command {
  return {
    name: 'agents',
    aliases: ['agent'],
    description: 'List, create, and delete named subagent definitions',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const tokens = splitArgs(args || '');
      const subcommand = tokens.shift()?.toLowerCase();

      // /agents create <name> [options]
      if (subcommand === 'create') {
        let name: string | undefined;
        let description: string | undefined;
        let tools: string[] | undefined;
        let systemPrompt: string | undefined;
        let maxTurns: number | undefined;
        let minTurns: number | undefined;
        let workUntilDone: boolean | undefined;
        let scope: 'global' | 'project' = 'project';
        let interactive = false;

        for (let i = 0; i < tokens.length; i += 1) {
          const token = tokens[i];
          if (!token) continue;
          if (token.startsWith('--')) {
            switch (token) {
              case '--global':
                scope = 'global';
                break;
              case '--project':
                scope = 'project';
                break;
              case '--desc':
              case '--description':
                description = tokens[i + 1];
                i += 1;
                break;
              case '--tools': {
                const list = tokens[i + 1] || '';
                tools = list.split(',').map((t) => t.trim()).filter(Boolean);
                i += 1;
                break;
              }
              case '--prompt':
              case '--system-prompt':
                systemPrompt = tokens[i + 1];
                i += 1;
                break;
              case '--max-turns':
                maxTurns = parseInt(tokens[i + 1] || '', 10) || undefined;
                i += 1;
                break;
              case '--min-turns':
                minTurns = parseInt(tokens[i + 1] || '', 10) || undefined;
                i += 1;
                break;
              case '--work-until-done':
                workUntilDone = true;
                break;
              case '--interactive':
              case '--ask':
                interactive = true;
                break;
              default:
                break;
            }
          } else if (!name) {
            name = token;
          }
        }

        if (!name) {
          context.emit('text', 'Usage: /agents create <name> [--global] [--desc "..."] [--tools a,b,c] [--prompt "..."]\n');
          context.emit('done');
          return { handled: true };
        }

        // Interactive mode: delegate to LLM to interview user
        if (interactive || (!description && !systemPrompt)) {
          const known: string[] = [];
          if (description) known.push(`description: ${description}`);
          if (tools && tools.length > 0) known.push(`tools: ${tools.join(', ')}`);
          if (systemPrompt) known.push(`systemPrompt: provided`);
          if (maxTurns !== undefined) known.push(`maxTurns: ${maxTurns}`);

          const missing: string[] = [];
          if (!description) missing.push('description (what does this agent specialize in?)');
          if (!systemPrompt) missing.push('systemPrompt (instructions for the agent)');
          if (!tools || tools.length === 0) missing.push('tools (comma-separated list, optional)');

          const knownBlock = known.length > 0 ? `Known values:\n- ${known.join('\n- ')}\n\n` : '';
          const missingBlock = missing.length > 0 ? `Ask for:\n- ${missing.join('\n- ')}\n\n` : '';

          context.emit('done');
          return {
            handled: false,
            prompt:
              `We are creating a new agent definition named "${name}" (scope: ${scope}).\n\n${knownBlock}${missingBlock}` +
              'Use the ask_user tool to interview the user and collect the missing fields. ' +
              'Then create the agent definition JSON file. The file should be saved at: ' +
              `${scope === 'global' ? '~/.assistants' : '.assistants'}/agents/${name}.json\n` +
              'Required fields: name, description. Optional: tools, systemPrompt, maxTurns, minTurns, workUntilDone.',
          };
        }

        try {
          const filePath = saveAgentDefinition(
            { name, description: description || '', tools, systemPrompt, maxTurns, minTurns, workUntilDone },
            scope,
            context.cwd,
          );
          context.emit('text', `\nCreated agent "${name}" (${scope}).\nLocation: ${filePath}\n`);
        } catch (error) {
          context.emit('text', `Failed to create agent: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /agents delete <name>
      if (subcommand === 'delete' || subcommand === 'rm' || subcommand === 'remove') {
        const name = tokens.shift()?.trim();
        if (!name) {
          context.emit('text', 'Usage: /agents delete <name>\n');
          context.emit('done');
          return { handled: true };
        }

        const deletedPath = deleteAgentDefinition(name, context.cwd);
        if (deletedPath) {
          context.emit('text', `\nDeleted agent "${name}".\nRemoved: ${deletedPath}\n`);
        } else {
          context.emit('text', `\nAgent "${name}" not found.\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /agents show <name>
      if (subcommand === 'show' || subcommand === 'info') {
        const name = tokens.shift()?.trim();
        if (!name) {
          context.emit('text', 'Usage: /agents show <name>\n');
          context.emit('done');
          return { handled: true };
        }

        const def = getAgentDefinition(name, context.cwd);
        if (!def) {
          context.emit('text', `\nAgent "${name}" not found.\n`);
          context.emit('done');
          return { handled: true };
        }

        let message = `\n**Agent: ${def.name}**\n`;
        message += `Description: ${def.description || '(none)'}\n`;
        message += `Scope: ${def.scope || 'unknown'}\n`;
        if (def.filePath) message += `File: ${def.filePath}\n`;
        if (def.tools && def.tools.length > 0) message += `Tools: ${def.tools.join(', ')}\n`;
        if (def.systemPrompt) message += `System prompt: ${def.systemPrompt.slice(0, 200)}${def.systemPrompt.length > 200 ? '...' : ''}\n`;
        if (def.maxTurns !== undefined) message += `Max turns: ${def.maxTurns}\n`;
        if (def.minTurns !== undefined) message += `Min turns: ${def.minTurns}\n`;
        if (def.workUntilDone) message += `Work until done: yes\n`;
        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      // /agents help
      if (subcommand === 'help') {
        let message = '\n**/agents commands**\n\n';
        message += '/agents                     List all agent definitions\n';
        message += '/agents show <name>         Show details for an agent\n';
        message += '/agents create <name>       Create a new agent definition\n';
        message += '/agents delete <name>       Delete an agent definition\n';
        message += '\nOptions for create:\n';
        message += '  --project              Save to project .assistants/agents/ (default)\n';
        message += '  --global               Save to ~/.assistants/agents/\n';
        message += '  --desc "..."           Description\n';
        message += '  --tools a,b,c          Comma-separated tool names\n';
        message += '  --prompt "..."         System prompt / instructions\n';
        message += '  --max-turns N          Maximum turns (default: 25)\n';
        message += '  --min-turns N          Minimum turns (default: 3)\n';
        message += '  --work-until-done      Keep going until explicitly done\n';
        message += '  --interactive          Ask follow-up questions\n';
        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      // /agents (no args) --- list all
      if (!subcommand || subcommand === 'list' || subcommand === 'ls') {
        const defs = loadAgentDefinitions(context.cwd);
        if (defs.length === 0) {
          context.emit('text', '\nNo agent definitions found.\n');
          context.emit('text', 'Create one with: /agents create <name>\n');
          context.emit('text', 'Agent definitions are JSON files in ~/.assistants/agents/ (global) or .assistants/agents/ (project).\n');
          context.emit('done');
          return { handled: true };
        }

        let message = '\n**Agent definitions:**\n\n';
        for (const def of defs) {
          const scopeTag = def.scope === 'global' ? ' (global)' : ' (project)';
          const toolsTag = def.tools && def.tools.length > 0 ? ` [${def.tools.length} tools]` : '';
          message += `  ${def.name}${scopeTag}${toolsTag} -- ${def.description || '(no description)'}\n`;
        }
        message += `\n${defs.length} agent(s) total. Use /agents show <name> for details.\n`;
        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      context.emit('text', `Unknown /agents subcommand: ${subcommand}\n`);
      context.emit('text', 'Use /agents help for available commands.\n');
      context.emit('done');
      return { handled: true };
    },
  };
}
