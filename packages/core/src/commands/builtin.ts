import type { Command, TokenUsage } from './types';
import type { CommandLoader } from './loader';
import { createTokenUsage } from './helpers';

// Info commands
import { aboutCommand, docsCommand, helpCommand, statusCommand, whoamiCommand, costCommand } from './info-commands';

// Session commands
import { clearCommand, newCommand, sessionCommand, resumeCommand, renameCommand, exitCommand, compactCommand } from './session-commands';

// Voice commands
import { voiceCommand, talkCommand } from './voice-commands';

// Assistant commands
import { assistantCommand, identityCommand, assistantsCommand } from './assistant-commands';

// Config commands
import { configCommand, modelCommand, effortCommand, modeCommand, initCommand, setupCommand } from './config-commands';

// Context commands
import { contextCommand, tokensCommand, summarizeCommand, memoryCommand } from './context-commands';

// Project commands
import { projectsCommand, plansCommand, workspaceCommand } from './project-commands';

// Security commands
import { guardrailsCommand, verificationCommand, securityLogCommand } from './security-commands';

// Resource commands
import { walletCommand, secretsCommand, budgetCommand } from './resource-commands';

// Operations commands
import { jobsCommand, tasksCommand, schedulesCommand, heartbeatCommand, ordersCommand } from './operations-commands';

// Communication commands
import { messagesCommand, webhooksCommand, channelsCommand, peopleCommand, contactsCommand, communicationCommand, callCommand } from './communication-commands';

// Tools commands
import { hooksCommand, connectorsCommand, skillsCommand, feedbackCommand } from './tools-commands';

// Dev commands
import { diffCommand, scriptsCommand, undoCommand, treeCommand, exportCommand } from './dev-commands';

// Swarm commands
import { swarmCommand, agentsCommand } from './swarm-commands';

// Packages commands
import { installCommand, removeCommand, packagesCommand } from './packages-commands';

import { resolveAuthTimeout } from './helpers';

/**
 * Built-in slash commands for assistants
 */
export class BuiltinCommands {
  private tokenUsage: TokenUsage = createTokenUsage();

  /**
   * Register all built-in commands
   */
  registerAll(loader: CommandLoader): void {
    const tu = this.tokenUsage;

    // Info
    loader.register(helpCommand(loader));
    loader.register(aboutCommand());
    loader.register(docsCommand());
    loader.register(statusCommand(tu));
    loader.register(whoamiCommand());
    loader.register(costCommand(tu));

    // Session
    loader.register(clearCommand(tu));
    loader.register(newCommand(tu));
    loader.register(sessionCommand());
    loader.register(resumeCommand());
    loader.register(renameCommand());
    loader.register(exitCommand());
    loader.register(compactCommand());

    // Voice
    loader.register(voiceCommand());
    loader.register(talkCommand());

    // Assistants & Identity
    loader.register(assistantCommand());
    loader.register(identityCommand());
    loader.register(assistantsCommand());

    // Config
    loader.register(configCommand());
    loader.register(modelCommand(tu));
    loader.register(effortCommand());
    loader.register(modeCommand());
    loader.register(initCommand());
    loader.register(setupCommand());

    // Context & Memory
    loader.register(contextCommand());
    loader.register(tokensCommand(tu));
    loader.register(summarizeCommand());
    loader.register(memoryCommand());

    // Projects & Workspace
    loader.register(projectsCommand());
    loader.register(plansCommand());
    loader.register(workspaceCommand());

    // Security
    loader.register(guardrailsCommand());
    loader.register(verificationCommand());
    loader.register(securityLogCommand());

    // Resources
    loader.register(walletCommand());
    loader.register(secretsCommand());
    loader.register(budgetCommand());

    // Operations
    loader.register(jobsCommand());
    loader.register(tasksCommand());
    loader.register(schedulesCommand());
    loader.register(heartbeatCommand());
    loader.register(ordersCommand());

    // Communication
    loader.register(messagesCommand());
    loader.register(webhooksCommand());
    loader.register(channelsCommand());
    loader.register(peopleCommand());
    loader.register(contactsCommand());
    loader.register(communicationCommand());
    loader.register(callCommand());

    // Tools
    loader.register(hooksCommand());
    loader.register(connectorsCommand());
    loader.register(skillsCommand(loader));
    loader.register(feedbackCommand());

    // Dev
    loader.register(diffCommand());
    loader.register(scriptsCommand());
    loader.register(undoCommand());
    loader.register(treeCommand());
    loader.register(exportCommand(tu));

    // Swarm & Agents
    loader.register(swarmCommand());
    loader.register(agentsCommand());

    // Packages
    loader.register(installCommand());
    loader.register(removeCommand());
    loader.register(packagesCommand());
  }

  /**
   * Update token usage
   */
  updateTokenUsage(usage: Partial<TokenUsage>): void {
    Object.assign(this.tokenUsage, usage);
  }

  /**
   * Get current token usage
   */
  getTokenUsage(): TokenUsage {
    return { ...this.tokenUsage };
  }
}

export const __test__ = {
  resolveAuthTimeout,
};
