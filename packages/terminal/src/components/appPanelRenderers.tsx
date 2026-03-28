/**
 * Panel rendering logic extracted from App.tsx.
 *
 * Each function renders one panel's full UI (including inline event handlers)
 * and returns a React element or null.  The App component calls these in its
 * early-return chain so that only one panel is visible at a time.
 */

import React from 'react';
import type { Message, Connector, HookConfig, HookEvent, HookHandler, ScheduledCommand, Skill, TokenUsage, VoiceState, HeartbeatState, ActiveIdentityInfo, InterviewResponse } from '@hasna/assistants-shared';
import type { SessionInfo, CreateAssistantOptions, CreateIdentityOptions, Identity, Memory, MemoryStats, Heartbeat, SavedSessionInfo, RecoverableSession } from '@hasna/assistants-core';
import {
  SessionRegistry,
  SessionStorage,
  ConnectorBridge,
  listTemplates,
  createIdentityFromTemplate,
  readHeartbeatHistoryBySession,
} from '@hasna/assistants-core';
import {
  getTasks,
  addTask,
  deleteTask,
  clearPendingTasks,
  clearCompletedTasks,
  isPaused,
  setPaused,
  startTask,
  updateTask,
  HookStore,
  nativeHookRegistry,
  loadConfig,
  getConfigDir,
  getProjectConfigDir,
  GuardrailsStore,
  PERMISSIVE_POLICY,
  RESTRICTIVE_POLICY,
  BudgetTracker,
  getGlobalRegistry,
  type Task,
  type TaskPriority,
  type TaskCreateOptions,
  type GuardrailsConfig,
  type PolicyInfo,
  type BudgetScope,
  type BudgetStatus,
  type RegisteredAssistant,
  type RegistryStats,
  listSchedules,
  saveSchedule,
  deleteSchedule,
  updateSchedule,
  computeNextRun,
  listProjects,
  createProject,
  deleteProject,
  updateProject,
  readProject,
  type ProjectRecord,
  type ProjectPlan,
  type PlanStepStatus,
  type SerializableSwarmState,
  type SwarmConfig,
  createSkill,
  deleteSkill,
  createLLMClient,
  type SkillScope,
  type CreateSkillOptions,
} from '@hasna/assistants-core';
import type { BudgetConfig, AssistantsConfig } from '@hasna/assistants-shared';
import type { BudgetProfile } from '../lib/budgets';
import {
  loadBudgetProfiles,
  createBudgetProfile,
  updateBudgetProfile,
  deleteBudgetProfile,
} from '../lib/budgets';
import { generateId, now } from '@hasna/assistants-shared';
import { getProviderInfo, LLM_PROVIDERS, getModelDisplayName, type LLMProvider } from '@hasna/assistants-shared';
import { parseMentions, resolveNameToKnown, type ChannelMember } from '@hasna/assistants-core';
import type { Email, EmailListItem } from '@hasna/assistants-shared';

import { OnboardingPanel, type OnboardingResult } from './OnboardingPanel';
import { RecoveryPanel } from './RecoveryPanel';
import { SessionSelector } from './SessionSelector';
import { ConnectorsPanel } from './ConnectorsPanel';
import { TasksPanel } from './TasksPanel';
import { SkillsPanel } from './SkillsPanel';
import { SchedulesPanel } from './SchedulesPanel';
import { AssistantsPanel } from './AssistantsPanel';
import { IdentityPanel } from './IdentityPanel';
import { MemoryPanel } from './MemoryPanel';
import { HooksPanel } from './HooksPanel';
import { GuardrailsPanel } from './GuardrailsPanel';
import { BudgetsPanel } from './BudgetsPanel';
import { ModelPanel } from './ModelPanel';
import { AssistantsRegistryPanel } from './AssistantsRegistryPanel';
import { ProjectsPanel } from './ProjectsPanel';
import { PlansPanel } from './PlansPanel';
import { WalletPanel } from './WalletPanel';
import { SecretsPanel } from './SecretsPanel';
import { AssistantsDashboard } from './AssistantsDashboard';
import { SwarmPanel } from './SwarmPanel';
import { WorkspacePanel } from './WorkspacePanel';
import { ResumePanel } from './ResumePanel';
import { HeartbeatPanel } from './HeartbeatPanel';
import { LogsPanel } from './LogsPanel';
import { ConfigPanel } from './ConfigPanel';
import { WebhooksPanel } from './WebhooksPanel';
import { ChannelsPanel } from './ChannelsPanel';
import { PeoplePanel } from './PeoplePanel';
import { ContactsPanel } from './ContactsPanel';
import { TelephonyPanel } from './TelephonyPanel';
import { OrdersPanel } from './OrdersPanel';
import { JobsPanel } from './JobsPanel';
import { DocsPanel } from './DocsPanel';
import { MessagesPanel } from './MessagesPanel';
import { Spinner } from './Spinner';
import { useSafeInput as useInput } from '../hooks/useSafeInput';

import type {
  WalletCardEntry,
  WalletAddInput,
  SkillDraft,
  HookDraft,
  IdentityPanelIntent,
  ActivityEntry,
} from './appHelpers';
import {
  HOOK_EVENT_SET,
  HOOK_TYPE_SET,
  HOOK_LOCATION_SET,
  HOOK_EVENT_MAP,
  collectStreamText,
  extractJsonObject,
  normalizeAllowedTools,
  deepMerge,
} from './appHelpers';

// ─── Small utility component ───────────────────────────────────────────────
function CloseOnAnyKeyPanel({ message, onClose }: { message: string; onClose: () => void }) {
  useInput(() => {
    onClose();
  }, { isActive: true });

  return (
    <box flexDirection="column" padding={1}>
      <text fg="red">{message}</text>
      <text fg="gray">Press any key to close.</text>
    </box>
  );
}

// ─── Panel context passed from App ─────────────────────────────────────────
export interface PanelRenderContext {
  // Core
  cwd: string;
  registry: SessionRegistry;
  activeSessionId: string | null;
  activeSession: SessionInfo | undefined;
  workspaceBaseDir: string;
  activeWorkspaceId: string | null;

  // Config
  currentConfig: AssistantsConfig | null;
  userConfig: Partial<AssistantsConfig> | null;
  projectConfig: Partial<AssistantsConfig> | null;
  localConfig: Partial<AssistantsConfig> | null;

  // Connectors
  connectors: Connector[];
  setConnectors: React.Dispatch<React.SetStateAction<Connector[]>>;
  connectorsPanelInitial: string | undefined;
  connectorBridgeRef: React.MutableRefObject<ConnectorBridge | null>;

  // Tasks
  tasksList: Task[];
  setTasksList: React.Dispatch<React.SetStateAction<Task[]>>;
  tasksPaused: boolean;
  setTasksPaused: React.Dispatch<React.SetStateAction<boolean>>;

  // Schedules
  schedulesList: ScheduledCommand[];
  setSchedulesList: React.Dispatch<React.SetStateAction<ScheduledCommand[]>>;

  // Skills
  skillsList: Skill[];
  setSkillsList: React.Dispatch<React.SetStateAction<Skill[]>>;

  // Assistants
  assistantError: string | null;
  setAssistantError: React.Dispatch<React.SetStateAction<string | null>>;
  setAssistantsRefreshKey: React.Dispatch<React.SetStateAction<number>>;

  // Identity
  identityError: string | null;
  setIdentityError: React.Dispatch<React.SetStateAction<string | null>>;
  identityPanelIntent: IdentityPanelIntent | null;
  setIdentityPanelIntent: React.Dispatch<React.SetStateAction<IdentityPanelIntent | null>>;
  identitiesList: Identity[];
  refreshIdentitiesList: () => void;

  // Memory
  memoryList: Memory[];
  memoryStats: MemoryStats | null;
  memoryError: string | null;
  refreshMemoryList: () => Promise<void>;

  // Hooks
  hooksConfig: HookConfig;
  setHooksConfig: React.Dispatch<React.SetStateAction<HookConfig>>;
  hookStoreRef: React.MutableRefObject<InstanceType<typeof HookStore> | null>;

  // Guardrails
  guardrailsConfig: GuardrailsConfig | null;
  setGuardrailsConfig: React.Dispatch<React.SetStateAction<GuardrailsConfig | null>>;
  guardrailsPolicies: PolicyInfo[];
  setGuardrailsPolicies: React.Dispatch<React.SetStateAction<PolicyInfo[]>>;
  guardrailsStoreRef: React.MutableRefObject<GuardrailsStore | null>;

  // Budget
  sessionBudgetStatus: BudgetStatus | null;
  setSessionBudgetStatus: React.Dispatch<React.SetStateAction<BudgetStatus | null>>;
  swarmBudgetStatus: BudgetStatus | null;
  setSwarmBudgetStatus: React.Dispatch<React.SetStateAction<BudgetStatus | null>>;
  budgetConfig: BudgetConfig | null;
  budgetTrackerRef: React.MutableRefObject<BudgetTracker | null>;
  budgetProfiles: BudgetProfile[];
  setBudgetProfiles: React.Dispatch<React.SetStateAction<BudgetProfile[]>>;
  getSessionBudgetProfileId: (sessionId: string, profiles: BudgetProfile[]) => string | null;
  applyBudgetProfileToSession: (session: SessionInfo, profileId: string | null, profiles: BudgetProfile[]) => Promise<void>;

  // Model
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;

  // Assistants registry
  assistantsList: RegisteredAssistant[];
  setAssistantsList: React.Dispatch<React.SetStateAction<RegisteredAssistant[]>>;
  registryStats: RegistryStats | null;
  setRegistryStats: React.Dispatch<React.SetStateAction<RegistryStats | null>>;

  // Projects
  projectsList: ProjectRecord[];
  setProjectsList: React.Dispatch<React.SetStateAction<ProjectRecord[]>>;
  activeProjectId: string | undefined;
  setActiveProjectId: React.Dispatch<React.SetStateAction<string | undefined>>;

  // Plans
  plansProject: ProjectRecord | null;
  setPlansProject: React.Dispatch<React.SetStateAction<ProjectRecord | null>>;

  // Wallet
  walletCards: WalletCardEntry[];
  setWalletCards: React.Dispatch<React.SetStateAction<WalletCardEntry[]>>;
  walletError: string | null;
  setWalletError: React.Dispatch<React.SetStateAction<string | null>>;
  walletPanelInitialMode: 'list' | 'add';
  toWalletCardEntry: (card: any) => WalletCardEntry;

