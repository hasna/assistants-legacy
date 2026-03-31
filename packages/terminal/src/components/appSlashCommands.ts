/**
 * Slash command → panel routing extracted from handleSubmit in App.tsx.
 *
 * Returns true if the command was handled (caller should return early),
 * false if it should fall through to the LLM.
 */

import type { Message, Skill } from '@hasna/assistants-shared';
import type { EmailListItem } from '@hasna/assistants-shared';
import type { SessionInfo } from '@hasna/assistants-core';
import {
  getTasks,
  isPaused,
  HookStore,
  GuardrailsStore,
  listSchedules,
  listProjects,
  readProject,
} from '@hasna/assistants-core';
import { generateId, now } from '@hasna/assistants-shared';
import { runShellCommand, formatShellResult } from './appHelpers';
import { loadMessagesAndInbox, type ShowPanelContext } from './appShowPanel';

export interface SlashCommandContext {
  cwd: string;
  activeSession: SessionInfo | null;
  registry: { getActiveSession(): SessionInfo | null };

  // State setters
  setShowDocsPanel: (v: boolean) => void;
  setConnectorsPanelInitial: (v: string | undefined) => void;
  setShowConnectorsPanel: (v: boolean) => void;
  setHooksConfig: (v: any) => void;
  setShowHooksPanel: (v: boolean) => void;
  setShowConfigPanel: (v: boolean) => void;
  setShowModelPanel: (v: boolean) => void;
  setIdentityPanelIntent: (v: any) => void;
  setShowIdentityPanel: (v: boolean) => void;
  setShowOnboardingPanel: (v: boolean) => void;
  setMemoryError: (v: string | null) => void;
  setShowMemoryPanel: (v: boolean) => void;
  setGuardrailsConfig: (v: any) => void;
  setGuardrailsPolicies: (v: any) => void;
  setShowGuardrailsPanel: (v: boolean) => void;
  setShowSwarmPanel: (v: boolean) => void;
  setTasksList: (v: any) => void;
  setTasksPaused: (v: boolean) => void;
  setShowTasksPanel: (v: boolean) => void;
  setSchedulesList: (v: any) => void;
  setShowSchedulesPanel: (v: boolean) => void;
  setShowJobsPanel: (v: boolean) => void;
  setSkillsList: (v: Skill[]) => void;
  setShowSkillsPanel: (v: boolean) => void;
  setShowAssistantsPanel: (v: boolean) => void;
  setProjectsList: (v: any) => void;
  setActiveProjectId: (v: string | undefined) => void;
  setShowProjectsPanel: (v: boolean) => void;
  setPlansProject: (v: any) => void;
  setShowPlansPanel: (v: boolean) => void;
  setMessagesList: (v: any) => void;
  setMessagesPanelError: (v: string | null) => void;
  setInboxEnabled: (v: boolean) => void;
  setInboxEmails: (v: EmailListItem[]) => void;
  setInboxError: (v: string | null) => void;
  setShowMessagesPanel: (v: boolean) => void;
  setShowWalletPanel: (v: boolean) => void;
  setShowSecretsPanel: (v: boolean) => void;
  setError: (v: string | null) => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;

  // Refs
  hookStoreRef: { current: InstanceType<typeof HookStore> | null };
  guardrailsStoreRef: { current: GuardrailsStore | null };

  // Callbacks
  openBudgetsPanel: () => Promise<void>;
  openWalletPanel: (mode: 'list' | 'add') => Promise<void>;
  openSecretsPanel: (mode: 'list' | 'add') => Promise<void>;
  loadConfigFiles: () => Promise<void>;
}

/**
 * Handle slash commands that open panels (e.g., /connectors, /tasks, /model).
 * Returns true if the command was handled, false to fall through.
 */
