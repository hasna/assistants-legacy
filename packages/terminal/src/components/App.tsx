import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { usePanelVisibility } from '../state/usePanelVisibility';
import { loadUserKeymap, resolveAction, generateHelp } from '../keybindings';
import { useAppContext, useTerminalDimensions } from '@opentui/react';
import { useDetectTheme, ThemeProvider } from '../hooks/useThemeColor';
import { join } from 'path';
import { homedir } from 'os';
import { SessionRegistry, SessionStorage, findRecoverableSessions, clearRecoveryState, ConnectorBridge, AudioRecorder, ElevenLabsSTT, WhisperSTT, readHeartbeatHistoryBySession, type SessionInfo, type RecoverableSession, type CreateSessionOptions, type Identity, type Memory, type MemoryStats, type Heartbeat, type SavedSessionInfo } from '@hasna/assistants-core';
import type { StreamChunk, Message, ToolCall, ToolResult, TokenUsage, VoiceState, HeartbeatState, ActiveIdentityInfo, AskUserRequest, AskUserResponse, InterviewRequest, InterviewResponse, Connector, HookConfig, HookEvent, ScheduledCommand, Skill } from '@hasna/assistants-shared';
import { InterviewStore } from '@hasna/assistants-core';
import { generateId, now } from '@hasna/assistants-shared';
import { Input, type InputHandle } from './Input';
import { Messages, type FinishInfo } from './Messages';
import { buildDisplayMessages } from './messageRender';
import { estimateDisplayMessagesLines, trimActivityLogByLines, trimDisplayMessagesByLines, type DisplayMessage } from './messageLines';
import { Status } from './Status';
import { ProcessingIndicator } from './ProcessingIndicator';
import { WelcomeBanner } from './WelcomeBanner';
import { ErrorBanner } from './ErrorBanner';
import { QueueIndicator } from './QueueIndicator';
import { AskUserPanel } from './AskUserPanel';
import { InterviewPanel } from './InterviewPanel';
import { Sidebar } from './Sidebar';
import type { ModifiedFile } from './Sidebar';
import type { OnboardingResult } from './OnboardingPanel';
import { getProviderInfo, LLM_PROVIDERS, getModelDisplayName } from '@hasna/assistants-shared';
import type { QueuedMessage } from './appTypes';
import { takeNextQueuedMessage } from './queueUtils';
import type { EmailListItem } from '@hasna/assistants-shared';
import { CLEAR_SCREEN_TOKEN } from '../output/sanitize';
import { handleExport, handleUndo, handleUndoConfirm, handlePin, handlePins, handleReplay, handleHistory, handleTemplates } from '../commands/qolCommands';
import { setExitStats } from '../exit-summary';
import { useSafeInput as useInput } from '../hooks/useSafeInput';
import {
  getTasks,
  isPaused,
  HookStore,
  loadConfig,
  getConfigDir,
  getProjectConfigDir,
  getActiveWorkspaceId,
  setActiveWorkspaceId,
  resolveWorkspaceBaseDir,
  GuardrailsStore,
  BudgetTracker,
  getGlobalRegistry,
  type Task,
  type GuardrailsConfig,
  type PolicyInfo,
  type BudgetStatus,
  type RegisteredAssistant,
  type RegistryStats,
  listSchedules,
  listProjects,
  readProject,
  type ProjectRecord,
  markOnboardingCompleted,
  isOnboardingCompleted,
  isFirstGreetingShown,
  markFirstGreetingShown,
} from '@hasna/assistants-core';
import type { BudgetConfig, AssistantsConfig } from '@hasna/assistants-shared';
import type { BudgetProfile } from '../lib/budgets';
import {
  loadBudgetProfiles,
  loadSessionBudgetMap,
  saveSessionBudgetMap,
} from '../lib/budgets';
import { renderActivePanel, type PanelRenderContext } from './appPanelRenderers';
import { handleShowPanel as handleShowPanelChunk, loadMessagesAndInbox as loadMessagesAndInboxData } from './appShowPanel';
import { handlePanelSlashCommand as handlePanelSlashCmd } from './appSlashCommands';
import type {
  ActivityEntry,
  SessionUIState,
  AskUserState,
  InterviewState,
  IdentityPanelIntent,
  WalletCardEntry,
  AppProps,
} from './appHelpers';
import {
  SHOW_ERROR_CODES,
  CONNECTOR_INSTALL_PATTERN,
  MESSAGE_CHUNK_LINES,
  MESSAGE_WRAP_CHARS,
  runShellCommand,
  formatShellResult,
  formatElapsedDuration,
  deepMerge,
  isUnrecognizedSlashCommand,
} from './appHelpers';
import { themeColor } from '../theme/colors';
import { applyThemeSetting, getThemeMode, type ThemeSetting } from '../theme/setup';
import {
  applyThemeName,
  getActiveTheme,
  THEME_SETTINGS,
  themeSettingLabel,
  type ThemeSettingName,
} from '../theme/colors';