  // Secrets
  secretsList: Array<{ name: string; scope: 'global' | 'assistant'; createdAt?: string; updatedAt?: string }>;
  setSecretsList: React.Dispatch<React.SetStateAction<Array<{ name: string; scope: 'global' | 'assistant'; createdAt?: string; updatedAt?: string }>>>;
  secretsError: string | null;
  setSecretsError: React.Dispatch<React.SetStateAction<string | null>>;
  secretsPanelInitialMode: 'list' | 'add';

  // Messages
  messagesList: Array<{
    id: string;
    threadId: string;
    fromAssistantId: string;
    fromAssistantName: string;
    subject?: string;
    preview: string;
    body?: string;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    status: 'unread' | 'read' | 'archived' | 'injected';
    createdAt: string;
    replyCount?: number;
  }>;
  setMessagesList: React.Dispatch<React.SetStateAction<PanelRenderContext['messagesList']>>;
  messagesPanelError: string | null;
  setMessagesPanelError: React.Dispatch<React.SetStateAction<string | null>>;
  inboxEmails: EmailListItem[];
  setInboxEmails: React.Dispatch<React.SetStateAction<EmailListItem[]>>;
  inboxError: string | null;
  setInboxError: React.Dispatch<React.SetStateAction<string | null>>;
  inboxEnabled: boolean;

  // Workspace
  workspacesList: Array<{ id: string; name: string; description?: string; createdAt: number; updatedAt: number; createdBy: string; participants: string[]; status: 'active' | 'archived' }>;
  setWorkspacesList: React.Dispatch<React.SetStateAction<PanelRenderContext['workspacesList']>>;
  switchWorkspace: (workspaceId: string | null) => Promise<void>;

  // Heartbeat / Resume / Logs
  heartbeatRuns: Heartbeat[];
  setHeartbeatRuns: React.Dispatch<React.SetStateAction<Heartbeat[]>>;
  heartbeatState: HeartbeatState | undefined;
  resumeSessions: SavedSessionInfo[];
  resumeFilter: 'cwd' | 'all';
  resumeFromSavedSession: (session: SavedSessionInfo) => Promise<void>;
  refreshResumeSessions: () => Promise<void>;

  // Session navigation
  sessions: SessionInfo[];
  switchToSession: (sessionId: string) => Promise<void>;
  handleNewSession: () => Promise<void>;

  // Identity info (for panel context)
  setIdentityInfo: React.Dispatch<React.SetStateAction<ActiveIdentityInfo | undefined>>;

  // Panel close setters (all the setShowXxxPanel(false) calls)
  setShowOnboardingPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowRecoveryPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSessionSelector: React.Dispatch<React.SetStateAction<boolean>>;
  setShowConnectorsPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setConnectorsPanelInitial: React.Dispatch<React.SetStateAction<string | undefined>>;
  setShowTasksPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSkillsPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSchedulesPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowAssistantsPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowIdentityPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowMemoryPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setMemoryError: React.Dispatch<React.SetStateAction<string | null>>;
  setShowHooksPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowGuardrailsPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowBudgetPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowModelPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowAssistantsRegistryPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowConfigPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowWebhooksPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowChannelsPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowPeoplePanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowContactsPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowTelephonyPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowOrdersPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowJobsPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowDocsPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowMessagesPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowProjectsPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowPlansPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowWalletPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSecretsPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowAssistantsDashboard: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSwarmPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowWorkspacePanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowLogsPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowHeartbeatPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowResumePanel: React.Dispatch<React.SetStateAction<boolean>>;

  // Error
  setError: React.Dispatch<React.SetStateAction<string | null>>;

  // Config loading
  loadConfigFiles: () => Promise<void>;

  // Recovery
  recoverableSessions: RecoverableSession[];
  handleRecover: (session: RecoverableSession) => void;
  handleStartFresh: () => void;
  handleOnboardingComplete: (result: OnboardingResult) => Promise<void>;
  handleOnboardingCancel: () => void;

  // Panel visibility flags
  showOnboardingPanel: boolean;
  showRecoveryPanel: boolean;
  showSessionSelector: boolean;
  showConnectorsPanel: boolean;
  showTasksPanel: boolean;
  showSkillsPanel: boolean;
  showSchedulesPanel: boolean;
  showAssistantsPanel: boolean;
  showIdentityPanel: boolean;
  showMemoryPanel: boolean;
  showHooksPanel: boolean;
  showGuardrailsPanel: boolean;
  showBudgetPanel: boolean;
  showModelPanel: boolean;
  showAssistantsRegistryPanel: boolean;
  showConfigPanel: boolean;
  showWebhooksPanel: boolean;
  showChannelsPanel: boolean;
  showPeoplePanel: boolean;
  showContactsPanel: boolean;
  showTelephonyPanel: boolean;
  showOrdersPanel: boolean;
  showJobsPanel: boolean;
  showDocsPanel: boolean;
  showMessagesPanel: boolean;
  showProjectsPanel: boolean;
  showPlansPanel: boolean;
  showWalletPanel: boolean;
  showSecretsPanel: boolean;
  showAssistantsDashboard: boolean;
  showSwarmPanel: boolean;
  showWorkspacePanel: boolean;
  showLogsPanel: boolean;
  showHeartbeatPanel: boolean;
  showResumePanel: boolean;
  isInitializing: boolean;
}

/**
 * Render a panel if one is active. Returns the JSX element to render, or null
 * if no panel is currently shown. The caller (App) should early-return the
 * result when non-null.
 */
export function renderActivePanel(ctx: PanelRenderContext): React.ReactElement | null {

  // Initializing spinner
  if (ctx.isInitializing && !ctx.showRecoveryPanel && !ctx.showOnboardingPanel) {
    return (
      <box flexDirection="column" padding={1}>
        <Spinner label="Initializing..." />
      </box>
    );
  }

  // Onboarding panel
  if (ctx.showOnboardingPanel) {
    const existingKeys = LLM_PROVIDERS.reduce((acc, provider) => {
      const key = process.env[provider.apiKeyEnv];
      if (key) acc[provider.id] = key;
      return acc;
    }, {} as Record<LLMProvider, string>);
    const discovered = ctx.connectorBridgeRef.current?.fastDiscover() || [];
    const discoveredNames = discovered.map((c: Connector) => c.name);

    return (
      <OnboardingPanel
        onComplete={ctx.handleOnboardingComplete}
        onCancel={ctx.handleOnboardingCancel}
        existingApiKeys={existingKeys}
        discoveredConnectors={discoveredNames}
        discoveredSkills={[]}
      />
    );
  }

  // Recovery panel
  if (ctx.showRecoveryPanel && ctx.recoverableSessions.length > 0) {
    return (
      <box flexDirection="column" padding={1}>
        <RecoveryPanel
          sessions={ctx.recoverableSessions}
          onRecover={ctx.handleRecover}
          onStartFresh={ctx.handleStartFresh}
        />
      </box>
    );
  }

  // Session selector
  if (ctx.showSessionSelector) {
    const subagentSessions = ctx.registry.getStore().listSubagentSessions();
    return (
      <box flexDirection="column" padding={1}>
        <SessionSelector
          sessions={ctx.sessions}
          activeSessionId={ctx.activeSessionId}
          onSelect={(sessionId) => {
            ctx.setShowSessionSelector(false);
            void ctx.switchToSession(sessionId);
          }}
          onNew={() => {
            ctx.setShowSessionSelector(false);
            void ctx.handleNewSession();
          }}
          onCancel={() => ctx.setShowSessionSelector(false)}
          subagentSessions={subagentSessions}
        />
      </box>
    );
  }

  // Connectors panel
  if (ctx.showConnectorsPanel) {
    return renderConnectorsPanel(ctx);
  }

  // Tasks panel
  if (ctx.showTasksPanel) {
    return renderTasksPanel(ctx);
  }

  // Skills panel
  if (ctx.showSkillsPanel) {
    return renderSkillsPanel(ctx);
  }

  // Schedules panel
  if (ctx.showSchedulesPanel) {
    return renderSchedulesPanel(ctx);
  }

  // Assistants panel
  if (ctx.showAssistantsPanel) {
    return renderAssistantsPanel(ctx);
  }

  // Identity panel
  if (ctx.showIdentityPanel) {
    return renderIdentityPanel(ctx);
  }

  // Memory panel
  if (ctx.showMemoryPanel) {
    return (
      <box flexDirection="column" padding={1}>
        <MemoryPanel
          memories={ctx.memoryList}
          stats={ctx.memoryStats}
          error={ctx.memoryError}
          onRefresh={ctx.refreshMemoryList}
          onClose={() => {
            ctx.setShowMemoryPanel(false);
            ctx.setMemoryError(null);
          }}
        />
      </box>
    );
  }

  // Hooks panel
  if (ctx.showHooksPanel) {
    return renderHooksPanel(ctx);
  }

  // Guardrails panel
  if (ctx.showGuardrailsPanel && ctx.guardrailsConfig) {
    return renderGuardrailsPanel(ctx);
  }

  // Budgets panel
  if (ctx.showBudgetPanel && ctx.sessionBudgetStatus && ctx.swarmBudgetStatus) {
    return renderBudgetsPanel(ctx);
  }

  // Model panel
  if (ctx.showModelPanel) {
    return renderModelPanel(ctx);
  }

  // Assistants registry panel
  if (ctx.showAssistantsRegistryPanel && ctx.registryStats) {
    return renderAssistantsRegistryPanel(ctx);
  }

  // Projects panel
  if (ctx.showProjectsPanel) {
    return renderProjectsPanel(ctx);
  }

  // Plans panel
  if (ctx.showPlansPanel && ctx.plansProject) {
    return renderPlansPanel(ctx);
  }

  // Wallet panel
  if (ctx.showWalletPanel) {
    return renderWalletPanel(ctx);
  }

  // Secrets panel
  if (ctx.showSecretsPanel) {
    return renderSecretsPanel(ctx);
  }

  // Assistants dashboard
  if (ctx.showAssistantsDashboard) {
    return renderAssistantsDashboard(ctx);
  }

  // Swarm panel
  if (ctx.showSwarmPanel) {
    return renderSwarmPanel(ctx);
  }

  // Workspace panel
  if (ctx.showWorkspacePanel) {
    return renderWorkspacePanel(ctx);
  }

  // Resume panel
  if (ctx.showResumePanel) {
    return (
      <box flexDirection="column" padding={1}>
        <ResumePanel
          sessions={ctx.resumeSessions}
          activeCwd={ctx.cwd}
          initialFilter={ctx.resumeFilter}
          onResume={(session) => {
            void ctx.resumeFromSavedSession(session);
          }}
          onRefresh={ctx.refreshResumeSessions}
          onClose={() => ctx.setShowResumePanel(false)}
        />
      </box>
    );
  }

  // Heartbeat panel
  if (ctx.showHeartbeatPanel) {
    return renderHeartbeatPanel(ctx);
  }

  // Logs panel
  if (ctx.showLogsPanel) {
    return (
      <box flexDirection="column" padding={1}>
        <LogsPanel
          onCancel={() => ctx.setShowLogsPanel(false)}
        />
      </box>
    );
  }

  // Config panel
  if (ctx.showConfigPanel && ctx.currentConfig) {
    return renderConfigPanel(ctx);
  }

  // Webhooks panel
  if (ctx.showWebhooksPanel) {
    const webhooksManager = ctx.activeSession?.client.getWebhooksManager?.();
    if (!webhooksManager) {
      return (
        <CloseOnAnyKeyPanel
          message="Webhooks are not enabled. Set webhooks.enabled: true in config."
          onClose={() => ctx.setShowWebhooksPanel(false)}
        />
      );
    }
    return (
      <WebhooksPanel
        manager={webhooksManager}
        onClose={() => ctx.setShowWebhooksPanel(false)}
      />
    );
  }

  // Channels panel
  if (ctx.showChannelsPanel) {
    return renderChannelsPanel(ctx);
  }

  // People panel
  if (ctx.showPeoplePanel) {
    const peopleManager = ctx.activeSession?.client.getPeopleManager?.();
    if (!peopleManager) {
      return (
        <CloseOnAnyKeyPanel
          message="People system is not available."
          onClose={() => ctx.setShowPeoplePanel(false)}
        />
      );
    }
    return (
      <PeoplePanel
        manager={peopleManager}
        onClose={() => ctx.setShowPeoplePanel(false)}
      />
    );
  }

  // Contacts panel
  if (ctx.showContactsPanel) {
    const contactsManager = ctx.activeSession?.client.getContactsManager?.();
    if (!contactsManager) {
      return (
        <CloseOnAnyKeyPanel
          message="Contacts system is not available."
          onClose={() => ctx.setShowContactsPanel(false)}
        />
      );
    }
    return (
      <ContactsPanel
        manager={contactsManager}
        onClose={() => ctx.setShowContactsPanel(false)}
      />
    );
  }

  // Telephony panel
  if (ctx.showTelephonyPanel) {
    const telephonyManager = ctx.activeSession?.client.getTelephonyManager?.();
    if (!telephonyManager) {
      return (
        <CloseOnAnyKeyPanel
          message="Communication is not enabled. Set telephony.enabled: true in config."
          onClose={() => ctx.setShowTelephonyPanel(false)}
        />
      );
    }
    const assistantManager = ctx.activeSession?.client.getAssistantManager?.();
    const assistantLookup = assistantManager
      ? assistantManager.listAssistants().reduce((acc: Record<string, string>, assistant: any) => {
        acc[assistant.id] = assistant.name;
        return acc;
      }, {} as Record<string, string>)
      : undefined;
    return (
      <TelephonyPanel
        manager={telephonyManager}
        assistantLookup={assistantLookup}
        onClose={() => ctx.setShowTelephonyPanel(false)}
      />
    );
  }

  // Orders panel
  if (ctx.showOrdersPanel) {
    const ordersManager = ctx.activeSession?.client.getOrdersManager?.();
    if (!ordersManager) {
      return (
        <CloseOnAnyKeyPanel
          message="Orders are not enabled. Set orders.enabled: true in config."
          onClose={() => ctx.setShowOrdersPanel(false)}
        />
      );
    }
    return (
      <OrdersPanel
        manager={ordersManager}
        onClose={() => ctx.setShowOrdersPanel(false)}
      />
    );
  }

  // Jobs panel
  if (ctx.showJobsPanel) {
    const jobsManager = ctx.activeSession?.client.getJobManager?.();
    if (!jobsManager) {
      return (
        <CloseOnAnyKeyPanel
          message="Jobs are not enabled. Set jobs.enabled: true in config."
          onClose={() => ctx.setShowJobsPanel(false)}
        />
      );
    }
    return (
      <JobsPanel
        manager={jobsManager}
        onClose={() => ctx.setShowJobsPanel(false)}
      />
    );
  }

  // Docs panel
  if (ctx.showDocsPanel) {
    return (
      <DocsPanel
        onClose={() => ctx.setShowDocsPanel(false)}
      />
    );
  }

  // Messages panel
  if (ctx.showMessagesPanel) {
    return renderMessagesPanel(ctx);
  }

  return null;
}


