/**
 * Handler for 'show_panel' stream chunks — extracted from handleChunk in App.tsx.
 *
 * Receives the chunk and a context object containing all the state setters and
 * helpers it needs, so it can be called from within handleChunk without being
 * a React hook itself.
 */

import type { StreamChunk, Connector, HookConfig, ScheduledCommand, Skill } from '@hasna/assistants-shared';
import type { EmailListItem } from '@hasna/assistants-shared';
import type { SessionRegistry, SessionStorage, Heartbeat, SavedSessionInfo } from '@hasna/assistants-core';
import {
  getTasks,
  isPaused,
  HookStore,
  GuardrailsStore,
  listSchedules,
  listProjects,
  readProject,
  type GuardrailsConfig,
  type PolicyInfo,
  type ProjectRecord,
  type Task,
} from '@hasna/assistants-core';
import { readHeartbeatHistoryBySession } from '@hasna/assistants-core';
import type { AssistantsConfig } from '@hasna/assistants-shared';
import type { IdentityPanelIntent } from './appHelpers';

export interface ShowPanelContext {
  cwd: string;
  registry: SessionRegistry;
  activeSessionId: string | null;
  workspaceBaseDir: string;
  currentConfig: AssistantsConfig | null;

  // State setters (only the ones used by show_panel)
  setConnectorsPanelInitial: (v: string | undefined) => void;
  setShowConnectorsPanel: (v: boolean) => void;
  setTasksList: (v: Task[] | ((prev: Task[]) => Task[])) => void;
  setTasksPaused: (v: boolean) => void;
  setShowTasksPanel: (v: boolean) => void;
  setSchedulesList: (v: ScheduledCommand[]) => void;
  setShowSchedulesPanel: (v: boolean) => void;
  setSkillsList: (v: Skill[]) => void;
  setShowSkillsPanel: (v: boolean) => void;
  setShowSessionSelector: (v: boolean) => void;
  setShowAssistantsDashboard: (v: boolean) => void;
  setShowAssistantsPanel: (v: boolean) => void;
  setIdentityPanelIntent: (v: IdentityPanelIntent | null) => void;
  setShowIdentityPanel: (v: boolean) => void;
  setMemoryError: (v: string | null) => void;
  setShowMemoryPanel: (v: boolean) => void;
  setHooksConfig: (v: HookConfig) => void;
  setShowHooksPanel: (v: boolean) => void;
  setShowConfigPanel: (v: boolean) => void;
  setShowWebhooksPanel: (v: boolean) => void;
  setShowChannelsPanel: (v: boolean) => void;
  setShowPeoplePanel: (v: boolean) => void;
  setShowContactsPanel: (v: boolean) => void;
  setShowTelephonyPanel: (v: boolean) => void;
  setShowOrdersPanel: (v: boolean) => void;
  setShowOnboardingPanel: (v: boolean) => void;
  setMessagesList: (v: any) => void;
  setMessagesPanelError: (v: string | null) => void;
  setInboxEnabled: (v: boolean) => void;
  setInboxEmails: (v: EmailListItem[]) => void;
  setInboxError: (v: string | null) => void;
  setShowMessagesPanel: (v: boolean) => void;
  setGuardrailsConfig: (v: GuardrailsConfig | null) => void;
  setGuardrailsPolicies: (v: PolicyInfo[]) => void;
  setShowGuardrailsPanel: (v: boolean) => void;
  setShowModelPanel: (v: boolean) => void;
  setProjectsList: (v: ProjectRecord[]) => void;
  setActiveProjectId: (v: string | undefined) => void;
  setShowProjectsPanel: (v: boolean) => void;
  setPlansProject: (v: ProjectRecord | null) => void;
  setShowPlansPanel: (v: boolean) => void;
  setShowSwarmPanel: (v: boolean) => void;
  setWorkspacesList: (v: any) => void;
  setShowWorkspacePanel: (v: boolean) => void;
  setResumeFilter: (v: 'cwd' | 'all') => void;
  setResumeSessions: (v: SavedSessionInfo[]) => void;
  setShowResumePanel: (v: boolean) => void;
  setHeartbeatRuns: (v: Heartbeat[]) => void;
  setShowHeartbeatPanel: (v: boolean) => void;
  setShowLogsPanel: (v: boolean) => void;
  setError: (v: string | null) => void;

  // Refs
  hookStoreRef: { current: InstanceType<typeof HookStore> | null };
  guardrailsStoreRef: { current: GuardrailsStore | null };

  // Callbacks
  createAndActivateSession: (opts: { cwd: string; label?: string; assistantId?: string }) => Promise<any>;
  switchToSession: (sessionId: string) => Promise<void>;
  openBudgetsPanel: () => Promise<void>;
  openWalletPanel: (mode: 'list' | 'add') => Promise<void>;
  openSecretsPanel: (mode: 'list' | 'add') => Promise<void>;
  loadConfigFiles: () => Promise<void>;
  listAllSessions: (baseDir: string) => SavedSessionInfo[];
}