export async function handlePanelSlashCommand(
  trimmedInput: string,
  ctx: SlashCommandContext
): Promise<boolean> {
  const panelMatch = trimmedInput.match(/^\/(\S+)(?:\s+(.*))?$/);
  if (!panelMatch) return false;

  const cmdName = panelMatch[1].toLowerCase();
  const cmdArgs = (panelMatch[2] || '').trim();

  // /docs (no args) → open documentation panel (does not require active session)
  if (cmdName === 'docs' && !cmdArgs) {
    ctx.setShowDocsPanel(true);
    return true;
  }

  if (!ctx.activeSession) return false;

  // /connectors (no args) → open panel
  if (cmdName === 'connectors' && !cmdArgs) {
    ctx.setConnectorsPanelInitial(undefined);
    ctx.setShowConnectorsPanel(true);
    return true;
  }

  // /hooks (no args) → open panel
  if (cmdName === 'hooks' && !cmdArgs) {
    if (!ctx.hookStoreRef.current) {
      ctx.hookStoreRef.current = new HookStore();
    }
    const hooks = ctx.hookStoreRef.current.loadAll();
    ctx.setHooksConfig(hooks);
    ctx.setShowHooksPanel(true);
    return true;
  }

  // /config (no args) → open panel
  if (cmdName === 'config' && !cmdArgs) {
    ctx.loadConfigFiles();
    ctx.setShowConfigPanel(true);
    return true;
  }

  // /model → open read-only model info panel (models are tied to agents)
  if (cmdName === 'model') {
    if (cmdArgs) {
      // /model <id> is no longer supported — models are tied to agents
      ctx.setError('Models are tied to agents. Use /agents to switch agent (and model).');
      return true;
    }
    ctx.setShowModelPanel(true);
    return true;
  }

  // /identity (no args) → open panel
  if (cmdName === 'identity' && !cmdArgs) {
    ctx.setIdentityPanelIntent(null);
    ctx.setShowIdentityPanel(true);
    return true;
  }

  // /onboarding (no args) → rerun onboarding flow
  if (cmdName === 'onboarding' && !cmdArgs) {
    ctx.setShowOnboardingPanel(true);
    return true;
  }

  // /memory (no args) → open panel
  if (cmdName === 'memory' && !cmdArgs) {
    ctx.setMemoryError(null);
    ctx.setShowMemoryPanel(true);
    return true;
  }

  // /guardrails (no args) → open panel
  if (cmdName === 'guardrails' && !cmdArgs) {
    if (!ctx.guardrailsStoreRef.current) {
      ctx.guardrailsStoreRef.current = new GuardrailsStore();
    }
    const config = ctx.guardrailsStoreRef.current.loadAll();
    const policies = ctx.guardrailsStoreRef.current.listPolicies();
    ctx.setGuardrailsConfig(config);
    ctx.setGuardrailsPolicies(policies);
    ctx.setShowGuardrailsPanel(true);
    return true;
  }

  // /budgets (or /budget alias) with no args → open panel
  if ((cmdName === 'budget' || cmdName === 'budgets' || cmdName === 'budets') && !cmdArgs) {
    void ctx.openBudgetsPanel();
    return true;
  }

  // /swarm (no args) → open panel
  if (cmdName === 'swarm' && !cmdArgs) {
    ctx.setShowSwarmPanel(true);
    return true;
  }

  // /tasks (no args) → open panel
  if (cmdName === 'tasks' && !cmdArgs) {
    getTasks(ctx.cwd).then((tasks) => {
      ctx.setTasksList(tasks);
      isPaused(ctx.cwd).then((paused) => {
        ctx.setTasksPaused(paused);
        ctx.setShowTasksPanel(true);
      });
    });
    return true;
  }

  // /schedules (no args) → open panel
  if (cmdName === 'schedules' && !cmdArgs) {
    listSchedules(ctx.cwd, { global: true }).then((schedules) => {
      ctx.setSchedulesList(schedules);
      ctx.setShowSchedulesPanel(true);
    });
    return true;
  }

  // /jobs (no args) → open panel
  if (cmdName === 'jobs' && !cmdArgs) {
    ctx.setShowJobsPanel(true);
    return true;
  }

  // /skills (no args) → open panel
  if ((cmdName === 'skills' || cmdName === 'skill') && !cmdArgs) {
    const client = ctx.registry.getActiveSession()?.client;
    if (client) {
      client.getSkills().then((skills: Skill[]) => {
        ctx.setSkillsList(skills);
        ctx.setShowSkillsPanel(true);
      });
    }
    return true;
  }

  // /assistants update → run CLI update
  if (cmdName === 'assistants' && cmdArgs) {
    const [subcommand] = cmdArgs.split(/\s+/);
    if (subcommand?.toLowerCase() === 'update') {
      const shellCommand = 'bun install -g @hasna/assistants';
      const shellCwd = ctx.activeSession?.cwd || ctx.cwd;
      ctx.setError(null);
      try {
        const result = await runShellCommand(shellCommand, shellCwd);
        ctx.setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: 'assistant',
            content: formatShellResult(shellCommand, result),
            timestamp: now(),
          },
        ]);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        ctx.setError(message);
      }
      return true;
    }
  }

  // /assistants (no args) → open panel or dashboard
  if (cmdName === 'assistants' && !cmdArgs) {
    ctx.setShowAssistantsPanel(true);
    return true;
  }

  // /projects (no args) → open panel
  if (cmdName === 'projects' && !cmdArgs) {
    listProjects(ctx.cwd).then((projects) => {
      const activeId = ctx.registry.getActiveSession()?.client.getActiveProjectId?.();
      ctx.setProjectsList(projects);
      ctx.setActiveProjectId(activeId || undefined);
      ctx.setShowProjectsPanel(true);
    });
    return true;
  }

  // /plans (no args) → open panel
  if (cmdName === 'plans' && !cmdArgs) {
    const activeId = ctx.registry.getActiveSession()?.client.getActiveProjectId?.();
    if (activeId) {
      readProject(ctx.cwd, activeId).then((project) => {
        if (project) {
          ctx.setPlansProject(project);
          ctx.setShowPlansPanel(true);
        }
      });
    } else {
      listProjects(ctx.cwd).then((projects) => {
        ctx.setProjectsList(projects);
        ctx.setActiveProjectId(undefined);
        ctx.setShowProjectsPanel(true);
      });
    }
    return true;
  }

  // /messages or /inbox (no args) → open unified messages panel
  if ((cmdName === 'messages' || cmdName === 'inbox') && !cmdArgs) {
    // Reuse the shared message/inbox loading from appShowPanel
    loadMessagesAndInbox({
      cwd: ctx.cwd,
      registry: ctx.registry as any,
      activeSessionId: null,
      workspaceBaseDir: '',
      currentConfig: null,
      setMessagesList: ctx.setMessagesList,
      setMessagesPanelError: ctx.setMessagesPanelError,
      setInboxEnabled: ctx.setInboxEnabled,
      setInboxEmails: ctx.setInboxEmails,
      setInboxError: ctx.setInboxError,
    } as any);
    ctx.setShowMessagesPanel(true);
    return true;
  }

  // /wallet (no args) → open panel
  if (cmdName === 'wallet' && !cmdArgs) {
    void ctx.openWalletPanel('list');
    return true;
  }

  // /secrets (no args) → open panel
  if (cmdName === 'secrets' && !cmdArgs) {
    void ctx.openSecretsPanel('list');
    return true;
  }

  return false;
}
