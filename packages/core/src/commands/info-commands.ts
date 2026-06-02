import type { Command, TokenUsage } from './types';
import type { CommandLoader } from './loader';

/**
 * /about - About Hasna and this app
 */
export function aboutCommand(): Command {
  return {
    name: 'about',
    description: 'About Hasna and Assistants',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (_args, context) => {
      let message = '\n**About Hasna**\n\n';
      message += 'Hasna is on a mission to make AI more useful to everyone.\n';
      message += 'We build tools that bring the power of AI into your everyday workflow — no expertise required.\n';
      message += 'Website: hasna.com\n';
      message += '\n**About Hasna Assistants**\n\n';
      message += 'Hasna Assistants is a general-purpose AI assistant that lives in your terminal.\n';
      message += 'It connects natively to 100+ tools — email, calendars, databases, cloud storage, CRMs, and more — so you can get things done without switching apps.\n\n';
      message += 'What you can do:\n';
      message += '- Ask questions and get answers in plain language\n';
      message += '- Automate repetitive tasks across your tools\n';
      message += '- Read, write, and manage files on your machine\n';
      message += '- Run multi-step workflows with built-in skills\n';
      message += '- Schedule commands to run on a timer\n';
      message += '- Collaborate with multiple AI agents via swarm mode\n\n';
      message += 'Whether you are a developer, a founder, or just someone who wants AI to handle the boring stuff — Assistants is built for you.\n';
      context.emit('text', message);
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /docs - Documentation overview (terminal opens interactive docs panel)
 */
export function docsCommand(): Command {
  return {
    name: 'docs',
    description: 'Open docs panel in terminal or print full usage guide',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (_args, context) => {
      let message = '\n**assistants Documentation**\n\n';
      message += 'In the terminal app, `/docs` opens an interactive documentation panel with keyboard navigation.\n\n';

      message += '**Quick Start**\n';
      message += '  1. Run `/init` in a project.\n';
      message += '  2. Run `/onboarding` to select provider, model, and API key setup.\n';
      message += '  3. Start work with `/new` and inspect status via `/status`, `/tokens`, and `/cost`.\n\n';

      message += '**Core Workflow**\n';
      message += '  - Sessions keep history, tool calls, context, and model state.\n';
      message += '  - `/sessions` switches sessions.\n';
      message += '  - `/compact` summarizes long context.\n';
      message += '  - `/resume` recovers interrupted work.\n\n';

      message += '**Configuration and Models**\n';
      message += '  - `/model` opens interactive model selection.\n';
      message += '  - `/effort` sets thinking depth (low, medium, high).\n';
      message += '  - `/mode` switches permission mode (normal, plan, auto).\n';
      message += '  - `/config` manages user/project/local config.\n';
      message += '  - `/memory`, `/context`, `/hooks`, and `/guardrails` control behavior and safety.\n\n';

      message += '**Workspaces and Projects**\n';
      message += '  - `/workspace` switches isolated workspace state.\n';
      message += '  - `/projects` and `/plans` manage project scope and plan execution.\n\n';

      message += '**Resources and Operations**\n';
      message += '  - `/wallet`, `/secrets`, and `/budgets` manage cards, secrets, and limits.\n';
      message += '  - `/tasks`, `/schedules`, `/jobs`, `/orders`, `/heartbeat`, and `/logs` manage operations.\n\n';

      message += '**Collaboration**\n';
      message += '  - `/assistants`, `/identity`, `/messages`, `/channels`, `/people`, `/communication`.\n\n';

      message += '**Voice**\n';
      message += '  - `/voice`, `/talk`, `/say`.\n\n';

      message += '**Storage**\n';
      message += '  - Project data: `.assistants/`\n';
      message += '  - User/global data: `~/.hasna/assistants/`\n';
      message += '  - Workspace switching isolates sessions, assistants, settings, and resource state.\n';

      context.emit('text', message);
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /help - Show available commands
 */
export function helpCommand(loader: CommandLoader): Command {
  return {
    name: 'help',
    description: 'Show all available slash commands and their descriptions',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const commands = loader.getCommands();
      const builtinByName = new Map<string, Command>();
      const customByName = new Map<string, Command>();

      for (const cmd of commands) {
        if (cmd.builtin) {
          builtinByName.set(cmd.name, cmd);
        } else {
          customByName.set(cmd.name, cmd);
        }
      }

      const builtinNames = Array.from(builtinByName.keys());
      const customNames = Array.from(customByName.keys());
      builtinNames.sort();
      customNames.sort();

      let message = '\n**Available Slash Commands**\n\n';

      if (builtinNames.length > 0) {
        message += '**Built-in Commands (registered locally in this session):**\n';
        for (const name of builtinNames) {
          const cmd = builtinByName.get(name);
          if (!cmd) continue;
          message += `  /${name} - ${cmd.description}\n`;
        }
        message += '\n';
      }

      if (customNames.length > 0) {
        message += '**Custom Commands:**\n';
        for (const name of customNames) {
          const cmd = customByName.get(name);
          if (!cmd) continue;
          message += `  /${name} - ${cmd.description}\n`;
        }
        message += '\n';
      }

      message += '**Tips:**\n';
      message += '  - Create custom commands in .assistants/commands/*.md\n';
      message += '  - Global commands go in ~/.hasna/assistants/commands/*.md\n';
      message += '  - Use /init to create a starter command\n';
      message += '  - The assistant can use the wait/sleep tool to pause between actions\n';

      context.emit('text', message);
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /status - Show current session status
 */
export function statusCommand(tokenUsage: TokenUsage): Command {
  return {
    name: 'status',
    description: 'Show session overview: status, identity, tokens, and runtime info',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const usage = tokenUsage;
      const rawPercent = usage.maxContextTokens > 0
        ? Math.round((usage.totalTokens / usage.maxContextTokens) * 100)
        : 0;
      const usedPercent = Math.max(0, Math.min(100, rawPercent));

      let message = '\n**Session Status**\n\n';
      message += `**Session ID:** ${context.sessionId}\n`;
      message += `**Working Directory:** ${context.cwd}\n`;

      // Identity info
      const assistant = context.getAssistantManager?.()?.getActive();
      const identity = context.getIdentityManager?.()?.getActive();
      if (assistant) {
        message += `**Assistant:** ${assistant.name}`;
        if (identity) {
          message += ` · ${identity.name}`;
        }
        message += '\n';
      }

      // Voice state
      const voiceState = context.getVoiceState?.();
      if (voiceState?.enabled) {
        const voiceActivity = voiceState.isSpeaking ? 'speaking' : voiceState.isListening ? 'listening' : 'idle';
        message += `**Voice:** ${voiceActivity}`;
        if (voiceState.sttProvider || voiceState.ttsProvider) {
          message += ` (STT: ${voiceState.sttProvider || 'n/a'}, TTS: ${voiceState.ttsProvider || 'n/a'})`;
        }
        message += '\n';
      }

      if (context.getActiveProjectId) {
        const projectId = context.getActiveProjectId();
        if (projectId) {
          message += `**Active Project:** ${projectId}\n`;
        }
      }
      message += `**Messages:** ${context.messages.length}\n`;
      message += `**Available Tools:** ${context.tools.length}\n\n`;

      message += '**Token Usage:**\n';
      message += `  Input: ${usage.inputTokens.toLocaleString()}\n`;
      message += `  Output: ${usage.outputTokens.toLocaleString()}\n`;
      message += `  Total: ${usage.totalTokens.toLocaleString()} / ${usage.maxContextTokens.toLocaleString()} (${usedPercent}%)\n`;

      if (usage.cacheReadTokens || usage.cacheWriteTokens) {
        message += `  Cache Read: ${(usage.cacheReadTokens || 0).toLocaleString()}\n`;
        message += `  Cache Write: ${(usage.cacheWriteTokens || 0).toLocaleString()}\n`;
      }

      // Visual progress bar
      const barLength = 30;
      const filledLength = Math.max(0, Math.min(barLength, Math.round((usedPercent / 100) * barLength)));
      const bar = '█'.repeat(filledLength) + '░'.repeat(Math.max(0, barLength - filledLength));
      message += `\n  [${bar}] ${usedPercent}%\n`;

      const contextInfo = context.getContextInfo?.();
      if (contextInfo) {
        const contextRawPercent = contextInfo.config.maxContextTokens > 0
          ? Math.round((contextInfo.state.totalTokens / contextInfo.config.maxContextTokens) * 100)
          : 0;
        const contextUsedPercent = Math.max(0, Math.min(100, contextRawPercent));
        message += '\n**Context Summary:**\n';
        message += `  Messages: ${contextInfo.state.messageCount}\n`;
        message += `  Estimated Tokens: ${contextInfo.state.totalTokens.toLocaleString()} / ${contextInfo.config.maxContextTokens.toLocaleString()} (${contextUsedPercent}%)\n`;
        message += `  Summaries: ${contextInfo.state.summaryCount}\n`;
        if (contextInfo.state.lastSummaryAt) {
          message += `  Last Summary: ${contextInfo.state.lastSummaryAt}\n`;
        }
      }

      const errorStats = context.getErrorStats?.() ?? [];
      if (errorStats.length > 0) {
        message += '\n**Recent Errors:**\n';
        message += '| Code | Count | Last Occurrence |\n';
        message += '| --- | --- | --- |\n';
        for (const stat of errorStats.slice(0, 5)) {
          message += `| ${stat.code} | ${stat.count} | ${stat.lastOccurrence} |\n`;
        }
      }

      context.emit('text', message);
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /whoami - Show current assistant + identity
 */
export function whoamiCommand(): Command {
  return {
    name: 'whoami',
    description: 'Show active assistant, identity profile, and current configuration',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (_args, context) => {
      const assistant = context.getAssistantManager?.()?.getActive();
      const identity = context.getIdentityManager?.()?.getActive();
      const model = context.getModel?.();

      if (!assistant && !identity) {
        context.emit('text', 'No active assistant or identity.\n');
        if (model) {
          context.emit('text', `Model: ${model}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      if (assistant) {
        context.emit('text', `Assistant: ${assistant.name}\n`);
      }

      if (identity) {
        context.emit('text', `Identity: ${identity.name}\n`);
        context.emit('text', `Display name: ${identity.profile.displayName || identity.name}\n`);
      } else if (assistant) {
        context.emit('text', 'Identity: (not configured)\n');
      }

      if (model) {
        context.emit('text', `Model: ${model}\n`);
      }

      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /cost - Show estimated cost of the session
 */
export function costCommand(tokenUsage: TokenUsage): Command {
  return {
    name: 'cost',
    description: 'Show estimated API cost for this session (input + output pricing)',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const usage = tokenUsage;

      // Look up pricing from model registry based on active model
      const { getModelById } = await import('../llm/models');
      const activeModelId = context.getModel?.();
      const model = activeModelId ? getModelById(activeModelId) : null;

      const inputCostPer1M = model?.inputCostPer1M ?? 3.0;
      const outputCostPer1M = model?.outputCostPer1M ?? 15.0;
      const modelName = model?.name ?? 'Unknown model';

      const inputCost = (usage.inputTokens / 1_000_000) * inputCostPer1M;
      const outputCost = (usage.outputTokens / 1_000_000) * outputCostPer1M;
      const cacheReadCost = usage.cacheReadTokens
        ? (usage.cacheReadTokens / 1_000_000) * inputCostPer1M * 0.1
        : 0;
      const cacheWriteCost = usage.cacheWriteTokens
        ? (usage.cacheWriteTokens / 1_000_000) * inputCostPer1M * 1.25
        : 0;
      const totalCost = inputCost + outputCost + cacheReadCost + cacheWriteCost;

      // Cache savings vs paying full input price for cached tokens
      const cacheSavings = usage.cacheReadTokens
        ? ((usage.cacheReadTokens / 1_000_000) * inputCostPer1M * 0.9)
        : 0;

      let message = '\n**Estimated Session Cost**\n\n';
      message += `Input tokens: ${usage.inputTokens.toLocaleString()} (~$${inputCost.toFixed(4)})\n`;
      message += `Output tokens: ${usage.outputTokens.toLocaleString()} (~$${outputCost.toFixed(4)})\n`;
      if (usage.cacheReadTokens) {
        message += `Cache read tokens: ${usage.cacheReadTokens.toLocaleString()} (~$${cacheReadCost.toFixed(4)})\n`;
      }
      if (usage.cacheWriteTokens) {
        message += `Cache write tokens: ${usage.cacheWriteTokens.toLocaleString()} (~$${cacheWriteCost.toFixed(4)})\n`;
      }
      message += `**Total: ~$${totalCost.toFixed(4)}**\n`;

      if (cacheSavings > 0) {
        message += `\nCache savings: ~$${cacheSavings.toFixed(4)}\n`;
      }

      message += `\n*Based on ${modelName} pricing ($${inputCostPer1M}/1M in, $${outputCostPer1M}/1M out)*\n`;

      context.emit('text', message);
      context.emit('done');
      return { handled: true };
    },
  };
}
