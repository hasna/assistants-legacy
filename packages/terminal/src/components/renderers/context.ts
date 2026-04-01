/**
 * PanelRenderContext — shared context passed from App to all panel renderer functions.
 */
import React from 'react';
import type { Message, Connector, HookConfig, ScheduledCommand, Skill, HeartbeatState, ActiveIdentityInfo, EmailListItem } from '@hasna/assistants-shared';
import type { SessionInfo, Identity, Memory, MemoryStats, Heartbeat, SavedSessionInfo, RecoverableSession, SessionRegistry } from '@hasna/assistants-core';
import type { ConnectorBridge, HookStore, GuardrailsStore, BudgetTracker } from '@hasna/assistants-core';
import type { Task, GuardrailsConfig, PolicyInfo, BudgetStatus, RegisteredAssistant, RegistryStats, ProjectRecord } from '@hasna/assistants-core';
import type { BudgetConfig, AssistantsConfig } from '@hasna/assistants-shared';
import type { BudgetProfile } from '../../lib/budgets';
import type { WalletCardEntry, IdentityPanelIntent } from '../appHelpers';
import type { OnboardingResult } from '../OnboardingPanel';

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

  // Panel close setters
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
