import type { Command, TokenUsage } from './types';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { getConfigDir } from '../config';

/**
 * /config - Show or edit configuration
 */
export function configCommand(): Command {
  return {
    name: 'config',
    description: 'View and edit configuration interactively (model, context, etc.)',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const action = args.trim().toLowerCase();

      // /config help
      if (action === 'help') {
        context.emit('text', '\n## Config Commands\n\n');
        context.emit('text', '/config                       Open interactive config panel\n');
        context.emit('text', '/config show                  Show config file locations\n');
        context.emit('text', '/config help                  Show this help\n');
        context.emit('done');
        return { handled: true };
      }

      // /config show - show file locations (legacy behavior)
      if (action === 'show' || action === 'paths') {
        const storageDir = context.getStorageDir?.() || getConfigDir();
        const configPaths = [
          join(context.cwd, '.assistants', 'config.json'),
          join(context.cwd, '.assistants', 'config.local.json'),
          join(storageDir, 'config.json'),
        ];

        let message = '\n**Configuration**\n\n';
        message += '**Config File Locations:**\n';
        for (const path of configPaths) {
          const exists = existsSync(path);
          message += `  ${exists ? '✓' : '○'} ${path}\n`;
        }

        const envHome = process.env.HOME || process.env.USERPROFILE;
        const homeDir = envHome && envHome.trim().length > 0 ? envHome : homedir();

        message += '\n**Commands Directories:**\n';
        message += `  - Project: ${join(context.cwd, '.assistants', 'commands')}\n`;
        message += `  - User/Workspace: ${join(storageDir, 'commands')}\n`;
        if (storageDir !== join(homeDir, '.hasna', 'assistants')) {
          message += `  - Global fallback: ${join(homeDir, '.hasna', 'assistants', 'commands')}\n`;
        }

        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      // /config (no args) - open interactive panel
      context.emit('done');
      return { handled: true, showPanel: 'config' };
    },
  };
}


/**
 * /model - Show or change the model
 */