export function handleShowPanel(chunk: StreamChunk, ctx: ShowPanelContext): void {
  if (chunk.panel === 'connectors') {
    ctx.setConnectorsPanelInitial(chunk.panelValue);
    ctx.setShowConnectorsPanel(true);
  } else if (chunk.panel === 'tasks') {
    getTasks(ctx.cwd).then((tasks) => {
      ctx.setTasksList(tasks);
      isPaused(ctx.cwd).then((paused) => {
        ctx.setTasksPaused(paused);
        ctx.setShowTasksPanel(true);
      });
    });
  } else if (chunk.panel === 'schedules') {
    listSchedules(ctx.cwd, { global: true }).then((schedules) => {
      ctx.setSchedulesList(schedules);
      ctx.setShowSchedulesPanel(true);
    });
  } else if (chunk.panel === 'skills') {
    const client = ctx.registry.getActiveSession()?.client;
    if (client) {
      client.getSkills().then((skills: Skill[]) => {
        ctx.setSkillsList(skills);
        ctx.setShowSkillsPanel(true);
      });
    }
  } else if (chunk.panel === 'assistants') {
    if (chunk.panelValue?.startsWith('session:')) {
      try {
        const payload = JSON.parse(chunk.panelValue.slice('session:'.length));
        if (payload.action === 'list') {
          ctx.setShowSessionSelector(true);
        } else if (payload.action === 'new') {
          ctx.createAndActivateSession({
            cwd: ctx.cwd,
            label: payload.label,
            assistantId: payload.agent,
          }).catch((err) => {
            ctx.setError(err instanceof Error ? err.message : 'Failed to create session');
          });
        } else if (payload.action === 'assign' && payload.agent) {
          const active = ctx.registry.getActiveSession();
          if (active) {
            ctx.registry.assignAssistant(active.id, payload.agent);
          }
        } else if (payload.action === 'rename' && payload.label) {
          const allSessions = ctx.registry.listSessions();
          const target = payload.number
            ? allSessions[payload.number - 1]
            : ctx.registry.getActiveSession();
          if (!target) {
            ctx.setError('Failed to rename session: session not found');
          } else {
            ctx.registry.setLabel(target.id, String(payload.label));
          }
        } else if (payload.action === 'switch' && payload.number) {
          const allSessions = ctx.registry.listSessions();
          const target = allSessions[payload.number - 1];
          if (target) {
            ctx.switchToSession(target.id).catch((err) => {
              ctx.setError(err instanceof Error ? err.message : 'Failed to switch session');
            });
          }
        }
      } catch {
        ctx.setShowAssistantsDashboard(true);
      }
    } else if (chunk.panelValue === 'dashboard') {
      ctx.setShowAssistantsDashboard(true);
    } else {
      ctx.setShowAssistantsPanel(true);
    }
  } else if (chunk.panel === 'identity') {
    const panelValue = chunk.panelValue?.trim();
    if (panelValue) {
      if (panelValue.startsWith('edit:')) {
        const id = panelValue.slice('edit:'.length).trim();
        ctx.setIdentityPanelIntent(id ? { id, mode: 'edit' } : null);
      } else if (panelValue.startsWith('detail:')) {
        const id = panelValue.slice('detail:'.length).trim();
        ctx.setIdentityPanelIntent(id ? { id, mode: 'detail' } : null);
      } else {
        ctx.setIdentityPanelIntent({ id: panelValue, mode: 'detail' });
      }
    } else {
      ctx.setIdentityPanelIntent(null);
    }
    ctx.setShowIdentityPanel(true);
  } else if (chunk.panel === 'memory') {
    ctx.setMemoryError(null);
    ctx.setShowMemoryPanel(true);
  } else if (chunk.panel === 'hooks') {
    if (!ctx.hookStoreRef.current) {
      ctx.hookStoreRef.current = new HookStore();
    }
    const hooks = ctx.hookStoreRef.current.loadAll();
    ctx.setHooksConfig(hooks);
    ctx.setShowHooksPanel(true);
  } else if (chunk.panel === 'config') {
    ctx.loadConfigFiles();
    ctx.setShowConfigPanel(true);
  } else if (chunk.panel === 'webhooks') {
    ctx.setShowWebhooksPanel(true);
  } else if (chunk.panel === 'channels') {
    ctx.setShowChannelsPanel(true);
  } else if (chunk.panel === 'people') {
    ctx.setShowPeoplePanel(true);
  } else if (chunk.panel === 'contacts') {
    ctx.setShowContactsPanel(true);
  } else if (chunk.panel === 'telephony') {
    ctx.setShowTelephonyPanel(true);
  } else if (chunk.panel === 'orders') {
    ctx.setShowOrdersPanel(true);
  } else if (chunk.panel === 'setup') {
    ctx.setShowOnboardingPanel(true);
  } else if (chunk.panel === 'messages') {
    loadMessagesAndInbox(ctx);
    ctx.setShowMessagesPanel(true);
  } else if (chunk.panel === 'guardrails') {
    if (!ctx.guardrailsStoreRef.current) {
      ctx.guardrailsStoreRef.current = new GuardrailsStore();
    }
    const config = ctx.guardrailsStoreRef.current.loadAll();
    const policies = ctx.guardrailsStoreRef.current.listPolicies();
    ctx.setGuardrailsConfig(config);
    ctx.setGuardrailsPolicies(policies);
    ctx.setShowGuardrailsPanel(true);
  } else if (chunk.panel === 'model') {
    ctx.setShowModelPanel(true);
  } else if (chunk.panel === 'budget') {
    void ctx.openBudgetsPanel();
  } else if (chunk.panel === 'projects') {
    listProjects(ctx.cwd).then((projects) => {
      const activeId = ctx.registry.getActiveSession()?.client.getActiveProjectId?.();
      ctx.setProjectsList(projects);
      ctx.setActiveProjectId(activeId || undefined);
      ctx.setShowProjectsPanel(true);
    });
  } else if (chunk.panel === 'plans') {
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
  } else if (chunk.panel === 'wallet') {
    void ctx.openWalletPanel(chunk.panelValue === 'add' ? 'add' : 'list');
  } else if (chunk.panel === 'secrets') {
    void ctx.openSecretsPanel(chunk.panelValue === 'add' ? 'add' : 'list');
  } else if (chunk.panel === 'inbox') {
    loadMessagesAndInbox(ctx);
    ctx.setShowMessagesPanel(true);
  } else if (chunk.panel === 'swarm') {
    ctx.setShowSwarmPanel(true);
  } else if (chunk.panel === 'workspace') {
    import('@hasna/assistants-core').then(({ SharedWorkspaceManager }) => {
      const mgr = new SharedWorkspaceManager();
      const workspaces = mgr.list(true);
      ctx.setWorkspacesList(workspaces);
      ctx.setShowWorkspacePanel(true);
    });
  } else if (chunk.panel === 'resume') {
    const mode = chunk.panelValue === 'all' ? 'all' : 'cwd';
    ctx.setResumeFilter(mode);
    ctx.setResumeSessions(ctx.listAllSessions(ctx.workspaceBaseDir));
    ctx.setShowResumePanel(true);
  } else if (chunk.panel === 'heartbeat') {
    const sessionId = ctx.activeSessionId || ctx.registry.getActiveSession()?.id;
    if (sessionId) {
      readHeartbeatHistoryBySession(sessionId, {
        historyPath: ctx.currentConfig?.heartbeat?.historyPath,
        order: 'desc',
        baseDir: ctx.workspaceBaseDir,
      }).then((runs) => {
        ctx.setHeartbeatRuns(runs);
        ctx.setShowHeartbeatPanel(true);
      });
    } else {
      ctx.setHeartbeatRuns([]);
      ctx.setShowHeartbeatPanel(true);
    }
  } else if (chunk.panel === 'logs') {
    ctx.setShowLogsPanel(true);
  }
}