// ─── Individual panel render functions ─────────────────────────────────────

function renderConnectorsPanel(ctx: PanelRenderContext): React.ReactElement {
  const handleCheckAuth = async (connector: Connector) => {
    if (!ctx.connectorBridgeRef.current) {
      return { authenticated: false, error: 'Not initialized' };
    }
    return ctx.connectorBridgeRef.current.checkAuthStatus(connector);
  };

  const handleGetCommandHelp = async (connector: Connector, command: string) => {
    if (!ctx.connectorBridgeRef.current) {
      return 'Not initialized';
    }
    return ctx.connectorBridgeRef.current.getCommandHelp(connector, command);
  };

  const handleLoadCommands = async (connectorName: string) => {
    if (!ctx.connectorBridgeRef.current) {
      return null;
    }
    const discovered = await ctx.connectorBridgeRef.current.discover([connectorName]);
    const connector = discovered.find((c) => c.name === connectorName);
    if (connector) {
      ctx.setConnectors((prev) => {
        const updated = prev.map((c) => c.name === connectorName ? connector : c);
        return updated;
      });
    }
    return connector || null;
  };

  return (
    <box flexDirection="column" padding={1}>
      <ConnectorsPanel
        connectors={ctx.connectors}
        initialConnector={ctx.connectorsPanelInitial}
        onCheckAuth={handleCheckAuth}
        onGetCommandHelp={handleGetCommandHelp}
        onLoadCommands={handleLoadCommands}
        onClose={() => {
          ctx.setShowConnectorsPanel(false);
          ctx.setConnectorsPanelInitial(undefined);
        }}
      />
    </box>
  );
}