export function App({ cwd, version, permissionMode: initialPermissionMode }: AppProps) {
  const appCtx = useAppContext();
  const exit = () => appCtx.renderer?.destroy();
  const dims = useTerminalDimensions();
  const rows = dims.height || 24;
  const columns = dims.width || 80;

  const initialWorkspaceRef = useRef<{ id: string | null; baseDir: string } | null>(null);
  if (!initialWorkspaceRef.current) {
    const id = getActiveWorkspaceId();
    const baseDir = resolveWorkspaceBaseDir(id) ?? getConfigDir();
    initialWorkspaceRef.current = { id, baseDir };
  }
  const initialWorkspace = initialWorkspaceRef.current!;

  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(initialWorkspace.id);
  const [workspaceBaseDir, setWorkspaceBaseDir] = useState<string>(initialWorkspace.baseDir);

  // Session registry
  const [registry] = useState(() => new SessionRegistry({
    basePath: initialWorkspace.baseDir,
    workspaceId: initialWorkspace.id ?? null,
  }));
  const registryRef = useRef(registry);

  // Active session state
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  // Panel visibility (plan 8d98da29 P0.3) — centralized single-source-of-truth store.
  // One panel visible at a time; exposes the legacy showXxx/setShowXxx interface.
  const {
    activePanel: __activePanel,
    showSessionSelector, setShowSessionSelector,
    showRecoveryPanel, setShowRecoveryPanel,
    showConnectorsPanel, setShowConnectorsPanel,
    showTasksPanel, setShowTasksPanel,
    showSchedulesPanel, setShowSchedulesPanel,
    showSkillsPanel, setShowSkillsPanel,
    showAssistantsPanel, setShowAssistantsPanel,
    showIdentityPanel, setShowIdentityPanel,
    showMemoryPanel, setShowMemoryPanel,
    showHooksPanel, setShowHooksPanel,
    showGuardrailsPanel, setShowGuardrailsPanel,
    showBudgetPanel, setShowBudgetPanel,
    showModelPanel, setShowModelPanel,
    showAssistantsRegistryPanel, setShowAssistantsRegistryPanel,
    showConfigPanel, setShowConfigPanel,
    showWebhooksPanel, setShowWebhooksPanel,
    showChannelsPanel, setShowChannelsPanel,
    showPeoplePanel, setShowPeoplePanel,
    showContactsPanel, setShowContactsPanel,
    showTelephonyPanel, setShowTelephonyPanel,
    showOrdersPanel, setShowOrdersPanel,
    showJobsPanel, setShowJobsPanel,
    showDocsPanel, setShowDocsPanel,
    showOnboardingPanel, setShowOnboardingPanel,
    showMessagesPanel, setShowMessagesPanel,
    showProjectsPanel, setShowProjectsPanel,
    showPlansPanel, setShowPlansPanel,
    showWalletPanel, setShowWalletPanel,
    showSecretsPanel, setShowSecretsPanel,
    showAssistantsDashboard, setShowAssistantsDashboard,
    showSwarmPanel, setShowSwarmPanel,
    showWorkspacePanel, setShowWorkspacePanel,
    showLogsPanel, setShowLogsPanel,
    showHeartbeatPanel, setShowHeartbeatPanel,
    showResumePanel, setShowResumePanel,
  } = usePanelVisibility();
  void __activePanel;
  // Incremented to force re-render when session labels change (rename, auto-name)
  const [sessionVersion, setSessionVersion] = useState(0);

  // Recovery state for crashed sessions
  const [recoverableSessions, setRecoverableSessions] = useState<RecoverableSession[]>([]);

  // Connectors panel state
  const [connectorsPanelInitial, setConnectorsPanelInitial] = useState<string | undefined>();
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const connectorBridgeRef = useRef<ConnectorBridge | null>(null);

  // Tasks panel state
  const [tasksList, setTasksList] = useState<Task[]>([]);
  const [tasksPaused, setTasksPaused] = useState(false);

  // Schedules panel state
  const [schedulesList, setSchedulesList] = useState<ScheduledCommand[]>([]);

  // Skills panel state
  const [skillsList, setSkillsList] = useState<Skill[]>([]);

  // Assistants panel state
  const [assistantsRefreshKey, setAssistantsRefreshKey] = useState(0);
  const [assistantError, setAssistantError] = useState<string | null>(null);

  // Identity panel state
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [identityPanelIntent, setIdentityPanelIntent] = useState<IdentityPanelIntent | null>(null);
  const [identitiesList, setIdentitiesList] = useState<Identity[]>([]);

  // Memory panel state
  const [memoryList, setMemoryList] = useState<Memory[]>([]);
  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);
  const [memoryError, setMemoryError] = useState<string | null>(null);

  // Hooks panel state
  const [hooksConfig, setHooksConfig] = useState<HookConfig>({});
  const hookStoreRef = useRef<HookStore | null>(null);

  // Guardrails panel state
  const [guardrailsConfig, setGuardrailsConfig] = useState<GuardrailsConfig | null>(null);
  const [guardrailsPolicies, setGuardrailsPolicies] = useState<PolicyInfo[]>([]);
  const guardrailsStoreRef = useRef<GuardrailsStore | null>(null);

  // Budget panel state
  const [budgetConfig, setBudgetConfig] = useState<BudgetConfig | null>(null);
  const [sessionBudgetStatus, setSessionBudgetStatus] = useState<BudgetStatus | null>(null);
  const [swarmBudgetStatus, setSwarmBudgetStatus] = useState<BudgetStatus | null>(null);
  const budgetTrackerRef = useRef<BudgetTracker | null>(null);
  const [budgetProfiles, setBudgetProfiles] = useState<BudgetProfile[]>([]);
  const budgetSessionMapRef = useRef<Record<string, string>>({});

  // Model panel state

  // Assistants panel state
  const [assistantsList, setAssistantsList] = useState<RegisteredAssistant[]>([]);
  const [registryStats, setRegistryStats] = useState<RegistryStats | null>(null);

  // Config panel state
  const [currentConfig, setCurrentConfig] = useState<AssistantsConfig | null>(null);
  const [userConfig, setUserConfig] = useState<Partial<AssistantsConfig> | null>(null);
  const [projectConfig, setProjectConfig] = useState<Partial<AssistantsConfig> | null>(null);
  const [localConfig, setLocalConfig] = useState<Partial<AssistantsConfig> | null>(null);

  // Webhooks panel state

  // Channels panel state

  // People panel state

  // Contacts panel state

  // Telephony panel state

  // Orders panel state

  // Onboarding panel state

  // Messages panel state
  const [messagesPanelError, setMessagesPanelError] = useState<string | null>(null);
  const [messagesList, setMessagesList] = useState<Array<{
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
  }>>([]);

  // Projects panel state
  const [projectsList, setProjectsList] = useState<ProjectRecord[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>();

  // Plans panel state (shown for a specific project)
  const [plansProject, setPlansProject] = useState<ProjectRecord | null>(null);

  // Wallet panel state
  const [walletCards, setWalletCards] = useState<WalletCardEntry[]>([]);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [walletPanelInitialMode, setWalletPanelInitialMode] = useState<'list' | 'add'>('list');

  // Secrets panel state
  const [secretsList, setSecretsList] = useState<Array<{ name: string; scope: 'global' | 'assistant'; createdAt?: string; updatedAt?: string }>>([]);
  const [secretsError, setSecretsError] = useState<string | null>(null);
  const [secretsPanelInitialMode, setSecretsPanelInitialMode] = useState<'list' | 'add'>('list');

  // Inbox data (loaded alongside messages panel)
  const [inboxEmails, setInboxEmails] = useState<EmailListItem[]>([]);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [inboxEnabled, setInboxEnabled] = useState(false);

  // Assistants dashboard panel state

  // Swarm panel state

  // Workspace panel state
  const [workspacesList, setWorkspacesList] = useState<Array<{ id: string; name: string; description?: string; createdAt: number; updatedAt: number; createdBy: string; participants: string[]; status: 'active' | 'archived' }>>([]);

  // Logs panel state
  const [heartbeatRuns, setHeartbeatRuns] = useState<Heartbeat[]>([]);
  const [resumeSessions, setResumeSessions] = useState<SavedSessionInfo[]>([]);
  const [resumeFilter, setResumeFilter] = useState<'cwd' | 'all'>('cwd');
  // [cato] Removed staticResetKey and staticMessages — dead code from Ink <Static> removal

  // Per-session UI state stored by session ID
  const sessionUIStates = useRef<Map<string, SessionUIState>>(new Map());

  // Current session UI state (derived from active session)
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentResponse, setCurrentResponse] = useState('');
  const [currentToolCall, setCurrentToolCall] = useState<ToolCall | undefined>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageQueue, setMessageQueue] = useState<QueuedMessage[]>([]);
  const messageQueueRef = useRef<QueuedMessage[]>([]);
  const [inlinePending, setInlinePending] = useState<QueuedMessage[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | undefined>();

  const [voiceState, setVoiceState] = useState<VoiceState | undefined>();
  const [heartbeatState, setHeartbeatState] = useState<HeartbeatState | undefined>();
  const [identityInfo, setIdentityInfo] = useState<ActiveIdentityInfo | undefined>();
  const [verboseTools, setVerboseTools] = useState(false);
  const [pinnedMessageIds, setPinnedMessageIds] = useState<Set<string>>(new Set());
  const [gitBranch, setGitBranch] = useState<string | undefined>();
  const [modifiedFiles, setModifiedFiles] = useState<ModifiedFile[]>([]);
  const [askUserState, setAskUserState] = useState<AskUserState | null>(null);
  const [interviewState, setInterviewState] = useState<InterviewState | null>(null);
  const [processingStartTime, setProcessingStartTime] = useState<number | undefined>();
  const [currentTurnTokens, setCurrentTurnTokens] = useState(0);
  const [lastWorkedFor, setLastWorkedFor] = useState<string | undefined>();

  const cachedDisplayMessagesRef = useRef<Map<string, { signature: string; display: ReturnType<typeof buildDisplayMessages> }>>(new Map());
  const pendingMetadataSessionIdRef = useRef<string | null>(null);
  const staticMessageIdsRef = useRef<Set<string>>(new Set());

  // Push-to-talk state
  const [pttRecording, setPttRecording] = useState(false);
  const [pttTranscribing, setPttTranscribing] = useState(false);
  const pttRecorderRef = useRef<AudioRecorder | null>(null);

  // Live partial transcript from streaming STT (talk mode)
  const [partialTranscript, setPartialTranscript] = useState('');

  // Available skills for autocomplete
  const [skills, setSkills] = useState<{ name: string; description: string; argumentHint?: string }[]>([]);
  const [commands, setCommands] = useState<{ name: string; description: string }[]>([]);

  // File list cache for @ autocomplete
  const fileListCacheRef = useRef<{ files: string[]; timestamp: number }>({ files: [], timestamp: 0 });

  const searchFiles = useCallback((query: string): string[] => {
    const cache = fileListCacheRef.current;
    const now = Date.now();
    // Refresh cache every 30 seconds
    if (now - cache.timestamp > 30000 || cache.files.length === 0) {
      try {
        const { execSync } = require('child_process');
        // Use git ls-files if available (respects .gitignore), fallback to find
        let output: string;
        try {
          output = execSync('git ls-files --cached --others --exclude-standard 2>/dev/null', {
            cwd,
            encoding: 'utf-8',
            maxBuffer: 1024 * 1024,
            timeout: 3000,
          });
        } catch {
          output = execSync('find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -maxdepth 5 2>/dev/null | head -1000', {
            cwd,
            encoding: 'utf-8',
            maxBuffer: 1024 * 1024,
            timeout: 3000,
          });
        }
        cache.files = output.trim().split('\n').filter(Boolean).slice(0, 2000);
        cache.timestamp = now;
      } catch {
        return [];
      }
    }

    if (!query) return cache.files.slice(0, 20);

    const lower = query.toLowerCase();
    const matches = cache.files.filter(f => f.toLowerCase().includes(lower));
    return matches.slice(0, 20);
  }, [cwd]);

  // Track Ctrl+C for double-tap exit
  const lastCtrlCRef = useRef<number>(0);
  const [showExitHint, setShowExitHint] = useState(false);

  // Use ref to track response for the done callback
  const responseRef = useRef('');
  const toolCallsRef = useRef<ToolCall[]>([]);
  const toolResultsRef = useRef<ToolResult[]>([]);
  const activityLogRef = useRef<ActivityEntry[]>([]);
  const skipNextDoneRef = useRef(false);
  const isProcessingRef = useRef(isProcessing);
  const currentToolCallRef = useRef<ToolCall | undefined>(currentToolCall);
  const hasPendingToolsRef = useRef(false);
  const tokenUsageRef = useRef<TokenUsage | undefined>(tokenUsage);
  tokenUsageRef.current = tokenUsage;
  const messagesLengthRef = useRef(messages.length);
  messagesLengthRef.current = messages.length;
  const pendingFirstGreetingRef = useRef(false);
  const inputRef = useRef<InputHandle>(null);
  const isPanelOpen = (
    showOnboardingPanel ||
    showRecoveryPanel ||
    showConnectorsPanel ||
    showTasksPanel ||
    showSchedulesPanel ||
    showSkillsPanel ||
    showAssistantsPanel ||
    showIdentityPanel ||
    showMemoryPanel ||
    showHooksPanel ||
    showGuardrailsPanel ||
    showBudgetPanel ||
    showModelPanel ||
    showAssistantsRegistryPanel ||
    showConfigPanel ||
    showWebhooksPanel ||
    showChannelsPanel ||
    showPeoplePanel ||
    showContactsPanel ||
    showTelephonyPanel ||
    showOrdersPanel ||
    showJobsPanel ||
    showDocsPanel ||
    showMessagesPanel ||
    showProjectsPanel ||
    showPlansPanel ||
    showWalletPanel ||
    showSecretsPanel ||
    showWorkspacePanel ||
    showAssistantsDashboard ||
    showSwarmPanel ||
    showLogsPanel ||
    showHeartbeatPanel ||
    showResumePanel
  );

  // Clear terminal buffer when transitioning to/from a panel.
  // Ink only re-renders the bottom portion of the terminal — old chat content
  // stays in the buffer above panels, making them invisible after long sessions.
  const prevPanelOpenRef = useRef(isPanelOpen);
  const panelMountedRef = useRef(false);
  useEffect(() => {
    // Skip the initial mount — don't clear during recovery/onboarding panels
    if (!panelMountedRef.current) {
      panelMountedRef.current = true;
      prevPanelOpenRef.current = isPanelOpen;
      return;
    }
    if (isPanelOpen !== prevPanelOpenRef.current) {
      prevPanelOpenRef.current = isPanelOpen;
      process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
    }
  }, [isPanelOpen]);

  // Clear terminal buffer when sidebar visibility changes (e.g. terminal resize
  // crossing the 100-column threshold, or session activation/deactivation).
  // Without this, old buffer content from the previous layout interleaves with
  // the new layout — Ink only re-renders the bottom portion, not the scroll buffer.
  const showSidebarForClear = Boolean(activeSessionId) && columns >= 100;
  const prevShowSidebarRef = useRef(showSidebarForClear);
  useEffect(() => {
    if (showSidebarForClear !== prevShowSidebarRef.current) {
      prevShowSidebarRef.current = showSidebarForClear;
      process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
    }
  }, [showSidebarForClear]);

  const processingStartTimeRef = useRef<number | undefined>(processingStartTime);
  const pendingSendsRef = useRef<Array<{ id: string; sessionId: string }>>([]);
  const pendingConnectorInstallRef = useRef<Set<string>>(new Set());
  const queueBlockedRef = useRef<Set<string>>(new Set());
  const queueBlockedTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const askUserStateRef = useRef<Map<string, AskUserState>>(new Map());
  const interviewStateRef = useRef<Map<string, InterviewState>>(new Map());
  const interviewStoreRef = useRef<InterviewStore | null>(null);
  // Lazy-init interview store
  const getInterviewStore = useCallback(() => {
    if (!interviewStoreRef.current) {
      interviewStoreRef.current = new InterviewStore();
    }
    return interviewStoreRef.current;
  }, []);
  // Trigger state update to force queue processing check after processing completes
  const [queueFlushTrigger, setQueueFlushTrigger] = useState(0);
  const clearPendingSend = useCallback((id: string, sessionId: string) => {
    pendingSendsRef.current = pendingSendsRef.current.filter(
      (entry) => entry.id !== id || entry.sessionId !== sessionId
    );
    setInlinePending((prev) => prev.filter((msg) => msg.id !== id));
  }, []);

  // Scrolling is handled by the <scrollbox> component — no manual scroll tracking needed

  const beginAskUser = useCallback((sessionId: string, request: AskUserRequest) => {
    return new Promise<AskUserResponse>((resolve, reject) => {
      if (askUserStateRef.current.has(sessionId)) {
        reject(new Error('Another interview is already in progress for this session.'));
        return;
      }
      const state: AskUserState = {
        sessionId,
        request,
        index: 0,
        answers: {},
        resolve,
        reject,
      };
      askUserStateRef.current.set(sessionId, state);
      if (sessionId === activeSessionId) {
        setAskUserState(state);
      }
    });
  }, [activeSessionId]);

  const cancelAskUser = useCallback((reason: string, sessionId?: string | null) => {
    const activeId = sessionId ?? activeSessionId;
    if (!activeId) return;
    const current = askUserStateRef.current.get(activeId);
    if (!current) return;
    askUserStateRef.current.delete(activeId);
    if (activeId === activeSessionId) {
      setAskUserState(null);
    }
    current.reject(new Error(reason));
  }, [activeSessionId]);

  const submitAskAnswer = useCallback((answer: string) => {
    if (!activeSessionId) return;
    const current = askUserStateRef.current.get(activeSessionId);
    if (!current) return;

    const question = current.request.questions[current.index];
    const trimmed = answer.trim();

    if (question.required && !trimmed) {
      setError('This question requires an answer.');
      return;
    }

    const options = (question.options || []).map((opt) => opt.trim()).filter(Boolean);
    if (trimmed && options.length > 0) {
      const normalizedOptions = options.map((opt) => opt.toLowerCase());
      const hasOther = normalizedOptions.some((opt) => opt === 'other' || opt.startsWith('other') || opt.includes('other'));
      if (!hasOther) {
        const parts = question.multiline
          ? trimmed.split(/[,\n]+/).map((part) => part.trim()).filter(Boolean)
          : [trimmed];
        const invalid = parts.some((part) => !normalizedOptions.includes(part.toLowerCase()));
        if (invalid) {
          const preview = options.slice(0, 6).join(', ');
          const suffix = options.length > 6 ? ', ...' : '';
          setError(`Please answer with one of: ${preview}${suffix}`);
          return;
        }
      }
    }

    setError(null);

    const answers = { ...current.answers, [question.id]: trimmed };
    const nextIndex = current.index + 1;

    if (nextIndex >= current.request.questions.length) {
      askUserStateRef.current.delete(current.sessionId);
      if (current.sessionId === activeSessionId) {
        setAskUserState(null);
      }
      current.resolve({ answers });
      return;
    }

    const nextState: AskUserState = {
      ...current,
      index: nextIndex,
      answers,
    };
    askUserStateRef.current.set(current.sessionId, nextState);
    if (current.sessionId === activeSessionId) {
      setAskUserState(nextState);
    }
  }, [activeSessionId]);

  // Interview mode handlers (rich multi-step wizard)
  const beginInterview = useCallback((sessionId: string, request: InterviewRequest) => {
    return new Promise<InterviewResponse>((resolve, reject) => {
      if (interviewStateRef.current.has(sessionId)) {
        reject(new Error('Another interview is already in progress for this session.'));
        return;
      }
      // Generate interview ID and persist to store
      const interviewId = generateId();
      const store = getInterviewStore();
      store.create({
        id: interviewId,
        sessionId,
        title: request.title,
        questions: request.questions,
      });

      const state: InterviewState = {
        sessionId,
        interviewId,
        request,
        resolve,
        reject,
      };
      interviewStateRef.current.set(sessionId, state);
      if (sessionId === activeSessionId) {
        setInterviewState(state);
      }
    });
  }, [activeSessionId, getInterviewStore]);

  const cancelInterview = useCallback((reason: string, sessionId?: string | null) => {
    const activeId = sessionId ?? activeSessionId;
    if (!activeId) return;
    const current = interviewStateRef.current.get(activeId);
    if (!current) return;
    interviewStateRef.current.delete(activeId);
    if (activeId === activeSessionId) {
      setInterviewState(null);
    }
    // Persist cancellation
    const store = getInterviewStore();
    store.cancel(current.interviewId);
    current.reject(new Error(reason));
  }, [activeSessionId, getInterviewStore]);

  const completeInterview = useCallback((response: InterviewResponse) => {
    setInterviewState((prev) => {
      if (!prev) return prev;
      interviewStateRef.current.delete(prev.sessionId);
      // Persist completion
      const store = getInterviewStore();
      store.complete(prev.interviewId, response.answers);
      prev.resolve(response);
      return null;
    });
  }, [getInterviewStore]);

  // Terminal resize is handled natively
  const turnIdRef = useRef(0);
  const initStateRef = useRef<'idle' | 'pending' | 'done'>('idle');
  // Set when the user skips onboarding (Esc) so the init effect doesn't re-show it this session.
  const onboardingDismissedRef = useRef(false);
  // Bumped by /theme to force a re-render so themeColor() re-resolves to the new palette.
  const [, setThemeVersion] = useState(0);
  const isMountedRef = useRef(true);
  const handlersRegisteredRef = useRef(false);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  useEffect(() => {
    currentToolCallRef.current = currentToolCall;
  }, [currentToolCall]);

  useEffect(() => {
    processingStartTimeRef.current = processingStartTime;
  }, [processingStartTime]);

  useEffect(() => {
    if (isProcessing && !processingStartTime) {
      const now = Date.now();
      setProcessingStartTime(now);
      processingStartTimeRef.current = now; // Sync ref immediately for synchronous access
    }
  }, [isProcessing, processingStartTime]);

  // Detect git branch on startup
  useEffect(() => {
    const { exec } = require('child_process');
    exec('git branch --show-current 2>/dev/null', { cwd }, (err: Error | null, stdout: string) => {
      if (!err && stdout?.trim()) {
        setGitBranch(stdout.trim());
      }
    });
  }, [cwd]);

  // Poll git diff --numstat for modified files (sidebar display)
  useEffect(() => {
    const fetchModifiedFiles = () => {
      const { exec } = require('child_process');
      exec('git diff --numstat HEAD 2>/dev/null', { cwd }, (err: Error | null, stdout: string) => {
        if (err || !stdout?.trim()) {
          setModifiedFiles([]);
          return;
        }
        const files: ModifiedFile[] = stdout.trim().split('\n').map(line => {
          const [add, del, path] = line.split('\t');
          return {
            path: path || '',
            additions: parseInt(add, 10) || 0,
            removals: parseInt(del, 10) || 0,
          };
        }).filter(f => f.path);
        setModifiedFiles(files);
      });
    };
    fetchModifiedFiles();
    const interval = setInterval(fetchModifiedFiles, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, [cwd]);

  const buildFullResponse = useCallback(() => {
    const parts = activityLogRef.current
      .filter((entry) => entry.type === 'text' && entry.content)
      .map((entry) => entry.content as string);

    if (responseRef.current.trim()) {
      parts.push(responseRef.current);
    }

    return parts.join('\n').trim();
  }, []);

  const loadSessionMetadata = useCallback(async (session: SessionInfo) => {
    pendingMetadataSessionIdRef.current = session.id;
    try {
      const [loadedSkills, loadedCommands] = await Promise.all([
        session.client.getSkills(),
        session.client.getCommands(),
      ]);
      if (pendingMetadataSessionIdRef.current !== session.id) {
        return;
      }
      setSkills(loadedSkills.map((s) => ({
        name: s.name,
        description: s.description || '',
        argumentHint: s.argumentHint,
      })));
      const loaded = loadedCommands.map((cmd) => ({
        name: cmd.name.startsWith('/') ? cmd.name : `/${cmd.name}`,
        description: cmd.description || '',
      }));
      // Built-in commands handled inline in handleSubmit (not from the loader).
      const builtins = [
        { name: '/theme', description: 'Switch color theme (auto/dark/light, +daltonized/+ansi)' },
        { name: '/keys', description: 'Show keybindings (remap via config.json)' },
      ];
      const seen = new Set(loaded.map((c) => c.name));
      setCommands([...loaded, ...builtins.filter((b) => !seen.has(b.name))]);
    } catch (err) {
      if (pendingMetadataSessionIdRef.current !== session.id) {
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const loadBudgetData = useCallback(async () => {
    const baseDir = workspaceBaseDir || getConfigDir();
    const profiles = await loadBudgetProfiles(baseDir, currentConfig?.budget);
    setBudgetProfiles(profiles);
    budgetSessionMapRef.current = await loadSessionBudgetMap(baseDir);
    return profiles;
  }, [workspaceBaseDir, currentConfig]);

  const getSessionBudgetProfileId = useCallback((sessionId: string, profiles: BudgetProfile[]) => {
    const mapped = budgetSessionMapRef.current[sessionId];
    if (mapped && profiles.some((p) => p.id === mapped)) {
      return mapped;
    }
    return profiles[0]?.id || null;
  }, []);

  const setSessionBudgetProfileId = useCallback(async (sessionId: string, profileId: string) => {
    const baseDir = workspaceBaseDir || getConfigDir();
    budgetSessionMapRef.current = { ...budgetSessionMapRef.current, [sessionId]: profileId };
    await saveSessionBudgetMap(baseDir, budgetSessionMapRef.current);
  }, [workspaceBaseDir]);

  const applyBudgetProfileToSession = useCallback(async (
    session: SessionInfo,
    profileId: string | null,
    profiles: BudgetProfile[]
  ) => {
    if (!profileId) return;
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return;

    await setSessionBudgetProfileId(session.id, profile.id);

    // Keep a local tracker as a fallback for non-loop contexts.
    budgetTrackerRef.current = new BudgetTracker(session.id, profile.config);
    setBudgetConfig(profile.config);

    // Update assistant loop config and prefer loop-derived live status.
    const loop = session.client.getAssistantLoop?.();
    if (loop && typeof loop.setBudgetConfig === 'function') {
      loop.setBudgetConfig(profile.config);
    }
    if (loop && typeof loop.getBudgetStatus === 'function') {
      const summary = loop.getBudgetStatus();
      if (summary) {
        setSessionBudgetStatus(summary.session);
        setSwarmBudgetStatus(summary.swarm);
        return;
      }
    }

    // Fallback status when loop does not expose budget summary.
    const sessionStatus = budgetTrackerRef.current.checkBudget('session');
    const swarmStatus = budgetTrackerRef.current.checkBudget('swarm');
    setSessionBudgetStatus(sessionStatus);
    setSwarmBudgetStatus(swarmStatus);
  }, [setSessionBudgetProfileId]);

  const openBudgetsPanel = useCallback(async () => {
    const profiles = await loadBudgetData();
    const session = registry.getActiveSession();
    if (!session) return;
    const profileId = getSessionBudgetProfileId(session.id, profiles);
    await applyBudgetProfileToSession(session, profileId, profiles);
    setShowBudgetPanel(true);
  }, [loadBudgetData, registry, getSessionBudgetProfileId, applyBudgetProfileToSession]);

  const toWalletCardEntry = useCallback((card: any): WalletCardEntry => {
    const expiryRaw = typeof card?.expiry === 'string' ? card.expiry : '';
    const [expMonthRaw, expYearRaw] = expiryRaw.split('/');
    const parsedMonth = parseInt(expMonthRaw || '', 10);
    const parsedYear = parseInt(expYearRaw || '', 10);
    const normalizedYear = Number.isFinite(parsedYear)
      ? (parsedYear < 100 ? 2000 + parsedYear : parsedYear)
      : undefined;
    const number = typeof card?.cardNumber === 'string' ? card.cardNumber : (typeof card?.number === 'string' ? card.number : undefined);
    const last4 = typeof card?.last4 === 'string'
      ? card.last4
      : (number ? number.slice(-4) : '');

    return {
      id: String(card?.id || ''),
      name: String(card?.name || 'Card'),
      last4,
      brand: card?.brand || card?.cardType,
      cardType: card?.cardType || card?.brand,
      cardholderName: card?.cardholderName,
      number,
      expiry: expiryRaw || undefined,
      expiryMonth: Number.isFinite(parsedMonth) ? parsedMonth : (typeof card?.expiryMonth === 'number' ? card.expiryMonth : undefined),
      expiryYear: normalizedYear || (typeof card?.expiryYear === 'number' ? card.expiryYear : undefined),
      isDefault: Boolean(card?.isDefault),
      createdAt: card?.createdAt,
    };
  }, []);

  const openWalletPanel = useCallback(async (mode: 'list' | 'add' = 'list') => {
    const walletManager = registry.getActiveSession()?.client.getWalletManager?.();
    setWalletPanelInitialMode(mode);

    if (!walletManager) {
      setWalletError('Wallet not enabled. Configure wallet in config.json.');
      setWalletCards([]);
      setShowWalletPanel(true);
      return;
    }

    try {
      const cards = await walletManager.list();
      setWalletCards(cards.map((card: any) => toWalletCardEntry(card)));
      setWalletError(null);
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : String(err));
    }

    setShowWalletPanel(true);
  }, [registry, toWalletCardEntry]);

  const openSecretsPanel = useCallback(async (mode: 'list' | 'add' = 'list') => {
    const secretsManager = registry.getActiveSession()?.client.getSecretsManager?.();
    setSecretsPanelInitialMode(mode);

    if (!secretsManager) {
      setSecretsError('Secrets not enabled. Configure secrets in config.json.');
      setSecretsList([]);
      setShowSecretsPanel(true);
      return;
    }

    try {
      const secrets = await secretsManager.list('all');
      setSecretsList(secrets);
      setSecretsError(null);
    } catch (err) {
      setSecretsError(err instanceof Error ? err.message : String(err));
    }

    setShowSecretsPanel(true);
  }, [registry]);

  const finalizeResponse = useCallback((status?: 'stopped' | 'interrupted' | 'error') => {
    const baseContent = buildFullResponse();
    const hasContent = baseContent.length > 0;
    const activityToolCalls = activityLogRef.current
      .filter((entry) => entry.type === 'tool_call' && entry.toolCall)
      .map((entry) => entry.toolCall as ToolCall);
    const activityToolResults = activityLogRef.current
      .filter((entry) => entry.type === 'tool_result' && entry.toolResult)
      .map((entry) => entry.toolResult as ToolResult);

    const toolCallMap = new Map<string, ToolCall>();
    for (const toolCall of activityToolCalls) {
      toolCallMap.set(toolCall.id, toolCall);
    }
    for (const toolCall of toolCallsRef.current) {
      toolCallMap.set(toolCall.id, toolCall);
    }
    const mergedToolCalls = Array.from(toolCallMap.values());

    const toolResultMap = new Map<string, ToolResult>();
    for (const toolResult of activityToolResults) {
      toolResultMap.set(toolResult.toolCallId, toolResult);
    }
    for (const toolResult of toolResultsRef.current) {
      toolResultMap.set(toolResult.toolCallId, toolResult);
    }
    const mergedToolResults = Array.from(toolResultMap.values());

    const hasTools = mergedToolCalls.length > 0;

    if (!hasContent && !hasTools) {
      return false;
    }

    let content = baseContent;
    if (status === 'stopped') {
      content = content ? `${content}\n\n[stopped]` : '[stopped]';
    } else if (status === 'interrupted') {
      content = content ? `${content}\n\n[interrupted]` : '[interrupted]';
    } else if (status === 'error') {
      content = content ? `${content}\n\n[error]` : '[error]';
    }

    // Store worked duration for sticky display above input (instead of appending to each message)
    if (processingStartTimeRef.current) {
      const workedFor = formatElapsedDuration(Date.now() - processingStartTimeRef.current);
      setLastWorkedFor(workedFor);
    }

    setMessages((prev) => [
      ...prev,
      {
        id: generateId(),
        role: 'assistant',
        content,
        timestamp: now(),
        toolCalls: hasTools ? mergedToolCalls : undefined,
        toolResults: mergedToolResults.length > 0 ? mergedToolResults : undefined,
      },
    ]);

    // Clear activity log immediately to prevent duplication — the finalized
    // message now contains all content, so the streaming entries must not
    // be rendered alongside it.
    setActivityLog([]);
    activityLogRef.current = [];

    return true;
  }, [buildFullResponse]); // Note: processingStartTime accessed via ref to avoid dependency chain issues

  const resetTurnState = useCallback(() => {
    setCurrentResponse('');
    responseRef.current = '';
    toolCallsRef.current = [];
    toolResultsRef.current = [];
    setCurrentToolCall(undefined);
    setActivityLog([]);
    activityLogRef.current = [];
    setProcessingStartTime(undefined);
    processingStartTimeRef.current = undefined; // Sync ref immediately to avoid stale values
    setCurrentTurnTokens(0);
    setPartialTranscript('');
  }, []);

  // Push-to-talk: toggle recording
  const togglePushToTalk = useCallback(async () => {
    // If transcribing, ignore toggle
    if (pttTranscribing) return;

    // If already recording, stop and transcribe
    if (pttRecording) {
      setPttRecording(false);
      const recorder = pttRecorderRef.current;
      if (!recorder) return;
      recorder.stop();
      // Audio will be captured from the record() promise
      return;
    }

    // Start recording
    setPttRecording(true);
    const recorder = new AudioRecorder();
    pttRecorderRef.current = recorder;

    let audioBuffer: ArrayBuffer;
    try {
      audioBuffer = await recorder.record({ durationSeconds: 120 });
    } catch (err) {
      setPttRecording(false);
      pttRecorderRef.current = null;
      setError(err instanceof Error ? err.message : 'Failed to start recording');
      return;
    }

    // Recording stopped (either by toggle or by reaching max duration)
    setPttRecording(false);
    pttRecorderRef.current = null;

    if (!audioBuffer || audioBuffer.byteLength === 0) return;

    // Transcribe
    setPttTranscribing(true);
    try {
      // Auto-detect STT provider: config → ELEVENLABS_API_KEY → OPENAI_API_KEY
      let stt: { transcribe(audio: ArrayBuffer): Promise<{ text: string }> };
      const config = currentConfig ?? await loadConfig(cwd, workspaceBaseDir);
      const sttConfig = config?.voice?.stt;

      if (sttConfig?.provider === 'elevenlabs') {
        stt = new ElevenLabsSTT({ model: sttConfig.model, language: sttConfig.language });
      } else if (sttConfig?.provider === 'whisper') {
        stt = new WhisperSTT({ model: sttConfig.model, language: sttConfig.language });
      } else if (process.env.ELEVENLABS_API_KEY) {
        stt = new ElevenLabsSTT();
      } else if (process.env.OPENAI_API_KEY) {
        stt = new WhisperSTT();
      } else {
        throw new Error('No STT API key found. Set ELEVENLABS_API_KEY or OPENAI_API_KEY.');
      }

      const result = await stt.transcribe(audioBuffer);
      const text = result.text.trim();
      if (text) {
        inputRef.current?.appendValue(text);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription failed');
    } finally {
      setPttTranscribing(false);
    }
  }, [pttRecording, pttTranscribing, currentConfig, cwd, workspaceBaseDir]);

  // Cleanup PTT on unmount
  useEffect(() => () => {
    if (pttRecorderRef.current) {
      pttRecorderRef.current.stop();
      pttRecorderRef.current = null;
    }
  }, []);

  // Save current session UI state
  const saveCurrentSessionState = useCallback(() => {
    if (activeSessionId) {
      // Deduplicate messages by ID before saving to prevent accumulation
      const seen = new Set<string>();
      const dedupedMessages = messages.filter((msg) => {
        if (seen.has(msg.id)) return false;
        seen.add(msg.id);
        return true;
      });
      sessionUIStates.current.set(activeSessionId, {
        messages: dedupedMessages,
        currentResponse: responseRef.current,
        activityLog: activityLogRef.current,
        toolCalls: toolCallsRef.current,
        toolResults: toolResultsRef.current,
        tokenUsage,
        voiceState,
        heartbeatState,
        identityInfo,
        processingStartTime,
        currentTurnTokens,
        error,
        lastWorkedFor,
      });
    }
  }, [activeSessionId, messages, tokenUsage, voiceState, heartbeatState, identityInfo, processingStartTime, currentTurnTokens, error, lastWorkedFor]);

  // Load session UI state
  const loadSessionState = useCallback((sessionId: string) => {
    const state = sessionUIStates.current.get(sessionId);
    const askState = askUserStateRef.current.get(sessionId) || null;
    const ivState = interviewStateRef.current.get(sessionId) || null;
    if (state) {
      // Deduplicate messages by ID to prevent accumulation across session switches
      const seen = new Set<string>();
      const deduped = state.messages.filter((msg) => {
        if (seen.has(msg.id)) return false;
        seen.add(msg.id);
        return true;
      });
      setMessages(deduped);
      setCurrentResponse(state.currentResponse);
      responseRef.current = state.currentResponse;
      setActivityLog(state.activityLog);
      activityLogRef.current = state.activityLog;
      toolCallsRef.current = state.toolCalls;
      toolResultsRef.current = state.toolResults;
      setCurrentToolCall(undefined);
      setTokenUsage(state.tokenUsage);
      setVoiceState(state.voiceState);
      setHeartbeatState(state.heartbeatState);
      setIdentityInfo(state.identityInfo);
      setProcessingStartTime(state.processingStartTime);
      processingStartTimeRef.current = state.processingStartTime; // Sync ref immediately
      setCurrentTurnTokens(state.currentTurnTokens);
      setError(state.error);
      setLastWorkedFor(state.lastWorkedFor);
      setAskUserState(askState);
      setInterviewState(ivState);
    } else {
      // New session - reset state
      setMessages([]);
      setCurrentResponse('');
      responseRef.current = '';
      setActivityLog([]);
      activityLogRef.current = [];
      toolCallsRef.current = [];
      toolResultsRef.current = [];
      setCurrentToolCall(undefined);
      setTokenUsage(undefined);
      setVoiceState(undefined);
      setHeartbeatState(undefined);
      setIdentityInfo(undefined);
      setProcessingStartTime(undefined);
      processingStartTimeRef.current = undefined; // Sync ref immediately
      setCurrentTurnTokens(0);
      setError(null);
      setLastWorkedFor(undefined);
      setAskUserState(askState);
      setInterviewState(ivState);
    }
  }, []);

  const clearSessionWindow = useCallback(() => {
    process.stdout.write(CLEAR_SCREEN_TOKEN);
    cachedDisplayMessagesRef.current.clear();
    staticMessageIdsRef.current.clear();
  }, []);

  const isConnectorInstallCommand = useCallback((command: unknown): boolean => {
    if (typeof command !== 'string') return false;
    const trimmed = command.trim();
    const lower = trimmed.toLowerCase();
    // Detect `connectors install <name>` or `connectors add <name>`
    if (/^\s*connectors\s+(install|add)\b/.test(lower)) return true;
    // Detect `bun add -g connect-*` or `bun add -g @hasna/*`
    if (!lower.startsWith('bun ')) return false;
    if (!/\bbun\s+(add|install|i)\b/.test(lower)) return false;
    if (!/\s(-g|--global)\b/.test(lower)) return false;
    return CONNECTOR_INSTALL_PATTERN.test(lower);
  }, []);

  const refreshConnectorBridge = useCallback(async () => {
    const active = registryRef.current.getActiveSession();
    const effectiveCwd = active?.cwd || cwd;
    if (!connectorBridgeRef.current) {
      connectorBridgeRef.current = new ConnectorBridge(effectiveCwd);
    }
    try {
      const discovered = await connectorBridgeRef.current.refresh();
      setConnectors(discovered);
    } catch {
      // Ignore refresh errors; connectors can be refreshed manually.
    }
  }, [cwd]);

  const closeAllPanels = useCallback(() => {
    setShowSessionSelector(false);
    setShowConnectorsPanel(false);
    setShowTasksPanel(false);
    setShowSchedulesPanel(false);
    setShowSkillsPanel(false);
    setShowAssistantsPanel(false);
    setShowIdentityPanel(false);
    setShowMemoryPanel(false);
    setShowHooksPanel(false);
    setShowGuardrailsPanel(false);
    setShowBudgetPanel(false);
    setShowModelPanel(false);
    setShowAssistantsRegistryPanel(false);
    setShowConfigPanel(false);
    setShowWebhooksPanel(false);
    setShowChannelsPanel(false);
    setShowPeoplePanel(false);
    setShowContactsPanel(false);
    setShowTelephonyPanel(false);
    setShowOrdersPanel(false);
    setShowJobsPanel(false);
    setShowDocsPanel(false);
    setShowMessagesPanel(false);
    setShowProjectsPanel(false);
    setShowPlansPanel(false);
    setShowWalletPanel(false);
    setShowSecretsPanel(false);
    setShowSwarmPanel(false);
    setShowWorkspacePanel(false);
    setShowLogsPanel(false);
    setShowHeartbeatPanel(false);
    setShowResumePanel(false);
    setShowAssistantsDashboard(false);
    setPartialTranscript('');
  }, []);

  const switchToSession = useCallback(async (sessionId: string) => {
    if (sessionId === activeSessionId) {
      return;
    }

    // Close panels to avoid stale cross-session UI state
    closeAllPanels();

    saveCurrentSessionState();
    clearSessionWindow();

    // Load new session state BEFORE switching (prevents race with buffered chunk replay)
    loadSessionState(sessionId);

    const session = registry.getSession(sessionId);
    if (session) {
      setIsProcessing(session.isProcessing);
      isProcessingRef.current = session.isProcessing;
      setVoiceState(session.client.getVoiceState() ?? undefined);
      setHeartbeatState(session.client.getHeartbeatState?.() ?? undefined);
      setIdentityInfo(session.client.getIdentityInfo() ?? undefined);
      await loadSessionMetadata(session);
      const profiles = budgetProfiles.length > 0 ? budgetProfiles : await loadBudgetData();
      const profileId = getSessionBudgetProfileId(session.id, profiles);
      await applyBudgetProfileToSession(session, profileId, profiles);
    }

    // Now switch session in registry (may replay buffered chunks to the reset state)
    await registry.switchSession(sessionId);
    setActiveSessionId(sessionId);
  }, [
    activeSessionId,
    saveCurrentSessionState,
    clearSessionWindow,
    loadSessionState,
    registry,
    loadSessionMetadata,
    budgetProfiles,
    loadBudgetData,
    getSessionBudgetProfileId,
    applyBudgetProfileToSession,
  ]);

  const createAndActivateSession = useCallback(async (options: CreateSessionOptions) => {
    saveCurrentSessionState();
    const newSession = await registry.createSession(options);
    newSession.client.setAskUserHandler((request) => beginAskUser(newSession.id, request));
    newSession.client.setInterviewHandler((request) => beginInterview(newSession.id, request));

    clearSessionWindow();
    setShowSessionSelector(false);
    setShowConnectorsPanel(false);
    setShowTasksPanel(false);
    setShowSchedulesPanel(false);
    setShowSkillsPanel(false);
    setShowAssistantsPanel(false);
    setShowIdentityPanel(false);
    setShowMemoryPanel(false);
    setShowHooksPanel(false);
    setShowGuardrailsPanel(false);
    setShowBudgetPanel(false);
    setShowModelPanel(false);
    setShowAssistantsRegistryPanel(false);
    setShowConfigPanel(false);
    setShowWebhooksPanel(false);
    setShowChannelsPanel(false);
    setShowPeoplePanel(false);
    setShowContactsPanel(false);
    setShowTelephonyPanel(false);
    setShowOrdersPanel(false);
    setShowJobsPanel(false);
    setShowDocsPanel(false);
    setShowMessagesPanel(false);
    setShowProjectsPanel(false);
    setShowPlansPanel(false);
    setShowWalletPanel(false);
    setShowSecretsPanel(false);
    setShowSwarmPanel(false);
    setShowWorkspacePanel(false);
    setShowLogsPanel(false);
    setShowHeartbeatPanel(false);
    setShowResumePanel(false);
    setShowAssistantsDashboard(false);
    setPartialTranscript('');

    await registry.switchSession(newSession.id);
    setActiveSessionId(newSession.id);

    // Initialize empty state AFTER switching (prevents old-session chunks from repopulating UI)
    loadSessionState(newSession.id);
    setIsProcessing(false);
    isProcessingRef.current = false;
    setVoiceState(newSession.client.getVoiceState() ?? undefined);
    setHeartbeatState(newSession.client.getHeartbeatState?.() ?? undefined);
    setIdentityInfo(newSession.client.getIdentityInfo() ?? undefined);
    await loadSessionMetadata(newSession);
    const profiles = budgetProfiles.length > 0 ? budgetProfiles : await loadBudgetData();
    const profileId = getSessionBudgetProfileId(newSession.id, profiles);
    await applyBudgetProfileToSession(newSession, profileId, profiles);

    // Apply initial permission mode from CLI flag if provided
    if (initialPermissionMode) {
      const loop = newSession.client.getAssistantLoop?.();
      loop?.setPermissionMode(initialPermissionMode);
    }

    return newSession;
  }, [
    registry,
    beginAskUser,
    beginInterview,
    clearSessionWindow,
    loadSessionState,
    loadSessionMetadata,
    saveCurrentSessionState,
    budgetProfiles,
    loadBudgetData,
    getSessionBudgetProfileId,
    applyBudgetProfileToSession,
    initialPermissionMode,
  ]);

  const seedSessionState = useCallback((sessionId: string, seededMessages: Message[]) => {
    // Deduplicate messages by ID to prevent persisted duplicates from propagating
    const seen = new Set<string>();
    const deduped = seededMessages.filter((msg) => {
      if (seen.has(msg.id)) return false;
      seen.add(msg.id);
      return true;
    });
    sessionUIStates.current.set(sessionId, {
      messages: deduped,
      currentResponse: '',
      activityLog: [],
      toolCalls: [],
      toolResults: [],
      tokenUsage: undefined,
      voiceState: undefined,
      heartbeatState: undefined,
      identityInfo: undefined,
      processingStartTime: undefined,
      currentTurnTokens: 0,
      error: null,
      lastWorkedFor: undefined,
    });
  }, []);

  const refreshResumeSessions = useCallback(async () => {
    setResumeSessions(SessionStorage.listAllSessions(workspaceBaseDir));
  }, [workspaceBaseDir]);

  const resumeFromSavedSession = useCallback(async (saved: SavedSessionInfo) => {
    setShowResumePanel(false);

    const sessionData = SessionStorage.loadSession(saved.id, saved.assistantId ?? null, workspaceBaseDir);
    if (!sessionData) {
      setError('Failed to load saved session.');
      return;
    }

    let session = registry.getSession(saved.id);
    if (!session) {
      try {
        session = await registry.createSession({
          cwd: sessionData.cwd || cwd,
          assistantId: saved.assistantId || undefined,
          sessionId: saved.id,
          initialMessages: sessionData.messages as Message[],
          startedAt: sessionData.startedAt,
        });
      } catch (error) {
        session = await registry.createSession({
          cwd: sessionData.cwd || cwd,
          assistantId: saved.assistantId || undefined,
          initialMessages: sessionData.messages as Message[],
          startedAt: sessionData.startedAt,
        });
      }
      session!.client.setAskUserHandler((request) => beginAskUser(session!.id, request));
      session!.client.setInterviewHandler((request) => beginInterview(session!.id, request));
    }

    if (!sessionUIStates.current.has(session!.id)) {
      seedSessionState(session!.id, sessionData.messages as Message[]);
    }
    await switchToSession(session.id);

    // Restore unsent queued messages on session resume.
    // First check explicitly persisted pendingQueue, then fall back to
    // detecting orphaned trailing user messages (user messages at the end
    // of the conversation with no following assistant response).
    const pending = sessionData.pendingQueue;
    let messagesToRequeue: { id: string; content: string }[] = [];

    if (pending && pending.length > 0) {
      messagesToRequeue = pending.map((content) => ({ id: generateId(), content }));
    } else {
      // Detect orphaned trailing user messages
      const msgs = sessionData.messages as Message[];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'user' && msgs[i].content) {
          messagesToRequeue.unshift({ id: msgs[i].id, content: msgs[i].content });
        } else {
          break;
        }
      }
    }

    if (messagesToRequeue.length > 0) {
      const restoredQueue: QueuedMessage[] = messagesToRequeue.map(({ id, content }) => ({
        id,
        sessionId: session!.id,
        content,
        queuedAt: Date.now(),
        mode: 'queued' as const,
      }));
      setMessageQueue((prev) => [...prev, ...restoredQueue]);
    }
  }, [cwd, registry, beginAskUser, beginInterview, seedSessionState, switchToSession, workspaceBaseDir]);

  const switchWorkspace = useCallback(async (workspaceId: string | null) => {
    if (workspaceId === activeWorkspaceId) {
      return;
    }

    try {
      setActiveWorkspaceId(workspaceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }

    const nextBaseDir = resolveWorkspaceBaseDir(workspaceId) ?? getConfigDir();

    // Stop any in-flight processing
    if (isProcessingRef.current) {
      const active = registryRef.current.getActiveSession();
      active?.client.stop();
      resetTurnState();
      setIsProcessing(false);
      isProcessingRef.current = false;
    }

    // Reset registry storage scope
    registry.resetStore({ basePath: nextBaseDir, workspaceId });

    // Clear UI/session state
    sessionUIStates.current.clear();
    setActiveSessionId(null);
    setMessages([]);
    setCurrentResponse('');
    responseRef.current = '';
    setActivityLog([]);
    activityLogRef.current = [];
    toolCallsRef.current = [];
    toolResultsRef.current = [];
    setCurrentToolCall(undefined);
    setTokenUsage(undefined);
    setVoiceState(undefined);
    setHeartbeatState(undefined);
    setIdentityInfo(undefined);
    setProcessingStartTime(undefined);
    processingStartTimeRef.current = undefined;
    setCurrentTurnTokens(0);
    setError(null);
    setLastWorkedFor(undefined);
    setAskUserState(null);
    setInterviewState(null);
    setMessageQueue([]);
    setInlinePending([]);
    pendingSendsRef.current = [];
    setRecoverableSessions([]);
    setShowRecoveryPanel(false);
    setShowOnboardingPanel(false);
    setShowResumePanel(false);
    setResumeSessions([]);
    closeAllPanels();
    setCurrentConfig(null);
    setUserConfig(null);
    setProjectConfig(null);
    setLocalConfig(null);
    hookStoreRef.current = null;
    guardrailsStoreRef.current = null;
    setBudgetProfiles([]);
    budgetSessionMapRef.current = {};
    setAssistantsList([]);
    setRegistryStats(null);
    setPartialTranscript('');
    queueBlockedRef.current.clear();
    for (const timer of queueBlockedTimersRef.current.values()) {
      clearTimeout(timer);
    }
    queueBlockedTimersRef.current.clear();
    clearSessionWindow();
    setShowWorkspacePanel(false);

    // Update workspace state
    setActiveWorkspaceIdState(workspaceId);
    setWorkspaceBaseDir(nextBaseDir);

    // Re-trigger initialization
    initStateRef.current = 'idle';
    setIsInitializing(true);
  }, [
    activeWorkspaceId,
    clearSessionWindow,
    registry,
    resetTurnState,
    setActiveWorkspaceIdState,
  ]);

  // Handle chunk from registry
  const handleChunk = useCallback((chunk: StreamChunk) => {
    const isStartChunk = chunk.type === 'text' || chunk.type === 'tool_use';
    const isTerminalChunk = chunk.type === 'error' || chunk.type === 'done';
    if (chunk.type === 'text' || chunk.type === 'partial_transcript') {
      const activeForVoice = registryRef.current.getActiveSession();
      if (activeForVoice) {
        setVoiceState(activeForVoice.client.getVoiceState() ?? undefined);
      }
    }
    if (!isProcessingRef.current && (isStartChunk || isTerminalChunk)) {
      const active = registryRef.current.getActiveSession();
      if (active) {
        turnIdRef.current += 1;
        resetTurnState();
        setError(null);
        registryRef.current.setProcessing(active.id, true);
        setIsProcessing(true);
        isProcessingRef.current = true;
        const startNow = Date.now();
        setProcessingStartTime(startNow);
        processingStartTimeRef.current = startNow; // Sync ref immediately for synchronous access
        const pendingIndex = pendingSendsRef.current.findIndex((entry) => entry.sessionId === active.id);
        if (pendingIndex !== -1) {
          const [started] = pendingSendsRef.current.splice(pendingIndex, 1);
          if (started) {
            setInlinePending((prev) => prev.filter((msg) => msg.id !== started.id));
          }
        }
      }
    }

    if (chunk.type === 'text' && chunk.content) {
      responseRef.current += chunk.content;
      setCurrentResponse(responseRef.current);
    } else if (chunk.type === 'tool_use' && chunk.toolCall) {
      // Save any accumulated text before the tool call
      if (responseRef.current.trim()) {
        const textEntry = {
          id: generateId(),
          type: 'text' as const,
          content: responseRef.current,
          timestamp: now(),
        };
        activityLogRef.current = [...activityLogRef.current, textEntry];
        setActivityLog(activityLogRef.current);
        setCurrentResponse('');
        responseRef.current = '';
      }

      // Track tool call
      toolCallsRef.current.push(chunk.toolCall);
      if (chunk.toolCall.name === 'bash') {
        const command = (chunk.toolCall.input as Record<string, unknown> | undefined)?.command;
        if (isConnectorInstallCommand(command)) {
          pendingConnectorInstallRef.current.add(chunk.toolCall.id);
        }
      }
      const toolEntry = {
        id: generateId(),
        type: 'tool_call' as const,
        toolCall: chunk.toolCall,
        timestamp: now(),
      };
      activityLogRef.current = [...activityLogRef.current, toolEntry];
      setActivityLog(activityLogRef.current);
      setCurrentToolCall(chunk.toolCall);
    } else if (chunk.type === 'tool_result' && chunk.toolResult) {
      const pendingInstall = pendingConnectorInstallRef.current.has(chunk.toolResult.toolCallId);
      if (pendingInstall) {
        pendingConnectorInstallRef.current.delete(chunk.toolResult.toolCallId);
      }
      if (!isProcessingRef.current) {
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const toolCallId = chunk.toolResult!.toolCallId;
          for (let i = prev.length - 1; i >= 0; i -= 1) {
            const msg = prev[i];
            if (msg.role !== 'assistant' || !msg.toolCalls) continue;
            if (!msg.toolCalls.some((call) => call.id === toolCallId)) continue;
            const existing = msg.toolResults || [];
            if (existing.some((r) => r.toolCallId === toolCallId)) {
              return prev;
            }
            const updated: Message = {
              ...msg,
              toolResults: [...existing, chunk.toolResult!],
            };
            return [...prev.slice(0, i), updated, ...prev.slice(i + 1)];
          }
          return prev;
        });
        const hasPendingCall = activityLogRef.current.some(
          (entry) => entry.type === 'tool_call' && entry.toolCall?.id === chunk.toolResult!.toolCallId
        );
        if (hasPendingCall) {
          const resultEntry = {
            id: generateId(),
            type: 'tool_result' as const,
            toolResult: chunk.toolResult,
            timestamp: now(),
          };
          activityLogRef.current = [...activityLogRef.current, resultEntry];
          setActivityLog(activityLogRef.current);
        }
        if (pendingInstall && !chunk.toolResult.isError) {
          void refreshConnectorBridge();
        }
        return;
      }
      // Track tool result
      toolResultsRef.current.push(chunk.toolResult);
      const resultEntry = {
        id: generateId(),
        type: 'tool_result' as const,
        toolResult: chunk.toolResult,
        timestamp: now(),
      };
      activityLogRef.current = [...activityLogRef.current, resultEntry];
      setActivityLog(activityLogRef.current);
      setCurrentToolCall(undefined);
      if (pendingInstall && !chunk.toolResult.isError) {
        void refreshConnectorBridge();
      }
    } else if (chunk.type === 'error' && chunk.error) {
      const finalized = finalizeResponse('error');
      if (finalized) {
        skipNextDoneRef.current = true;
      }
      resetTurnState();
      setError(chunk.error);
      setIsProcessing(false);
      isProcessingRef.current = false;
      const active = registryRef.current.getActiveSession();
      if (active) {
        registryRef.current.setProcessing(active.id, false);
        setInlinePending((prev) => prev.filter((msg) => msg.sessionId !== active.id));
        pendingSendsRef.current = pendingSendsRef.current.filter(
          (entry) => entry.sessionId !== active.id
        );
      }
      // Trigger queue flush check after state settles
      setQueueFlushTrigger((prev) => prev + 1);
    } else if (chunk.type === 'exit') {
      // Exit command was issued
      const active = registryRef.current.getActiveSession();
      if (active) {
        setExitStats({
          sessionId: active.id,
          sessionLabel: active.label,
          startedAt: active.startedAt,
          tokenUsage: tokenUsageRef.current,
          messageCount: messagesLengthRef.current,
          modelId: active.client.getModel() ?? undefined,
        });
      }
      registry.closeAll();
      exit();
    } else if (chunk.type === 'usage' && chunk.usage) {
      setTokenUsage(chunk.usage);
      // Track tokens for current turn (both input and output)
      const turnTokens = (chunk.usage?.inputTokens || 0) + (chunk.usage?.outputTokens || 0);
      setCurrentTurnTokens((prev) => prev + turnTokens);
    } else if (chunk.type === 'done') {
      const shouldSkip = skipNextDoneRef.current;
      skipNextDoneRef.current = false;
      if (!shouldSkip) {
        finalizeResponse();
      }
      setIsProcessing(false);
      isProcessingRef.current = false;
      const active = registryRef.current.getActiveSession();
      if (active) {
        registryRef.current.setProcessing(active.id, false);
      }
      const turnId = turnIdRef.current;
      // Defer clearing streaming state to avoid flicker where output disappears
      queueMicrotask(() => {
        if (!isProcessingRef.current && turnIdRef.current === turnId) {
          resetTurnState();
        }
      });

      // Clear any inline pending messages for this session — the turn is complete
      if (active) {
        setInlinePending((prev) => prev.filter((msg) => msg.sessionId !== active.id));
        pendingSendsRef.current = pendingSendsRef.current.filter(
          (entry) => entry.sessionId !== active.id
        );
      }

      // Trigger queue flush check after state settles
      setQueueFlushTrigger((prev) => prev + 1);

      // Update token usage from client
      const activeSession = registry.getActiveSession();
      if (activeSession) {
        setTokenUsage(activeSession.client.getTokenUsage());
        setVoiceState(activeSession.client.getVoiceState() ?? undefined);
        setHeartbeatState(activeSession.client.getHeartbeatState?.() ?? undefined);
        setIdentityInfo(activeSession.client.getIdentityInfo() ?? undefined);
      }
    } else if (chunk.type === 'stopped') {
      // Assistant was stopped mid-processing (e.g., user pressed Ctrl+C)
      // Ensure UI state is finalized even if no done chunk arrives.
      if (isProcessingRef.current) {
        const finalized = finalizeResponse('stopped');
        if (finalized) {
          skipNextDoneRef.current = true;
        }
        setIsProcessing(false);
        isProcessingRef.current = false;
        const active = registryRef.current.getActiveSession();
        if (active) {
          registryRef.current.setProcessing(active.id, false);
          // Clear inline pending for this session
          setInlinePending((prev) => prev.filter((msg) => msg.sessionId !== active.id));
          pendingSendsRef.current = pendingSendsRef.current.filter(
            (entry) => entry.sessionId !== active.id
          );
        }
        resetTurnState();
      }
      // Trigger queue flush check (done chunk will follow shortly in normal cases)
      setQueueFlushTrigger((prev) => prev + 1);
    } else if (chunk.type === 'partial_transcript') {
      // Live streaming transcription text from talk mode
      setPartialTranscript(chunk.content || '');
    } else if (chunk.type === 'show_panel') {
      handleShowPanelChunk(chunk, {
        cwd, registry, activeSessionId, workspaceBaseDir, currentConfig,
        setConnectorsPanelInitial, setShowConnectorsPanel,
        setTasksList, setTasksPaused, setShowTasksPanel,
        setSchedulesList, setShowSchedulesPanel,
        setSkillsList, setShowSkillsPanel,
        setShowSessionSelector, setShowAssistantsDashboard, setShowAssistantsPanel,
        setIdentityPanelIntent, setShowIdentityPanel,
        setMemoryError, setShowMemoryPanel,
        setHooksConfig, setShowHooksPanel,
        setShowConfigPanel, setShowWebhooksPanel, setShowChannelsPanel,
        setShowPeoplePanel, setShowContactsPanel, setShowTelephonyPanel,
        setShowOrdersPanel, setShowOnboardingPanel,
        setMessagesList, setMessagesPanelError, setInboxEnabled, setInboxEmails, setInboxError, setShowMessagesPanel,
        setGuardrailsConfig, setGuardrailsPolicies, setShowGuardrailsPanel,
        setShowModelPanel,
        setProjectsList, setActiveProjectId, setShowProjectsPanel,
        setPlansProject, setShowPlansPanel,
        setShowSwarmPanel, setWorkspacesList, setShowWorkspacePanel,
        setResumeFilter, setResumeSessions, setShowResumePanel,
        setHeartbeatRuns, setShowHeartbeatPanel, setShowLogsPanel,
        setError,
        hookStoreRef, guardrailsStoreRef,
        createAndActivateSession, switchToSession, openBudgetsPanel, openWalletPanel, openSecretsPanel, loadConfigFiles,
        listAllSessions: SessionStorage.listAllSessions,
      });
    }
  }, [
    registry,
    exit,
    finalizeResponse,
    resetTurnState,
    cwd,
    activeSessionId,
    currentConfig,
    createAndActivateSession,
    isConnectorInstallCommand,
    refreshConnectorBridge,
    switchToSession,
    openWalletPanel,
    workspaceBaseDir,
  ]);

  // Load config files helper
  const loadConfigFiles = useCallback(async () => {
    try {
      // Load merged config
      const config = await loadConfig(cwd, workspaceBaseDir);
      setCurrentConfig(config);

      // Load individual config files for source tracking
      const { readFile, access } = await import('fs/promises');
      const configBaseDir = workspaceBaseDir || getConfigDir();

      // User config
      const userPath = `${configBaseDir}/config.json`;
      try {
        await access(userPath);
        const content = await readFile(userPath, 'utf-8');
        setUserConfig(JSON.parse(content));
      } catch {
        setUserConfig(null);
      }

      // Project config
      const projectPath = `${getProjectConfigDir(cwd)}/config.json`;
      try {
        await access(projectPath);
        const content = await readFile(projectPath, 'utf-8');
        setProjectConfig(JSON.parse(content));
      } catch {
        setProjectConfig(null);
      }

      // Local config
      const localPath = `${getProjectConfigDir(cwd)}/config.local.json`;
      try {
        await access(localPath);
        const content = await readFile(localPath, 'utf-8');
        setLocalConfig(JSON.parse(content));
      } catch {
        setLocalConfig(null);
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  }, [cwd, workspaceBaseDir]);

  // Create a session (either fresh or from recovery)
  const createSessionFromRecovery = useCallback(async (recoverSession: RecoverableSession | null) => {
    // Register chunk handler (only once, even on retry after error)
    if (!handlersRegisteredRef.current) {
      handlersRegisteredRef.current = true;
      registry.onChunk(handleChunk);
      registry.onError((err) => {
        const finalized = finalizeResponse('error');
        if (finalized) {
          skipNextDoneRef.current = true;
        }
        resetTurnState();
        setError(err.message);
        setIsProcessing(false);
        isProcessingRef.current = false;
        const active = registryRef.current.getActiveSession();
        if (active) {
          registryRef.current.setProcessing(active.id, false);
        }
        // Trigger queue flush check after error
        setQueueFlushTrigger((prev) => prev + 1);
      });
      // Re-render when session labels change (rename, auto-name)
      registry.onLabelChange(() => {
        setSessionVersion((prev) => prev + 1);
      });
    }

    // Load session data if recovering
    let initialMessages: Message[] | undefined;
    let sessionId: string | undefined;
    let startedAt: string | undefined;
    let effectiveCwd = cwd;

    if (recoverSession) {
      // Load saved session data
      const sessionData = SessionStorage.loadSession(recoverSession.sessionId, undefined, workspaceBaseDir);
      if (sessionData) {
        initialMessages = sessionData.messages as Message[];
        sessionId = recoverSession.sessionId;
        startedAt = sessionData.startedAt;
        effectiveCwd = sessionData.cwd || cwd;
      }
      // Clear recovery state files (heartbeat and state, but keep session storage)
      clearRecoveryState(recoverSession.sessionId, workspaceBaseDir);
    }

    // Create session (with or without initial messages)
    const session = await registry.createSession(
      initialMessages && initialMessages.length > 0
        ? { cwd: effectiveCwd, sessionId, initialMessages, startedAt }
        : effectiveCwd
    );

    // Set UI messages from recovery data (deduplicated)
    if (initialMessages && initialMessages.length > 0) {
      const seen = new Set<string>();
      const deduped = initialMessages.filter((msg) => {
        if (seen.has(msg.id)) return false;
        seen.add(msg.id);
        return true;
      });
      setMessages(deduped);
    }

    setActiveSessionId(session.id);
    session.client.setAskUserHandler((request) => beginAskUser(session.id, request));
    session.client.setInterviewHandler((request) => beginInterview(session.id, request));

    await loadSessionMetadata(session);

    setVoiceState(session.client.getVoiceState() ?? undefined);
    setHeartbeatState(session.client.getHeartbeatState?.() ?? undefined);
    setIdentityInfo(session.client.getIdentityInfo() ?? undefined);

    // Initialize connector bridge for the connectors panel
    if (!connectorBridgeRef.current) {
      connectorBridgeRef.current = new ConnectorBridge(effectiveCwd);
      const discovered = connectorBridgeRef.current.fastDiscover();
      setConnectors(discovered);
    }

    initStateRef.current = 'done';
    setIsInitializing(false);

    // Trigger first-chat AI greeting after onboarding
    if (pendingFirstGreetingRef.current) {
      pendingFirstGreetingRef.current = false;
      markFirstGreetingShown();
      // Small delay to let the UI render before triggering the greeting
      setTimeout(() => {
        const greetingPrompt = [
          'This is the user\'s very first interaction with you after completing setup.',
          'Greet them warmly and briefly introduce yourself.',
          'You are their personal AI assistant, made by Hasna.',
          'Tell them you\'re ready to help and ask what they\'d like to do.',
          'Keep it short and friendly (2-3 sentences max).',
          'Do NOT say your name is "Hasna Assistant" — you are simply their assistant.',
        ].join(' ');
        session.client.send(greetingPrompt).catch(() => {
          // Greeting is best-effort, don't fail on error
        });
      }, 300);
    }
  }, [cwd, registry, handleChunk, finalizeResponse, resetTurnState, loadSessionMetadata, beginAskUser, beginInterview, workspaceBaseDir]);

  // Handle recovery panel actions
  const handleRecover = useCallback((session: RecoverableSession) => {
    setShowRecoveryPanel(false);
    // Clear recovery state for sessions we're not recovering
    for (const s of recoverableSessions) {
      if (s.sessionId !== session.sessionId) {
        clearRecoveryState(s.sessionId, workspaceBaseDir);
      }
    }
    createSessionFromRecovery(session).catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
      setIsInitializing(false);
    });
  }, [recoverableSessions, createSessionFromRecovery, workspaceBaseDir]);

  const handleStartFresh = useCallback(() => {
    // Clear recovery state for all discarded sessions
    for (const session of recoverableSessions) {
      clearRecoveryState(session.sessionId, workspaceBaseDir);
    }
    setShowRecoveryPanel(false);
    setRecoverableSessions([]);
    createSessionFromRecovery(null).catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
      setIsInitializing(false);
    });
  }, [recoverableSessions, createSessionFromRecovery, workspaceBaseDir]);

  const handleOnboardingComplete = useCallback(async (result: OnboardingResult) => {
    const { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } = await import('fs');

    // 1. Save API key to ~/.secrets
    const secretsPath = join(homedir(), '.secrets');
    const providerInfo = getProviderInfo(result.provider);
    const envName = providerInfo?.apiKeyEnv || 'ANTHROPIC_API_KEY';
    const keyExport = `export ${envName}="${result.apiKey}"`;
    if (existsSync(secretsPath)) {
      const content = readFileSync(secretsPath, 'utf-8');
      if (content.includes(envName)) {
        // Replace existing line
        const updated = content.replace(new RegExp(`^export ${envName}=.*$`, 'm'), keyExport);
        writeFileSync(secretsPath, updated, 'utf-8');
      } else {
        appendFileSync(secretsPath, '\n' + keyExport + '\n', 'utf-8');
      }
    } else {
      writeFileSync(secretsPath, keyExport + '\n', { mode: 0o600 });
    }

    // Save additional connector keys to ~/.secrets
    for (const [name, key] of Object.entries(result.connectorKeys)) {
      const envName = `${name.toUpperCase()}_API_KEY`;
      const connKeyExport = `export ${envName}="${key}"`;
      const content = readFileSync(secretsPath, 'utf-8');
      if (content.includes(envName)) {
        const updated = content.replace(new RegExp(`^export ${envName}=.*$`, 'm'), connKeyExport);
        writeFileSync(secretsPath, updated, 'utf-8');
      } else {
        appendFileSync(secretsPath, connKeyExport + '\n', 'utf-8');
      }
    }

    // 2. Save config to active workspace config directory
    const configDir = workspaceBaseDir || getConfigDir();
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    const configPath = join(configDir, 'config.json');
    let existingConfig: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      try {
        existingConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      } catch {
        // Start fresh if corrupt
      }
    }
    const newConfig = {
      ...existingConfig,
      onboardingCompleted: true,
      llm: {
        provider: result.provider,
        model: result.model,
        apiKey: result.apiKey,
      },
      connectors: result.connectors.length > 0 ? result.connectors : undefined,
    };
    writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');
    await loadConfigFiles();

    // Also persist onboarding state to DB for resilience
    try {
      markOnboardingCompleted();
    } catch {
      // DB may not be available yet, JSON config is sufficient
    }

    // 3. Set API key in current process
    process.env[envName] = result.apiKey;

    // 4. Set flag for first-chat AI greeting
    if (!isFirstGreetingShown()) {
      pendingFirstGreetingRef.current = true;
    }

    // 5. Close panel and re-trigger session init
    setShowOnboardingPanel(false);
    // initStateRef is 'idle', so the useEffect will re-run and create a session
  }, [loadConfigFiles, workspaceBaseDir]);

  const handleOnboardingCancel = useCallback(() => {
    // Remember the skip for this session so the init effect doesn't immediately
    // re-trigger onboarding (it re-runs when showOnboardingPanel flips to false,
    // and onboarding is still not marked completed) — otherwise skip loops forever.
    onboardingDismissedRef.current = true;
    initStateRef.current = 'idle'; // allow the init effect to re-run and proceed
    setShowOnboardingPanel(false);
  }, []);

  // Initialize first session
  useEffect(() => {
    // Only skip if initialization completed successfully
    // Allow retry if we were interrupted (state is still 'idle' or was reset to 'idle')
    if (initStateRef.current === 'done') return;

    // If already pending, another instance is running
    if (initStateRef.current === 'pending') return;

    // If showing recovery panel or onboarding, wait for user decision
    if (showRecoveryPanel) return;
    if (showOnboardingPanel) return;

    initStateRef.current = 'pending';

    let cancelled = false;

    const initSession = async () => {
      try {
        // Check for recoverable sessions first
        const foundSessions = findRecoverableSessions(120000, 24 * 60 * 60 * 1000, workspaceBaseDir);
        if (foundSessions.length > 0 && recoverableSessions.length === 0) {
          // Show recovery panel listing all recoverable sessions
          setRecoverableSessions(foundSessions);
          setShowRecoveryPanel(true);
          initStateRef.current = 'idle'; // Allow re-entry after user decision
          return;
        }

        // Check for first-run onboarding (DB first, then JSON fallback)
        try {
          let needsOnboarding = false;
          // Check DB first
          if (isOnboardingCompleted()) {
            needsOnboarding = false;
          } else {
            // Fallback to JSON config
            const configPath = join(workspaceBaseDir || getConfigDir(), 'config.json');
            const { existsSync, readFileSync } = await import('fs');
            if (!existsSync(configPath)) {
              needsOnboarding = true;
            } else {
              try {
                const raw = readFileSync(configPath, 'utf-8');
                const parsed = JSON.parse(raw);
                if (!parsed.onboardingCompleted) {
                  needsOnboarding = true;
                }
              } catch {
                needsOnboarding = true;
              }
            }
          }
          if (needsOnboarding && !onboardingDismissedRef.current) {
            setShowOnboardingPanel(true);
            initStateRef.current = 'idle';
            setIsInitializing(false);
            return;
          }
        } catch {
          // If checking fails, proceed without onboarding
        }

        // No recovery needed, create fresh session
        await createSessionFromRecovery(null);
      } catch (err) {
        initStateRef.current = 'idle'; // Allow retry on error
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setIsInitializing(false);
      }
    };

    initSession();

    // Cleanup - only set cancelled flag, don't close registry
    // Registry cleanup happens in the mount/unmount effect below
    return () => {
      cancelled = true;
    };
  }, [cwd, registry, showRecoveryPanel, showOnboardingPanel, recoverableSessions, createSessionFromRecovery, workspaceBaseDir]);

  // Separate effect for component mount/unmount lifecycle
  // This ensures registry is only closed when component truly unmounts
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      registry.closeAll();
    };
  }, [registry]);

  // Process queued messages
  const processQueue = useCallback(async () => {
    const activeSession = registryRef.current.getActiveSession();
    if (!activeSessionId || !activeSession) return;
    if (queueBlockedRef.current.has(activeSessionId)) return;

    // Read from ref to avoid stale closure issues
    const currentQueue = messageQueueRef.current;
    const { next: nextMessage } = takeNextQueuedMessage(currentQueue, activeSessionId);
    if (!nextMessage) return;

    // Use functional update to safely remove only the dispatched message
    setMessageQueue((prev) => prev.filter((msg) => msg.id !== nextMessage.id));

    // Clear any leftover inline pending for this session (safety net)
    setInlinePending((prev) => prev.filter((msg) => msg.sessionId !== activeSessionId));
    pendingSendsRef.current = pendingSendsRef.current.filter(
      (entry) => entry.sessionId !== activeSessionId
    );

    // Add user message if not already shown (queued messages are pre-rendered)
    const userMessage: Message = {
      id: nextMessage.id,
      role: 'user',
      content: nextMessage.content,
      timestamp: nextMessage.queuedAt,
    };
    setMessages((prev) => {
      if (prev.some((msg) => msg.id === userMessage.id)) {
        return prev;
      }
      return [...prev, userMessage];
    });

    // Reset state
    skipNextDoneRef.current = false;
    setCurrentResponse('');
    responseRef.current = '';
    toolCallsRef.current = [];
    toolResultsRef.current = [];
    setError(null);
    setCurrentToolCall(undefined);
    setActivityLog([]);
    activityLogRef.current = [];
    const queueStartNow = Date.now();
    setProcessingStartTime(queueStartNow);
    processingStartTimeRef.current = queueStartNow; // Sync ref immediately for synchronous access
    setCurrentTurnTokens(0);
    setIsProcessing(true);
    isProcessingRef.current = true;

    registryRef.current.setProcessing(activeSession.id, true);
    try {
      await activeSession.client.send(nextMessage.content);
    } catch (err) {
      queueBlockedRef.current.add(activeSessionId);
      if (!queueBlockedTimersRef.current.has(activeSessionId)) {
        const timer = setTimeout(() => {
          queueBlockedRef.current.delete(activeSessionId);
          queueBlockedTimersRef.current.delete(activeSessionId);
          setQueueFlushTrigger((prev) => prev + 1);
        }, 15000);
        queueBlockedTimersRef.current.set(activeSessionId, timer);
      }
      setMessageQueue((prev) => {
        if (prev.some((msg) => msg.id === nextMessage.id)) {
          return prev;
        }
        return [
          {
            ...nextMessage,
            mode: 'queued',
          },
          ...prev,
        ];
      });
      clearPendingSend(nextMessage.id, activeSessionId);
      setError(err instanceof Error ? err.message : String(err));
      setIsProcessing(false);
      isProcessingRef.current = false;
      registryRef.current.setProcessing(activeSession.id, false);
      setQueueFlushTrigger((prev) => prev + 1);
    }
  }, [activeSessionId, clearPendingSend]);

  const activeQueue = activeSessionId
    ? messageQueue.filter((msg) => msg.sessionId === activeSessionId)
    : [];
  const activeInline = activeSessionId
    ? inlinePending.filter((msg) => msg.sessionId === activeSessionId)
    : [];
  const queuedMessageIds = useMemo(
    () => new Set(activeQueue.filter((msg) => msg.mode === 'queued').map((msg) => msg.id)),
    [activeQueue]
  );

  // Get session info (sessionVersion forces re-read after label changes)
  void sessionVersion;
  const sessions = registry.listSessions();
  const activeSession = registry.getActiveSession();
  const sessionIndex = activeSessionId ? registry.getSessionIndex(activeSessionId) : 0;
  const sessionCount = registry.getSessionCount();
  const backgroundProcessingCount = registry.getBackgroundProcessingSessions().length;

  const refreshIdentitiesList = useCallback(() => {
    const manager = activeSession?.client.getIdentityManager?.();
    setIdentitiesList(manager?.listIdentities() ?? []);
  }, [activeSession]);

  useEffect(() => {
    if (!showIdentityPanel) return;
    refreshIdentitiesList();
  }, [showIdentityPanel, refreshIdentitiesList]);

  const refreshMemoryList = useCallback(async () => {
    const manager = activeSession?.client.getMemoryManager?.();
    if (!manager) {
      setMemoryError('Memory system not available. Enable it in config.');
      setMemoryList([]);
      setMemoryStats(null);
      return;
    }
    try {
      const result = await manager.query({ limit: 200, orderBy: 'updated', orderDir: 'desc' });
      setMemoryList(result.memories);
      setMemoryStats(await manager.getStats());
      setMemoryError(null);
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : String(err));
    }
  }, [activeSession]);

  useEffect(() => {
    if (!showMemoryPanel) return;
    void refreshMemoryList();
  }, [showMemoryPanel, refreshMemoryList]);

  const MAX_QUEUED_PREVIEW = 3;
  const inlineCount = activeInline.length;
  const activeAskQuestion = askUserState && askUserState.sessionId === activeSessionId
    ? askUserState.request.questions[askUserState.index]
    : undefined;
  const askPlaceholder = activeAskQuestion?.placeholder || activeAskQuestion?.question || 'Answer the question...';
  const hasPendingTools = useMemo(() => {
    const toolResultIds = new Set<string>();
    for (const entry of activityLog) {
      if (entry.type === 'tool_result' && entry.toolResult) {
        toolResultIds.add(entry.toolResult.toolCallId);
      }
    }
    for (const entry of activityLog) {
      if (entry.type === 'tool_call' && entry.toolCall) {
        if (!toolResultIds.has(entry.toolCall.id)) {
          return true;
        }
      }
    }
    return false;
  }, [activityLog]);

  useEffect(() => {
    hasPendingToolsRef.current = hasPendingTools;
  }, [hasPendingTools]);

  useEffect(() => {
    messageQueueRef.current = messageQueue;
  }, [messageQueue]);

  const isBusy = isProcessing || hasPendingTools;
  const stopHint = isBusy && !activeAskQuestion ? '[esc] to stop' : null;

  const pttStatus = voiceState?.isTalking ? 'talking' as const : pttTranscribing ? 'transcribing' as const : pttRecording ? 'recording' as const : null;

  // Show welcome banner only when no messages
  const showWelcome = messages.length === 0 && !isProcessing;

  const renderWidth = columns ? Math.max(1, columns - 2) : undefined;
  const wrapChars = renderWidth ?? MESSAGE_WRAP_CHARS;

  const displayMessages = useMemo(() => {
    const result: ReturnType<typeof buildDisplayMessages> = [];
    const seenIds = new Set<string>();

    for (const msg of messages) {
      // Skip duplicate messages (safety net)
      if (seenIds.has(msg.id)) continue;
      seenIds.add(msg.id);
      const signature = [
        msg.role,
        msg.content?.length ?? 0,
        msg.toolCalls?.length ?? 0,
        msg.toolResults?.length ?? 0,
        wrapChars,
        renderWidth ?? 0,
      ].join(':');
      // Use cached rendering if available to keep keys stable
      const cached = cachedDisplayMessagesRef.current.get(msg.id);
      if (cached && cached.signature === signature) {
        result.push(...cached.display);
        continue;
      }

      // Build display for this message
      const msgDisplay = buildDisplayMessages([msg], MESSAGE_CHUNK_LINES, wrapChars, { maxWidth: renderWidth });

      // Cache the result
      cachedDisplayMessagesRef.current.set(msg.id, { signature, display: msgDisplay });

      result.push(...msgDisplay);
    }

    return result;
  }, [messages, wrapChars, renderWidth]);

  // All messages render inside a <scrollbox> which handles overflow natively.

  const reservedLines = 12;
  const dynamicBudget = Math.max(6, rows - reservedLines);

  const streamingTrim = useMemo(() => {
    if (!isProcessing || !currentResponse.trim()) {
      return { messages: [], trimmed: false };
    }
    const streamingMessage: Message = {
      id: 'streaming-response',
      role: 'assistant',
      content: currentResponse,
      timestamp: now(),
    };
    const display = buildDisplayMessages([streamingMessage], MESSAGE_CHUNK_LINES, wrapChars, { maxWidth: renderWidth });
    return trimDisplayMessagesByLines(display, dynamicBudget, renderWidth);
  }, [currentResponse, isProcessing, wrapChars, renderWidth, dynamicBudget]);
  const streamingMessages = streamingTrim.messages;
  const streamingTrimmed = streamingTrim.trimmed;
  const streamingLineCount = useMemo(
    () => estimateDisplayMessagesLines(streamingMessages, renderWidth),
    [streamingMessages, renderWidth]
  );
  const activityTrim = useMemo(() => {
    const activityBudget = Math.max(4, dynamicBudget - streamingLineCount);
    return trimActivityLogByLines(activityLog, wrapChars, renderWidth, activityBudget);
  }, [activityLog, wrapChars, renderWidth, dynamicBudget, streamingLineCount]);

  // Historical message trimming is no longer needed — the <scrollbox> component
  // handles overflow natively with scroll, so all messages are rendered.

  // Process queue when not busy (not processing and no pending tools)
  // queueFlushTrigger forces re-evaluation when processing completes (done/error)
  useEffect(() => {
    if (!isBusy && activeQueue.length > 0 && activeInline.length === 0) {
      processQueue();
    }
  }, [isBusy, activeQueue.length, activeInline.length, processQueue, queueFlushTrigger]);

  // Scroll position is managed by the <scrollbox> component (stickyScroll)

  // Handle session switch
  const handleSessionSwitch = useCallback(async (sessionId: string) => {
    // Close selector IMMEDIATELY
    setShowSessionSelector(false);

    await switchToSession(sessionId);
  }, [switchToSession]);

  // Handle new session creation
  const handleNewSession = useCallback(async () => {
    // Close selector IMMEDIATELY - don't wait for async operations
    setShowSessionSelector(false);

    try {
      await createAndActivateSession({ cwd });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    }
  }, [cwd, createAndActivateSession]);

  const stopActiveProcessing = useCallback((status: 'stopped' | 'interrupted' = 'stopped') => {
    const active = registryRef.current.getActiveSession();
    if (!active) return false;

    const sessionProcessing = active.isProcessing;
    const shouldStopNow = (
      isProcessingRef.current ||
      hasPendingToolsRef.current ||
      sessionProcessing ||
      Boolean(currentToolCallRef.current)
    );
    if (!shouldStopNow) return false;

    active.client.stop();
    const finalized = finalizeResponse(status);
    if (finalized) {
      skipNextDoneRef.current = true;
    }
    resetTurnState();
    registryRef.current.setProcessing(active.id, false);
    setIsProcessing(false);
    isProcessingRef.current = false;
    setQueueFlushTrigger((prev) => prev + 1);
    return true;
  }, [finalizeResponse, resetTurnState]);


  // Gather exit stats for the session summary printed after Ink unmounts
  const gatherAndSetExitStats = useCallback(() => {
    const active = registryRef.current.getActiveSession();
    if (active) {
      setExitStats({
        sessionId: active.id,
        sessionLabel: active.label,
        startedAt: active.startedAt,
        tokenUsage,
        messageCount: messages.length,
        modelId: active.client.getModel() ?? undefined,
      });
    }
  }, [tokenUsage, messages.length]);

  // Handle keyboard shortcuts (inactive when session selector is shown)
  // Global keybindings resolve through the configurable engine (plan P3.2).
  // Bindings come from the defaults merged with any `keybindings` overrides in
  // config.json, so they're remappable; the handler bodies are unchanged.
  const globalKeymap = useMemo(
    () => loadUserKeymap(currentConfig as { keybindings?: Record<string, unknown> } | null),
    [currentConfig],
  );

  useInput((input, key) => {
    const action = resolveAction(globalKeymap, input, key);

    switch (action) {
      case 'app:pushToTalk':
        togglePushToTalk();
        return;

      case 'session:cycle':
        if (sessions.length > 0) {
          setShowSessionSelector(true);
        }
        return;

      case 'app:interrupt': {
        const hasAsk = activeSessionId ? askUserStateRef.current.has(activeSessionId) : false;
        const hasInterview = activeSessionId ? interviewStateRef.current.has(activeSessionId) : false;
        if (hasAsk) {
          cancelAskUser('Cancelled by user', activeSessionId);
        }
        if (hasInterview) {
          cancelInterview('Cancelled by user', activeSessionId);
        }
        if (stopActiveProcessing('stopped')) {
          // Reset exit hint state when stopping processing
          lastCtrlCRef.current = 0;
          setShowExitHint(false);
          return;
        }
        if (hasAsk || hasInterview) {
          return;
        }

        // Double Ctrl+C to exit (when not processing)
        const now = Date.now();
        const timeSinceLastCtrlC = now - lastCtrlCRef.current;
        if (timeSinceLastCtrlC < 1500 && lastCtrlCRef.current > 0) {
          // Double Ctrl+C - exit the app
          gatherAndSetExitStats();
          registry.closeAll();
          exit();
          return;
        }
        // First Ctrl+C - show hint and record timestamp
        lastCtrlCRef.current = now;
        setShowExitHint(true);
        // Hide hint after 2 seconds
        setTimeout(() => {
          setShowExitHint(false);
        }, 2000);
        return;
      }

      case 'app:toggleVerbose':
        setVerboseTools((prev) => !prev);
        return;

      case 'app:cancel': {
        // Escape: stop processing (falls through to no-op when nothing is active).
        if (activeSessionId && askUserStateRef.current.has(activeSessionId)) {
          cancelAskUser('Cancelled by user', activeSessionId);
        }
        if (activeSessionId && interviewStateRef.current.has(activeSessionId)) {
          cancelInterview('Cancelled by user', activeSessionId);
        }
        if (stopActiveProcessing('stopped')) {
          return;
        }
        return;
      }

      case 'panel:assistantsDashboard':
        setShowAssistantsDashboard(true);
        return;

      case 'panel:budget':
        void openBudgetsPanel();
        return;

      case 'panel:messages':
        // Ctrl+M can arrive as Enter on some terminals; guard against that.
        if (key.return) return;
        loadMessagesAndInboxData({
          cwd, registry: registry as any, activeSessionId, workspaceBaseDir, currentConfig,
          setMessagesList, setMessagesPanelError, setInboxEnabled, setInboxEmails, setInboxError,
          setShowMessagesPanel,
        } as any);
        setShowMessagesPanel(true);
        return;

      default:
        // Scrolling is handled by the <scrollbox> component via mouse wheel and arrow keys
        return;
    }
  }, { isActive: !showSessionSelector && !isPanelOpen });


  // Handle message submission
  const handleSubmit = useCallback(
    async (input: string, mode: 'normal' | 'interrupt' | 'queue' | 'inline' = 'normal') => {
      if (activeSessionId && askUserStateRef.current.has(activeSessionId)) {
        submitAskAnswer(input.trim());
        return;
      }
      if (!activeSession || !input.trim()) return;

      if (activeSessionId) {
        queueBlockedRef.current.delete(activeSessionId);
        const timer = queueBlockedTimersRef.current.get(activeSessionId);
        if (timer) {
          clearTimeout(timer);
          queueBlockedTimersRef.current.delete(activeSessionId);
        }
      }

      const trimmedInput = input.trim();

      // Check for $skill command - convert to /skill format
      if (trimmedInput.startsWith('$')) {
        const skillInput = '/' + trimmedInput.slice(1);
        // Continue with the converted input
        return handleSubmit(skillInput, mode);
      }

      // Shell passthrough: !<command> runs locally and reports output to the assistant
      if (trimmedInput.startsWith('!')) {
        const raw = trimmedInput.slice(1).trim();
        const shellCommand = raw.startsWith('[') && raw.endsWith(']')
          ? raw.slice(1, -1).trim()
          : raw;
        if (!shellCommand) {
          setError('Usage: !<command>');
          return;
        }
        try {
          const shellCwd = activeSession?.cwd || cwd;
          const result = await runShellCommand(shellCommand, shellCwd);
          const payload = formatShellResult(shellCommand, result);
          return handleSubmit(payload, mode);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          return;
        }
      }

      // Check for /exit command
      if (trimmedInput === '/exit') {
        gatherAndSetExitStats();
        registry.closeAll();
        exit();
        return;
      }

      // Intercept panel commands at terminal level for reliability.
      // These commands open interactive panels and should bypass the LLM entirely.
      const panelHandled = await handlePanelSlashCmd(trimmedInput, {
        cwd, activeSession, registry,
        setShowDocsPanel, setConnectorsPanelInitial, setShowConnectorsPanel,
        setHooksConfig, setShowHooksPanel, setShowConfigPanel, setShowModelPanel,
        setIdentityPanelIntent, setShowIdentityPanel, setShowOnboardingPanel,
        setMemoryError, setShowMemoryPanel, setGuardrailsConfig, setGuardrailsPolicies,
        setShowGuardrailsPanel, setShowSwarmPanel, setTasksList, setTasksPaused,
        setShowTasksPanel, setSchedulesList, setShowSchedulesPanel, setShowJobsPanel,
        setSkillsList, setShowSkillsPanel, setShowAssistantsPanel,
        setProjectsList, setActiveProjectId, setShowProjectsPanel,
        setPlansProject, setShowPlansPanel, setMessagesList, setMessagesPanelError,
        setInboxEnabled, setInboxEmails, setInboxError, setShowMessagesPanel,
        setShowWalletPanel, setShowSecretsPanel, setError, setMessages,
        hookStoreRef, guardrailsStoreRef,
        openBudgetsPanel, openWalletPanel, openSecretsPanel, loadConfigFiles,
      });
      if (panelHandled) return;

      // /workspace use|switch|clear handled locally for workspace scoping
      if (trimmedInput.startsWith('/workspace')) {
        const arg = trimmedInput.slice('/workspace'.length).trim();
        const parts = arg.split(/\s+/).filter(Boolean);
        const sub = parts[0]?.toLowerCase() || '';

        if (sub === 'use' || sub === 'switch') {
          const target = parts.slice(1).join(' ').trim();
          if (!target) {
            setError('Usage: /workspace use <id|name>');
            return;
          }
          const { SharedWorkspaceManager } = await import('@hasna/assistants-core');
          const mgr = new SharedWorkspaceManager();
          const all = mgr.list(true);
          const workspace = mgr.get(target)
            || all.find((ws) => ws.name.toLowerCase() === target.toLowerCase());
          if (!workspace) {
            setError(`Workspace not found: ${target}`);
            return;
          }
          setWorkspacesList(all);
          await switchWorkspace(workspace.id);
          return;
        }

        if (sub === 'clear' || sub === 'reset') {
          await switchWorkspace(null);
          return;
        }
      }

      // Check for /theme command — switch and persist the color theme
      if (trimmedInput === '/keys' || trimmedInput === '/keybindings') {
        // Auto-generated keybinding help from the active (possibly remapped) keymap.
        const rows = generateHelp(globalKeymap);
        const body = rows.length
          ? rows.map((r) => `  \`${r.keys.padEnd(10)}\` ${r.action}`).join('\n')
          : '  (no keybindings configured)';
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: 'assistant',
            content: `**Keybindings**\n\n${body}\n\nRemap any action via the \`keybindings\` map in config.json (set to \`none\` to disable).`,
            timestamp: now(),
          },
        ]);
        return;
      }

      if (trimmedInput === '/theme' || trimmedInput.startsWith('/theme ')) {
        const arg = trimmedInput.slice('/theme'.length).trim().toLowerCase();
        let setting: ThemeSettingName;
        if (arg === '' || arg === 'toggle') {
          // No arg (or "toggle"): flip between the two concrete modes, keeping
          // the current accessibility variant (e.g. dark-ansi → light-ansi).
          const current = getActiveTheme();
          const variant = current.endsWith('-daltonized')
            ? '-daltonized'
            : current.endsWith('-ansi')
              ? '-ansi'
              : '';
          setting = `${getThemeMode() === 'dark' ? 'light' : 'dark'}${variant}` as ThemeSettingName;
        } else if ((THEME_SETTINGS as readonly string[]).includes(arg)) {
          setting = arg as ThemeSettingName;
        } else {
          setError(
            `Usage: /theme <${THEME_SETTINGS.join('|')}|toggle> (current: ${getActiveTheme()})`,
          );
          return;
        }

        const resolved = applyThemeName(setting);

        // Persist to the global config.json (read-modify-write; non-fatal on error).
        try {
          const { join: joinPath } = await import('path');
          const { existsSync, readFileSync, writeFileSync, mkdirSync } = await import('fs');
          const dir = workspaceBaseDir || getConfigDir();
          const configPath = joinPath(dir, 'config.json');
          let cfg: Record<string, unknown> = {};
          if (existsSync(configPath)) {
            try { cfg = JSON.parse(readFileSync(configPath, 'utf-8')); } catch { cfg = {}; }
          } else {
            mkdirSync(dir, { recursive: true });
          }
          cfg.theme = setting;
          writeFileSync(configPath, JSON.stringify(cfg, null, 2));
        } catch {
          // Persistence is best-effort — the runtime switch still applies.
        }

        setThemeVersion((v) => v + 1); // force re-render so colors re-resolve
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: 'assistant',
            content: setting === 'auto'
              ? `Theme set to **auto** (resolved to **${resolved}** — ${themeSettingLabel(resolved)}).`
              : `Theme set to **${setting}** (${themeSettingLabel(setting)}).`,
            timestamp: now(),
          },
        ]);
        return;
      }

      // Check for /session command
      if (trimmedInput.startsWith('/sessions') || trimmedInput.startsWith('/session')) {
        const prefix = trimmedInput.startsWith('/sessions') ? '/sessions' : '/session';
        const arg = trimmedInput.slice(prefix.length).trim();
        const sessionParts = arg.split(/\s+/);
        const sessionSub = sessionParts[0]?.toLowerCase() || '';

        if (sessionSub === 'new') {
          // Parse --agent flag
          const agentIdx = sessionParts.indexOf('--agent');
          let label: string | undefined;
          let agentId: string | undefined;

          if (agentIdx !== -1 && sessionParts[agentIdx + 1]) {
            agentId = sessionParts[agentIdx + 1];
            const labelParts = sessionParts.slice(1, agentIdx);
            if (labelParts.length > 0) label = labelParts.join(' ');
          } else {
            const labelParts = sessionParts.slice(1);
            if (labelParts.length > 0) label = labelParts.join(' ');
          }

          await createAndActivateSession({
            cwd,
            label,
            assistantId: agentId,
          });
          return;
        }

        if (sessionSub === 'assign') {
          const agentName = sessionParts.slice(1).join(' ').trim();
          if (agentName && activeSession) {
            registry.assignAssistant(activeSession.id, agentName);
          }
          return;
        }

        if (sessionSub === 'rename' || sessionSub === 'name') {
          if (sessionParts.length < 2) {
            setError('Usage: /session rename [number] <label>');
            return;
          }

          let sessionNumber: number | undefined;
          let labelParts = sessionParts.slice(1);
          const firstArg = sessionParts[1];
          const parsedNumber = parseInt(firstArg, 10);
          if (!isNaN(parsedNumber) && parsedNumber > 0) {
            sessionNumber = parsedNumber;
            labelParts = sessionParts.slice(2);
          } else if (['current', 'this', '.'].includes(firstArg.toLowerCase())) {
            labelParts = sessionParts.slice(2);
          }

          const label = labelParts.join(' ').trim();
          if (!label) {
            setError('Usage: /session rename [number] <label>');
            return;
          }

          const target = sessionNumber ? sessions[sessionNumber - 1] : activeSession;
          if (!target) {
            setError('Failed to rename session: session not found');
            return;
          }
          registry.setLabel(target.id, label);
          return;
        }

        if (sessionSub === 'help') {
          // Let it fall through to the assistant loop for help text
        } else {
          const num = parseInt(sessionSub, 10);
          if (!isNaN(num) && num > 0 && num <= sessions.length) {
            await handleSessionSwitch(sessions[num - 1].id);
            return;
          }

          // No arg or 'list' - show session selector
          setShowSessionSelector(true);
          return;
        }
      }

      // QoL commands — extracted to commands/qolCommands.ts
      if (trimmedInput.startsWith('/export')) {
        const exportMsg = await handleExport(
          trimmedInput.slice('/export'.length).trim(),
          activeSession.id,
          activeSession.cwd,
          activeSession.client.getModel() ?? 'unknown',
          messages,
          tokenUsage,
        );
        setMessages((prev) => [...prev, exportMsg]);
        return;
      }

      if (trimmedInput === '/undo') {
        setMessages((prev) => [...prev, handleUndo(activeSession?.cwd || cwd)]);
        return;
      }

      if (trimmedInput === '/undo confirm') {
        setMessages((prev) => [...prev, handleUndoConfirm(activeSession?.cwd || cwd)]);
        return;
      }

      if (trimmedInput === '/pin' || trimmedInput.startsWith('/pin ')) {
        const result = handlePin(trimmedInput.slice('/pin'.length).trim(), messages, pinnedMessageIds.size);
        if (result.clear) {
          setPinnedMessageIds(new Set());
        } else if (result.pinId) {
          setPinnedMessageIds((prev) => { const next = new Set(prev); next.add(result.pinId!); return next; });
        }
        setMessages((prev) => [...prev, result.message]);
        return;
      }

      if (trimmedInput === '/pins') {
        setMessages((prev) => [...prev, handlePins(messages, pinnedMessageIds)]);
        return;
      }

      if (trimmedInput.startsWith('/replay')) {
        setMessages((prev) => [...prev, handleReplay(trimmedInput.slice('/replay'.length).trim(), messages)]);
        return;
      }

      if (trimmedInput.startsWith('/history')) {
        setMessages((prev) => [...prev, handleHistory(trimmedInput.slice('/history'.length).trim())]);
        return;
      }

      if (trimmedInput === '/templates') {
        setMessages((prev) => [...prev, handleTemplates()]);
        return;
      }

      // Handle /clear and /new entirely at terminal level for reliability.
      const isClearCommand = trimmedInput === '/clear' || trimmedInput === '/new' || trimmedInput.startsWith('/new ');

      if (isClearCommand) {
        // Stop any ongoing processing
        if (isProcessing) {
          activeSession.client.stop();
          const finalized = finalizeResponse('interrupted');
          if (finalized) {
            skipNextDoneRef.current = true;
          }
          resetTurnState();
          setIsProcessing(false);
          isProcessingRef.current = false;
          registry.setProcessing(activeSession.id, false);
          setQueueFlushTrigger((prev) => prev + 1);
          await new Promise((r) => setTimeout(r, 100));
        }

        // Clear UI state
        setMessageQueue((prev) => prev.filter((msg) => msg.sessionId !== activeSession.id));
        setInlinePending((prev) => prev.filter((msg) => msg.sessionId !== activeSession.id));
        pendingSendsRef.current = pendingSendsRef.current.filter(
          (entry) => entry.sessionId !== activeSession.id
        );
        setActivityLog([]);
        activityLogRef.current = [];
        setLastWorkedFor(undefined);
        setError(null);
        setCurrentResponse('');
        responseRef.current = '';
        toolCallsRef.current = [];
        toolResultsRef.current = [];

        clearSessionWindow();

        // Clear conversation on the client side (resets context, tokens, etc.)
        activeSession.client.clearConversation();

        // Show confirmation message, then clear all messages
        const templateArg = trimmedInput.startsWith('/new ') ? trimmedInput.slice('/new '.length).trim() : '';
        const templateDescriptions: Record<string, string> = {
          coding: 'Code generation, debugging, and refactoring',
          research: 'Deep research, analysis, and comparison',
          writing: 'Creative and technical writing',
        };
        const templateMatch = templateArg && templateDescriptions[templateArg];
        const confirmText = trimmedInput === '/clear'
          ? 'Conversation cleared. Starting fresh.'
          : templateMatch
          ? `Starting new conversation with **${templateArg}** template (${templateMatch}).`
          : 'Starting new conversation.';
        const confirmMessage = {
          id: generateId(),
          role: 'assistant',
          content: confirmText,
          timestamp: now(),
        } as Message;
        // /new → empty messages to show welcome banner; /clear → show confirmation
        setMessages(trimmedInput === '/clear' ? [confirmMessage] : []);

        // Update session UI state cache
        const cachedMessages = trimmedInput === '/clear' ? [confirmMessage] : [];
        sessionUIStates.current.set(activeSession.id, {
          messages: cachedMessages,
          currentResponse: '',
          activityLog: [],
          toolCalls: [],
          toolResults: [],
          tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, maxContextTokens: tokenUsage?.maxContextTokens || 200000 },
          voiceState,
          heartbeatState,
          identityInfo,
          processingStartTime: undefined,
          currentTurnTokens: 0,
          error: null,
          lastWorkedFor: undefined,
        });

        // Reset token usage display
        setTokenUsage({
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          maxContextTokens: tokenUsage?.maxContextTokens || 200000,
        });

        return;
      }

      // Queue mode: add to queue for later
      if (mode === 'queue') {
        if (!activeSessionId) return;
        const queuedId = generateId();
        setMessageQueue((prev) => [
          ...prev,
          {
            id: queuedId,
            sessionId: activeSessionId,
            content: trimmedInput,
            queuedAt: now(),
            mode: 'queued',
          },
        ]);
        setMessages((prev) => [
          ...prev,
          {
            id: queuedId,
            role: 'user',
            content: trimmedInput,
            timestamp: now(),
          },
        ]);
        return;
      }

      // Inline mode: send immediately (client will queue while processing)
      if (mode === 'inline') {
        if (!activeSessionId) return;
        const inlineId = generateId();
        setInlinePending((prev) => [
          ...prev,
          {
            id: inlineId,
            sessionId: activeSessionId,
            content: trimmedInput,
            queuedAt: now(),
            mode: 'inline',
          },
        ]);
        setMessages((prev) => [
          ...prev,
          {
            id: inlineId,
            role: 'user',
            content: trimmedInput,
            timestamp: now(),
          },
        ]);
        pendingSendsRef.current.push({ id: inlineId, sessionId: activeSessionId });
        try {
          await activeSession.client.send(trimmedInput);
        } catch (err) {
          clearPendingSend(inlineId, activeSessionId);
          setError(err instanceof Error ? err.message : String(err));
        }
        return;
      }

      // Interrupt mode: stop current and send immediately
      if (mode === 'interrupt' && isBusy) {
        stopActiveProcessing('interrupted');
        // Small delay to ensure stop propagates before immediate follow-up send
        await new Promise((r) => setTimeout(r, 100));
      }

      // Warn on unrecognized slash commands — avoid wasting API tokens. Registered
      // commands (incl. agent-handled panel commands like /webhooks) pass through.
      if (isUnrecognizedSlashCommand(trimmedInput, commands.map((c) => c.name))) {
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: 'assistant',
            content: `Unknown command: \`${trimmedInput}\`. Type \`/help\` to see available commands.`,
            timestamp: now(),
          },
        ]);
        return;
      }

      // Add user message
      const userMessage: Message = {
        id: generateId(),
        role: 'user',
        content: trimmedInput,
        timestamp: now(),
      };
      setMessages((prev) => {
        if (prev.some((msg) => msg.id === userMessage.id)) {
          return prev;
        }
        return [...prev, userMessage];
      });

      // Reset state
      skipNextDoneRef.current = false;
      setCurrentResponse('');
      responseRef.current = '';
      toolCallsRef.current = [];
      toolResultsRef.current = [];
      setError(null);
      setCurrentToolCall(undefined);
      setActivityLog([]);
      activityLogRef.current = [];
      const submitStartNow = Date.now();
      setProcessingStartTime(submitStartNow);
      processingStartTimeRef.current = submitStartNow; // Sync ref immediately for synchronous access
      setCurrentTurnTokens(0);
      setIsProcessing(true);
      isProcessingRef.current = true;

      // Mark session as processing
      registry.setProcessing(activeSession.id, true);

      // Send to assistant
      try {
        await activeSession.client.send(trimmedInput);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setIsProcessing(false);
        isProcessingRef.current = false;
        registry.setProcessing(activeSession.id, false);
      }
    },
    [
      activeSession,
      isProcessing,
      isBusy,
      registry,
      sessions,
      handleNewSession,
      handleSessionSwitch,
      createAndActivateSession,
      finalizeResponse,
      resetTurnState,
      activeSessionId,
      submitAskAnswer,
      clearPendingSend,
      stopActiveProcessing,
    ]
  );

  // Build panel render context and check if any panel is active
  const panelCtx: PanelRenderContext = {
    cwd, registry, activeSessionId, activeSession: activeSession ?? undefined, workspaceBaseDir, activeWorkspaceId,
    currentConfig, userConfig, projectConfig, localConfig,
    connectors, setConnectors, connectorsPanelInitial, connectorBridgeRef,
    tasksList, setTasksList, tasksPaused, setTasksPaused,
    schedulesList, setSchedulesList,
    skillsList, setSkillsList,
    assistantError, setAssistantError, setAssistantsRefreshKey,
    identityError, setIdentityError, identityPanelIntent, setIdentityPanelIntent, identitiesList, refreshIdentitiesList,
    memoryList, memoryStats, memoryError, refreshMemoryList,
    hooksConfig, setHooksConfig, hookStoreRef,
    guardrailsConfig, setGuardrailsConfig, guardrailsPolicies, setGuardrailsPolicies, guardrailsStoreRef,
    sessionBudgetStatus, setSessionBudgetStatus, swarmBudgetStatus, setSwarmBudgetStatus,
    budgetConfig, budgetTrackerRef, budgetProfiles, setBudgetProfiles,
    getSessionBudgetProfileId, applyBudgetProfileToSession,
    setMessages,
    assistantsList, setAssistantsList, registryStats, setRegistryStats,
    projectsList, setProjectsList, activeProjectId, setActiveProjectId,
    plansProject, setPlansProject,
    walletCards, setWalletCards, walletError, setWalletError, walletPanelInitialMode, toWalletCardEntry,
    secretsList, setSecretsList, secretsError, setSecretsError, secretsPanelInitialMode,
    messagesList, setMessagesList, messagesPanelError, setMessagesPanelError,
    inboxEmails, setInboxEmails, inboxError, setInboxError, inboxEnabled,
    workspacesList, setWorkspacesList, switchWorkspace,
    heartbeatRuns, setHeartbeatRuns, heartbeatState,
    resumeSessions, resumeFilter, resumeFromSavedSession, refreshResumeSessions,
    sessions, switchToSession, handleNewSession: handleNewSession,
    setIdentityInfo,
    setShowOnboardingPanel, setShowRecoveryPanel, setShowSessionSelector,
    setShowConnectorsPanel, setConnectorsPanelInitial,
    setShowTasksPanel, setShowSkillsPanel, setShowSchedulesPanel,
    setShowAssistantsPanel, setShowIdentityPanel, setShowMemoryPanel, setMemoryError,
    setShowHooksPanel, setShowGuardrailsPanel, setShowBudgetPanel,
    setShowModelPanel, setShowAssistantsRegistryPanel, setShowConfigPanel,
    setShowWebhooksPanel, setShowChannelsPanel, setShowPeoplePanel, setShowContactsPanel,
    setShowTelephonyPanel, setShowOrdersPanel, setShowJobsPanel, setShowDocsPanel,
    setShowMessagesPanel, setShowProjectsPanel, setShowPlansPanel,
    setShowWalletPanel, setShowSecretsPanel, setShowAssistantsDashboard,
    setShowSwarmPanel, setShowWorkspacePanel, setShowLogsPanel, setShowHeartbeatPanel, setShowResumePanel,
    setError,
    loadConfigFiles,
    recoverableSessions, handleRecover, handleStartFresh, handleOnboardingComplete, handleOnboardingCancel,
    showOnboardingPanel, showRecoveryPanel, showSessionSelector,
    showConnectorsPanel, showTasksPanel, showSkillsPanel, showSchedulesPanel,
    showAssistantsPanel, showIdentityPanel, showMemoryPanel, showHooksPanel,
    showGuardrailsPanel, showBudgetPanel, showModelPanel, showAssistantsRegistryPanel,
    showConfigPanel, showWebhooksPanel, showChannelsPanel, showPeoplePanel, showContactsPanel,
    showTelephonyPanel, showOrdersPanel, showJobsPanel, showDocsPanel,
    showMessagesPanel, showProjectsPanel, showPlansPanel, showWalletPanel, showSecretsPanel,
    showAssistantsDashboard, showSwarmPanel, showWorkspacePanel, showLogsPanel,
    showHeartbeatPanel, showResumePanel, isInitializing,
  };

  // Compute finish info for the last completed turn (OpenCode-style "■ Build · model · duration")
  // Must be before the panelElement early-return to keep hook ordering stable.
  const finishInfo = useMemo<FinishInfo | undefined>(() => {
    if (isProcessing || !lastWorkedFor) return undefined;
    const currentModelId = activeSession?.client.getModel() ?? undefined;
    const modelName = currentModelId ? getModelDisplayName(currentModelId) : undefined;
    return {
      variant: 'Build',
      modelName: modelName ?? currentModelId,
      duration: lastWorkedFor,
    };
  }, [isProcessing, lastWorkedFor, activeSession]);

  const panelElement = renderActivePanel(panelCtx);
  if (panelElement) {
    return panelElement;
  }

  // Build tool call entries for the box
  const toolCallEntries = activityLog
    .filter((e) => e.type === 'tool_call' && e.toolCall)
    .map((e) => {
      const result = activityLog.find(
        (r) => r.type === 'tool_result' && r.toolResult?.toolCallId === e.toolCall?.id
      )?.toolResult;
      return { toolCall: e.toolCall!, result };
    });

  // Check if currently thinking (no response and no tool calls yet)
  const isThinking = isProcessing && !currentResponse && !currentToolCall && toolCallEntries.length === 0;

  // Derive sidebar title — computed inline (not a hook) to avoid hooks ordering issues
  const sidebarTitle = activeSession?.label || (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user' && messages[i].content) {
        const text = messages[i].content.trim();
        return text.length > 60 ? text.slice(0, 57) + '...' : text;
      }
    }
    return undefined;
  })();

  // OpenCode layout: status bar = 1 row at bottom, split pane gets the rest
  const statusHeight = 1;
  const splitPaneHeight = rows - statusHeight;
  // Sidebar visible only when session active AND terminal wide enough
  const showSidebar = Boolean(activeSessionId) && columns >= 100;
  // 70/30 horizontal split per OpenCode spec
  const leftWidth = showSidebar ? Math.floor(columns * 0.7) : columns;
  const rightWidth = showSidebar ? columns - leftWidth : 0;
  // 90/10 vertical split: 90% messages, 10% editor (min 3 lines)
  const editorHeight = Math.max(3, Math.floor(splitPaneHeight * 0.1));
  const messagesHeight = splitPaneHeight - editorHeight;

  // --- Welcome / empty state: centered layout like OpenCode ---
  if (showWelcome) {
    const welcomeInputWidth = Math.min(80, columns - 4);
    const tips = [
      'Set any keybind to none to disable it completely',
      'Use /help to see all available commands',
      'Press Ctrl+L to clear the screen',
      'Use /sessions to switch between conversations',
      'Skills can automate complex multi-step workflows',
    ];
    const tipText = tips[Math.floor(Date.now() / 60000) % tips.length];

    return (
      <box flexDirection="column" height={rows} width={columns}>
        {/* Centered content area */}
        <box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
          {/* ASCII Logo */}
          <WelcomeBanner />

          {/* Input box — light gray bg, no borders */}
          <box flexDirection="column" width={welcomeInputWidth} marginTop={2}>
            <box flexDirection="row" backgroundColor={themeColor('surface')} paddingX={1} paddingY={0}>
              <Input
                ref={inputRef}
                onSubmit={handleSubmit}
                onStopProcessing={() => { stopActiveProcessing('stopped'); }}
                isProcessing={isBusy}
                queueLength={activeQueue.length + inlineCount}
                commands={commands}
                skills={skills}
                isAskingUser={false}
                onFileSearch={searchFiles}
                pasteConfig={currentConfig?.input?.paste ? {
                  enabled: currentConfig.input.paste.enabled,
                  thresholds: currentConfig.input.paste.thresholds,
                  mode: currentConfig.input.paste.mode as 'placeholder' | 'preview' | 'confirm' | 'inline' | undefined,
                } : undefined}
              />
            </box>

            {/* Keyboard shortcuts hint */}
            <box flexDirection="row" justifyContent="center" marginTop={1}>
              <text fg={themeColor('muted')}><b>tab</b> agents  <b>ctrl+p</b> commands</text>
            </box>

            {/* Tip */}
            <box flexDirection="row" justifyContent="center" marginTop={1}>
              <text fg={themeColor('warning')}>● </text>
              <text fg={themeColor('muted')}>Tip  {tipText}</text>
            </box>
          </box>
        </box>

        {/* Status bar at bottom — welcome mode */}
        <box height={1} width={columns}>
          <Status
            isProcessing={false}
            cwd={cwd}
            gitBranch={gitBranch}
            version={version}
            welcomeMode={true}
          />
        </box>
      </box>
    );
  }

  return (
    <box flexDirection="column" height={rows} width={columns}>
      {/* Split pane area (everything except status bar) */}
      <box flexDirection="column" height={splitPaneHeight} width={columns}>
        {/* Top section: horizontal split (messages + sidebar) */}
        <box flexDirection="row" height={messagesHeight} width={columns}>
          {/* Left panel: Messages — padding: top=1, right=1, bottom=0, left=1 */}
          <box flexDirection="column" width={leftWidth} paddingTop={1} paddingRight={1} paddingBottom={0} paddingLeft={1}>
            {/* Welcome banner — not shown here; handled by early return above */}

            {/* Background processing indicator */}
            {backgroundProcessingCount > 0 && (
              <box marginBottom={1}>
                <text fg={themeColor('warning')}>
                  {backgroundProcessingCount} session{backgroundProcessingCount > 1 ? 's' : ''} processing in background (Ctrl+] to switch)
                </text>
              </box>
            )}

            {/* Messages area — scrollbox enables scroll with mouse wheel, arrow keys, and stickyScroll auto-scrolls to bottom on new content */}
            <scrollbox flexGrow={1} stickyScroll={true} focused={!isPanelOpen && !askUserState && !interviewState}>
              {/* All messages rendered in a scrollable container */}
              <Messages
                key="all-messages"
                messages={displayMessages}
                currentResponse={undefined}
                streamingMessages={isProcessing ? streamingMessages : []}
                currentToolCall={undefined}
                lastToolResult={undefined}
                activityLog={isProcessing ? activityTrim.entries : []}
                queuedMessageIds={queuedMessageIds}
                verboseTools={verboseTools}
                finishInfo={finishInfo}
              />
            </scrollbox>

            {/* Ask-user simple interview */}
            {askUserState && activeAskQuestion && !interviewState && (
              <AskUserPanel
                sessionId={askUserState.sessionId}
                request={askUserState.request}
                question={activeAskQuestion}
                index={askUserState.index}
                total={askUserState.request.questions.length}
              />
            )}

            {/* Rich interview wizard */}
            {interviewState && interviewState.sessionId === activeSessionId && (
              <InterviewPanel
                request={interviewState.request}
                onComplete={completeInterview}
                onCancel={() => cancelInterview('Cancelled by user', activeSessionId)}
                isActive={!isPanelOpen}
              />
            )}

            {/* Error */}
            {error && <ErrorBanner error={error} showErrorCodes={SHOW_ERROR_CODES} />}

            {/* Processing indicator */}
            <ProcessingIndicator
              isProcessing={isProcessing}
              startTime={processingStartTime}
              tokenCount={currentTurnTokens}
              isThinking={isThinking}
            />

            {/* Finish line now rendered inside <Messages> as ■ Build · model · duration */}

            {/* Exit hint for double Ctrl+C */}
            {showExitHint && (
              <box marginLeft={2} marginBottom={0}>
                <text fg={themeColor('warning')}>(Press Ctrl+C again to exit)</text>
              </box>
            )}

            {/* Queue indicator - sticky above input */}
            <QueueIndicator
              messages={[...activeInline, ...activeQueue]}
              maxPreview={MAX_QUEUED_PREVIEW}
            />

            {stopHint && (
              <box marginLeft={2}>
                <text fg={themeColor('muted')}>{stopHint}</text>
              </box>
            )}
          </box>

          {/* Right panel: Sidebar (30%) — gray bg, only when session active AND terminal >= 100 cols */}
          {showSidebar && (
            <box flexDirection="column" width={rightWidth} paddingTop={1} paddingRight={1} paddingBottom={1} paddingLeft={1} backgroundColor={themeColor('surface')}>
              <Sidebar
                title={sidebarTitle}
                modelId={activeSession?.client.getModel() ?? undefined}
                cwd={activeSession?.cwd || cwd}
                modifiedFiles={modifiedFiles}
                tokenUsage={tokenUsage}
                gitBranch={gitBranch}
                appVersion={version}
              />
            </box>
          )}
        </box>

        {/* Bottom panel: Editor/Input — no border, bg matches main, never shrinks */}
        <box flexDirection="column" height={editorHeight} width={columns} flexShrink={0}>
          <Input
            ref={inputRef}
            onSubmit={handleSubmit}
            onStopProcessing={() => {
              stopActiveProcessing('stopped');
            }}
            isProcessing={isBusy}
            queueLength={activeQueue.length + inlineCount}
            commands={commands}
            skills={skills}
            isAskingUser={Boolean(activeAskQuestion) || Boolean(interviewState && interviewState.sessionId === activeSessionId)}
            askPlaceholder={askPlaceholder}
            allowBlankAnswer={activeAskQuestion?.required === false}
            assistantName={identityInfo?.assistant?.name || undefined}
            isRecording={pttRecording}
            recordingStatus={pttStatus}
            onStopRecording={togglePushToTalk}
            onFileSearch={searchFiles}
            partialTranscript={partialTranscript}
            pasteConfig={currentConfig?.input?.paste ? {
              enabled: currentConfig.input.paste.enabled,
              thresholds: currentConfig.input.paste.thresholds,
              mode: currentConfig.input.paste.mode as 'placeholder' | 'preview' | 'confirm' | 'inline' | undefined,
            } : undefined}
          />
        </box>
      </box>

      {/* Status bar: exactly 1 row at bottom, OUTSIDE the split pane */}
      <box height={statusHeight} width={columns}>
        <Status
          isProcessing={isBusy}
          cwd={activeSession?.cwd || cwd}
          queueLength={activeQueue.length + inlineCount}
          tokenUsage={tokenUsage}
          modelId={activeSession?.client.getModel() ?? undefined}
          agentName={identityInfo?.assistant?.name || activeSession?.assistantId || undefined}
          voiceState={voiceState}
          heartbeatState={heartbeatState}
          identityInfo={identityInfo}
          sessionIndex={sessionIndex}
          sessionCount={sessionCount}
          backgroundProcessingCount={backgroundProcessingCount}
          processingStartTime={processingStartTime}
          verboseTools={verboseTools}
          gitBranch={gitBranch}
          recentTools={activityLog
            .filter((e) => e.type === 'tool_call' && e.toolCall)
            .slice(-8)
            .map((e) => {
              const hasResult = activityLog.some(
                (r) => r.type === 'tool_result' && r.toolResult?.toolCallId === e.toolCall!.id
              );
              return {
                name: e.toolCall!.name,
                status: hasResult ? ('succeeded' as const) : ('running' as const),
                durationMs: 0,
                startedAt: e.timestamp,
              };
            })}
        />
      </box>
    </box>
  );
}