/**
 * Load messages and inbox data — shared by 'messages' and 'inbox' panel openers.
 */
export function loadMessagesAndInbox(ctx: ShowPanelContext): void {
  const messagesManager = ctx.registry.getActiveSession()?.client.getMessagesManager?.();
  const inboxManager = ctx.registry.getActiveSession()?.client.getInboxManager?.();

  if (messagesManager) {
    messagesManager.list({ limit: 50 }).then((msgs: Array<{
      id: string;
      threadId: string;
      fromAssistantId: string;
      fromAssistantName: string;
      subject?: string;
      preview: string;
      body?: string;
      priority: string;
      status: string;
      createdAt: string;
      replyCount?: number;
    }>) => {
      ctx.setMessagesList(msgs.map((m: typeof msgs[0]) => ({
        id: m.id,
        threadId: m.threadId,
        fromAssistantId: m.fromAssistantId,
        fromAssistantName: m.fromAssistantName,
        subject: m.subject,
        preview: m.preview,
        body: m.body,
        priority: m.priority as 'low' | 'normal' | 'high' | 'urgent',
        status: m.status as 'unread' | 'read' | 'archived' | 'injected',
        createdAt: m.createdAt,
        replyCount: m.replyCount,
      })));
      ctx.setMessagesPanelError(null);
    }).catch((err: Error) => {
      ctx.setMessagesPanelError(err instanceof Error ? err.message : String(err));
    });
  } else {
    ctx.setMessagesPanelError(null);
  }

  if (inboxManager) {
    ctx.setInboxEnabled(true);
    inboxManager.list({ limit: 50 }).then((emails: EmailListItem[]) => {
      ctx.setInboxEmails(emails);
      ctx.setInboxError(null);
    }).catch((err: Error) => {
      ctx.setInboxError(err instanceof Error ? err.message : String(err));
    });
  } else {
    ctx.setInboxEnabled(false);
  }
}