function renderTasksPanel(ctx: PanelRenderContext): React.ReactElement {
  const handleTasksAdd = async (options: TaskCreateOptions) => {
    try {
      await addTask(ctx.cwd, options);
      ctx.setTasksList(await getTasks(ctx.cwd));
    } catch (err) {
      ctx.setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleTasksDelete = async (id: string) => {
    try {
      const deleted = await deleteTask(ctx.cwd, id);
      if (!deleted) throw new Error('Task not found or locked.');
      ctx.setTasksList(await getTasks(ctx.cwd));
    } catch (err) {
      ctx.setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleTasksRun = async (id: string) => {
    try {
      const started = await startTask(ctx.cwd, id);
      if (!started) throw new Error('Task not found or locked.');
      const updatedTasks = await getTasks(ctx.cwd);
      ctx.setTasksList(updatedTasks);
      const task = updatedTasks.find((t) => t.id === id);
      if (task && ctx.activeSession) {
        await ctx.activeSession.client.send(`Execute the following task:\n\n${task.description}\n\nWhen done, report the result.`);
      }
    } catch (err) {
      ctx.setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleTasksClearPending = async () => {
    try {
      await clearPendingTasks(ctx.cwd);
      ctx.setTasksList(await getTasks(ctx.cwd));
    } catch (err) {
      ctx.setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleTasksClearCompleted = async () => {
    try {
      await clearCompletedTasks(ctx.cwd);
      ctx.setTasksList(await getTasks(ctx.cwd));
    } catch (err) {
      ctx.setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleTasksTogglePause = async () => {
    const newPaused = !ctx.tasksPaused;
    try {
      await setPaused(ctx.cwd, newPaused);
      ctx.setTasksPaused(newPaused);
    } catch (err) {
      ctx.setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleTasksChangePriority = async (id: string, priority: TaskPriority) => {
    try {
      const updated = await updateTask(ctx.cwd, id, { priority });
      if (!updated) throw new Error('Task not found or locked.');
      ctx.setTasksList(await getTasks(ctx.cwd));
    } catch (err) {
      ctx.setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <box flexDirection="column" padding={1}>
      <TasksPanel
        tasks={ctx.tasksList}
        paused={ctx.tasksPaused}
        onAdd={handleTasksAdd}
        onDelete={handleTasksDelete}
        onRun={handleTasksRun}
        onClearPending={handleTasksClearPending}
        onClearCompleted={handleTasksClearCompleted}
        onTogglePause={handleTasksTogglePause}
        onChangePriority={handleTasksChangePriority}
        onClose={() => ctx.setShowTasksPanel(false)}
      />
    </box>
  );
}

function renderSkillsPanel(ctx: PanelRenderContext): React.ReactElement {
  const activeClient = ctx.registry.getActiveSession()?.client;

  const handleSkillExecute = (name: string) => {
    ctx.setShowSkillsPanel(false);
    if (activeClient) {
      activeClient.send(`/${name}`);
    }
  };

  const handleSkillCreate = async (options: CreateSkillOptions) => {
    const result = await createSkill(options);
    if (activeClient) {
      await activeClient.refreshSkills();
    }
    return result;
  };

  const handleSkillDraft = async (prompt: string, scope: SkillScope): Promise<SkillDraft> => {
    const config = ctx.currentConfig ?? await loadConfig(ctx.cwd, ctx.workspaceBaseDir);
    const llmConfig = config?.llm;
    if (!llmConfig?.model) {
      throw new Error('LLM not configured. Set llm.model in config.json.');
    }

    const llmClient = await createLLMClient(llmConfig);
    const systemPrompt = [
      'You are generating a SKILL.md draft for the assistants CLI.',
      'Return ONLY a JSON object with keys:',
      'name, description, allowed_tools, argument_hint, content.',
      'name: short kebab-case, do not include the word "skill".',
      'allowed_tools: array of tool names (or empty array if unsure).',
      'argument_hint: short usage hint like "[input] [options]".',
      'content: markdown instructions for the skill body. Include $ARGUMENTS where relevant.',
      'Do not wrap the JSON in markdown or code fences.',
    ].join('\n');

    const userPrompt = [
      `Scope: ${scope}`,
      `User prompt: ${prompt}`,
      '',
      'Return JSON only.',
    ].join('\n');

    const responseText = await collectStreamText(
      llmClient.chat([
        {
          id: generateId(),
          role: 'user',
          content: userPrompt,
          timestamp: Date.now(),
        },
      ], undefined, systemPrompt)
    );

    const jsonText = extractJsonObject(responseText);
    if (!jsonText) {
      throw new Error('Failed to parse skill draft from model response.');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      throw new Error('Invalid JSON returned by model.');
    }

    const allowedTools = normalizeAllowedTools(parsed.allowed_tools ?? parsed.allowedTools ?? parsed.tools);

    return {
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      description: typeof parsed.description === 'string' ? parsed.description : undefined,
      allowedTools,
      argumentHint: typeof parsed.argument_hint === 'string'
        ? parsed.argument_hint
        : typeof parsed.argumentHint === 'string'
          ? parsed.argumentHint
          : undefined,
      content: typeof parsed.content === 'string' ? parsed.content : undefined,
    };
  };

  const handleSkillDelete = async (name: string, filePath: string) => {
    await deleteSkill(filePath);
    const skillLoader = activeClient?.getSkillLoader();
    if (skillLoader) {
      skillLoader.removeSkill(name);
    }
  };

  const handleSkillRefresh = async () => {
    if (activeClient) {
      const refreshed = await activeClient.refreshSkills();
      ctx.setSkillsList(refreshed);
      return refreshed;
    }
    return ctx.skillsList;
  };

  const handleSkillEnsureContent = async (name: string) => {
    const skillLoader = activeClient?.getSkillLoader();
    if (skillLoader && typeof skillLoader.ensureSkillContent === 'function') {
      return skillLoader.ensureSkillContent(name);
    }
    return null;
  };

  return (
    <box flexDirection="column" padding={1}>
      <SkillsPanel
        skills={ctx.skillsList}
        onExecute={handleSkillExecute}
        onCreate={handleSkillCreate}
        onGenerateDraft={handleSkillDraft}
        onDelete={handleSkillDelete}
        onRefresh={handleSkillRefresh}
        onEnsureContent={handleSkillEnsureContent}
        onClose={() => ctx.setShowSkillsPanel(false)}
        cwd={ctx.cwd}
      />
    </box>
  );
}

function renderSchedulesPanel(ctx: PanelRenderContext): React.ReactElement {
  const scheduleListOpts = { global: true };

  const handleSchedulePause = async (id: string) => {
    try {
      const updated = await updateSchedule(ctx.cwd, id, (schedule) => ({
        ...schedule,
        status: 'paused',
        updatedAt: Date.now(),
      }));
      if (!updated) throw new Error('Schedule not found or locked.');
      ctx.setSchedulesList(await listSchedules(ctx.cwd, scheduleListOpts));
    } catch (err) {
      ctx.setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleScheduleResume = async (id: string) => {
    try {
      const updated = await updateSchedule(ctx.cwd, id, (schedule) => {
        const nextRun = computeNextRun(schedule, Date.now());
        return {
          ...schedule,
          status: 'active',
          updatedAt: Date.now(),
          nextRunAt: nextRun,
        };
      });
      if (!updated) throw new Error('Schedule not found or locked.');
      ctx.setSchedulesList(await listSchedules(ctx.cwd, scheduleListOpts));
    } catch (err) {
      ctx.setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleScheduleDelete = async (id: string) => {
    ctx.setSchedulesList((prev) => prev.filter((s) => s.id !== id));
    try {
      const deleted = await deleteSchedule(ctx.cwd, id);
      if (!deleted) throw new Error('Schedule not found or locked.');
      const refreshed = await listSchedules(ctx.cwd, scheduleListOpts);
      ctx.setSchedulesList(refreshed);
    } catch (err) {
      ctx.setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleScheduleRun = async (id: string) => {
    const schedule = ctx.schedulesList.find((s) => s.id === id);
    if (schedule && ctx.activeSession) {
      try {
        const actionType = schedule.actionType || 'command';
        if (actionType === 'message' && schedule.message) {
          await ctx.activeSession.client.send(schedule.message);
        } else {
          await ctx.activeSession.client.send(schedule.command);
        }
      } catch (err) {
        ctx.setError(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const handleScheduleRefresh = async () => {
    try {
      ctx.setSchedulesList(await listSchedules(ctx.cwd, scheduleListOpts));
    } catch (err) {
      ctx.setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleScheduleCreate = async (schedule: Omit<ScheduledCommand, 'id' | 'createdAt' | 'updatedAt' | 'nextRunAt'>) => {
    try {
      const nowTs = Date.now();
      const fullSchedule: ScheduledCommand = {
        ...schedule,
        id: generateId(),
        createdAt: nowTs,
        updatedAt: nowTs,
      };
      fullSchedule.nextRunAt = computeNextRun(fullSchedule, nowTs);
      if (!fullSchedule.nextRunAt) {
        throw new Error('Unable to compute next run time. Check your schedule configuration.');
      }
      if (fullSchedule.schedule.kind === 'once' && fullSchedule.nextRunAt <= nowTs) {
        throw new Error('Scheduled time must be in the future.');
      }
      await saveSchedule(ctx.cwd, fullSchedule);
      ctx.setSchedulesList(await listSchedules(ctx.cwd, scheduleListOpts));
    } catch (err) {
      ctx.setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <box flexDirection="column" padding={1}>
      <SchedulesPanel
        schedules={ctx.schedulesList}
        sessionId={ctx.activeSessionId || 'default'}
        onPause={handleSchedulePause}
        onResume={handleScheduleResume}
        onDelete={handleScheduleDelete}
        onRun={handleScheduleRun}
        onCreate={handleScheduleCreate}
        onRefresh={handleScheduleRefresh}
        onClose={() => ctx.setShowSchedulesPanel(false)}
      />
    </box>
  );
}

function renderAssistantsPanel(ctx: PanelRenderContext): React.ReactElement {
  const assistantManager = ctx.activeSession?.client.getAssistantManager?.();
  const assistantsList = assistantManager?.listAssistants() ?? [];
  const activeAssistantId = assistantManager?.getActiveId() ?? undefined;
  const ensureAssistantManager = () => {
    if (assistantManager) return assistantManager;
    const err = new Error('Assistant manager not available');
    ctx.setAssistantError(err.message);
    throw err;
  };
  const switchAssistantAndSyncIdentity = async (assistantId: string) => {
    if (!ctx.activeSession) {
      throw new Error('No active session');
    }

    const loop = ctx.activeSession.client.getAssistantLoop?.();
    if (loop && typeof loop.switchAssistant === 'function') {
      await loop.switchAssistant(assistantId);
    } else {
      const manager = ensureAssistantManager();
      await manager.switchAssistant(assistantId);
      await ctx.activeSession.client.refreshIdentityContext?.();
    }
    ctx.setIdentityInfo(ctx.activeSession.client.getIdentityInfo() ?? undefined);
  };

  const handleAssistantSelect = async (assistantId: string) => {
    ctx.setAssistantError(null);
    try {
      await switchAssistantAndSyncIdentity(assistantId);
      ctx.setAssistantsRefreshKey((k) => k + 1);
      ctx.setShowAssistantsPanel(false);
    } catch (err) {
      ctx.setAssistantError(err instanceof Error ? err.message : 'Failed to switch assistant');
    }
  };

  const handleAssistantCreate = async (options: CreateAssistantOptions) => {
    ctx.setAssistantError(null);
    try {
      const manager = ensureAssistantManager();
      const created = await manager.createAssistant(options);
      await switchAssistantAndSyncIdentity(created.id);
      ctx.setAssistantsRefreshKey((k) => k + 1);
    } catch (err) {
      ctx.setAssistantError(err instanceof Error ? err.message : 'Failed to create assistant');
      throw err;
    }
  };

  const handleAssistantUpdate = async (id: string, updates: Partial<{ name: string; description: string; settings: Record<string, unknown> }>) => {
    ctx.setAssistantError(null);
    try {
      const manager = ensureAssistantManager();
      await manager.updateAssistant(id, updates as any);
      await ctx.activeSession?.client.refreshIdentityContext?.();
      ctx.setIdentityInfo(ctx.activeSession?.client.getIdentityInfo() ?? undefined);
      ctx.setAssistantsRefreshKey((k) => k + 1);
    } catch (err) {
      ctx.setAssistantError(err instanceof Error ? err.message : 'Failed to update assistant');
      throw err;
    }
  };

  const handleAssistantDelete = async (assistantId: string) => {
    ctx.setAssistantError(null);
    try {
      const manager = ensureAssistantManager();
      const assistantsBefore = manager.listAssistants();
      if (assistantsBefore.length <= 1) {
        throw new Error('Cannot delete the last remaining assistant');
      }
      const wasActive = manager.getActiveId() === assistantId;
      await manager.deleteAssistant(assistantId);
      if (wasActive) {
        const nextActiveId = manager.getActiveId();
        if (nextActiveId) {
          await switchAssistantAndSyncIdentity(nextActiveId);
        }
      } else {
        ctx.setIdentityInfo(ctx.activeSession?.client.getIdentityInfo() ?? undefined);
      }
      ctx.setAssistantsRefreshKey((k) => k + 1);
    } catch (err) {
      ctx.setAssistantError(err instanceof Error ? err.message : 'Failed to delete assistant');
      throw err;
    }
  };

  return (
    <box flexDirection="column" padding={1}>
      <AssistantsPanel
        assistants={assistantsList}
        activeAssistantId={activeAssistantId}
        onSelect={handleAssistantSelect}
        onCreate={handleAssistantCreate}
        onUpdate={handleAssistantUpdate}
        onDelete={handleAssistantDelete}
        onCancel={() => {
          ctx.setAssistantError(null);
          ctx.setShowAssistantsPanel(false);
        }}
        error={ctx.assistantError}
        onClearError={() => ctx.setAssistantError(null)}
      />
    </box>
  );
}

function renderIdentityPanel(ctx: PanelRenderContext): React.ReactElement {
  const identityManager = ctx.activeSession?.client.getIdentityManager?.();
  const activeIdentity = identityManager?.getActive();
  const templates = listTemplates();

  const ensureIdentityManager = () => {
    if (identityManager) return identityManager;
    const err = new Error('Identity manager not available');
    ctx.setIdentityError(err.message);
    throw err;
  };

  const handleIdentitySwitch = async (identityId: string) => {
    ctx.setIdentityError(null);
    try {
      const manager = ensureIdentityManager();
      await manager.switchIdentity(identityId);
      await ctx.activeSession?.client.refreshIdentityContext?.();
      ctx.setIdentityInfo(ctx.activeSession?.client.getIdentityInfo() ?? undefined);
      ctx.refreshIdentitiesList();
    } catch (err) {
      ctx.setIdentityError(err instanceof Error ? err.message : 'Failed to switch identity');
    }
  };

  const handleIdentityCreate = async (options: CreateIdentityOptions) => {
    ctx.setIdentityError(null);
    try {
      const manager = ensureIdentityManager();
      await manager.createIdentity(options);
      await ctx.activeSession?.client.refreshIdentityContext?.();
      ctx.setIdentityInfo(ctx.activeSession?.client.getIdentityInfo() ?? undefined);
      ctx.refreshIdentitiesList();
    } catch (err) {
      ctx.setIdentityError(err instanceof Error ? err.message : 'Failed to create identity');
      throw err;
    }
  };

  const handleIdentityCreateFromTemplate = async (templateName: string) => {
    ctx.setIdentityError(null);
    try {
      const manager = ensureIdentityManager();
      const options = createIdentityFromTemplate(templateName);
      if (options) {
        await manager.createIdentity(options);
        await ctx.activeSession?.client.refreshIdentityContext?.();
        ctx.setIdentityInfo(ctx.activeSession?.client.getIdentityInfo() ?? undefined);
        ctx.refreshIdentitiesList();
      }
    } catch (err) {
      ctx.setIdentityError(err instanceof Error ? err.message : 'Failed to create identity from template');
      throw err;
    }
  };

  const handleIdentityUpdate = async (identityId: string, updates: Partial<CreateIdentityOptions>) => {
    ctx.setIdentityError(null);
    try {
      const manager = ensureIdentityManager();
      await manager.updateIdentity(identityId, updates as any);
      await ctx.activeSession?.client.refreshIdentityContext?.();
      ctx.setIdentityInfo(ctx.activeSession?.client.getIdentityInfo() ?? undefined);
      ctx.refreshIdentitiesList();
    } catch (err) {
      ctx.setIdentityError(err instanceof Error ? err.message : 'Failed to update identity');
      throw err;
    }
  };

  const handleIdentitySetDefault = async (identityId: string) => {
    ctx.setIdentityError(null);
    try {
      const manager = ensureIdentityManager();
      for (const identity of ctx.identitiesList) {
        if (identity.isDefault && identity.id !== identityId) {
          await manager.updateIdentity(identity.id, { isDefault: false });
        }
      }
      await manager.updateIdentity(identityId, { isDefault: true });
      await ctx.activeSession?.client.refreshIdentityContext?.();
      ctx.setIdentityInfo(ctx.activeSession?.client.getIdentityInfo() ?? undefined);
      ctx.refreshIdentitiesList();
    } catch (err) {
      ctx.setIdentityError(err instanceof Error ? err.message : 'Failed to set default identity');
    }
  };

  const handleIdentityDelete = async (identityId: string) => {
    ctx.setIdentityError(null);
    try {
      const manager = ensureIdentityManager();
      await manager.deleteIdentity(identityId);
      await ctx.activeSession?.client.refreshIdentityContext?.();
      ctx.setIdentityInfo(ctx.activeSession?.client.getIdentityInfo() ?? undefined);
      ctx.refreshIdentitiesList();
    } catch (err) {
      ctx.setIdentityError(err instanceof Error ? err.message : 'Failed to delete identity');
      throw err;
    }
  };

  return (
    <box flexDirection="column" padding={1}>
      <IdentityPanel
        identities={ctx.identitiesList}
        activeIdentityId={activeIdentity?.id}
        initialIdentityId={ctx.identityPanelIntent?.id}
        initialMode={ctx.identityPanelIntent?.mode}
        templates={templates}
        onSwitch={handleIdentitySwitch}
        onCreate={handleIdentityCreate}
        onCreateFromTemplate={handleIdentityCreateFromTemplate}
        onUpdate={handleIdentityUpdate}
        onSetDefault={handleIdentitySetDefault}
        onDelete={handleIdentityDelete}
        onClose={() => {
          ctx.setIdentityError(null);
          ctx.setIdentityPanelIntent(null);
          ctx.setShowIdentityPanel(false);
        }}
        error={ctx.identityError}
      />
    </box>
  );
}

function renderHooksPanel(ctx: PanelRenderContext): React.ReactElement {
  const handleHookToggle = (event: HookEvent, hookId: string, enabled: boolean) => {
    if (!ctx.hookStoreRef.current) {
      ctx.hookStoreRef.current = new HookStore();
    }
    ctx.hookStoreRef.current.setEnabled(hookId, enabled);
    const hooks = ctx.hookStoreRef.current.loadAll();
    ctx.setHooksConfig(hooks);
  };

  const handleHookDelete = async (event: HookEvent, hookId: string) => {
    if (!ctx.hookStoreRef.current) {
      ctx.hookStoreRef.current = new HookStore();
    }
    ctx.hookStoreRef.current.removeHook(hookId);
    const hooks = ctx.hookStoreRef.current.loadAll();
    ctx.setHooksConfig(hooks);
  };

  const handleHookAdd = async (
    event: HookEvent,
    handler: HookHandler,
    location: 'user' | 'project' | 'local',
    matcher?: string
  ) => {
    if (!ctx.hookStoreRef.current) {
      ctx.hookStoreRef.current = new HookStore();
    }
    ctx.hookStoreRef.current.addHook(event, handler, location, matcher);
    const hooks = ctx.hookStoreRef.current.loadAll();
    ctx.setHooksConfig(hooks);
  };

  const handleNativeHookToggle = (hookId: string, enabled: boolean) => {
    nativeHookRegistry.setEnabled(hookId, enabled);
  };

  const handleHookDraft = async (prompt: string): Promise<HookDraft> => {
    const config = ctx.currentConfig ?? await loadConfig(ctx.cwd, ctx.workspaceBaseDir);
    const llmConfig = config?.llm;
    if (!llmConfig?.model) {
      throw new Error('LLM not configured. Set llm.model in config.json.');
    }

    const llmClient = await createLLMClient(llmConfig);
    const systemPrompt = [
      'You are generating a hook configuration for assistants.',
      'Return ONLY a JSON object with keys:',
      'event, matcher, type, command, timeout, async, name, description, location.',
      'event: one of SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest, Notification, SubassistantStart, SubassistantStop, PreCompact, Stop.',
      'type: command | prompt | assistant.',
      'command: for type=command use a shell command; for prompt/assistant use the prompt text.',
      'matcher: optional string (regex or *).',
      'timeout: milliseconds (number).',
      'async: boolean.',
      'location: project | user | local.',
      'Do not wrap JSON in markdown or code fences.',
    ].join('\n');

    const userPrompt = [
      'Create a hook draft that matches this request:',
      prompt,
      'Return JSON only.',
    ].join('\n');

    const responseText = await collectStreamText(
      llmClient.chat([
        {
          id: generateId(),
          role: 'user',
          content: userPrompt,
          timestamp: Date.now(),
        },
      ], undefined, systemPrompt)
    );

    const jsonText = extractJsonObject(responseText);
    if (!jsonText) {
      throw new Error('Failed to parse hook draft from model response.');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error('Invalid JSON returned by model.');
    }

    const rawEvent = typeof parsed.event === 'string' ? parsed.event : '';
    const event = HOOK_EVENT_MAP.get(rawEvent.trim().toLowerCase()) ?? 'PreToolUse';

    const rawType = typeof parsed.type === 'string' ? parsed.type.trim().toLowerCase() : 'command';
    const type = HOOK_TYPE_SET.has(rawType) ? rawType : 'command';

    const rawLocation = typeof parsed.location === 'string' ? parsed.location.trim().toLowerCase() : 'project';
    const location = HOOK_LOCATION_SET.has(rawLocation) ? rawLocation : 'project';

    const timeout = typeof parsed.timeout === 'number'
      ? parsed.timeout
      : typeof parsed.timeout === 'string'
        ? parseInt(parsed.timeout, 10)
        : undefined;

    const command = typeof parsed.command === 'string'
      ? parsed.command
      : typeof parsed.prompt === 'string'
        ? parsed.prompt
        : typeof parsed.action === 'string'
          ? parsed.action
          : '';

    return {
      event,
      matcher: typeof parsed.matcher === 'string' ? parsed.matcher : '',
      type,
      command,
      timeout: Number.isFinite(timeout) && timeout! >= 0 ? timeout : 30000,
      async: Boolean(parsed.async),
      name: typeof parsed.name === 'string' ? parsed.name : '',
      description: typeof parsed.description === 'string' ? parsed.description : '',
      location,
    };
  };

  const nativeHooks = nativeHookRegistry.listFlat();

  return (
    <box flexDirection="column" padding={1}>
      <HooksPanel
        hooks={ctx.hooksConfig}
        nativeHooks={nativeHooks}
        onToggle={handleHookToggle}
        onToggleNative={handleNativeHookToggle}
        onDelete={handleHookDelete}
        onAdd={handleHookAdd}
        onGenerateDraft={handleHookDraft}
        onCancel={() => ctx.setShowHooksPanel(false)}
      />
    </box>
  );
}

function renderGuardrailsPanel(ctx: PanelRenderContext): React.ReactElement {
  const handleToggleEnabled = (enabled: boolean) => {
    if (!ctx.guardrailsStoreRef.current) {
      ctx.guardrailsStoreRef.current = new GuardrailsStore();
    }
    ctx.guardrailsStoreRef.current.setEnabled(enabled, 'project');
    const config = ctx.guardrailsStoreRef.current.loadAll();
    const policies = ctx.guardrailsStoreRef.current.listPolicies();
    ctx.setGuardrailsConfig(config);
    ctx.setGuardrailsPolicies(policies);
  };

  const handleTogglePolicy = (policyId: string, enabled: boolean) => {
    if (!ctx.guardrailsStoreRef.current) {
      ctx.guardrailsStoreRef.current = new GuardrailsStore();
    }
    ctx.guardrailsStoreRef.current.setPolicyEnabled(policyId, enabled);
    const config = ctx.guardrailsStoreRef.current.loadAll();
    const policies = ctx.guardrailsStoreRef.current.listPolicies();
    ctx.setGuardrailsConfig(config);
    ctx.setGuardrailsPolicies(policies);
  };

  const handleSetPreset = (preset: 'permissive' | 'restrictive') => {
    if (!ctx.guardrailsStoreRef.current) {
      ctx.guardrailsStoreRef.current = new GuardrailsStore();
    }
    const policy = preset === 'permissive' ? PERMISSIVE_POLICY : RESTRICTIVE_POLICY;
    ctx.guardrailsStoreRef.current.addPolicy({ ...policy }, 'project');
    ctx.guardrailsStoreRef.current.setEnabled(true, 'project');
    const config = ctx.guardrailsStoreRef.current.loadAll();
    const policies = ctx.guardrailsStoreRef.current.listPolicies();
    ctx.setGuardrailsConfig(config);
    ctx.setGuardrailsPolicies(policies);
  };

  const handleAddPolicy = (policy: any) => {
    if (!ctx.guardrailsStoreRef.current) {
      ctx.guardrailsStoreRef.current = new GuardrailsStore();
    }
    ctx.guardrailsStoreRef.current.addPolicy(policy, 'project');
    const config = ctx.guardrailsStoreRef.current.loadAll();
    const policies = ctx.guardrailsStoreRef.current.listPolicies();
    ctx.setGuardrailsConfig(config);
    ctx.setGuardrailsPolicies(policies);
  };

  const handleRemovePolicy = (policyId: string) => {
    if (!ctx.guardrailsStoreRef.current) {
      ctx.guardrailsStoreRef.current = new GuardrailsStore();
    }
    ctx.guardrailsStoreRef.current.removePolicy(policyId);
    const config = ctx.guardrailsStoreRef.current.loadAll();
    const policies = ctx.guardrailsStoreRef.current.listPolicies();
    ctx.setGuardrailsConfig(config);
    ctx.setGuardrailsPolicies(policies);
  };

  const handleUpdatePolicy = (policyId: string, updates: any) => {
    if (!ctx.guardrailsStoreRef.current) {
      ctx.guardrailsStoreRef.current = new GuardrailsStore();
    }
    const existing = ctx.guardrailsStoreRef.current.getPolicy(policyId);
    if (existing) {
      ctx.guardrailsStoreRef.current.removePolicy(policyId);
      const merged = { ...existing.policy, ...updates };
      ctx.guardrailsStoreRef.current.addPolicy(merged, existing.location as any);
    }
    const config = ctx.guardrailsStoreRef.current.loadAll();
    const policies = ctx.guardrailsStoreRef.current.listPolicies();
    ctx.setGuardrailsConfig(config);
    ctx.setGuardrailsPolicies(policies);
  };

  return (
    <box flexDirection="column" padding={1}>
      <GuardrailsPanel
        config={ctx.guardrailsConfig!}
        policies={ctx.guardrailsPolicies}
        onToggleEnabled={handleToggleEnabled}
        onTogglePolicy={handleTogglePolicy}
        onSetPreset={handleSetPreset}
        onAddPolicy={handleAddPolicy}
        onRemovePolicy={handleRemovePolicy}
        onUpdatePolicy={handleUpdatePolicy}
        onCancel={() => ctx.setShowGuardrailsPanel(false)}
      />
    </box>
  );
}

function renderBudgetsPanel(ctx: PanelRenderContext): React.ReactElement {
  const session = ctx.registry.getActiveSession();
  const activeProfileId = session
    ? ctx.getSessionBudgetProfileId(session.id, ctx.budgetProfiles)
    : null;
  const activeProfile = ctx.budgetProfiles.find((p) => p.id === activeProfileId) || null;
  const baseDir = ctx.workspaceBaseDir || getConfigDir();

  const handleBudgetReset = (scope: BudgetScope) => {
    const loop = session?.client.getAssistantLoop?.();
    if (loop && typeof loop.resetBudget === 'function') {
      loop.resetBudget(scope);
    }
    if (loop && typeof loop.getBudgetStatus === 'function') {
      const summary = loop.getBudgetStatus();
      if (summary) {
        ctx.setSessionBudgetStatus(summary.session);
        ctx.setSwarmBudgetStatus(summary.swarm);
        return;
      }
    }

    if (!ctx.budgetTrackerRef.current) {
      ctx.budgetTrackerRef.current = new BudgetTracker(
        ctx.activeSessionId || 'default',
        activeProfile?.config || ctx.budgetConfig || ctx.currentConfig?.budget
      );
    }
    ctx.budgetTrackerRef.current.resetUsage(scope);
    const sessionStatus = ctx.budgetTrackerRef.current.checkBudget('session');
    const swarmStatus = ctx.budgetTrackerRef.current.checkBudget('swarm');
    ctx.setSessionBudgetStatus(sessionStatus);
    ctx.setSwarmBudgetStatus(swarmStatus);
  };

  const handleSelectProfile = async (profileId: string) => {
    if (!session) return;
    await ctx.applyBudgetProfileToSession(session, profileId, ctx.budgetProfiles);
  };

  const handleCreateProfile = async (name: string, config: BudgetConfig, description?: string) => {
    const created = await createBudgetProfile(baseDir, name, config, description);
    const profiles = await loadBudgetProfiles(baseDir, ctx.currentConfig?.budget);
    ctx.setBudgetProfiles(profiles);
    if (session) {
      await ctx.applyBudgetProfileToSession(session, created.id, profiles);
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    if (ctx.budgetProfiles.length <= 1) return;
    await deleteBudgetProfile(baseDir, profileId);
    const profiles = await loadBudgetProfiles(baseDir, ctx.currentConfig?.budget);
    ctx.setBudgetProfiles(profiles);
    if (session) {
      const fallback = profiles[0]?.id || null;
      await ctx.applyBudgetProfileToSession(session, fallback, profiles);
    }
  };

  const handleUpdateProfile = async (profileId: string, updates: Partial<BudgetConfig>) => {
    const updated = await updateBudgetProfile(baseDir, profileId, (profile) => ({
      ...profile,
      config: { ...profile.config, ...updates },
    }));
    if (!updated) return;
    const nextProfiles = await loadBudgetProfiles(baseDir, ctx.currentConfig?.budget);
    ctx.setBudgetProfiles(nextProfiles);
    if (session) {
      const currentSessionProfileId = ctx.getSessionBudgetProfileId(session.id, nextProfiles);
      if (currentSessionProfileId === profileId) {
        await ctx.applyBudgetProfileToSession(session, profileId, nextProfiles);
      }
    }
  };

  return (
    <box flexDirection="column" padding={1}>
      <BudgetsPanel
        profiles={ctx.budgetProfiles}
        activeProfileId={activeProfileId}
        sessionStatus={ctx.sessionBudgetStatus!}
        swarmStatus={ctx.swarmBudgetStatus!}
        onSelectProfile={handleSelectProfile}
        onCreateProfile={handleCreateProfile}
        onDeleteProfile={handleDeleteProfile}
        onUpdateProfile={handleUpdateProfile}
        onReset={handleBudgetReset}
        onCancel={() => ctx.setShowBudgetPanel(false)}
      />
    </box>
  );
}

function renderModelPanel(ctx: PanelRenderContext): React.ReactElement {
  const currentModelId = ctx.activeSession?.client.getModel() || null;
  const assistantName = ctx.activeSession?.client.getIdentityInfo?.()?.assistant?.name
    || ctx.activeSession?.assistantId
    || 'Assistant';

  const handleSelectModel = async (modelId: string) => {
    if (!ctx.activeSession) {
      throw new Error('No active session.');
    }

    const loop = ctx.activeSession.client.getAssistantLoop?.();
    if (loop && typeof loop.switchModel === 'function') {
      await loop.switchModel(modelId);
    } else {
      await ctx.activeSession.client.send(`/model ${modelId}`);
    }

    const displayName = getModelDisplayName(modelId);
    ctx.setShowModelPanel(false);
    ctx.setMessages((prev) => [
      ...prev,
      {
        id: generateId(),
        role: 'assistant',
        content: `Switched model to **${displayName}** (\`${modelId}\`).`,
        timestamp: now(),
      },
    ]);
  };

  return (
    <box flexDirection="column" padding={1}>
      <ModelPanel
        currentModelId={currentModelId}
        assistantName={assistantName}
        onSelectModel={handleSelectModel}
        onCancel={() => ctx.setShowModelPanel(false)}
      />
    </box>
  );
}

function renderAssistantsRegistryPanel(ctx: PanelRenderContext): React.ReactElement {
  const handleAssistantsRefresh = () => {
    const assistantRegistry = getGlobalRegistry();
    const assistants = assistantRegistry.list();
    const stats = assistantRegistry.getStats();
    ctx.setAssistantsList(assistants);
    ctx.setRegistryStats(stats);
  };

  return (
    <box flexDirection="column" padding={1}>
      <AssistantsRegistryPanel
        assistants={ctx.assistantsList}
        stats={ctx.registryStats!}
        onRefresh={handleAssistantsRefresh}
        onCancel={() => ctx.setShowAssistantsRegistryPanel(false)}
      />
    </box>
  );
}

function renderProjectsPanel(ctx: PanelRenderContext): React.ReactElement {
  const handleProjectSelect = (projectId: string) => {
    const activeSession = ctx.registry.getActiveSession();
    activeSession?.client.setActiveProjectId?.(projectId);
    ctx.setActiveProjectId(projectId);
    ctx.setShowProjectsPanel(false);
  };

  const handleProjectCreate = async (name: string, description?: string) => {
    const project = await createProject(ctx.cwd, name, description);
    const projects = await listProjects(ctx.cwd);
    ctx.setProjectsList(projects);
    const activeSession = ctx.registry.getActiveSession();
    activeSession?.client.setActiveProjectId?.(project.id);
    ctx.setActiveProjectId(project.id);
  };

  const handleProjectDelete = async (projectId: string) => {
    await deleteProject(ctx.cwd, projectId);
    const projects = await listProjects(ctx.cwd);
    ctx.setProjectsList(projects);
    if (ctx.activeProjectId === projectId) {
      const activeSession = ctx.registry.getActiveSession();
      activeSession?.client.setActiveProjectId?.(null);
      ctx.setActiveProjectId(undefined);
    }
  };

  const handleViewPlans = (projectId: string) => {
    readProject(ctx.cwd, projectId).then((project) => {
      if (project) {
        ctx.setPlansProject(project);
        ctx.setShowProjectsPanel(false);
        ctx.setShowPlansPanel(true);
      }
    });
  };

  return (
    <box flexDirection="column" padding={1}>
      <ProjectsPanel
        projects={ctx.projectsList}
        activeProjectId={ctx.activeProjectId}
        onSelect={handleProjectSelect}
        onCreate={handleProjectCreate}
        onDelete={handleProjectDelete}
        onViewPlans={handleViewPlans}
        onCancel={() => ctx.setShowProjectsPanel(false)}
      />
    </box>
  );
}

function renderPlansPanel(ctx: PanelRenderContext): React.ReactElement {
  const plansProject = ctx.plansProject!;

  const handleCreatePlan = async (title: string) => {
    const nowTs = Date.now();
    const plan: ProjectPlan = {
      id: `plan-${nowTs}`,
      title,
      createdAt: nowTs,
      updatedAt: nowTs,
      steps: [],
    };
    const updated = await updateProject(ctx.cwd, plansProject.id, (current) => ({
      ...current,
      plans: [...current.plans, plan],
      updatedAt: nowTs,
    }));
    if (updated) ctx.setPlansProject(updated);
  };

  const handleDeletePlan = async (planId: string) => {
    const nowTs = Date.now();
    const updated = await updateProject(ctx.cwd, plansProject.id, (current) => ({
      ...current,
      plans: current.plans.filter((p) => p.id !== planId),
      updatedAt: nowTs,
    }));
    if (updated) ctx.setPlansProject(updated);
  };

  const handleAddStep = async (planId: string, text: string) => {
    const nowTs = Date.now();
    const updated = await updateProject(ctx.cwd, plansProject.id, (current) => ({
      ...current,
      plans: current.plans.map((p) =>
        p.id === planId
          ? { ...p, steps: [...p.steps, { id: `step-${nowTs}`, text, status: 'todo' as const, createdAt: nowTs, updatedAt: nowTs }], updatedAt: nowTs }
          : p
      ),
      updatedAt: nowTs,
    }));
    if (updated) ctx.setPlansProject(updated);
  };

  const handleUpdateStep = async (planId: string, stepId: string, status: PlanStepStatus) => {
    const nowTs = Date.now();
    const updated = await updateProject(ctx.cwd, plansProject.id, (current) => ({
      ...current,
      plans: current.plans.map((p) =>
        p.id === planId
          ? { ...p, steps: p.steps.map((s) => (s.id === stepId ? { ...s, status, updatedAt: nowTs } : s)), updatedAt: nowTs }
          : p
      ),
      updatedAt: nowTs,
    }));
    if (updated) ctx.setPlansProject(updated);
  };

  const handleRemoveStep = async (planId: string, stepId: string) => {
    const nowTs = Date.now();
    const updated = await updateProject(ctx.cwd, plansProject.id, (current) => ({
      ...current,
      plans: current.plans.map((p) =>
        p.id === planId
          ? { ...p, steps: p.steps.filter((s) => s.id !== stepId), updatedAt: nowTs }
          : p
      ),
      updatedAt: nowTs,
    }));
    if (updated) ctx.setPlansProject(updated);
  };

  return (
    <box flexDirection="column" padding={1}>
      <PlansPanel
        project={plansProject}
        onCreatePlan={handleCreatePlan}
        onDeletePlan={handleDeletePlan}
        onAddStep={handleAddStep}
        onUpdateStep={handleUpdateStep}
        onRemoveStep={handleRemoveStep}
        onBack={() => ctx.setShowPlansPanel(false)}
        onClose={() => ctx.setShowPlansPanel(false)}
      />
    </box>
  );
}

function renderWalletPanel(ctx: PanelRenderContext): React.ReactElement {
  const walletManager = ctx.activeSession?.client.getWalletManager?.();

  const handleWalletGet = async (cardId: string) => {
    if (!walletManager) throw new Error('Wallet not available');
    const card = await walletManager.get(cardId);
    if (!card) throw new Error(`Card ${cardId} not found`);
    return ctx.toWalletCardEntry(card);
  };

  const handleWalletAdd = async (input: WalletAddInput) => {
    if (!walletManager) throw new Error('Wallet not available');
    const result = await walletManager.add(input);
    if (!result.success) throw new Error(result.message);
    const cards = await walletManager.list();
    ctx.setWalletCards(cards.map((card: any) => ctx.toWalletCardEntry(card)));
    ctx.setWalletError(null);
  };

  const handleWalletRemove = async (cardId: string) => {
    if (!walletManager) throw new Error('Wallet not available');
    const result = await walletManager.remove(cardId);
    if (!result.success) throw new Error(result.message);
    const cards = await walletManager.list();
    ctx.setWalletCards(cards.map((card: any) => ctx.toWalletCardEntry(card)));
    ctx.setWalletError(null);
  };

  return (
    <box flexDirection="column" padding={1}>
      <WalletPanel
        cards={ctx.walletCards}
        initialMode={ctx.walletPanelInitialMode}
        onGet={handleWalletGet}
        onAdd={handleWalletAdd}
        onRemove={handleWalletRemove}
        onClose={() => ctx.setShowWalletPanel(false)}
        error={ctx.walletError}
      />
    </box>
  );
}

function renderSecretsPanel(ctx: PanelRenderContext): React.ReactElement {
  const secretsManager = ctx.activeSession?.client.getSecretsManager?.();

  const handleSecretsGet = async (name: string, scope?: 'global' | 'assistant') => {
    if (!secretsManager) throw new Error('Secrets not available');
    const value = await secretsManager.get(name, scope, 'plain');
    return value || '';
  };

  const handleSecretsAdd = async (input: {
    name: string;
    value: string;
    scope: 'global' | 'assistant';
    description?: string;
  }) => {
    if (!secretsManager) throw new Error('Secrets not available');
    const result = await secretsManager.set(input);
    if (!result.success) throw new Error(result.message);
    const secrets = await secretsManager.list('all');
    ctx.setSecretsList(secrets);
    ctx.setSecretsError(null);
  };

  const handleSecretsDelete = async (name: string, scope: 'global' | 'assistant') => {
    if (!secretsManager) throw new Error('Secrets not available');
    const result = await secretsManager.delete(name, scope);
    if (!result.success) throw new Error(result.message);
    const secrets = await secretsManager.list('all');
    ctx.setSecretsList(secrets);
    ctx.setSecretsError(null);
  };

  return (
    <box flexDirection="column" padding={1}>
      <SecretsPanel
        secrets={ctx.secretsList}
        initialMode={ctx.secretsPanelInitialMode}
        onGet={handleSecretsGet}
        onAdd={handleSecretsAdd}
        onDelete={handleSecretsDelete}
        onClose={() => ctx.setShowSecretsPanel(false)}
        error={ctx.secretsError}
      />
    </box>
  );
}

function renderAssistantsDashboard(ctx: PanelRenderContext): React.ReactElement {
  const sessions = ctx.registry.listSessions();
  const sessionEntries = sessions.map((s, i) => ({
    id: s.id,
    label: s.label,
    assistantId: s.assistantId,
    assistantName: s.assistantId ? (s.label || `Assistant ${i + 1}`) : null,
    isActive: s.id === ctx.activeSessionId,
    isProcessing: s.isProcessing,
    isPaused: false,
    cwd: s.cwd,
    startedAt: s.startedAt,
    unreadMessages: 0,
  }));

  const swarmCoordinator = ctx.activeSession?.client.getSwarmCoordinator?.();
  const swarmState = swarmCoordinator?.getSerializableState?.();

  const activeLoop = ctx.activeSession?.client.getAssistantLoop?.();
  const budgetSummary = activeLoop?.getBudgetStatus?.() || null;
  const activeProjectName = ctx.activeSession?.client.getActiveProjectId?.() || null;
  const projectBudgetStatus = activeProjectName
    ? (budgetSummary?.project || null)
    : null;

  return (
    <box flexDirection="column" padding={1}>
      <AssistantsDashboard
        sessions={sessionEntries}
        projectBudget={projectBudgetStatus || undefined}
        projectName={activeProjectName || undefined}
        swarmStatus={swarmState?.status || null}
        swarmTaskProgress={swarmState ? `${swarmState.metrics.completedTasks}/${swarmState.metrics.totalTasks}` : null}
        onSwitchSession={async (sessionId) => {
          await ctx.switchToSession(sessionId);
          ctx.setShowAssistantsDashboard(false);
        }}
        onMessageAgent={(assistantId) => {
          ctx.setShowAssistantsDashboard(false);
          ctx.activeSession?.client.send(`/messages send ${assistantId}`);
        }}
        onPauseResume={(sessionId) => {
          const session = ctx.registry.getSession(sessionId);
          if (session) {
            const loop = session.client.getAssistantLoop?.();
            if (loop?.isPaused?.()) {
              loop.resume?.();
            }
          }
        }}
        onCancel={() => ctx.setShowAssistantsDashboard(false)}
      />
    </box>
  );
}

function renderSwarmPanel(ctx: PanelRenderContext): React.ReactElement {
  const swarmCoordinator = ctx.activeSession?.client.getSwarmCoordinator?.();
  const swarmState = swarmCoordinator?.getSerializableState?.() || null;
  const swarmConfig = swarmCoordinator?.getConfig?.() || null;
  const swarmMemory = swarmCoordinator?.getMemory?.();
  const memoryStats = swarmMemory ? swarmMemory.getStats() : null;

  return (
    <box flexDirection="column" padding={1}>
      <SwarmPanel
        state={swarmState}
        config={swarmConfig}
        memoryStats={memoryStats}
        onStop={() => {
          swarmCoordinator?.stop?.();
        }}
        onCancel={() => ctx.setShowSwarmPanel(false)}
      />
    </box>
  );
}

function renderWorkspacePanel(ctx: PanelRenderContext): React.ReactElement {
  const handleWorkspaceArchive = async (id: string) => {
    const { SharedWorkspaceManager } = await import('@hasna/assistants-core');
    const mgr = new SharedWorkspaceManager();
    mgr.archive(id);
    ctx.setWorkspacesList(mgr.list(true));
  };

  const handleWorkspaceDelete = async (id: string) => {
    const { SharedWorkspaceManager } = await import('@hasna/assistants-core');
    const mgr = new SharedWorkspaceManager();
    mgr.delete(id);
    ctx.setWorkspacesList(mgr.list(true));
  };

  return (
    <box flexDirection="column" padding={1}>
      <WorkspacePanel
        workspaces={ctx.workspacesList}
        activeWorkspaceId={ctx.activeWorkspaceId}
        onArchive={handleWorkspaceArchive}
        onDelete={handleWorkspaceDelete}
        onSelect={ctx.switchWorkspace}
        onClose={() => ctx.setShowWorkspacePanel(false)}
      />
    </box>
  );
}

function renderHeartbeatPanel(ctx: PanelRenderContext): React.ReactElement {
  const sessionId = ctx.activeSessionId || ctx.registry.getActiveSession()?.id;
  const handleRefresh = async () => {
    if (!sessionId) {
      ctx.setHeartbeatRuns([]);
      return;
    }
    const runs = await readHeartbeatHistoryBySession(sessionId, {
      historyPath: ctx.currentConfig?.heartbeat?.historyPath,
      order: 'desc',
      baseDir: ctx.workspaceBaseDir,
    });
    ctx.setHeartbeatRuns(runs);
  };

  return (
    <box flexDirection="column" padding={1}>
      <HeartbeatPanel
        runs={ctx.heartbeatRuns}
        heartbeatState={ctx.heartbeatState}
        onRefresh={handleRefresh}
        onClose={() => ctx.setShowHeartbeatPanel(false)}
      />
    </box>
  );
}

function renderConfigPanel(ctx: PanelRenderContext): React.ReactElement {
  const handleConfigSave = async (
    location: 'user' | 'project' | 'local',
    updates: Partial<AssistantsConfig>
  ) => {
    const { writeFile, mkdir } = await import('fs/promises');
    const { dirname } = await import('path');

    let configPath: string;
    let existingConfig: Partial<AssistantsConfig> | null;

    switch (location) {
      case 'user':
        configPath = `${ctx.workspaceBaseDir || getConfigDir()}/config.json`;
        existingConfig = ctx.userConfig;
        break;
      case 'project':
        configPath = `${getProjectConfigDir(ctx.cwd)}/config.json`;
        existingConfig = ctx.projectConfig;
        break;
      case 'local':
        configPath = `${getProjectConfigDir(ctx.cwd)}/config.local.json`;
        existingConfig = ctx.localConfig;
        break;
    }

    const newConfig = deepMerge(existingConfig || {}, updates);
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(newConfig, null, 2));
    await ctx.loadConfigFiles();
  };

  return (
    <box flexDirection="column" padding={1}>
      <ConfigPanel
        config={ctx.currentConfig!}
        userConfig={ctx.userConfig}
        projectConfig={ctx.projectConfig}
        localConfig={ctx.localConfig}
        onSave={handleConfigSave}
        onCancel={() => ctx.setShowConfigPanel(false)}
      />
    </box>
  );
}

function renderChannelsPanel(ctx: PanelRenderContext): React.ReactElement {
  const channelsManager = ctx.activeSession?.client.getChannelsManager?.();
  if (!channelsManager) {
    return (
      <CloseOnAnyKeyPanel
        message="Channels are not enabled. Set channels.enabled: true in config."
        onClose={() => ctx.setShowChannelsPanel(false)}
      />
    );
  }
  const activeAssistantName = ctx.activeSession?.client.getIdentityInfo?.()?.assistant?.name
    || ctx.activeSession?.assistantId
    || 'Assistant';
  return (
    <ChannelsPanel
      manager={channelsManager}
      onClose={() => ctx.setShowChannelsPanel(false)}
      activePersonId={ctx.activeSession?.client.getPeopleManager?.()?.getActivePersonId?.() || undefined}
      activePersonName={ctx.activeSession?.client.getPeopleManager?.()?.getActivePerson?.()?.name || undefined}
      activeAssistantName={activeAssistantName}
      onPersonMessage={(channelName, personName, message) => {
        const members: ChannelMember[] = channelsManager.getMembers(channelName);

        const agentPool = ctx.activeSession?.client.getChannelAgentPool?.();
        if (agentPool) {
          agentPool.triggerResponses(
            channelName,
            personName,
            message,
            members,
            ctx.activeSession?.assistantId || undefined,
          );
        }

        const activeAssistantId = ctx.activeSession?.assistantId;
        const isActiveMember = activeAssistantId && members.some(
          (m) => m.assistantId === activeAssistantId && m.memberType === 'assistant'
        );

        const mentions = parseMentions(message);
        let activeAssistantTargeted = true;
        if (mentions.length > 0) {
          const assistantMembers = members.filter((m) => m.memberType === 'assistant');
          const knownNames = assistantMembers.map((m) => ({ id: m.assistantId, name: m.assistantName }));
          const resolved = mentions
            .map((m) => resolveNameToKnown(m, knownNames))
            .filter(Boolean) as Array<{ id: string; name: string }>;
          if (resolved.length > 0) {
            activeAssistantTargeted = resolved.some((r) => r.id === activeAssistantId);
          } else {
            activeAssistantTargeted = false;
          }
        }

        if (isActiveMember && activeAssistantTargeted) {
          const prompt = `[Channel Message] ${personName} posted in #${channelName}: "${message}"\n\nYou are in a group channel with other assistants and people. Respond in #${channelName} using channel_send. Be helpful and conversational. You may reference or build on what other assistants have said.`;
          ctx.activeSession?.client.send(prompt);
        }
      }}
    />
  );
}

function renderMessagesPanel(ctx: PanelRenderContext): React.ReactElement {
  const messagesManager = ctx.activeSession?.client.getMessagesManager?.();
  const inboxManager = ctx.activeSession?.client.getInboxManager?.();

  const handleMessagesRead = async (id: string) => {
    if (!messagesManager) throw new Error('Messages not available');
    const msg = await messagesManager.read(id);
    return {
      id: msg.id,
      threadId: msg.threadId,
      fromAssistantId: msg.fromAssistantId,
      fromAssistantName: msg.fromAssistantName,
      subject: msg.subject,
      preview: msg.preview,
      body: msg.body,
      priority: msg.priority as 'low' | 'normal' | 'high' | 'urgent',
      status: msg.status as 'unread' | 'read' | 'archived' | 'injected',
      createdAt: msg.createdAt,
      replyCount: msg.replyCount,
    };
  };

  const refreshMessagesList = async () => {
    const msgs = await messagesManager!.list({ limit: 50 });
    ctx.setMessagesList(msgs.map((m: { id: string; threadId: string; fromAssistantId: string; fromAssistantName: string; subject?: string; preview: string; body?: string; priority: string; status: string; createdAt: string; replyCount?: number }) => ({
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
  };

  const handleMessagesDelete = async (id: string) => {
    if (!messagesManager) throw new Error('Messages not available');
    await messagesManager.delete(id);
    await refreshMessagesList();
  };

  const handleMessagesInject = async (id: string) => {
    if (!messagesManager) throw new Error('Messages not available');
    const msg = await messagesManager.read(id);
    if (ctx.activeSession) {
      ctx.activeSession.client.addSystemMessage(`[Injected message from ${msg.fromAssistantName}]\n\n${msg.body || msg.preview}`);
    }
    await messagesManager.markStatus?.(id, 'injected');
    await refreshMessagesList();
  };

  const handleMessagesReply = async (id: string, body: string) => {
    if (!messagesManager) throw new Error('Messages not available');
    const msg = await messagesManager.read(id);
    await messagesManager.send({
      to: msg.fromAssistantId,
      body,
      replyTo: id,
    });
  };

  const handleInboxRead = async (id: string): Promise<Email> => {
    if (!inboxManager) throw new Error('Inbox not available');
    const email = await inboxManager.read(id);
    if (!email) throw new Error('Email not found');
    const emails = await inboxManager.list({ limit: 50 });
    ctx.setInboxEmails(emails);
    return email;
  };

  const handleInboxDelete = async (id: string) => {
    if (!inboxManager) throw new Error('Inbox not available');
    throw new Error('Delete not implemented yet');
  };

  const handleInboxFetch = async (): Promise<number> => {
    if (!inboxManager) throw new Error('Inbox not available');
    const count = await inboxManager.fetch({ limit: 20 });
    const emails = await inboxManager.list({ limit: 50 });
    ctx.setInboxEmails(emails);
    return count;
  };

  const handleInboxMarkRead = async (id: string) => {
    if (!inboxManager) throw new Error('Inbox not available');
    await inboxManager.markRead(id);
    const emails = await inboxManager.list({ limit: 50 });
    ctx.setInboxEmails(emails);
  };

  const handleInboxMarkUnread = async (id: string) => {
    if (!inboxManager) throw new Error('Inbox not available');
    await inboxManager.markUnread(id);
    const emails = await inboxManager.list({ limit: 50 });
    ctx.setInboxEmails(emails);
  };

  const handleInboxReply = (id: string) => {
    ctx.setShowMessagesPanel(false);
    ctx.activeSession?.client.send(`/messages compose ${id}`);
  };

  if (!messagesManager && !inboxManager) {
    return (
      <box flexDirection="column" padding={1}>
        <box marginBottom={1}>
          <text fg="cyan"><b>Messages</b></text>
        </box>
        <box
          flexDirection="column"
          borderStyle="rounded"
          borderColor="#d4d4d8" border={["top", "bottom"]}
          paddingX={1}
          paddingY={1}
        >
          <text>Messages are not enabled.</text>
          <text fg="gray">Configure messages in config.json to enable.</text>
        </box>
        <box marginTop={1}>
          <text fg="gray">q quit</text>
        </box>
      </box>
    );
  }

  return (
    <box flexDirection="column" padding={1}>
      <MessagesPanel
        messages={ctx.messagesList}
        onRead={handleMessagesRead}
        onDelete={handleMessagesDelete}
        onInject={handleMessagesInject}
        onReply={handleMessagesReply}
        onClose={() => ctx.setShowMessagesPanel(false)}
        error={ctx.messagesPanelError}
        inboxEmails={ctx.inboxEmails}
        onInboxRead={handleInboxRead}
        onInboxDelete={handleInboxDelete}
        onInboxFetch={handleInboxFetch}
        onInboxMarkRead={handleInboxMarkRead}
        onInboxMarkUnread={handleInboxMarkUnread}
        onInboxReply={handleInboxReply}
        inboxError={ctx.inboxError}
        inboxEnabled={ctx.inboxEnabled}
      />
    </box>
  );
}