export function modelCommand(tokenUsage: TokenUsage): Command {
  return {
    name: 'model',
    description: 'Open interactive model selector or switch directly (e.g. /model claude-sonnet-4-5-20250929)',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      // Dynamically import model registry
      const { MODELS, getModelById, getModelsGroupedByProvider, getModelDisplayName, getProviderForModel } = await import('../llm/models');
      const { LLM_PROVIDER_IDS, getProviderLabel } = await import('@hasna/assistants-shared');

      const trimmedArgs = args.trim();
      const currentModel = context.getModel?.() || 'unknown';

      // /model (or /model ui) - Open interactive selector panel
      if (!trimmedArgs || trimmedArgs === 'ui') {
        context.emit('done');
        return { handled: true, showPanel: 'model' };
      }

      // /model status - Show current model and usage
      if (trimmedArgs === 'status' || trimmedArgs === 'current') {
        const modelDef = getModelById(currentModel);
        let message = '\n**Current Model**\n\n';
        message += `Model: ${modelDef?.name || currentModel}\n`;
        message += `ID: ${currentModel}\n`;

        // Show provider correctly, or "Unknown" if model not in registry
        if (modelDef) {
          message += `Provider: ${getProviderLabel(modelDef.provider)}\n`;
        } else {
          const inferred = getProviderForModel(currentModel);
          message += `Provider: ${inferred ? getProviderLabel(inferred) : 'Unknown'}\n`;
        }

        message += `Context: ${tokenUsage.maxContextTokens.toLocaleString()} tokens\n`;
        if (modelDef) {
          message += `Max output: ${modelDef.maxOutputTokens?.toLocaleString() || 'unknown'} tokens\n`;
          message += `Cost: $${modelDef.inputCostPer1M}/1M in, $${modelDef.outputCostPer1M}/1M out\n`;
        }
        message += '\n**Usage**\n';
        message += '  /model              Open interactive model selector\n';
        message += '  /model status       Show current model details\n';
        message += '  /model list         List all available models\n';
        message += '  /model <model-id>   Switch to a different model\n';

        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      // /model help - Show usage
      if (trimmedArgs === 'help') {
        let message = '\n**Model Commands**\n\n';
        message += '  /model              Open interactive model selector\n';
        message += '  /model status       Show current model details\n';
        message += '  /model list         List all available models\n';
        message += '  /model <model-id>   Switch to a different model\n';
        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      // /model list - List all available models
      if (trimmedArgs === 'list') {
        const grouped = getModelsGroupedByProvider();
        let message = '\n**Available Models**\n\n';

        for (const providerId of LLM_PROVIDER_IDS) {
          const models = grouped[providerId];
          if (!models || models.length === 0) continue;
          message += `## ${getProviderLabel(providerId)}\n`;
          for (const model of models) {
            const current = model.id === currentModel ? ' ← current' : '';
            message += `  ${model.name} (${model.id})${current}\n`;
            message += `    ${model.description}\n`;
            if (model.contextWindow && model.maxOutputTokens) {
              message += `    Context: ${(model.contextWindow / 1000).toFixed(0)}K | Max output: ${(model.maxOutputTokens / 1000).toFixed(0)}K\n`;
            } else {
              message += '    Context: unknown | Max output: unknown\n';
            }
            if (model.inputCostPer1M !== undefined && model.outputCostPer1M !== undefined) {
              message += `    Cost: $${model.inputCostPer1M}/1M in, $${model.outputCostPer1M}/1M out\n`;
            } else {
              message += '    Cost: unknown\n';
            }
            if (model.notes) {
              message += `    Note: ${model.notes}\n`;
            }
            message += '\n';
          }
        }

        message += '\nUse `/model <model-id>` to switch models.\n';

        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      // /model <model-id> - Switch to a different model
      const modelId = trimmedArgs;
      const modelDef = getModelById(modelId);

      if (!modelDef) {
        const inferredProvider = getProviderForModel(modelId);
        if (!inferredProvider) {
          // Try to find a close match
          const lowerInput = modelId.toLowerCase();
          const possibleMatch = MODELS.find(
            (m) =>
              m.id.toLowerCase().includes(lowerInput) ||
              m.name.toLowerCase().includes(lowerInput)
          );

          let message = `Unknown model: ${modelId}\n`;
          if (possibleMatch) {
            message += `Did you mean: ${possibleMatch.id} (${possibleMatch.name})?\n`;
          }
          message += 'Use `/model list` to see available models.\n';

          context.emit('text', message);
          context.emit('done');
          return { handled: true };
        }

        if (!context.switchModel) {
          context.emit('text', 'Model switching not available in this context.\n');
          context.emit('done');
          return { handled: true };
        }

        try {
          await context.switchModel(modelId);
          let message = `\nSwitched to **${modelId}**\n`;
          message += `Provider: ${getProviderLabel(inferredProvider)}\n`;
          message += 'Note: Model not in registry; using inferred provider.\n';
          context.emit('text', message);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          context.emit('text', `Failed to switch model: ${errMsg}\n`);
        }

        context.emit('done');
        return { handled: true };
      }

      // Check if already on this model
      if (modelId === currentModel) {
        context.emit('text', `Already using ${modelDef.name} (${modelId})\n`);
        context.emit('done');
        return { handled: true };
      }

      // Switch model
      if (!context.switchModel) {
        context.emit('text', 'Model switching not available in this context.\n');
        context.emit('done');
        return { handled: true };
      }

      try {
        await context.switchModel(modelId);
        let message = `\nSwitched to **${modelDef.name}** (${modelId})\n`;
        message += `Provider: ${getProviderLabel(modelDef.provider)}\n`;
        message += `Context: ${modelDef.contextWindow?.toLocaleString() || 'unknown'} tokens\n`;
        if (modelDef.notes) {
          message += `Note: ${modelDef.notes}\n`;
        }
        context.emit('text', message);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        context.emit('text', `Failed to switch model: ${errMsg}\n`);
      }

      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /effort - Show or change the effort/thinking level
 */
export function effortCommand(): Command {
  return {
    name: 'effort',
    description: 'Show or change effort level (low, medium, high). High enables extended thinking.',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const trimmed = args.trim().toLowerCase();

      // /effort — show current level
      if (!trimmed) {
        const current = context.getEffortLevel?.() || 'medium';
        let message = `\n**Effort Level:** ${current}\n\n`;
        message += '**Levels:**\n';
        message += '  `low`    — Faster responses, reduced max tokens\n';
        message += '  `medium` — Default behavior\n';
        message += '  `high`   — Extended thinking enabled (deeper reasoning)\n\n';
        message += 'Usage: `/effort low` · `/effort medium` · `/effort high`\n';
        if (process.env.MAX_THINKING_TOKENS) {
          message += `\nThinking budget: ${process.env.MAX_THINKING_TOKENS} tokens (from MAX_THINKING_TOKENS)\n`;
        }
        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      // /effort help
      if (trimmed === 'help') {
        let message = '\n**Effort Commands**\n\n';
        message += '  `/effort`        Show current effort level\n';
        message += '  `/effort low`    Faster responses, reduced max tokens\n';
        message += '  `/effort medium` Default behavior\n';
        message += '  `/effort high`   Extended thinking (deeper reasoning)\n\n';
        message += 'Set `MAX_THINKING_TOKENS` env var to override thinking budget (default: 10000).\n';
        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      // /effort <level>
      const validLevels = ['low', 'medium', 'high'] as const;
      if (!validLevels.includes(trimmed as typeof validLevels[number])) {
        context.emit('text', `Invalid effort level: "${trimmed}". Use: low, medium, high\n`);
        context.emit('done');
        return { handled: true };
      }

      const level = trimmed as 'low' | 'medium' | 'high';

      if (!context.setEffortLevel) {
        context.emit('text', 'Effort level switching not available in this context.\n');
        context.emit('done');
        return { handled: true };
      }

      const previous = context.getEffortLevel?.() || 'medium';
      context.setEffortLevel(level);

      let message = `\nEffort level: **${previous}** → **${level}**\n`;
      if (level === 'high') {
        const budget = parseInt(process.env.MAX_THINKING_TOKENS || '', 10) || 10000;
        message += `Extended thinking enabled (budget: ${budget.toLocaleString()} tokens)\n`;
      } else if (level === 'low') {
        message += 'Reduced max tokens for faster responses.\n';
      }

      context.emit('text', message);
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /tree - Display session message history as a tree
 */
/**
 * /mode - Show or switch permission mode (normal, plan, auto)
 */
export function modeCommand(): Command {
  return {
    name: 'mode',
    description: 'Show or switch permission mode: normal, plan (read-only), auto (auto-accept)',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const trimmedArgs = args.trim().toLowerCase();

      // /mode — show current mode
      if (!trimmedArgs) {
        const current = context.getPermissionMode?.() ?? 'normal';
        let message = `\n**Permission Mode:** ${current}\n\n`;
        message += '**Available modes:**\n';
        message += '  `normal`  — Standard behavior with per-tool permission checks\n';
        message += '  `plan`    — Read-only mode. Only analysis tools allowed (read, glob, grep, web_search, etc.)\n';
        message += '  `auto`    — Auto-accept all tool calls without confirmation\n\n';
        message += 'Switch with: `/mode plan`, `/mode normal`, or `/mode auto`\n';
        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      // Normalize 'auto' to 'auto-accept'
      const modeMap: Record<string, 'normal' | 'plan' | 'auto-accept'> = {
        normal: 'normal',
        plan: 'plan',
        auto: 'auto-accept',
        'auto-accept': 'auto-accept',
      };

      const newMode = modeMap[trimmedArgs];
      if (!newMode) {
        context.emit('text', `\nUnknown mode "${trimmedArgs}". Valid modes: normal, plan, auto\n`);
        context.emit('done');
        return { handled: true };
      }

      context.setPermissionMode?.(newMode);

      const labels: Record<string, string> = {
        normal: 'normal — standard tool permissions',
        plan: 'plan — read-only mode (write tools blocked)',
        'auto-accept': 'auto — all tool calls auto-accepted',
      };

      context.emit('text', `\nSwitched to **${labels[newMode]}**\n`);
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /init - Initialize assistants in current project
 */
export function initCommand(): Command {
  return {
    name: 'init',
    description: 'Initialize .assistants/ config directory with example commands and hooks',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const commandsDir = join(context.cwd, '.assistants', 'commands');

      // Create directories
      mkdirSync(commandsDir, { recursive: true });

      // Create example command
      const exampleCommand = `---
name: reflect
description: Reflect on the conversation and suggest next steps
tags: [reflection, next-steps]
---

# Reflection

Please summarize the last interaction and suggest 2-3 next steps.

- Keep it concise
- Focus on clarity
- Ask a follow-up question if needed
`;

      const examplePath = join(commandsDir, 'reflect.md');
      if (!existsSync(examplePath)) {
        writeFileSync(examplePath, exampleCommand);
      }

      let message = '\n**Initialized assistants**\n\n';
      message += `Created: ${commandsDir}\n`;
      message += `Example: ${examplePath}\n\n`;
      message += 'You can now:\n';
      message += '  - Add custom commands to .assistants/commands/\n';
      message += '  - Use /reflect to try the example command\n';
      message += '  - Run /help to see all available commands\n';

      context.emit('text', message);
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /setup - Run the interactive setup wizard
 */
export function setupCommand(): Command {
  return {
    name: 'setup',
    aliases: ['onboarding'],
    description: 'Run the interactive setup wizard',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (_args, context) => {
      context.emit('done');
      return { handled: true, showPanel: 'setup' as const };
    },
  };
}
