import type { Message, Tool, StreamChunk, ToolCall, ToolResult, AssistantsConfig, ScheduledCommand, VoiceState, ActiveIdentityInfo, HeartbeatState } from '@hasna/assistants-shared';
import { generateId } from '@hasna/assistants-shared';
import { join } from 'path';
import { AssistantContext } from './context';
import { PendingContext } from './pending-context';
import { ManagerContainer } from './manager-container';
import {
  ContextManager,
  ContextInjector,
  HybridSummarizer,
  LLMSummarizer,
  TokenCounter,
  type ContextConfig,
  type ContextInfo,
  type ContextInjectionConfig,
} from '../context';
import { ToolRegistry } from '../tools/registry';
import { ConnectorBridge, registerConnectorExecuteTool, registerConnectorsListTool, registerConnectorsSearchTool } from '../tools/connector';
import { registerConnectorAutoRefreshTool } from '../tools/connector-refresh';
import { registerConfigTools } from '../tools/config';
import { registerAssistantTools } from '../tools/assistant';
import { registerIdentityTools } from '../tools/identity';
import { registerModelTools } from '../tools/model';

import { registerHeartbeatTools } from '../tools/heartbeat';
import { registerContextEntryTools } from '../tools/context-entries';
import { registerSecurityTools } from '../tools/security';
import { getSecurityLogger } from '../security/logger';
import { registerLogsTools } from '../tools/logs';
import { registerVerificationTools } from '../tools/verification';
import { BashTool } from '../tools/bash';
import { FilesystemTools } from '../tools/filesystem';
import { WebTools } from '../tools/web';
import { FeedbackTool } from '../tools/feedback';
import { registerSchedulerTools, type SchedulerContext } from '../tools/scheduler';
import { ImageTools } from '../tools/image';
import { AudioTools } from '../tools/audio';
import { MarkdownTools } from '../tools/markdown';
import { SpreadsheetTools } from '../tools/spreadsheet';
import { WorkflowTools } from '../tools/workflows';
import { SkillTool, SkillInstallTool, SkillUninstallTool, createSkillListTool, createSkillReadTool, createSkillExecuteTool } from '../tools/skills';
import { createAskUserTool, type AskUserHandler, type InterviewHandler } from '../tools/ask-user';
import { WaitTool, SleepTool } from '../tools/wait';
import { NotifyTool } from '../tools/notify';
import { TmuxTools } from '../tools/tmux';
import { DiffTool } from '../tools/diff';
import { runHookAssistant } from './subagent';
import { SkillLoader } from '../skills/loader';
import { SkillExecutor } from '../skills/executor';
import { ExtensionLoader } from '../extensions/loader';
import {
  HookLoader,
  HookExecutor,
  HookStore,
  HookCliBridge,
  nativeHookRegistry,
  ScopeContextManager,
  createScopeVerificationHook,
  registerHooksTools,
} from '../hooks';
import { CommandLoader, CommandExecutor, BuiltinCommands, type TokenUsage, type CommandContext, type CommandResult } from '../commands';
import { createLLMClient, type AISDKExecutableTool, type LLMClient } from '../llm/client';
import { loadConfig, loadSystemPrompt, ensureConfigDir, getConfigDir } from '../config';
import { getDatabase, closeDatabase } from '../database';
import { backupIfNeeded } from '../database/backup';
import { migrateIfNeeded } from '../database/migrate';
import {
  HeartbeatManager,
  StatePersistence,
  RecoveryManager,
  createAutoScheduleHeartbeatHook,
  ensureWatchdogSchedule,
  installHeartbeatSkills,
  type AssistantState,
  type Heartbeat,
  type HeartbeatConfig as HeartbeatRuntimeConfig,
} from '../heartbeat';

import { AssistantError, ErrorAggregator, ErrorCodes, type ErrorCode } from '../errors';
import { expandFileReferences } from './file-references';
import { configureLimits, enforceMessageLimit, getLimits } from '../validation/limits';
import { validateToolCalls } from '../validation/llm-response';
import {
  getDueSchedules,
  computeNextRun,
  readSchedule,
  updateSchedule,
} from '../scheduler/store';
import { ConnectorAutoRefreshManager } from '../connectors/auto-refresh';
import { VoiceManager } from '../voice/manager';
import { AssistantManager, IdentityManager } from '../identity';
import { createInboxManager, registerInboxTools, createSdkInboxAdapter, type InboxManager } from '../inbox';
import { createWalletManager, registerWalletTools, type WalletManager } from '../wallet';
import { createSecretsManager, registerSecretsTools, type SecretsManager } from '../secrets';
import { JobManager, createJobTools } from '../jobs';
import { createMessagesManager, registerMessagesTools, type MessagesManager } from '../messages';
import { registerConversationsSpacesTools } from '../tools/conversations';
import { registerAllSdkTools } from '../tools/sdk-tools';
// createConversationsAdapter loaded dynamically — @hasna/conversations has module-level side effects
// that interfere with Anthropic SDK async generator streaming
// @hasna/conversations loaded dynamically to avoid module-level side effects
// that interfere with Anthropic SDK async generator streaming
import { createWebhooksManager, registerWebhookTools, type WebhooksManager } from '../webhooks';
import { createChannelsManager, registerChannelTools, ChannelAgentPool, type ChannelsManager } from '../channels';
import { createPeopleManager, registerPeopleTools, type PeopleManager } from '../people';
import { createTelephonyManager, registerTelephonyTools, type TelephonyManager } from '../telephony';
import { createOrdersManager, registerOrderTools, type OrdersManager } from '../orders';
import { registerContactsTools } from '../contacts';
import { registerSessionTools, type SessionContext, type SessionQueryFunctions } from '../sessions';
import { generateSessionName } from '../sessions/auto-name';
import { registerProjectTools, type ProjectToolContext } from '../tools/projects';
import { registerSelfAwarenessTools } from '../tools/self-awareness';
import { registerMemoryTools } from '../tools/memory';
import { registerBookmarkTools } from '../tools/bookmarks';
import { registerCalendarTools } from '../tools/calendar';
import { MemoryStore } from '../memory/mementos-adapter';
import { registerAssistantTools as registerAssistantSpawnTools } from '../tools/agents';
import { registerAssistantRegistryTools } from '../tools/agent-registry';
import { registerCapabilityTools } from '../tools/capabilities';
import { registerVoiceTools } from '../tools/voice';
import { registerTaskTools } from '../tools/tasks';
import { registerSwarmTools, type SwarmToolContext } from '../tools/swarm';
import { SwarmCoordinator, type SwarmCoordinatorContext } from '../swarm/coordinator';
import { GlobalMemoryManager, MemoryInjector, type MemoryConfig } from '../memory';
import { SubassistantManager, type SubassistantManagerContext, type SubassistantResult, type SubassistantLoopConfig } from './subagent-manager';
import { SessionStore } from '../sessions/store';
import { StatsTracker } from './stats';
import { BudgetTracker, DEFAULT_BUDGET_CONFIG, registerBudgetTools, type BudgetScope } from '../budget';
import { PolicyEvaluator, GuardrailsStore, registerGuardrailsTools, type GuardrailsConfig, type PolicyEvaluationResult } from '../guardrails';
import { getGlobalRegistry, type AssistantRegistryService, type RegisteredAssistant, type AssistantType } from '../registry';
import { CapabilityEnforcer, type CapabilityEnforcementResult } from '../capabilities';
import type { BudgetConfig, CapabilitiesConfigShared } from '@hasna/assistants-shared';

function orderToolResults(toolCalls: ToolCall[], results: ToolResult[]): ToolResult[] {
  const resultsById = new Map<string, ToolResult>();
  for (const result of results) {
    resultsById.set(result.toolCallId, result);
  }
  return toolCalls
    .map((call) => resultsById.get(call.id))
    .filter(Boolean) as ToolResult[];
}

export interface AssistantLoopOptions {
  config?: AssistantsConfig;
  cwd?: string;
  sessionId?: string;
  assistantId?: string;
  allowedTools?: string[];
  extraSystemPrompt?: string;
  llmClient?: LLMClient;
  /** Override the model from config (e.g., assistant-specific model selection) */
  model?: string;
  /** Maximum turns per processing loop (default: 50) */
  maxTurns?: number;
  /** Optional base path for workspace-scoped storage */
  storageDir?: string;
  /** Optional workspace identifier for scoping */
  workspaceId?: string | null;
  onChunk?: (chunk: StreamChunk) => void;
  onToolStart?: (toolCall: ToolCall) => void;
  onToolEnd?: (toolCall: ToolCall, result: ToolResult) => void;
  onTokenUsage?: (usage: TokenUsage) => void;
  /** Session context for session management tools (userId, query functions) */
  sessionContext?: {
    userId: string;
    queryFn: SessionQueryFunctions;
  };
  /** Subassistant depth level (0 = root assistant, used internally) */
  depth?: number;
  /** Budget configuration for resource limits */
  budgetConfig?: BudgetConfig;
  /** Callback when budget warning/exceeded occurs */
  onBudgetWarning?: (warning: string) => void;
  /** Guardrails configuration for security policies */
  guardrailsConfig?: GuardrailsConfig;
  /** Callback when guardrails violation occurs */
  onGuardrailsViolation?: (result: PolicyEvaluationResult, toolName: string) => void;
  /** Callback when session auto-name is generated */
  onSessionLabel?: (sessionId: string, label: string) => void;
}

/**
 * Main assistant loop - orchestrates the conversation
 */
export class AssistantLoop {
  private static readonly CONNECTOR_INSTALL_PATTERN = /\b(connect-[a-z0-9._-]+(?:@[a-z0-9._-]+)?|@hasna\/[a-z0-9._-]+(?:@[a-z0-9._-]+)?)\b/i;
  private context: AssistantContext;
  private contextManager: ContextManager | null = null;
  private contextConfig: ContextConfig | null = null;
  private heartbeatManager: HeartbeatManager | null = null;
  private heartbeatPersistence: StatePersistence | null = null;
  private heartbeatRecovery: RecoveryManager | null = null;
  private heartbeatRuntimeConfig: HeartbeatRuntimeConfig | null = null;
  private lastUserMessage: string | null = null;
  private lastToolName: string | null = null;
  private pendingToolCalls: Map<string, string> = new Map();

  private toolRegistry: ToolRegistry;
  private connectorBridge: ConnectorBridge;
  private skillLoader: SkillLoader;
  private skillExecutor: SkillExecutor;
  private extensionLoader: ExtensionLoader;
  private hookLoader: HookLoader;
  private hookExecutor: HookExecutor;
  private scopeContextManager: ScopeContextManager;
  private commandLoader: CommandLoader;
  private commandExecutor: CommandExecutor;
  private builtinCommands: BuiltinCommands;
  private llmClient: LLMClient | null = null;
  private config: AssistantsConfig | null = null;
  private allowedTools: Set<string> | null = null;
  private currentAllowedTools: Set<string> | null = null;
  private extraSystemPrompt: string | null = null;
  private cwd: string;
  private sessionId: string;
  private sessionStartTime: number = Date.now();
  private initialized = false;
  private isRunning = false;
  private shouldStop = false;
  private cumulativeTurns = 0;
  private userMessageCount = 0;    // total user turns in this session (for drift detection)
  private sessionTopicWords: Set<string> = new Set(); // keywords from first 3 messages
  private inTalkMode = false;
  private emittedTerminalChunk = false;
  private toolAbortController: AbortController | null = null;
  private systemPrompt: string | null = null;
  private connectorDiscovery: Promise<unknown> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private scheduledQueue: ScheduledCommand[] = [];
  private drainingScheduled = false;
  private errorAggregator = new ErrorAggregator();
  private mgr = new ManagerContainer();
  private channelAgentPool: ChannelAgentPool | null = null;
  private memoryInjector: MemoryInjector | null = null;
  private contextInjector: ContextInjector | null = null;
  private pendingCtx = new PendingContext();
  private subassistantManager: SubassistantManager | null = null;
  private depth: number = 0;
  private static readonly MAX_CUMULATIVE_TURNS = 100;
  private identityContext: string | null = null;
  private projectContext: string | null = null;
  private activeProjectId: string | null = null;
  private assistantId: string | null = null;
  private storageDir: string;
  private workspaceId: string | null;
  private askUserHandler: AskUserHandler | null = null;
  private interviewHandler: InterviewHandler | null = null;
  private sessionContextOptions: { userId: string; queryFn: SessionQueryFunctions } | null = null;
  private modelOverride: string | null = null;
  private budgetTracker: BudgetTracker | null = null;
  private budgetConfig: BudgetConfig | null = null;
  private policyEvaluator: PolicyEvaluator | null = null;
  private guardrailsConfig: GuardrailsConfig | null = null;
  private onGuardrailsViolation?: (result: PolicyEvaluationResult, toolName: string) => void;
  private capabilityEnforcer: CapabilityEnforcer | null = null;
  private capabilitiesConfig: CapabilitiesConfigShared | null = null;
  private onCapabilityViolation?: (result: CapabilityEnforcementResult, context: string) => void;
  private registryService: AssistantRegistryService | null = null;
  private registeredAssistantId: string | null = null;
  private swarmCoordinator: SwarmCoordinator | null = null;
  private statsTracker: StatsTracker;
  private paused = false;
  private pauseResolve: (() => void) | null = null;
  private pendingPermissionMode: 'normal' | 'plan' | 'auto-accept' | null = null;
  private maxTurnsPerRun = 50;

  // Event callbacks
  private onChunk?: (chunk: StreamChunk) => void;
  private onToolStart?: (toolCall: ToolCall) => void;
  private onToolEnd?: (toolCall: ToolCall, result: ToolResult) => void;
  private onTokenUsage?: (usage: TokenUsage) => void;
  private onBudgetWarning?: (warning: string) => void;
  private onSessionLabel?: (sessionId: string, label: string) => void;
  private sessionAutoNamed = false;

  constructor(options: AssistantLoopOptions = {}) {
    this.storageDir = options.storageDir ?? getConfigDir();
    this.workspaceId = options.workspaceId ?? null;
    this.cwd = options.cwd || process.cwd();
    this.sessionId = options.sessionId || generateId();
    this.assistantId = options.assistantId || null;
    this.depth = options.depth ?? 0;
    this.context = new AssistantContext();
    this.toolRegistry = new ToolRegistry();
    this.toolRegistry.setErrorAggregator(this.errorAggregator);
    this.connectorBridge = new ConnectorBridge(this.cwd);
    this.skillLoader = new SkillLoader();
    this.skillExecutor = new SkillExecutor();
    this.extensionLoader = new ExtensionLoader();
    this.hookLoader = new HookLoader();
    this.hookExecutor = new HookExecutor();
    this.scopeContextManager = new ScopeContextManager();
    this.commandLoader = new CommandLoader(this.cwd);
    this.commandExecutor = new CommandExecutor(this.commandLoader);
    this.builtinCommands = new BuiltinCommands();
    this.statsTracker = new StatsTracker(this.sessionId);
    this.allowedTools = this.normalizeAllowedTools(options.allowedTools);
    this.extraSystemPrompt = options.extraSystemPrompt || null;
    this.llmClient = options.llmClient ?? null;
    this.modelOverride = options.model || null;
    if (typeof options.maxTurns === 'number' && options.maxTurns > 0) {
      const normalized = Math.floor(options.maxTurns);
      this.maxTurnsPerRun = Math.min(normalized, AssistantLoop.MAX_CUMULATIVE_TURNS);
    }
    this.sessionContextOptions = options.sessionContext || null;

    this.onChunk = options.onChunk;
    this.onToolStart = options.onToolStart;
    this.onToolEnd = options.onToolEnd;
    this.onTokenUsage = options.onTokenUsage;
    this.onBudgetWarning = options.onBudgetWarning;
    this.onSessionLabel = options.onSessionLabel;
    this.budgetConfig = options.budgetConfig || null;
    this.guardrailsConfig = options.guardrailsConfig || null;
    this.onGuardrailsViolation = options.onGuardrailsViolation;

    // Initialize budget tracker if config provided
    if (this.budgetConfig) {
      this.budgetTracker = new BudgetTracker(this.sessionId, this.budgetConfig);
    }

    // Initialize policy evaluator if config provided
    if (this.guardrailsConfig) {
      this.policyEvaluator = new PolicyEvaluator(this.guardrailsConfig);
    }
  }

  /**
   * Get the active assistant's identity info for subsystem initialization.
   */
  private getAssistantIdentity(): { id: string; name: string } {
    const assistant = this.mgr.assistant?.getActive();
    return {
      id: assistant?.id || this.sessionId,
      name: assistant?.name || 'assistant',
    };
  }

  /**
   * Initialize the assistant (parallelized for fast startup)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // Phase 1: Load config, ensure directories, and initialize database
    const [config] = await Promise.all([
      loadConfig(this.cwd, this.storageDir),
      ensureConfigDir(this.sessionId, this.storageDir),
    ]);
    this.config = config;

    // Apply pending permission mode from CLI flag (set before initialize)
    if (this.pendingPermissionMode) {
      if (!this.config.permissions) {
        this.config.permissions = {};
      }
      this.config.permissions.mode = this.pendingPermissionMode;
      this.pendingPermissionMode = null;
    }

    // Initialize the unified SQLite database (creates ~/.hasna/assistants/assistants.db on first run)
    const db = getDatabase();
    // Run one-time migration from old stores if needed
    migrateIfNeeded(db, this.storageDir);
    // Create daily backup if none exists for today
    backupIfNeeded(db, this.storageDir);
    // Apply model override if provided (e.g., assistant-specific model selection)
    if (this.modelOverride) {
      this.config = {
        ...this.config,
        llm: {
          ...this.config.llm,
          model: this.modelOverride,
        },
      };
    }
    configureLimits(this.config.validation);
    this.toolRegistry.setValidationConfig(this.config.validation);
    this.contextConfig = this.buildContextConfig(this.config);
    this.context.setMaxMessages(this.contextConfig.maxMessages);
    this.builtinCommands.updateTokenUsage({ maxContextTokens: this.contextConfig.maxContextTokens });
    // Always create a VoiceManager so /talk works.
    // If voice config is provided, use it. Otherwise, fall back to sensible defaults:
    //   STT: whisper (uses OPENAI_API_KEY), TTS: openai (uses OPENAI_API_KEY),
    //   or system TTS if no API key is available.
    {
      const voiceConfig = this.config.voice ?? {
        enabled: false,
        stt: { provider: 'whisper' as const },
        tts: {
          provider: (process.env.OPENAI_API_KEY ? 'openai' : 'system') as 'openai' | 'system',
          voiceId: process.env.OPENAI_API_KEY ? 'nova' : undefined,
        },
      };
      this.mgr.voice = new VoiceManager(voiceConfig);
    }
    // Initialize budget tracker from config if not already set via options
    if (!this.budgetTracker && this.config.budget) {
      this.budgetConfig = this.config.budget;
      this.budgetTracker = new BudgetTracker(this.sessionId, this.budgetConfig);
    } else if (this.budgetTracker && this.config.budget) {
      // Merge config budget with options budget (options take precedence)
      this.budgetConfig = { ...this.config.budget, ...this.budgetConfig };
      this.budgetTracker.updateConfig(this.budgetConfig);
    }
    // Initialize guardrails evaluator from config if not already set via options
    if (!this.policyEvaluator && this.config.guardrails) {
      this.guardrailsConfig = this.config.guardrails as GuardrailsConfig;
      this.policyEvaluator = new PolicyEvaluator(this.guardrailsConfig);
    } else if (this.policyEvaluator && this.config.guardrails) {
      // Merge config guardrails with options guardrails (options take precedence)
      this.guardrailsConfig = { ...this.config.guardrails, ...this.guardrailsConfig } as GuardrailsConfig;
      this.policyEvaluator.updateConfig(this.guardrailsConfig);
    }
    // Initialize capability enforcer from config
    if (!this.capabilityEnforcer && this.config.capabilities) {
      this.capabilitiesConfig = this.config.capabilities as CapabilitiesConfigShared;
      this.capabilityEnforcer = new CapabilityEnforcer(this.capabilitiesConfig);
    } else if (this.capabilityEnforcer && this.config.capabilities) {
      this.capabilitiesConfig = { ...this.config.capabilities, ...this.capabilitiesConfig } as CapabilitiesConfigShared;
      this.capabilityEnforcer.updateConfig(this.capabilitiesConfig);
    }
    // Initialize context injector if enabled
    const injectionConfig = this.config.context?.injection;
    if (injectionConfig?.enabled !== false) {
      this.contextInjector = new ContextInjector(this.cwd, injectionConfig as Partial<ContextInjectionConfig>);
    }
    await this.initializeIdentitySystem();
    await ConnectorAutoRefreshManager.getInstance().start();

    // Normalize connectors config to extract enabled list
    const connectorsConfig = this.config.connectors;
    let connectorNames: string[] | undefined;
    if (connectorsConfig) {
      if (Array.isArray(connectorsConfig)) {
        // String array format (backwards compatible)
        connectorNames = connectorsConfig.length > 0 && !connectorsConfig.includes('*')
          ? connectorsConfig
          : undefined;
      } else if (connectorsConfig.enabled && connectorsConfig.enabled.length > 0) {
        // Object format with enabled list
        connectorNames = !connectorsConfig.enabled.includes('*')
          ? connectorsConfig.enabled
          : undefined;
      }
    }

    // Fast discovery (PATH scan only) so connector tools are available immediately.
    this.connectorBridge.fastDiscover(connectorNames);
    this.connectorBridge.registerAll(this.toolRegistry, connectorsConfig);

    // Start connector discovery in the background so chat can start immediately.
    this.connectorDiscovery = this.connectorBridge.discover(connectorNames)
      .then(() => {
        this.connectorBridge.registerAll(this.toolRegistry, connectorsConfig);
      })
      .catch(() => {});

    // Phase 2: All independent async operations in parallel (excluding connectors)
    const llmClientPromise = this.llmClient
      ? Promise.resolve(this.llmClient).then((client) => {
          this.hookExecutor.setLLMClient(client);
          return client;
        })
      : createLLMClient(this.config.llm).then((client) => {
          this.llmClient = client;
          this.hookExecutor.setLLMClient(client);
          return client;
        });

    const [, , , systemPrompt] = await Promise.all([
      llmClientPromise,
      // Load skills metadata (descriptions only)
      this.skillLoader.loadAll(this.cwd, { includeContent: false }),
      // Placeholder for hooks (now loaded from SQLite below)
      Promise.resolve(),
      // Load system prompt
      loadSystemPrompt(this.cwd, this.storageDir),
      // Load commands
      this.commandLoader.loadAll(),
    ]);

    // Load hooks from SQLite via HookStore
    const hookStore = new HookStore();
    const hooksConfig = hookStore.loadAll();

    if (this.llmClient && this.contextConfig) {
      const summaryClient = await this.buildSummaryClient(this.contextConfig);
      const tokenCounter = new TokenCounter(this.llmClient.getModel());
      const llmSummarizer = new LLMSummarizer(summaryClient, {
        maxTokens: this.contextConfig.summaryMaxTokens,
        tokenCounter,
      });
      const summarizer =
        this.contextConfig.summaryStrategy === 'hybrid'
          ? new HybridSummarizer(llmSummarizer)
          : llmSummarizer;
      this.contextManager = new ContextManager(this.contextConfig, summarizer, tokenCounter);
    }

    // Phase 3: Sync operations (fast)
    // Register built-in tools
    this.toolRegistry.register(BashTool.tool, BashTool.executor);
    FilesystemTools.registerAll(this.toolRegistry, this.sessionId, this.config.workspace);
    WebTools.registerAll(this.toolRegistry);
    ImageTools.registerAll(this.toolRegistry);
    AudioTools.registerAll(this.toolRegistry);
    MarkdownTools.registerAll(this.toolRegistry);
    SpreadsheetTools.registerAll(this.toolRegistry);
    WorkflowTools.registerAll(this.toolRegistry);
    this.toolRegistry.register(SkillTool.tool, SkillTool.executor);
    this.toolRegistry.register(SkillInstallTool.tool, SkillInstallTool.executor);
    this.toolRegistry.register(SkillUninstallTool.tool, SkillUninstallTool.executor);
    const skillListTool = createSkillListTool(() => this.skillLoader);
    this.toolRegistry.register(skillListTool.tool, skillListTool.executor);
    const skillReadTool = createSkillReadTool(() => this.skillLoader);
    this.toolRegistry.register(skillReadTool.tool, skillReadTool.executor);
    const skillExecuteTool = createSkillExecuteTool(() => this.skillLoader);
    this.toolRegistry.register(skillExecuteTool.tool, skillExecuteTool.executor);
    // Skills + Connectors registry tools (dynamically loaded to avoid import side effects)
    try {
      const [{ createSkillsRegistrySearchTool, createSkillsRegistryListTool, createSkillsRegistryInstallTool },
             { registerConnectorsRegistryTools }] = await Promise.all([
        import('../tools/skills-registry'),
        import('../tools/connectors-registry'),
      ]);
      const skillsRegSearch = createSkillsRegistrySearchTool();
      this.toolRegistry.register(skillsRegSearch.tool, skillsRegSearch.executor);
      const skillsRegList = createSkillsRegistryListTool();
      this.toolRegistry.register(skillsRegList.tool, skillsRegList.executor);
      const skillsRegInstall = createSkillsRegistryInstallTool(this.cwd);
      this.toolRegistry.register(skillsRegInstall.tool, skillsRegInstall.executor);
      registerConnectorsRegistryTools(this.toolRegistry, this.cwd);
    } catch {
      // Registry tools unavailable
    }
    const askUserTool = createAskUserTool(() => this.askUserHandler, () => this.interviewHandler);
    this.toolRegistry.register(askUserTool.tool, askUserTool.executor);
    this.toolRegistry.register(FeedbackTool.tool, FeedbackTool.executor);

    // Register scheduler tools with session context
    registerSchedulerTools(this.toolRegistry, () => ({
      sessionId: this.sessionId,
      cwd: this.cwd,
    }));

    this.toolRegistry.register(WaitTool.tool, WaitTool.executor);
    this.toolRegistry.register(SleepTool.tool, SleepTool.executor);
    this.toolRegistry.register(NotifyTool.tool, NotifyTool.executor);
    this.toolRegistry.register(TmuxTools.tool, TmuxTools.executor);
    this.toolRegistry.register(DiffTool.tool, DiffTool.executor);

    // Register all @hasna/* SDK-backed tools (economy, sessions, emails, prompts, etc.)
    // All imports are lazy inside executors — no module-level side effects
    registerAllSdkTools(this.toolRegistry);

    // Startup schema validation — warn on any malformed tool schemas (never throws)
    this.toolRegistry.validateAll();

    // Initialize inbox — prefer native config, then try @hasna/emails SDK adapter
    if (this.config?.inbox?.enabled) {
      const { id: assistantId, name: assistantName } = this.getAssistantIdentity();
      this.mgr.inbox = createInboxManager(
        assistantId,
        assistantName,
        this.config.inbox,
        this.storageDir
      );
      registerInboxTools(this.toolRegistry, () => this.mgr.inbox);
    } else {
      // [nero] Try SDK-backed inbox when native inbox config is not enabled
      const { id: assistantId } = this.getAssistantIdentity();
      createSdkInboxAdapter(assistantId).then((adapter) => {
        if (adapter) {
          this.mgr.inbox = adapter as any; // SdkInboxAdapter implements same public API
        }
      }).catch(() => { /* SDK not available — inbox stays null */ });
    }

    // Initialize wallet if enabled
    if (this.config?.wallet?.enabled) {
      const { id: assistantId } = this.getAssistantIdentity();
      this.mgr.wallet = createWalletManager(assistantId, this.config.wallet, this.storageDir);
      registerWalletTools(this.toolRegistry, () => this.mgr.wallet);
    }

    // Initialize secrets if enabled — SDK adapter manages its own DB state
    if (this.config?.secrets?.enabled) {
      registerSecretsTools(this.toolRegistry);
    }

    // Initialize messages if enabled
    // Use ConversationsAdapter when messages.provider === 'conversations', native otherwise
    if (this.config?.messages?.enabled) {
      const { id: assistantId, name: assistantName } = this.getAssistantIdentity();
      const provider = (this.config.messages as any).provider;
      if (provider === 'conversations') {
        const { createConversationsAdapter } = await import('../messages/conversations-adapter');
        this.mgr.messages = createConversationsAdapter(assistantId, assistantName, this.config.messages) as any;
      } else {
        this.mgr.messages = createMessagesManager(assistantId, assistantName, this.config.messages);
      }
      await this.mgr.messages!.initialize();
      registerMessagesTools(this.toolRegistry, () => this.mgr.messages);

      // Start watching for real-time message notifications (native)
      this.mgr.messages!.startWatching();
      this.mgr.messages!.onMessage((message) => {
        if (message.priority === 'urgent' || message.priority === 'high') {
          const context = this.mgr.messages!.buildInjectionContext([message]);
          if (context) {
            this.pendingCtx.messages = context;
          }
        }
      });

      // Register spaces tools — lazy-imported inside each executor so no streaming side effects
      registerConversationsSpacesTools(this.toolRegistry, assistantId);
    }

    // Initialize webhooks if enabled
    if (this.config?.webhooks?.enabled) {
      const { id: assistantId } = this.getAssistantIdentity();
      this.mgr.webhooks = createWebhooksManager(assistantId, this.config.webhooks);
      await this.mgr.webhooks.initialize();
      registerWebhookTools(this.toolRegistry, () => this.mgr.webhooks);

      // Start watching for real-time webhook event notifications
      this.mgr.webhooks.startWatching();
      this.mgr.webhooks.onEvent((event) => {
        // When a new event arrives, prepare it for injection at the next turn
        const context = this.mgr.webhooks!.buildInjectionContext([event]);
        if (context) {
          this.pendingCtx.webhooks = context;
        }
      });
    }

    // Initialize channels if enabled
    if (this.config?.channels?.enabled) {
      const { id: assistantId, name: assistantName } = this.getAssistantIdentity();
      this.mgr.channels = createChannelsManager(
        assistantId,
        assistantName,
        this.config.channels,
        { basePath: this.storageDir }
      );
      registerChannelTools(this.toolRegistry, () => this.mgr.channels);
      this.channelAgentPool = new ChannelAgentPool(this.cwd, () => this.mgr.channels);
    }

    // Initialize people manager (always available)
    try {
      this.mgr.people = await createPeopleManager();
    } catch {
      // People manager is non-critical
    }
    registerPeopleTools(this.toolRegistry, () => this.mgr.people);

    // Initialize telephony if enabled
    if (this.config?.telephony?.enabled) {
      const { id: assistantId, name: assistantName } = this.getAssistantIdentity();
      this.mgr.telephony = createTelephonyManager(assistantId, assistantName, this.config.telephony);
      registerTelephonyTools(this.toolRegistry, () => this.mgr.telephony);

      // Start WebSocket stream server for Twilio media streams if voice bridge is available
      if (this.mgr.telephony.getVoiceBridge()) {
        try {
          const { port } = this.mgr.telephony.startStreamServer();
          console.log(`[Telephony] Stream server started on port ${port}`);
        } catch {
          // Stream server is non-critical — calls still work via external stream server
        }
      }
    }

    // Initialize orders if enabled
    if (this.config?.orders?.enabled) {
      const { id: assistantId, name: assistantName } = this.getAssistantIdentity();
      this.mgr.orders = createOrdersManager(assistantId, assistantName, this.config.orders);
      registerOrderTools(this.toolRegistry, () => this.mgr.orders);
    }

    // Initialize contacts tools — backed by @hasna/contacts SDK (no local manager)
    registerContactsTools(this.toolRegistry);

    // Initialize memory system if enabled
    const memoryConfig = this.config?.memory;
    if (memoryConfig?.enabled !== false) {
      const { id: assistantScopeId } = this.getAssistantIdentity();
      const scopePrefix = this.workspaceId ? `${this.workspaceId}:` : '';
      const scopedScopeId = `${scopePrefix}${assistantScopeId}`;
      this.mgr.memory = new GlobalMemoryManager({
        defaultScope: 'private',
        scopeId: scopedScopeId,
        sessionId: this.sessionId,
        config: {
          enabled: memoryConfig?.enabled ?? true,
          injection: {
            enabled: memoryConfig?.injection?.enabled ?? true,
            maxTokens: memoryConfig?.injection?.maxTokens ?? 500,
            minImportance: memoryConfig?.injection?.minImportance ?? 5,
            categories: memoryConfig?.injection?.categories ?? ['preference', 'fact'],
            refreshInterval: memoryConfig?.injection?.refreshInterval ?? 5,
          },
          storage: {
            maxEntries: memoryConfig?.storage?.maxEntries ?? 1000,
            defaultTTL: memoryConfig?.storage?.defaultTTL,
          },
          scopes: {
            globalEnabled: memoryConfig?.scopes?.globalEnabled ?? true,
            sharedEnabled: memoryConfig?.scopes?.sharedEnabled ?? true,
            privateEnabled: memoryConfig?.scopes?.privateEnabled ?? true,
          },
        },
      });
      this.memoryInjector = new MemoryInjector(this.mgr.memory, {
        enabled: memoryConfig?.injection?.enabled ?? true,
        maxTokens: memoryConfig?.injection?.maxTokens ?? 500,
        minImportance: memoryConfig?.injection?.minImportance ?? 5,
        categories: memoryConfig?.injection?.categories ?? ['preference', 'fact'],
        refreshInterval: memoryConfig?.injection?.refreshInterval ?? 5,
      });
      registerMemoryTools(this.toolRegistry, () => this.mgr.memory);
    }

    // Register bookmark tools (always available — uses its own MemoryStore instance)
    registerBookmarkTools(this.toolRegistry, () => {
      try {
        return new MemoryStore(undefined, undefined, { scope: 'shared' });
      } catch {
        return null;
      }
    });

    // Register calendar tools (always available — uses shared SQLite database)
    registerCalendarTools(this.toolRegistry);

    // Register session tools if session context is provided
    if (this.sessionContextOptions) {
      registerSessionTools(this.toolRegistry, () => {
        if (!this.sessionContextOptions) return null;
        return {
          userId: this.sessionContextOptions.userId,
          sessionId: this.sessionId,
          queryFn: this.sessionContextOptions.queryFn,
        };
      });
    }

    // Register project tools (always available for managing projects and plans)
    registerProjectTools(this.toolRegistry, () => ({
      cwd: this.cwd,
    }));

    // Register task tools (always available for task queue management)
    registerTaskTools(this.toolRegistry, {
      cwd: this.cwd,
      projectId: this.activeProjectId ?? undefined,
    });

    // Register self-awareness tools (always available for assistant introspection)
    registerSelfAwarenessTools(this.toolRegistry, {
      getContextManager: () => this.contextManager,
      getContextInfo: () => this.getContextInfo(),
      getAssistantManager: () => this.mgr.assistant,
      getIdentityManager: () => this.mgr.identity,
      getWalletManager: () => this.mgr.wallet,
      getStatsTracker: () => this.statsTracker,
      sessionId: this.sessionId,
      model: this.config?.llm?.model,
    });

    // Register connectors list tool
    registerConnectorsListTool(this.toolRegistry, {
      getConnectorBridge: () => this.connectorBridge,
    });
    registerConnectorsSearchTool(this.toolRegistry, {
      getConnectorBridge: () => this.connectorBridge,
      onConnectorSelected: (connectorName) => {
        this.connectorBridge.registerConnector(this.toolRegistry, connectorName);
      },
    });
    registerConnectorExecuteTool(this.toolRegistry, {
      getConnectorBridge: () => this.connectorBridge,
    });
    registerConnectorAutoRefreshTool(this.toolRegistry);
    // Connectors registry tools registered dynamically to avoid @hasna/connectors import side effects

    // Register config tools
    registerConfigTools(this.toolRegistry, {
      cwd: this.cwd,
      baseDir: this.storageDir,
    });

    // Register assistant management tools
    registerAssistantTools(this.toolRegistry, {
      getAssistantManager: () => this.mgr.assistant,
    });

    // Register identity management tools
    registerIdentityTools(this.toolRegistry, {
      getIdentityManager: () => this.mgr.identity,
    });

    // Register model management tools
    registerModelTools(this.toolRegistry, {
      getModel: () => this.getModel(),
      switchModel: async (modelId: string) => this.switchModel(modelId),
      getLLMConfig: () => this.config?.llm ?? null,
    });

    // Register heartbeat tools
    registerHeartbeatTools(this.toolRegistry, {
      sessionId: this.sessionId,
      getHeartbeatState: () => this.getHeartbeatState(),
      getHeartbeatConfig: () => this.heartbeatRuntimeConfig,
      baseDir: this.storageDir,
    });

    // Register context entry tools
    registerContextEntryTools(this.toolRegistry, {
      cwd: this.cwd,
      getActiveProjectId: () => this.activeProjectId,
      setProjectContext: (content: string | null) => {
        this.setProjectContext(content);
      },
      getConnectors: () => this.connectorBridge.getConnectors().map((c: { name: string; description?: string; cli?: string; tools?: Array<{ name: string; description: string }> }) => ({
        name: c.name,
        description: c.description,
        cli: c.cli,
        commands: c.tools?.map((t: { name: string; description: string }) => ({
          name: t.name,
          description: t.description,
        })),
      })),
    });

    // Register security tools
    registerSecurityTools(this.toolRegistry, {
      getSecurityLogger,
      sessionId: this.sessionId,
    });

    // Register logs tools (read-only access to all log sources)
    registerLogsTools(this.toolRegistry, {
      sessionId: this.sessionId,
    });

    // Register verification tools
    registerVerificationTools(this.toolRegistry, {
      sessionId: this.sessionId,
    });

    // Initialize subassistant manager and register assistant tools
    this.initializeSubassistantManager();
    registerAssistantSpawnTools(this.toolRegistry, {
      getSubassistantManager: () => this.subassistantManager,
      getAssistantManager: () => this.mgr.assistant,
      getDepth: () => this.depth,
      getCwd: () => this.cwd,
      getSessionId: () => this.sessionId,
    });

    // Register assistant registry tools (for querying running assistants)
    registerAssistantRegistryTools(this.toolRegistry, {
      getRegistryService: () => this.registryService,
    });

    // Register swarm tools for multi-assistant orchestration
    registerSwarmTools(this.toolRegistry, {
      getSwarmCoordinator: () => this.getOrCreateSwarmCoordinator(),
      isSwarmEnabled: () => this.subassistantManager !== null,
    });

    // Register capability tools (for querying assistant capabilities)
    registerCapabilityTools(this.toolRegistry, {
      getCapabilities: () => this.capabilityEnforcer?.getResolvedCapabilities() ?? null,
      isEnabled: () => this.capabilityEnforcer?.isEnabled() ?? false,
      getOrchestrationLevel: () => this.capabilityEnforcer?.getResolvedCapabilities()?.orchestration.level ?? null,
      getToolPolicy: () => this.capabilityEnforcer?.getResolvedCapabilities()?.tools.policy ?? null,
      getAllowedTools: () => this.allowedTools ? Array.from(this.allowedTools) : null,
      getDeniedTools: () => this.capabilitiesConfig?.deniedTools ?? null,
    });

    // Register voice tools (available when voice manager is configured)
    registerVoiceTools(this.toolRegistry, {
      getVoiceManager: () => this.mgr.voice,
      processForTalk: (text: string) => this.processForTalk(text),
      emit: (event) => this.emit(event as any),
    });

    // Register budget tools (always available for budget introspection)
    registerBudgetTools(this.toolRegistry, () => this.budgetTracker);

    // Register guardrails tools (read-only, always available)
    registerGuardrailsTools(this.toolRegistry, () => new GuardrailsStore());

    // Register hooks tools (always available for hook inspection)
    registerHooksTools(this.toolRegistry, () => new HookStore());

    // Initialize jobs system if enabled
    if (this.config?.jobs?.enabled !== false) {
      this.mgr.job = new JobManager(this.config?.jobs || {}, this.sessionId);

      // Set up job completion notifications
      this.mgr.job.onJobComplete((event) => {
        // Notify via stream chunk with hook support
        const statusEmoji = event.status === 'completed' ? '✓' : event.status === 'failed' ? '✗' : '⚠';
        void this.emitNotification({
          type: 'job_complete',
          title: `Job ${event.status} ${statusEmoji}`,
          message: `${event.connector} (${event.jobId}): ${event.summary}`,
          priority: event.status === 'failed' ? 'high' : 'normal',
        });
      });

      // Register job tools
      const jobTools = createJobTools(() => this.mgr.job);
      for (const { tool, executor } of jobTools) {
        this.toolRegistry.register(tool, executor);
      }

      // Connect job manager to connector bridge
      this.connectorBridge.setJobManagerGetter(() => this.mgr.job);

      // Clean up old jobs on startup
      this.mgr.job.cleanup().catch(() => {});
    }

    // Register connector tools
    this.connectorBridge.registerAll(this.toolRegistry);

    // Register builtin commands
    this.builtinCommands.registerAll(this.commandLoader);

    // Load and setup extensions (TypeScript plugins that register tools and commands)
    try {
      await this.extensionLoader.loadAll(this.cwd, this.toolRegistry, this.commandLoader, this.config);
    } catch {
      // Extension loading is non-fatal — continue without extensions
    }

    // Load hooks
    this.hookLoader.load(hooksConfig);

    // Initialize HookCliBridge for .hooks/ CLI discovery
    const hookCliBridge = new HookCliBridge(this.cwd);
    this.hookExecutor.setCliBridge(hookCliBridge);

    // Fast CLI hook discovery (from cache)
    hookCliBridge.fastDiscover();

    // Background full CLI hook discovery
    hookCliBridge.discover()
      .then((discovered) => {
        if (discovered.length > 0) {
          const cliHooks = hookCliBridge.getDiscoveredHooksForUpsert();
          hookStore.upsertFromCli(cliHooks);
        }
      })
      .catch(() => {});

    // Register native hooks
    nativeHookRegistry.register(createScopeVerificationHook());

    // Configure scope verification from hooks config
    const nativeConfig = (hooksConfig as any)?.native;
    if (nativeConfig) {
      nativeHookRegistry.setConfig(nativeConfig);
      if (nativeConfig.scopeVerification) {
        this.scopeContextManager.setConfig(nativeConfig.scopeVerification);
      }
    }

    // Register autonomous heartbeat Stop hook and setup watchdog
    const heartbeatCfg = this.config.heartbeat;
    if (heartbeatCfg?.autonomous) {
      nativeHookRegistry.register(createAutoScheduleHeartbeatHook());
      // Install main-loop and watchdog skills (no-op if already present)
      installHeartbeatSkills().catch(() => {});
      // Setup watchdog if enabled
      if (heartbeatCfg.watchdogEnabled) {
        ensureWatchdogSchedule(
          this.cwd,
          this.sessionId,
          heartbeatCfg.watchdogIntervalMs,
        ).catch(() => {});
      }
    }

    this.hookExecutor.setAssistantRunner((hook, input, timeout) =>
      runHookAssistant({ hook, input, timeout, cwd: this.cwd })
    );

    // Set system prompt (store for re-use on clear)
    this.systemPrompt = systemPrompt || null;
    if (this.systemPrompt) {
      this.context.addSystemMessage(this.systemPrompt);
    }
    if (this.extraSystemPrompt) {
      this.context.addSystemMessage(this.extraSystemPrompt);
    }

    // Always provide basic heartbeat awareness so agents know how to respond to /main-loop
    if (this.config.heartbeat?.enabled !== false) {
      this.context.addSystemMessage(`## Heartbeat Basics
- The system can trigger scheduled runs via \`/main-loop\` or \`/watchdog\`.
- If invoked with those commands, follow the heartbeat skill instructions.
- Heartbeat schedules use the id \`heartbeat-${this.sessionId}\`.`);
    }

    // Inject heartbeat awareness into system prompt when autonomous mode is enabled
    if (this.config.heartbeat?.autonomous) {
      const maxSleepMin = Math.round((this.config.heartbeat.maxSleepMs ?? 1800000) / 60000);
      this.context.addSystemMessage(`## Autonomous Heartbeat System

You are running in **autonomous mode**. You manage your own wakeup schedule.

### How it works
- After every turn, a safety-net hook ensures a heartbeat schedule exists
- The heartbeat fires \`/main-loop\` which runs your autonomous check-in skill
- A watchdog monitors your health and forces a wakeup if you're overdue

### Your responsibilities at the END of every turn
1. **Save state** to memory before the turn ends:
   - \`memory_save agent.heartbeat.intention "what you plan to do next"\`
   - \`memory_save agent.state.pending "items waiting for follow-up"\`
   - \`memory_save agent.state.lastActions "what you just did"\`
2. **Schedule your next heartbeat**:
   - Delete old: call \`schedule\` with \`{ action: "delete", id: "heartbeat-${this.sessionId}" }\`
   - Create new: call \`schedule\` with \`action: "create"\`, \`actionType: "message"\`, \`message: "/main-loop"\`, and either \`at\` (one-shot) or \`cron\` + \`startImmediately: true\` (recurring)
3. **Save goals** when they change: \`memory_save agent.goals "..."\`

### Timing guidelines
| Situation | Wake up in |
|-----------|-----------|
| Active jobs running or tasks pending | 1–3 minutes |
| Goals exist but nothing urgent | 5–15 minutes |
| Nothing pending, user idle | 15–${maxSleepMin} minutes (max) |

### Key memory keys
- \`agent.heartbeat.last\` — when you last ran (save ISO timestamp)
- \`agent.heartbeat.next\` — when you plan to run next
- \`agent.heartbeat.intention\` — why you're waking up
- \`agent.goals\` — your active goals
- \`agent.state.pending\` — items waiting
- \`agent.state.lastActions\` — what you did recently

### Rules
- **Stay fast** — if work takes >30s, delegate to a subassistant
- **Never sleep longer than ${maxSleepMin} minutes** — the system enforces this cap
- **Always schedule your next heartbeat** — if you forget, the safety net creates a default one
`);
    }

    this.contextManager?.refreshState(this.context.getMessages());

    // Run session start hooks
    await this.hookExecutor.execute(this.hookLoader.getHooks('SessionStart'), {
      session_id: this.sessionId,
      hook_event_name: 'SessionStart',
      cwd: this.cwd,
    });

    this.startHeartbeat();
    await this.startAssistantHeartbeat();

  }

  /**
   * Process a user message
   */
  async process(userMessage: string): Promise<void> {
    if (this.isRunning) {
      throw new Error('Assistant is already processing a message');
    }

    // Set isRunning early to prevent race conditions with scheduled commands.
    // The heartbeat timer checks isRunning before draining the scheduled queue,
    // so we need to set it before any async operations to avoid concurrent runs.
    this.isRunning = true;
    // Reset cumulative turn counter for each new user message
    this.cumulativeTurns = 0;

    try {
      // Inject pending messages before processing
      await this.injectPendingMessages();
      // Inject pending webhook events before processing
      await this.injectPendingWebhookEvents();
      // Inject pending channel messages before processing
      await this.injectPendingChannelMessages();
      // Inject pending telephony messages before processing
      await this.injectPendingTelephonyMessages();
      // Inject pending order updates before processing
      await this.injectPendingOrderUpdates();
      // Inject relevant memories based on user message
      await this.injectMemoryContext(userMessage);
      // Inject environment context (datetime, cwd, etc.)
      await this.injectContextInfo();

      // Track session topic from early messages (for drift detection)
      this.userMessageCount++;
      if (this.userMessageCount <= 3) {
        for (const word of userMessage.toLowerCase().split(/\W+/).filter(w => w.length > 4)) {
          this.sessionTopicWords.add(word);
        }
      }

      // Drift detection: on long sessions, check if current message is off-topic
      if (this.userMessageCount === 25) {
        this.onChunk?.({ type: 'text', content: '\n> **Note:** This is a long conversation. If I seem to have lost track of your original goal, feel free to remind me or start a new session.\n\n' });
      }
      // Inject pending tasks from todos if TODOS_URL is set
      await this.injectTasksContext();
      // Inject recent sessions if SESSIONS_URL is set
      await this.injectSessionsContext();
    } catch (error) {
      // If injection fails, reset isRunning before re-throwing
      this.isRunning = false;
      throw error;
    }

    // runMessage handles its own isRunning state in its finally block
    await this.runMessage(userMessage, 'user');
  }

  /**
   * Process a message during talk mode.
   * Unlike process(), this can be called while already running (from within a /talk command).
   * It adds the user message, runs the LLM loop, and returns the assistant's text response.
   * Sets inTalkMode flag so runLoop skips 'done' emission and Stop hooks.
   */
  async processForTalk(userMessage: string): Promise<string> {
    if (!this.llmClient || !this.config) {
      throw new Error('Assistant not initialized.');
    }

    const beforeCount = this.context.getMessages().length;
    this.shouldStop = false;
    this.cumulativeTurns = 0; // Reset per talk message to avoid hitting safety limit
    this.inTalkMode = true;

    try {
      // Inject memory context for the talk message
      await this.injectMemoryContext(userMessage);

      // Expand @file references
      userMessage = await expandFileReferences(userMessage, this.cwd);

      this.context.addUserMessage(userMessage);
      await this.runLoop();
      this.contextManager?.refreshState(this.context.getMessages());

      // Extract the assistant's text response
      const messages = this.context.getMessages().slice(beforeCount);
      const lastAssistant = [...messages].reverse().find((msg) => msg.role === 'assistant');
      return lastAssistant?.content?.trim() || '';
    } finally {
      this.inTalkMode = false;
    }
  }

  private async runMessage(
    userMessage: string,
    source: 'user' | 'schedule'
  ): Promise<{ ok: boolean; summary?: string; error?: string }> {
    if (!this.llmClient || !this.config) {
      throw new Error('Assistant not initialized. Call initialize() first.');
    }

    this.isRunning = true;
    this.emittedTerminalChunk = false;
    this.setHeartbeatState('processing');
    this.shouldStop = false;
    this.cumulativeTurns = 0;
    const beforeCount = this.context.getMessages().length;
    this.lastUserMessage = userMessage;
    this.recordHeartbeatActivity('message');

    try {
      if (source === 'user') {
        const promptHookResult = await this.hookExecutor.execute(
          this.hookLoader.getHooks('UserPromptSubmit'),
          {
            session_id: this.sessionId,
            hook_event_name: 'UserPromptSubmit',
            cwd: this.cwd,
            prompt: userMessage,
          }
        );

        if (promptHookResult?.continue === false) {
          this.emit({ type: 'error', error: promptHookResult.stopReason || 'Blocked by hook' });
          return { ok: false, error: promptHookResult.stopReason || 'Blocked by hook' };
        }
      }

      const explicitToolResult = await this.handleExplicitToolCommand(userMessage);
      if (explicitToolResult) {
        // Clear pending context - explicit tool commands bypass the LLM
        this.pendingCtx.memory = null;
        this.pendingCtx.injection = null;
        this.ensureTerminalChunk();
        return explicitToolResult;
      }

      if (userMessage.startsWith('/')) {
        const parsed = this.commandExecutor.parseCommand(userMessage);
        const command = parsed ? this.commandLoader.getCommand(parsed.name) : undefined;
        const skill = parsed ? this.skillLoader.getSkill(parsed.name) : undefined;

        if (command) {
          const commandResult = await this.handleCommand(userMessage);
          if (commandResult.handled) {
            // Clear pending context - commands bypass the LLM
            this.pendingCtx.memory = null;
            this.pendingCtx.injection = null;
            if (commandResult.clearConversation) {
              this.resetContext();
            }
            if (commandResult.exit) {
              this.emit({ type: 'exit' });
            }
            if (commandResult.showPanel) {
              this.emit({
                type: 'show_panel',
                panel: commandResult.showPanel,
                panelValue: commandResult.panelValue,
              });
            }
            // Session actions: encode in show_panel with session-action prefix
            if (commandResult.sessionAction) {
              const payload = JSON.stringify({
                action: commandResult.sessionAction,
                number: commandResult.sessionNumber,
                label: commandResult.sessionLabel,
                agent: commandResult.sessionAgent,
              });
              this.emit({
                type: 'show_panel',
                panel: 'assistants',
                panelValue: `session:${payload}`,
              });
            }
            this.ensureTerminalChunk();
            return { ok: true, summary: `Handled ${userMessage}` };
          }
          if (commandResult.prompt) {
            userMessage = commandResult.prompt;
          }
        } else if (skill) {
          const handled = await this.handleSkillInvocation(userMessage);
          if (handled) {
            // Clear pending context - skills handle their own context
            this.pendingCtx.memory = null;
            this.pendingCtx.injection = null;
            this.ensureTerminalChunk();
            return { ok: true, summary: `Executed ${userMessage}` };
          }
        } else {
          const commandResult = await this.handleCommand(userMessage);
          if (commandResult.handled) {
            // Clear pending context - commands bypass the LLM
            this.pendingCtx.memory = null;
            this.pendingCtx.injection = null;
            if (commandResult.showPanel) {
              this.emit({
                type: 'show_panel',
                panel: commandResult.showPanel,
                panelValue: commandResult.panelValue,
              });
            }
            this.ensureTerminalChunk();
            return { ok: true, summary: `Handled ${userMessage}` };
          }
          if (commandResult.prompt) {
            userMessage = commandResult.prompt;
          }
        }
      }

      const limits = getLimits();
      userMessage = enforceMessageLimit(userMessage, limits.maxUserMessageLength);

      // Expand @file references before sending to LLM
      if (source === 'user') {
        userMessage = await expandFileReferences(userMessage, this.cwd);
      }

      // Track scope context for goal verification (only for non-command messages)
      if (source === 'user') {
        const scopeContext = await this.scopeContextManager.createContext(
          userMessage,
          this.llmClient
        );
        if (scopeContext) {
          this.context.setScopeContext(scopeContext);
        }
      }

      this.context.addUserMessage(userMessage);
      await this.runLoop();
      this.contextManager?.refreshState(this.context.getMessages());

      const messages = this.context.getMessages().slice(beforeCount);
      const lastAssistant = [...messages].reverse().find((msg) => msg.role === 'assistant');
      const summary = lastAssistant?.content?.trim();

      // Auto-name session after first successful response (fire-and-forget)
      if (!this.sessionAutoNamed && this.onSessionLabel && source === 'user') {
        this.sessionAutoNamed = true;
        const bgModel = this.config?.backgroundModel;
        const sessionId = this.sessionId;
        const labelCallback = this.onSessionLabel;
        generateSessionName(userMessage, { model: bgModel })
          .then((label) => {
            labelCallback?.(sessionId, label);
          })
          .catch((err) => {
            // Non-critical — log but don't block the conversation
            // Non-critical — auto-naming is best-effort
          });
      }

      return { ok: true, summary: summary ? summary.slice(0, 200) : undefined };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    } finally {
      this.currentAllowedTools = null;
      this.isRunning = false;
      this.setHeartbeatState('idle');
      if (this.config?.scheduler?.enabled !== false) {
        await this.tickHeartbeat();
        await this.drainScheduledQueue();
      }
    }
  }

  private async handleExplicitToolCommand(
    userMessage: string
  ): Promise<{ ok: boolean; summary?: string; error?: string } | null> {
    const match = userMessage.match(/^!\[(\w+)\]\s*([\s\S]*)$/);
    if (!match) return null;

    const toolName = match[1].toLowerCase();
    const command = match[2].trim();

    if (!command) {
      this.emit({ type: 'text', content: `Usage: ![${toolName}] <command>\n` });
      this.emit({ type: 'done' });
      return { ok: false, error: 'Missing command' };
    }

    if (toolName !== 'bash') {
      this.emit({ type: 'text', content: `Unsupported tool: ${toolName}\n` });
      this.emit({ type: 'done' });
      return { ok: false, error: 'Unsupported tool' };
    }

    const toolCall: ToolCall = {
      id: generateId(),
      name: 'bash',
      input: {
        command,
        cwd: this.cwd,
        sessionId: this.sessionId,
      },
    };

    this.context.addUserMessage(userMessage);
    this.context.addAssistantMessage('', [toolCall]);

    this.emit({ type: 'tool_use', toolCall });
    const results = await this.executeToolCalls([toolCall]);
    this.context.addToolResults(results);

    this.emit({ type: 'done' });
    const failed = results.some((result) => result.isError);
    if (failed) {
      const error = results.find((result) => result.isError)?.content;
      return { ok: false, error: error ? String(error) : 'Tool execution failed' };
    }
    return { ok: true, summary: `Executed ${toolName}` };
  }

  /**
   * Main assistant loop - continues until no more tool calls
   */
  private async runLoop(): Promise<void> {
    const maxTurns = this.maxTurnsPerRun;
    let turn = 0;
    let streamError: Error | null = null;

    // Safety check: prevent unbounded recursive calls from scope verification
    if (this.cumulativeTurns >= AssistantLoop.MAX_CUMULATIVE_TURNS) {
      this.emit({ type: 'text', content: '\n[Safety limit reached - too many cumulative turns. Stopping.]\n' });
      this.emit({ type: 'done' });
      return;
    }

    try {
      while (turn < maxTurns && !this.shouldStop && this.cumulativeTurns < AssistantLoop.MAX_CUMULATIVE_TURNS) {
        turn++;
        this.cumulativeTurns++;

        // Wait if paused (budget pause enforcement)
        if (this.paused) {
          this.onBudgetWarning?.('Budget exceeded - agent paused. Use /budgets resume to continue.');
          this.emit({ type: 'text', content: '\n[Agent paused - budget exceeded. Use /budgets resume to continue.]\n' });
          await new Promise<void>((resolve) => {
            this.pauseResolve = resolve;
          });
          this.pauseResolve = null;
          if (this.shouldStop) break;
        }

        // Check budget before starting a new turn
        if (this.isBudgetExceeded()) {
          const onExceeded = this.budgetConfig?.onExceeded || 'warn';
          if (onExceeded === 'stop') {
            this.onBudgetWarning?.('Budget exceeded - stopping before turn ' + turn);
            break;
          }
        }

        await this.maybeSummarizeContext();

        const messages = this.context.getMessages();
        const allTools = this.toolRegistry.getTools();
        const tools = this.buildExecutableTools(this.filterAllowedTools(allTools));
        const systemPrompt = this.buildSystemPrompt(messages);

        let responseText = '';
        let toolCalls: ToolCall[] = [];
        let streamedToolResults: ToolResult[] = [];
        let finishReason: string | undefined;

        const allPendingToolCallsResolved = () => {
          if (toolCalls.length === 0) return false;
          const streamedResultIds = new Set(streamedToolResults.map((result) => result.toolCallId));
          return toolCalls.every((call) => streamedResultIds.has(call.id));
        };

        const flushResolvedAISDKStep = () => {
          if (!allPendingToolCallsResolved()) return false;
          this.context.addAssistantMessage(responseText, toolCalls);
          this.context.addToolResults(orderToolResults(toolCalls, streamedToolResults));
          responseText = '';
          toolCalls = [];
          streamedToolResults = [];
          return true;
        };

        // Stream response from LLM
        for await (const chunk of this.llmClient!.chat(messages, tools, systemPrompt)) {
          if (this.shouldStop) break;

          this.emit(chunk);

          if (chunk.type === 'text' && chunk.content) {
            flushResolvedAISDKStep();
            responseText += chunk.content;
          } else if (chunk.type === 'tool_use' && chunk.toolCall) {
            flushResolvedAISDKStep();
            toolCalls.push(chunk.toolCall);
          } else if (chunk.type === 'tool_result' && chunk.toolResult) {
            streamedToolResults.push(chunk.toolResult);
          } else if (chunk.type === 'usage' && chunk.usage) {
            // Update token usage
            this.updateTokenUsage(chunk.usage);
          } else if (chunk.type === 'done') {
            finishReason = chunk.finishReason;
          } else if (chunk.type === 'error') {
            this.recordLLMError(chunk.error);
            // Surface the error to the UI — otherwise the turn ends silently with
            // no assistant message and no visible failure (a dead-air chat).
            this.emit({ type: 'error', error: chunk.error || 'LLM stream error' });
            streamError = new Error(chunk.error || 'LLM stream error');
            break;
          }
        }

        const shouldStopNow = this.shouldStop || streamError !== null;

        if (shouldStopNow) {
          // Avoid persisting dangling assistant tool calls when the provider
          // errors before the corresponding tool results arrive.
          if (toolCalls.length > 0) {
            flushResolvedAISDKStep();
          } else if (responseText.trim()) {
            this.context.addAssistantMessage(responseText);
          }
          break;
        }

        const flushedFinalAISDKStep = flushResolvedAISDKStep();

        // If no tool calls, we're done
        if (toolCalls.length === 0) {
          if (responseText.trim()) {
            this.context.addAssistantMessage(responseText);
          }
          if (flushedFinalAISDKStep && finishReason === 'tool-calls') {
            continue;
          }
          break;
        }

        const streamedResultIds = new Set(streamedToolResults.map((result) => result.toolCallId));
        const unresolvedToolCalls = toolCalls.filter((call) => !streamedResultIds.has(call.id));

        if (unresolvedToolCalls.length === 0) {
          this.context.addToolResults(orderToolResults(toolCalls, streamedToolResults));
          if (finishReason === 'tool-calls') {
            continue;
          }
          break;
        }

        if (responseText.trim() || toolCalls.length > 0) {
          this.context.addAssistantMessage(responseText, toolCalls);
        }

        const validation = validateToolCalls(unresolvedToolCalls, allTools, this.config?.validation);
        if (validation.errors.length > 0) {
          for (const error of validation.errors) {
            this.errorAggregator.record(error);
          }
        }
        const invalidResults = new Map<string, ToolResult>();
        for (const call of unresolvedToolCalls) {
          if (validation.validated.has(call.id)) {
            continue;
          }
          const callErrors = validation.errorsByCallId.get(call.id) ?? [];
          const message = callErrors.length > 0
            ? callErrors.map((err) => err.message).join('; ')
            : `Invalid tool call for "${call.name}".`;
          const result: ToolResult = {
            toolCallId: call.id,
            content: `Tool call validation failed: ${message}`,
            isError: true,
            toolName: call.name,
          };
          invalidResults.set(call.id, result);
          this.emit({ type: 'tool_result', toolResult: result });
          await this.hookExecutor.execute(this.hookLoader.getHooks('PostToolUseFailure'), {
            session_id: this.sessionId,
            hook_event_name: 'PostToolUseFailure',
            cwd: this.cwd,
            tool_name: call.name,
            tool_input: call.input,
            tool_result: result.content,
          });
        }

        const validatedCalls = unresolvedToolCalls
          .map((call) => validation.validated.get(call.id))
          .filter(Boolean) as ToolCall[];

        // Execute valid tool calls
        const validResults = await this.executeToolCalls(validatedCalls);
        const resultsById = new Map<string, ToolResult>();
        for (const result of validResults) {
          resultsById.set(result.toolCallId, result);
        }

        const orderedResults: ToolResult[] = [];
        for (const call of unresolvedToolCalls) {
          const result = resultsById.get(call.id) ?? invalidResults.get(call.id);
          if (result) {
            orderedResults.push(result);
          }
        }

        // Add tool results to context
        this.context.addToolResults(orderToolResults(toolCalls, [...streamedToolResults, ...orderedResults]));
      }
    } finally {
      // In talk mode, skip Stop hooks, scope verification, and done emission.
      // The outer talk loop manages the conversation lifecycle; each processForTalk
      // call is just one exchange within a continuous voice conversation.
      if (this.inTalkMode) {
        return;
      }

      // Run user-defined Stop hooks (wrapped in try/catch to prevent blocking cleanup)
      try {
        await this.hookExecutor.execute(this.hookLoader.getHooks('Stop'), {
          session_id: this.sessionId,
          hook_event_name: 'Stop',
          cwd: this.cwd,
        });
      } catch {
        // User Stop hooks must never block the assistant or prevent cleanup
      }

      // Run native Stop hooks (e.g., auto-schedule heartbeat) unconditionally
      try {
        await nativeHookRegistry.execute(
          'Stop',
          this.buildNativeStopHookInput(),
          {
            sessionId: this.sessionId,
            cwd: this.cwd,
            messages: this.context.getMessages(),
          }
        );
      } catch {
        // Native Stop hooks must never block the assistant
      }

      const shouldSkipVerification = this.shouldStop || streamError !== null;
      if (shouldSkipVerification) {
        this.scopeContextManager.clear();
        this.context.clearScopeContext();
        this.emit({ type: 'done' });
        return;
      }

      // Run native scope verification if enabled
      const verificationResult = await this.runScopeVerification();
      if (verificationResult && verificationResult.continue === false) {
        // Verification failed - force continuation
        if (verificationResult.systemMessage) {
          this.context.addSystemMessage(verificationResult.systemMessage);
        }
        // Increment attempts and re-run the loop
        this.scopeContextManager.incrementAttempts();
        const scope = this.scopeContextManager.getContext();
        if (scope) {
          this.context.setScopeContext(scope);
        }
        // Don't emit 'done' - re-enter the loop
        await this.runLoop();
        return;
      }

      // Clear scope context on successful completion
      this.scopeContextManager.clear();
      this.context.clearScopeContext();

      this.emit({ type: 'done' });
    }

    if (streamError) {
      throw streamError;
    }
  }

  private async maybeSummarizeContext(): Promise<void> {
    if (!this.contextManager) return;
    try {
      const messagesBefore = this.context.getMessages();

      // Fire PreCompact hook before attempting compaction
      const preCompactInput = {
        session_id: this.sessionId,
        hook_event_name: 'PreCompact' as const,
        cwd: this.cwd,
        message_count: messagesBefore.length,
        strategy: this.contextConfig?.summaryStrategy ?? 'llm',
      };

      const preCompactResult = await this.hookExecutor.execute(
        this.hookLoader.getHooks('PreCompact'),
        preCompactInput
      );

      // Hook can skip compaction
      if (preCompactResult?.skip === true) {
        return;
      }

      // Hook can modify strategy via updatedInput
      if (preCompactResult?.updatedInput?.strategy) {
        // Note: strategy modification is informational only - the actual strategy
        // is set at initialization. Hooks can use this to log/track strategy changes.
      }

      const result = await this.contextManager.processMessages(messagesBefore);
      if (!result.summarized) return;

      // Check if the assistant was actively working (had recent tool calls)
      const lastAssistantMessage = this.findLastAssistantMessage(messagesBefore);
      const wasActivelyWorking = lastAssistantMessage?.toolCalls && lastAssistantMessage.toolCalls.length > 0;

      this.context.import(result.messages);

      // Inject continuation prompt if assistant was actively working
      if (wasActivelyWorking && lastAssistantMessage?.toolCalls) {
        const lastToolCall = lastAssistantMessage.toolCalls[lastAssistantMessage.toolCalls.length - 1];
        const continuationPrompt = this.buildContinuationPrompt(lastToolCall);
        this.context.addUserMessage(continuationPrompt);

        const notice = `\n[Context summarized: ${result.summarizedCount} messages compacted. Continuing from: ${lastToolCall.name}]\n`;
        this.emit({ type: 'text', content: notice });
      } else {
        const notice = `\n[Context summarized: ${result.summarizedCount} messages, ${result.tokensBefore.toLocaleString()} -> ${result.tokensAfter.toLocaleString()} tokens]\n`;
        this.emit({ type: 'text', content: notice });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.errorAggregator.record(new AssistantError(message, {
        code: ErrorCodes.LLM_API_ERROR,
        recoverable: true,
        retryable: false,
        userFacing: true,
      }));
      this.emit({ type: 'text', content: `\n[Context summarization failed: ${message}]\n` });
    }
  }

  /**
   * Find the last assistant message in the conversation
   */
  private findLastAssistantMessage(messages: Message[]): Message | undefined {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        return messages[i];
      }
    }
    return undefined;
  }

  /**
   * Build a continuation prompt to help the assistant resume work after context compaction
   */
  private buildContinuationPrompt(lastToolCall: ToolCall): string {
    const toolName = lastToolCall.name;
    const toolInput = lastToolCall.input;

    // Build a descriptive hint about what the assistant was doing
    let actionDescription = `using the ${toolName} tool`;
    if (toolName === 'bash' && toolInput && typeof toolInput === 'object' && 'command' in toolInput) {
      actionDescription = `running: ${String(toolInput.command).slice(0, 50)}${String(toolInput.command).length > 50 ? '...' : ''}`;
    } else if (toolName === 'read' && toolInput && typeof toolInput === 'object' && 'file_path' in toolInput) {
      actionDescription = `reading: ${String(toolInput.file_path)}`;
    } else if (toolName === 'write' && toolInput && typeof toolInput === 'object' && 'file_path' in toolInput) {
      actionDescription = `writing to: ${String(toolInput.file_path)}`;
    } else if (toolName === 'edit' && toolInput && typeof toolInput === 'object' && 'file_path' in toolInput) {
      actionDescription = `editing: ${String(toolInput.file_path)}`;
    } else if (toolName === 'glob' && toolInput && typeof toolInput === 'object' && 'pattern' in toolInput) {
      actionDescription = `searching for files matching: ${String(toolInput.pattern)}`;
    } else if (toolName === 'grep' && toolInput && typeof toolInput === 'object' && 'pattern' in toolInput) {
      actionDescription = `searching for: ${String(toolInput.pattern)}`;
    }

    return `[System: Context was automatically compacted to save space. Your last action was ${actionDescription}. Please continue from where you left off. Do not repeat work that was already completed - check the preserved tool results above for recent progress.]`;
  }

  /**
   * Run scope verification to check if goals were met
   */
  private async runScopeVerification(): Promise<{ continue: boolean; systemMessage?: string } | null> {
    // Skip if verification is disabled
    if (!this.scopeContextManager.isEnabled()) {
      return null;
    }

    // Skip if max attempts reached
    if (this.scopeContextManager.hasReachedMaxAttempts()) {
      return null;
    }

    const scopeContext = this.context.getScopeContext();
    if (!scopeContext) {
      return null;
    }

    // Run native verification hooks
    const result = await nativeHookRegistry.execute(
      'Stop',
      this.buildNativeStopHookInput(),
      {
        sessionId: this.sessionId,
        cwd: this.cwd,
        messages: this.context.getMessages(),
        scopeContext,
        llmClient: this.llmClient,
      }
    );

    if (!result) {
      return null;
    }

    return {
      continue: result.continue !== false,
      systemMessage: result.systemMessage,
    };
  }

  private buildNativeStopHookInput(): {
    session_id: string;
    hook_event_name: 'Stop';
    cwd: string;
    heartbeat?: {
      autonomous?: boolean;
      maxSleepMs?: number;
      watchdogEnabled?: boolean;
      watchdogIntervalMs?: number;
    };
  } {
    const heartbeatCfg = this.config?.heartbeat;
    return {
      session_id: this.sessionId,
      hook_event_name: 'Stop',
      cwd: this.cwd,
      heartbeat: heartbeatCfg
        ? {
            autonomous: heartbeatCfg.autonomous,
            maxSleepMs: heartbeatCfg.maxSleepMs,
            watchdogEnabled: heartbeatCfg.watchdogEnabled,
            watchdogIntervalMs: heartbeatCfg.watchdogIntervalMs,
          }
        : undefined,
    };
  }

  /**
   * Fire PostToolUseFailure hook for a failed tool call
   */
  private async firePostToolUseFailure(toolCall: ToolCall, resultContent: string): Promise<void> {
    await this.hookExecutor.execute(this.hookLoader.getHooks('PostToolUseFailure'), {
      session_id: this.sessionId,
      hook_event_name: 'PostToolUseFailure',
      cwd: this.cwd,
      tool_name: toolCall.name,
      tool_input: toolCall.input,
      tool_result: resultContent,
    });
  }

  /**
   * Execute tool calls with hooks
   */
  private async executeToolCalls(
    toolCalls: ToolCall[],
    options: { emitResults?: boolean; includeStoppedResults?: boolean; signal?: AbortSignal } = {}
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    const emitResults = options.emitResults ?? true;
    const emitToolResult = (toolResult: ToolResult) => {
      if (emitResults) {
        this.emit({ type: 'tool_result', toolResult });
      }
    };

    // Create new abort controller for this batch of tool calls
    const localAbortController = options.signal ? null : new AbortController();
    this.toolAbortController = localAbortController;
    const signal = options.signal ?? localAbortController!.signal;

    for (const toolCall of toolCalls) {
      // Check if stop was requested - break early and return partial results
      if (this.shouldStop || signal.aborted) {
        break;
      }

      // Ensure tools receive the assistant's cwd by default
      const toolInput = { ...(toolCall.input || {}) } as Record<string, unknown>;
      if (toolInput.cwd === undefined) {
        toolInput.cwd = this.cwd;
      }
      if (typeof toolInput.sessionId !== 'string' || toolInput.sessionId.length === 0) {
        toolInput.sessionId = this.sessionId;
      }
      toolCall.input = toolInput;

      if (!this.isToolAllowed(toolCall.name)) {
        const blockedResult: ToolResult = {
          toolCallId: toolCall.id,
          content: `Tool call denied: "${toolCall.name}" is not in the allowed tools list`,
          isError: true,
          toolName: toolCall.name,
        };
        emitToolResult(blockedResult);
        await this.hookExecutor.execute(this.hookLoader.getHooks('PostToolUseFailure'), {
          session_id: this.sessionId,
          hook_event_name: 'PostToolUseFailure',
          cwd: this.cwd,
          tool_name: toolCall.name,
          tool_input: toolCall.input,
          tool_result: blockedResult.content,
        });
        results.push(blockedResult);
        continue;
      }

      // Check permission mode (plan mode blocks write tools)
      if (this.config?.permissions?.mode === 'plan' && !this.isToolAllowedInPlanMode(toolCall.name)) {
        const blockedResult: ToolResult = {
          toolCallId: toolCall.id,
          content: `Blocked in plan mode: "${toolCall.name}" is not available. Only read-only tools are allowed. Switch to normal mode with /mode normal`,
          isError: true,
          toolName: toolCall.name,
        };
        emitToolResult(blockedResult);
        await this.hookExecutor.execute(this.hookLoader.getHooks('PostToolUseFailure'), {
          session_id: this.sessionId,
          hook_event_name: 'PostToolUseFailure',
          cwd: this.cwd,
          tool_name: toolCall.name,
          tool_input: toolCall.input,
          tool_result: blockedResult.content,
        });
        results.push(blockedResult);
        continue;
      }

      // Check guardrails policy if enabled
      if (this.policyEvaluator?.isEnabled()) {
        const policyResult = this.policyEvaluator.evaluateToolUse({
          toolName: toolCall.name,
          toolInput: toolCall.input as Record<string, unknown>,
          depth: this.depth,
        });

        // Handle warnings (log them - they don't block execution)
        if (policyResult.warnings.length > 0) {
          for (const warning of policyResult.warnings) {
            // Use the callback if available, otherwise warnings are silent
            this.onGuardrailsViolation?.(policyResult, toolCall.name);
          }
        }

        // If denied, block the tool call
        if (!policyResult.allowed && policyResult.action === 'deny') {
          const reason = policyResult.reasons.join('; ') || 'Blocked by guardrails policy';
          const blockedResult: ToolResult = {
            toolCallId: toolCall.id,
            content: `Tool call denied by guardrails: ${reason}`,
            isError: true,
            toolName: toolCall.name,
          };
          emitToolResult(blockedResult);
          this.onGuardrailsViolation?.(policyResult, toolCall.name);
          await this.hookExecutor.execute(this.hookLoader.getHooks('PostToolUseFailure'), {
            session_id: this.sessionId,
            hook_event_name: 'PostToolUseFailure',
            cwd: this.cwd,
            tool_name: toolCall.name,
            tool_input: toolCall.input,
            tool_result: blockedResult.content,
          });
          results.push(blockedResult);
          continue;
        }

        // If requires approval, emit the need for approval
        if (policyResult.requiresApproval) {
          const reason = policyResult.reasons.join('; ') || 'Requires approval per guardrails policy';
          const approvalResult: ToolResult = {
            toolCallId: toolCall.id,
            content: `Tool call requires approval: ${reason}`,
            isError: true,
            toolName: toolCall.name,
          };
          emitToolResult(approvalResult);
          this.onGuardrailsViolation?.(policyResult, toolCall.name);
          await this.hookExecutor.execute(this.hookLoader.getHooks('PostToolUseFailure'), {
            session_id: this.sessionId,
            hook_event_name: 'PostToolUseFailure',
            cwd: this.cwd,
            tool_name: toolCall.name,
            tool_input: toolCall.input,
            tool_result: approvalResult.content,
          });
          results.push(approvalResult);
          continue;
        }
      }

      // Check capability enforcement if enabled
      if (this.capabilityEnforcer?.isEnabled()) {
        const capResult = this.capabilityEnforcer.canUseTool(toolCall.name, {
          depth: this.depth,
          sessionId: this.sessionId,
          assistantId: this.registeredAssistantId || undefined,
        });

        // Handle warnings
        if (capResult.warnings.length > 0) {
          for (const warning of capResult.warnings) {
            this.emit({ type: 'text', content: `\n[Capability Warning] ${warning}\n` });
          }
        }

        // If not allowed, block the tool call
        if (!capResult.allowed) {
          const blockedResult: ToolResult = {
            toolCallId: toolCall.id,
            content: `Tool call denied by capabilities: ${capResult.reason}`,
            isError: true,
            toolName: toolCall.name,
          };
          emitToolResult(blockedResult);
          this.onCapabilityViolation?.(capResult, `tool:${toolCall.name}`);
          await this.hookExecutor.execute(this.hookLoader.getHooks('PostToolUseFailure'), {
            session_id: this.sessionId,
            hook_event_name: 'PostToolUseFailure',
            cwd: this.cwd,
            tool_name: toolCall.name,
            tool_input: toolCall.input,
            tool_result: blockedResult.content,
          });
          results.push(blockedResult);
          continue;
        }

        // If requires approval, emit the need for approval
        if (capResult.requiresApproval) {
          const approvalResult: ToolResult = {
            toolCallId: toolCall.id,
            content: `Tool call requires approval: ${capResult.reason}`,
            isError: true,
            toolName: toolCall.name,
          };
          emitToolResult(approvalResult);
          this.onCapabilityViolation?.(capResult, `tool:${toolCall.name}`);
          await this.hookExecutor.execute(this.hookLoader.getHooks('PostToolUseFailure'), {
            session_id: this.sessionId,
            hook_event_name: 'PostToolUseFailure',
            cwd: this.cwd,
            tool_name: toolCall.name,
            tool_input: toolCall.input,
            tool_result: approvalResult.content,
          });
          results.push(approvalResult);
          continue;
        }
      }

      // Run PreToolUse hooks
      const preHookResult = await this.hookExecutor.execute(
        this.hookLoader.getHooks('PreToolUse'),
        {
          session_id: this.sessionId,
          hook_event_name: 'PreToolUse',
          cwd: this.cwd,
          tool_name: toolCall.name,
          tool_input: toolCall.input,
        }
      );

      // Apply updated input from hook if provided
      if (preHookResult?.updatedInput) {
        toolCall.input = { ...(toolCall.input || {}), ...preHookResult.updatedInput };
      }

      const input = toolCall.input as Record<string, unknown>;
      if (input.cwd === undefined) {
        input.cwd = this.cwd;
      }
      if (typeof input.sessionId !== 'string' || input.sessionId.length === 0) {
        input.sessionId = this.sessionId;
      }

      // Check if hook blocked the tool (either via continue: false or permissionDecision: deny)
      if (preHookResult?.continue === false || preHookResult?.permissionDecision === 'deny') {
        const blockedResult: ToolResult = {
          toolCallId: toolCall.id,
          content: `Tool call denied: ${preHookResult.stopReason || 'Blocked by hook'}`,
          isError: true,
          toolName: toolCall.name,
        };
        emitToolResult(blockedResult);
        await this.hookExecutor.execute(this.hookLoader.getHooks('PostToolUseFailure'), {
          session_id: this.sessionId,
          hook_event_name: 'PostToolUseFailure',
          cwd: this.cwd,
          tool_name: toolCall.name,
          tool_input: toolCall.input,
          tool_result: blockedResult.content,
        });
        results.push(blockedResult);
        continue;
      }

      // If PreToolUse didn't make a decision, fire PermissionRequest hook
      // This allows hooks to auto-approve/deny or fall through to user prompt
      let finalPermissionDecision: 'allow' | 'deny' | 'ask' | undefined = preHookResult?.permissionDecision;
      let permissionStopReason = preHookResult?.stopReason;
      if (!finalPermissionDecision) {
        const permHookResult = await this.hookExecutor.execute(
          this.hookLoader.getHooks('PermissionRequest'),
          {
            session_id: this.sessionId,
            hook_event_name: 'PermissionRequest',
            cwd: this.cwd,
            tool_name: toolCall.name,
            tool_input: toolCall.input,
            permission_type: 'tool_execution',
          }
        );
        if (permHookResult?.updatedInput) {
          toolCall.input = { ...(toolCall.input || {}), ...permHookResult.updatedInput };
        }
        if (permHookResult?.permissionDecision) {
          finalPermissionDecision = permHookResult.permissionDecision;
        }
        if (permHookResult?.stopReason) {
          permissionStopReason = permHookResult.stopReason;
        }
        // Handle PermissionRequest hook decision to deny
        if (permHookResult?.permissionDecision === 'deny' || permHookResult?.continue === false) {
          const blockedResult: ToolResult = {
            toolCallId: toolCall.id,
            content: `Tool call denied: ${permHookResult.stopReason || 'Blocked by permission hook'}`,
            isError: true,
            toolName: toolCall.name,
          };
          emitToolResult(blockedResult);
          await this.hookExecutor.execute(this.hookLoader.getHooks('PostToolUseFailure'), {
            session_id: this.sessionId,
            hook_event_name: 'PostToolUseFailure',
            cwd: this.cwd,
            tool_name: toolCall.name,
            tool_input: toolCall.input,
            tool_result: blockedResult.content,
          });
          results.push(blockedResult);
          continue;
        }
      }

      if (finalPermissionDecision === 'ask' || preHookResult?.permissionDecision === 'ask') {
        const askResult: ToolResult = {
          toolCallId: toolCall.id,
          content: `Tool call requires approval: ${permissionStopReason || 'Approval required'}`,
          isError: true,
          toolName: toolCall.name,
        };
        emitToolResult(askResult);
        await this.hookExecutor.execute(this.hookLoader.getHooks('PostToolUseFailure'), {
          session_id: this.sessionId,
          hook_event_name: 'PostToolUseFailure',
          cwd: this.cwd,
          tool_name: toolCall.name,
          tool_input: toolCall.input,
          tool_result: askResult.content,
        });
        results.push(askResult);
        continue;
      }

      // Emit tool start
      this.recordHeartbeatActivity('tool');
      this.lastToolName = toolCall.name;
      this.pendingToolCalls.set(toolCall.id, toolCall.name);
      this.statsTracker.onToolStart(toolCall);
      this.onToolStart?.(toolCall);

      // Execute the tool with timing
      const toolStartTime = Date.now();
      const result = await this.toolRegistry.execute(toolCall, signal);
      const toolDuration = Date.now() - toolStartTime;

      // Record tool call in budget tracker
      this.recordToolCallBudget(toolDuration);

      const stopAfterTool = this.shouldStop;

      // Emit tool end
      this.statsTracker.onToolEnd(toolCall, result);
      this.onToolEnd?.(toolCall, result);

      // Auto-refresh connectors after a successful global install
      if (!stopAfterTool && !result.isError && toolCall.name === 'bash') {
        const command = (toolCall.input as Record<string, unknown> | undefined)?.command;
        if (typeof command === 'string' && this.shouldRefreshConnectors(command)) {
          try {
            await this.connectorBridge.refresh();
            this.connectorBridge.registerAll(this.toolRegistry, this.config?.connectors);
          } catch {
            // Ignore refresh errors; connector can be refreshed manually.
          }
        }
      }

      // Emit result as stream chunk
      emitToolResult(result);

      // Run PostToolUse or PostToolUseFailure hooks based on result
      const hookEvent = result.isError ? 'PostToolUseFailure' : 'PostToolUse';
      if (result.isError) {
        this.recordHeartbeatActivity('error');
      }
      await this.hookExecutor.execute(this.hookLoader.getHooks(hookEvent), {
        session_id: this.sessionId,
        hook_event_name: hookEvent,
        cwd: this.cwd,
        tool_name: toolCall.name,
        tool_input: toolCall.input,
        tool_result: result.content,
      });

      this.pendingToolCalls.delete(toolCall.id);

      if (stopAfterTool) {
        if (options.includeStoppedResults) {
          results.push(result);
        }
        break;
      }

      results.push(result);

      // Update registry load after tool completion
      this.updateRegistryLoad();
    }

    // Clean up abort controller
    this.toolAbortController = null;

    return results;
  }

  private shouldRefreshConnectors(command: string): boolean {
    const trimmed = command.trim();
    const lower = trimmed.toLowerCase();
    if (!lower.startsWith('bun ')) return false;
    if (!/\bbun\s+(add|install|i)\b/.test(lower)) return false;
    if (!/\s(-g|--global)\b/.test(lower)) return false;
    return AssistantLoop.CONNECTOR_INSTALL_PATTERN.test(lower);
  }

  /**
   * Handle slash command
   */
  private async handleCommand(message: string): Promise<CommandResult> {
    const parsed = this.commandExecutor.parseCommand(message);
    const command = parsed ? this.commandLoader.getCommand(parsed.name) : undefined;
    if (parsed?.name === 'connectors' && this.connectorDiscovery) {
      try {
        await this.connectorDiscovery;
      } catch {
        // Ignore discovery errors; command will handle empty state.
      }
    }
    const context: CommandContext = {
      cwd: this.cwd,
      sessionId: this.sessionId,
      messages: this.context.getMessages(),
      tools: this.toolRegistry.getTools(),
      skills: this.skillLoader.getSkills().map(s => ({
        name: s.name,
        description: s.description || '',
        argumentHint: s.argumentHint,
      })),
      connectors: this.connectorBridge.getConnectors().map(c => ({
        name: c.name,
        description: c.description,
        cli: c.cli,
        commands: c.commands.map(cmd => ({
          name: cmd.name,
          description: cmd.description,
        })),
      })),
      getContextInfo: () => this.getContextInfo(),
      getModel: () => this.llmClient?.getModel(),
      getStorageDir: () => this.storageDir,
      getWorkspaceId: () => this.workspaceId,
      summarizeContext: async () => {
        if (!this.contextManager) {
          return {
            messages: this.context.getMessages(),
            summarized: false,
            summary: undefined,
            tokensBefore: 0,
            tokensAfter: 0,
            summarizedCount: 0,
          };
        }
        const result = await this.contextManager.summarizeNow(this.context.getMessages());
        if (result.summarized) {
          this.context.import(result.messages);
        }
        return result;
      },
      getAssistantManager: () => this.mgr.assistant,
      getIdentityManager: () => this.mgr.identity,
      getInboxManager: () => this.mgr.inbox,
      getWalletManager: () => this.mgr.wallet,
      getSecretsManager: () => this.mgr.secrets,
      getMessagesManager: () => this.mgr.messages,
      getWebhooksManager: () => this.mgr.webhooks,
      getChannelsManager: () => this.mgr.channels,
      getChannelAgentPool: () => this.channelAgentPool,
      getPeopleManager: () => this.mgr.people,
      getTelephonyManager: () => this.mgr.telephony,
      getOrdersManager: () => this.mgr.orders,
      getMemoryManager: () => this.mgr.memory,
      getJobManager: () => this.mgr.job ?? null,
      refreshIdentityContext: async () => {
        if (this.mgr.identity) {
          this.identityContext = await this.mgr.identity.buildSystemPromptContext();
        }
      },
      refreshSkills: async () => {
        await this.skillLoader.loadAll(this.cwd, { includeContent: false });
      },
      switchAssistant: async (assistantId: string) => {
        await this.switchAssistant(assistantId);
      },
      switchIdentity: async (identityId: string) => {
        await this.switchIdentity(identityId);
      },
      switchModel: async (modelId: string) => {
        await this.switchModel(modelId);
      },
      getEffortLevel: () => {
        return this.llmClient?.getEffortLevel?.() || this.config?.llm?.effortLevel || 'medium';
      },
      setEffortLevel: (level) => {
        if (this.llmClient?.setEffortLevel) {
          this.llmClient.setEffortLevel(level);
        }
        if (this.config?.llm) {
          this.config.llm.effortLevel = level;
        }
      },
      getActiveProjectId: () => this.activeProjectId,
      setActiveProjectId: (projectId: string | null) => {
        this.activeProjectId = projectId;
      },
      setProjectContext: (content: string | null) => {
        this.setProjectContext(content);
      },
      getVoiceState: () => this.getVoiceState(),
      getHeartbeatState: () => this.getHeartbeatState(),
      getHeartbeatConfig: () => this.heartbeatRuntimeConfig,
      enableVoice: () => {
        if (!this.mgr.voice) {
          throw new Error('Voice support is not available.');
        }
        this.mgr.voice.enable();
      },
      disableVoice: () => {
        if (!this.mgr.voice) {
          throw new Error('Voice support is not available.');
        }
        this.mgr.voice.disable();
      },
      speak: async (text: string) => {
        if (!this.mgr.voice) {
          throw new Error('Voice support is not available.');
        }
        await this.mgr.voice.speak(text);
      },
      listen: async (options) => {
        if (!this.mgr.voice) {
          throw new Error('Voice support is not available.');
        }
        return this.mgr.voice.listen(options);
      },
      stopSpeaking: () => {
        this.mgr.voice?.stopSpeaking();
      },
      stopListening: () => {
        this.mgr.voice?.stopListening();
      },
      talk: async (options) => {
        if (!this.mgr.voice) {
          throw new Error('Voice support is not available.');
        }
        await this.mgr.voice.talk(options);
      },
      stopTalking: () => {
        this.mgr.voice?.stopTalking();
      },
      processForTalk: async (text: string) => {
        return this.processForTalk(text);
      },
      getAutoSend: () => {
        return this.mgr.voice?.getAutoSend() ?? true;
      },
      setAutoSend: (enabled: boolean) => {
        this.mgr.voice?.setAutoSend(enabled);
      },
      refreshConnectors: async () => {
        const connectors = await this.connectorBridge.refresh();
        return {
          count: connectors.length,
          names: connectors.map(c => c.name),
        };
      },
      clearMessages: () => {
        this.resetContext();
      },
      addSystemMessage: (content: string) => {
        this.context.addSystemMessage(content);
      },
      emit: (type: 'text' | 'done' | 'error' | 'partial_transcript', content?: string) => {
        if (type === 'text' && content) {
          this.emit({ type: 'text', content });
        } else if (type === 'done') {
          this.emit({ type: 'done' });
        } else if (type === 'error' && content) {
          this.recordLLMError(content);
          this.emit({ type: 'error', error: content });
        } else if (type === 'partial_transcript') {
          this.emit({ type: 'partial_transcript', content: content || '' });
        }
      },
      getErrorStats: () => this.errorAggregator.getStats(),
      budgetConfig: this.budgetConfig || undefined,
      getBudgetSummary: () => this.getBudgetStatus(),
      setBudgetConfig: (config: BudgetConfig) => {
        this.setBudgetConfig(config);
      },
      setBudgetEnabled: (enabled: boolean) => {
        if (this.budgetTracker) {
          this.budgetTracker.setEnabled(enabled);
          this.budgetConfig = this.budgetTracker.getConfig();
          return;
        }

        if (!enabled) {
          if (this.budgetConfig) {
            this.budgetConfig = {
              ...this.budgetConfig,
              enabled: false,
            };
          }
          return;
        }

        const seed = this.budgetConfig || DEFAULT_BUDGET_CONFIG;
        this.budgetConfig = {
          ...DEFAULT_BUDGET_CONFIG,
          ...seed,
          session: { ...(DEFAULT_BUDGET_CONFIG.session || {}), ...(seed.session || {}) },
          assistant: { ...(DEFAULT_BUDGET_CONFIG.assistant || {}), ...(seed.assistant || {}) },
          swarm: { ...(DEFAULT_BUDGET_CONFIG.swarm || {}), ...(seed.swarm || {}) },
          project: { ...(DEFAULT_BUDGET_CONFIG.project || {}), ...(seed.project || {}) },
          enabled: true,
        };
        this.budgetTracker = new BudgetTracker(this.sessionId, this.budgetConfig);
        this.budgetTracker.setEnabled(true);
        if (this.activeProjectId) {
          this.budgetTracker.setActiveProject(this.activeProjectId);
        }
      },
      resetBudget: (scope?: BudgetScope) => {
        if (!this.budgetTracker) return;
        if (scope) {
          this.budgetTracker.resetUsage(scope);
        } else {
          this.budgetTracker.resetAll();
        }
      },
      resumeBudget: () => {
        if (this.budgetTracker) {
          this.budgetTracker.setEnabled(true);
        }
      },
      getHooks: () => this.hookLoader.getAllHooks?.() ?? {},
      setHookEnabled: async (_hookId: string, _enabled: boolean) => {
        // Hook enable/disable is managed by the hook store, not the loader
        return false;
      },
      guardrailsConfig: this.guardrailsConfig || undefined,
      setGuardrailsEnabled: (enabled: boolean) => {
        if (this.policyEvaluator) {
          this.policyEvaluator.setEnabled(enabled);
        } else if (enabled && this.guardrailsConfig) {
          // Create evaluator if enabling and we have config
          this.policyEvaluator = new PolicyEvaluator(this.guardrailsConfig);
          this.policyEvaluator.setEnabled(true);
        }
      },
      addGuardrailsPolicy: (policy) => {
        if (this.policyEvaluator) {
          this.policyEvaluator.addPolicy(policy);
        } else {
          // Create evaluator with this policy
          this.guardrailsConfig = {
            enabled: true,
            policies: [policy],
            defaultAction: 'allow',
          };
          this.policyEvaluator = new PolicyEvaluator(this.guardrailsConfig);
        }
      },
      removeGuardrailsPolicy: (policyId: string) => {
        if (this.policyEvaluator) {
          this.policyEvaluator.removePolicy(policyId);
        }
      },
      setGuardrailsDefaultAction: (action) => {
        if (this.policyEvaluator) {
          const config = this.policyEvaluator.getConfig();
          this.policyEvaluator.updateConfig({ ...config, defaultAction: action });
        }
      },
      getSwarmCoordinator: () => this.getOrCreateSwarmCoordinator(),
      getPermissionMode: () => this.getPermissionMode(),
      setPermissionMode: (mode) => this.setPermissionMode(mode),
    };

    const result = await this.commandExecutor.execute(message, context);

    if (!result.handled && result.prompt) {
      this.currentAllowedTools = this.normalizeAllowedTools(command?.allowedTools);
    }

    return result;
  }

  private recordLLMError(message?: string): void {
    const text = message || 'LLM error';
    this.recordHeartbeatActivity('error');
    this.setHeartbeatState('error');
    const parsed = parseErrorCode(text);
    if (parsed) {
      this.errorAggregator.record(new AssistantError(parsed.message, {
        code: parsed.code,
        recoverable: true,
        retryable: false,
        userFacing: true,
      }));
      return;
    }
    this.errorAggregator.record(new AssistantError(text, {
      code: ErrorCodes.LLM_API_ERROR,
      recoverable: true,
      retryable: false,
      userFacing: true,
    }));
  }

  /**
   * Handle skill invocation
   */
  private async handleSkillInvocation(message: string): Promise<boolean> {
    const match = message.match(/^\/(\S+)(?:\s+(.*))?$/);
    if (!match) return false;

    const [, skillName, args] = match;
    const skill = this.skillLoader.getSkill(skillName);

    if (!skill) {
      // Not a skill, let the LLM handle it
      return false;
    }

    // Execute the skill
    const argsList = args ? args.split(/\s+/) : [];
    const hydrated = await this.skillLoader.ensureSkillContent(skill.name);
    if (!hydrated) {
      this.context.addAssistantMessage(`Skill "${skillName}" could not be loaded.`);
      return true;
    }
    const content = await this.skillExecutor.prepare(hydrated, argsList);

    // Add skill content as context
    this.currentAllowedTools = this.normalizeAllowedTools(skill.allowedTools);
    this.context.addSystemMessage(content);
    this.context.addUserMessage(`Execute the "${skillName}" skill with arguments: ${args || '(none)'}`);

    try {
      await this.runLoop();
    } finally {
      this.currentAllowedTools = null;
    }
    return true;
  }

  /**
   * Ensure we emit a terminal chunk for command-only paths.
   */
  private ensureTerminalChunk(): void {
    if (!this.emittedTerminalChunk) {
      this.emit({ type: 'done' });
    }
  }

  /**
   * Emit a stream chunk
   */
  private emit(chunk: StreamChunk): void {
    if (chunk.type === 'done' || chunk.type === 'error') {
      this.emittedTerminalChunk = true;
    }
    this.onChunk?.(chunk);
  }

  /**
   * Emit a notification with hook support
   * Fires Notification hook first, which can suppress or modify the notification
   */
  async emitNotification(params: {
    type: string;
    title: string;
    message: string;
    priority?: 'low' | 'normal' | 'high';
  }): Promise<void> {
    // Fire Notification hook
    const hookResult = await this.hookExecutor.execute(
      this.hookLoader.getHooks('Notification'),
      {
        session_id: this.sessionId,
        hook_event_name: 'Notification',
        cwd: this.cwd,
        notification_type: params.type,
        title: params.title,
        message: params.message,
        priority: params.priority || 'normal',
      }
    );

    // If hook suppresses the notification, don't emit
    if (hookResult?.suppress) {
      return;
    }

    // Apply any modifications from hook
    const finalTitle = (hookResult?.updatedInput?.title as string) || params.title;
    const finalMessage = (hookResult?.updatedInput?.message as string) || params.message;

    // Emit the notification as a text chunk
    this.emit({ type: 'text', content: `\n[${finalTitle}] ${finalMessage}\n` });
  }

  /**
   * Stop the current processing
   */
  stop(): void {
    this.shouldStop = true;
    // Clear pending tool calls so late results don't contaminate state
    this.pendingToolCalls.clear();
    // Abort any running tool executions
    if (this.toolAbortController) {
      this.toolAbortController.abort();
      this.toolAbortController = null;
    }
    this.mgr.voice?.stopTalking();
    this.setHeartbeatState('stopped');
    // Emit stopped chunk so clients can drain queues
    this.emit({ type: 'stopped' });
  }

  /**
   * Shutdown background systems and timers
   */
  shutdown(): void {
    // Fire SessionEnd hook (fire-and-forget for backwards compatibility)
    this.fireSessionEndHook('shutdown').catch(() => {});

    this.shouldStop = true;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.heartbeatManager?.stop();
    // Deregister from registry
    this.deregisterFromRegistry();
    this.mgr.voice?.stopTalking();
    // Stop message watching
    this.mgr.messages?.stopWatching();
    // Stop webhook watching
    this.mgr.webhooks?.stopWatching();
    // Close channels database connection and agent pool
    this.channelAgentPool?.shutdown();
    this.channelAgentPool = null;
    this.mgr.channels?.close();
    this.mgr.channels = null;
    // Close telephony connections
    this.mgr.telephony?.close();
    this.mgr.telephony = null;
    // Close orders database connection
    this.mgr.orders?.close();
    this.mgr.orders = null;
    // Close memory database connection
    this.mgr.memory?.close();
    this.mgr.memory = null;
    this.memoryInjector = null;
    // Close the unified database connection
    closeDatabase();
  }

  /**
   * Async shutdown that waits for SessionEnd hook
   */
  async shutdownAsync(reason: string = 'shutdown'): Promise<void> {
    await this.fireSessionEndHook(reason);
    this.shutdown();
  }

  /**
   * Fire SessionEnd hook with session statistics
   */
  private async fireSessionEndHook(reason: string): Promise<void> {
    const messages = this.context.getMessages();
    const tokenUsage = this.getTokenUsage();

    // Count tool calls from all messages
    let toolCallCount = 0;
    for (const msg of messages) {
      if (msg.toolCalls) {
        toolCallCount += msg.toolCalls.length;
      }
    }

    const hookInput = {
      session_id: this.sessionId,
      hook_event_name: 'SessionEnd' as const,
      cwd: this.cwd,
      reason,
      duration_ms: Date.now() - this.sessionStartTime,
      message_count: messages.length,
      tool_calls: toolCallCount,
      token_usage: {
        input: tokenUsage.inputTokens,
        output: tokenUsage.outputTokens,
        total: tokenUsage.totalTokens,
      },
    };

    // Extract topic keywords from the session and store with session metadata
    // Uses a lightweight word-frequency approach — no LLM call needed
    this.extractAndSaveTopics(messages);

    await this.hookExecutor.execute(
      this.hookLoader.getHooks('SessionEnd'),
      hookInput
    );
  }

  /** Extract top keywords from session messages and store as session label/metadata */
  private extractAndSaveTopics(messages: { role?: string; content?: unknown }[]): void {
    try {
      const stopWords = new Set(['that', 'this', 'with', 'from', 'they', 'have', 'what',
        'will', 'been', 'were', 'when', 'your', 'which', 'their', 'about', 'there',
        'would', 'could', 'should', 'just', 'into', 'also', 'some', 'than', 'then']);
      const freq: Record<string, number> = {};

      for (const msg of messages) {
        if (msg.role !== 'user') continue;
        const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? '');
        for (const word of text.toLowerCase().split(/\W+/)) {
          if (word.length > 4 && !stopWords.has(word)) {
            freq[word] = (freq[word] ?? 0) + 1;
          }
        }
      }

      const topics = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([w]) => w);

      if (topics.length > 0) {
        // Store topics in the session file via logger metadata
        // Log topics via console (loop doesn't have a logger instance)
        if (process.env.ASSISTANTS_DEBUG) {
          console.error(`[assistants] Session topics: ${topics.join(', ')}`);
        }
      }
    } catch {
      // Topic extraction is non-critical — never throw
    }
  }

  /**
   * Get the current context
   */
  getContext(): AssistantContext {
    return this.context;
  }

  /**
   * Get current voice state
   */
  getVoiceState(): VoiceState | null {
    return this.mgr.voice?.getState() ?? null;
  }

  /**
   * Get current heartbeat state
   */
  getHeartbeatState(): HeartbeatState | null {
    if (!this.heartbeatManager || this.config?.heartbeat?.enabled === false) {
      return null;
    }

    const staleThresholdMs = this.config?.heartbeat?.staleThresholdMs ?? 120000;
    const lastActivity = this.heartbeatManager.getLastActivity();
    const age = Date.now() - lastActivity;
    const stats = this.heartbeatManager.getStats();
    const intervalMs = this.heartbeatRuntimeConfig?.intervalMs ?? this.config?.heartbeat?.intervalMs ?? 15000;
    const nextHeartbeatAt = this.heartbeatManager.getNextHeartbeatAt();

    return {
      enabled: true,
      state: this.heartbeatManager.getState(),
      lastActivity: new Date(lastActivity).toISOString(),
      uptimeSeconds: stats.uptimeSeconds,
      isStale: age > staleThresholdMs,
      intervalMs,
      nextHeartbeatAt: new Date(nextHeartbeatAt).toISOString(),
    };
  }

  getAssistantManager(): AssistantManager | null {
    return this.mgr.assistant;
  }

  getIdentityManager(): IdentityManager | null {
    return this.mgr.identity;
  }

  getMemoryManager(): GlobalMemoryManager | null {
    return this.mgr.memory;
  }

  getMessagesManager(): MessagesManager | null {
    return this.mgr.messages;
  }

  getWebhooksManager(): WebhooksManager | null {
    return this.mgr.webhooks;
  }

  getChannelsManager(): ChannelsManager | null {
    return this.mgr.channels;
  }

  getChannelAgentPool(): ChannelAgentPool | null {
    return this.channelAgentPool;
  }

  getPeopleManager(): PeopleManager | null {
    return this.mgr.people;
  }

  /** @deprecated Contacts now use @hasna/contacts SDK directly — no local manager */
  getContactsManager(): null {
    return null;
  }

  getTelephonyManager(): TelephonyManager | null {
    return this.mgr.telephony;
  }

  getOrdersManager(): OrdersManager | null {
    return this.mgr.orders;
  }

  getJobManager(): JobManager | null {
    return this.mgr.job;
  }

  getWalletManager(): WalletManager | null {
    return this.mgr.wallet;
  }

  getSecretsManager(): SecretsManager | null {
    return this.mgr.secrets;
  }

  getInboxManager(): InboxManager | null {
    return this.mgr.inbox;
  }

  async refreshIdentityContext(): Promise<void> {
    if (this.mgr.identity) {
      this.identityContext = await this.mgr.identity.buildSystemPromptContext();
    }
  }

  getAssistantId(): string | null {
    return this.mgr.assistant?.getActiveId() ?? null;
  }

  getIdentityInfo(): ActiveIdentityInfo {
    return {
      assistant: this.mgr.assistant?.getActive() ?? null,
      identity: this.mgr.identity?.getActive() ?? null,
    };
  }

  private async switchAssistant(assistantId: string): Promise<void> {
    if (!this.mgr.assistant) {
      throw new Error('Assistant manager not initialized');
    }
    await this.mgr.assistant.switchAssistant(assistantId);
    const active = this.mgr.assistant.getActive();
    if (!active) {
      this.mgr.identity = null;
      this.identityContext = null;
      return;
    }
    this.mgr.identity = this.mgr.assistant.getIdentityManager(active.id);
    await this.mgr.identity.initialize();
    if (this.mgr.identity.listIdentities().length === 0) {
      await this.mgr.identity.createIdentity({ name: 'Default' });
    }
    this.identityContext = await this.mgr.identity.buildSystemPromptContext();
  }

  private async switchIdentity(identityId: string): Promise<void> {
    if (!this.mgr.identity) {
      throw new Error('Identity manager not initialized');
    }
    await this.mgr.identity.switchIdentity(identityId);
    this.identityContext = await this.mgr.identity.buildSystemPromptContext();
  }

  /**
   * Switch to a different model at runtime
   */
  private async switchModel(modelId: string): Promise<void> {
    if (!this.config) {
      throw new Error('Assistant not initialized');
    }

    // Import dynamically to avoid circular dependency
    const { getModelById } = await import('../llm/models');

    const modelDef = getModelById(modelId);

    // Create new LLM client with the new model
    const newConfig = {
      ...this.config.llm,
      model: modelId,
    };

    this.llmClient = await createLLMClient(newConfig);
    this.hookExecutor.setLLMClient(this.llmClient);

    // Update config.llm to reflect the new model/provider
    // This ensures downstream consumers (summary client, reporting, etc.) see the correct model
    this.config.llm = newConfig;

    // Recompute context config with new model's context window
    // This allows expanding when switching to a larger model
    if (this.contextConfig) {
      const limits = getLimits();
      const fallbackContext = this.contextConfig.maxContextTokens || this.config.context?.maxContextTokens || 128000;
      const modelContextWindow = modelDef?.contextWindow ?? fallbackContext;
      // Use config's maxContextTokens if set, otherwise use the model's context window
      const configuredMax = this.config.context?.maxContextTokens ?? modelContextWindow;
      // Cap at both validation limits and model's actual context window
      const newMaxContextTokens = Math.max(
        1000,
        Math.min(configuredMax, limits.maxTotalContextTokens, modelContextWindow)
      );

      this.contextConfig.maxContextTokens = newMaxContextTokens;

      // Also update targetContextTokens to stay proportional (85% of max)
      const configuredTarget = this.config.context?.targetContextTokens;
      if (!configuredTarget) {
        this.contextConfig.targetContextTokens = Math.floor(newMaxContextTokens * 0.85);
      } else {
        // Keep configured target but cap at new max
        this.contextConfig.targetContextTokens = Math.min(configuredTarget, newMaxContextTokens);
      }

      this.builtinCommands.updateTokenUsage({
        maxContextTokens: this.contextConfig.maxContextTokens,
      });
    }
  }

  /**
   * Replace context messages (used for session restore)
   */
  importContext(messages: Message[]): void {
    this.context.import(messages);
    this.contextManager?.refreshState(messages);
  }

  /**
   * Get all available tools
   */
  getTools(): Tool[] {
    return this.toolRegistry.getTools();
  }

  /**
   * Get all loaded skills
   */
  getSkills() {
    return this.skillLoader.getSkills();
  }

  /**
   * Reload skills from disk
   */
  async refreshSkills(): Promise<void> {
    await this.skillLoader.loadAll(this.cwd, { includeContent: false });
  }

  /**
   * Get the skill loader (for panel operations)
   */
  getSkillLoader() {
    return this.skillLoader;
  }

  /**
   * Get all loaded commands
   */
  getCommands() {
    return this.commandLoader.getCommands();
  }

  /**
   * Get current token usage
   */
  getTokenUsage(): TokenUsage {
    return this.builtinCommands.getTokenUsage();
  }

  /**
   * Get current LLM model
   */
  getModel(): string | null {
    return this.llmClient?.getModel() ?? this.config?.llm?.model ?? null;
  }

  /**
   * Get current context info
   */
  getContextInfo(): ContextInfo | null {
    if (!this.contextManager || !this.contextConfig) return null;
    return {
      config: this.contextConfig,
      state: this.contextManager.getState(),
    };
  }

  /**
   * Update token usage (called by LLM client)
   */
  updateTokenUsage(usage: Partial<TokenUsage>): void {
    this.builtinCommands.updateTokenUsage(usage);
    this.statsTracker.updateTokenUsage(usage);
    this.statsTracker.onLlmCall();
    this.onTokenUsage?.(this.builtinCommands.getTokenUsage());

    // Track budget usage
    if (this.budgetTracker && (usage.inputTokens || usage.outputTokens)) {
      this.budgetTracker.recordLlmCall(
        usage.inputTokens || 0,
        usage.outputTokens || 0,
        0 // Duration tracked separately
      );
      this.checkBudgetWarnings();
    }
  }

  /**
   * Record a tool call in the budget tracker
   */
  private recordToolCallBudget(durationMs: number): void {
    if (this.budgetTracker) {
      this.budgetTracker.recordToolCall(durationMs);
      this.checkBudgetWarnings();
    }
  }

  /**
   * Check budget limits and emit warnings
   */
  private checkBudgetWarnings(): void {
    if (!this.budgetTracker || !this.budgetTracker.isEnabled()) return;

    let sessionStatus = this.budgetTracker.checkBudget('session');
    let exceeded = sessionStatus.overallExceeded;

    // Collect all warnings
    const warnings: string[] = [];
    for (const [_metric, check] of Object.entries(sessionStatus.checks)) {
      if (check?.warning) {
        warnings.push(check.warning);
      }
    }

    // Also check project budget if active
    if (this.budgetTracker.getActiveProject()) {
      const projectStatus = this.budgetTracker.checkBudget('project');
      for (const [_metric, check] of Object.entries(projectStatus.checks)) {
        if (check?.warning) {
          warnings.push(`[project] ${check.warning}`);
        }
      }
      if (projectStatus.overallExceeded) {
        exceeded = true;
      }
    }

    // Emit warnings
    if (warnings.length > 0) {
      this.onBudgetWarning?.(warnings.join('; '));
    }

    // Check if exceeded and handle based on onExceeded config
    if (exceeded) {
      const onExceeded = this.budgetConfig?.onExceeded || 'warn';
      if (onExceeded === 'stop') {
        this.onBudgetWarning?.('Budget exceeded - stopping assistant');
        this.stop();
      } else if (onExceeded === 'pause') {
        this.onBudgetWarning?.('Budget exceeded - pausing (requires /budgets resume to continue)');
        this.paused = true;
      }
    }
  }

  /**
   * Check if budget is exceeded (can be used before starting a turn)
   */
  isBudgetExceeded(): boolean {
    if (!this.budgetTracker || !this.budgetTracker.isEnabled()) return false;
    return this.budgetTracker.isAnyExceeded();
  }

  /**
   * Check if the assistant is currently paused
   */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Resume from budget pause
   */
  resume(): void {
    if (this.paused) {
      this.paused = false;
      if (this.pauseResolve) {
        this.pauseResolve();
      }
    }
  }

  /**
   * Reset budget usage counters
   */
  resetBudget(scope?: BudgetScope): void {
    if (!this.budgetTracker) return;
    if (scope) {
      this.budgetTracker.resetUsage(scope);
    } else {
      this.budgetTracker.resetAll();
    }
  }

  /**
   * Get current budget status
   */
  getBudgetStatus() {
    if (!this.budgetTracker) return null;
    return this.budgetTracker.getSummary();
  }

  /**
   * Update the budget configuration for this session
   */
  setBudgetConfig(config: BudgetConfig): void {
    this.budgetConfig = { ...config };
    if (this.budgetTracker) {
      this.budgetTracker.updateConfig(this.budgetConfig);
    } else {
      this.budgetTracker = new BudgetTracker(this.sessionId, this.budgetConfig);
    }
    if (this.activeProjectId && this.budgetTracker) {
      this.budgetTracker.setActiveProject(this.activeProjectId);
    }
  }

  /**
   * Check if assistant is currently running
   */
  isProcessing(): boolean {
    return this.isRunning;
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  getActiveProjectId(): string | null {
    return this.activeProjectId;
  }

  setActiveProjectId(projectId: string | null): void {
    this.activeProjectId = projectId;
    if (this.budgetTracker) {
      this.budgetTracker.setActiveProject(projectId);
    }
  }

  setProjectContext(content: string | null): void {
    const tag = '[Project Context]';
    this.projectContext = content;
    this.context.removeSystemMessages((message) => message.startsWith(tag));
    if (content && content.trim()) {
      this.context.addSystemMessage(`${tag}\n${content.trim()}`);
    }
    this.contextManager?.refreshState(this.context.getMessages());
  }

  setAskUserHandler(handler: AskUserHandler | null): void {
    this.askUserHandler = handler;
  }

  setInterviewHandler(handler: InterviewHandler | null): void {
    this.interviewHandler = handler;
  }

  /**
   * Clear conversation
   */
  clearConversation(): void {
    this.resetContext();
  }

  private async startAssistantHeartbeat(): Promise<void> {
    if (!this.config) return;
    if (this.config.heartbeat?.enabled === false) return;

    const heartbeatConfig = this.buildHeartbeatConfig(this.config);
    if (!heartbeatConfig) return;
    this.heartbeatRuntimeConfig = heartbeatConfig;

    this.heartbeatManager = new HeartbeatManager(heartbeatConfig);
    this.heartbeatPersistence = new StatePersistence(this.sessionId);
    this.heartbeatRecovery = new RecoveryManager(
      this.heartbeatPersistence,
      heartbeatConfig.persistPath,
      heartbeatConfig.staleThresholdMs,
      {
        autoResume: false,
        maxAgeMs: 24 * 60 * 60 * 1000,
      }
    );

    this.heartbeatManager.onHeartbeat((heartbeat) => {
      void this.persistHeartbeat(heartbeat);
      // Also send heartbeat to registry
      if (this.registeredAssistantId && this.registryService) {
        this.registryService.heartbeat(this.registeredAssistantId);
      }
    });

    await this.checkRecovery();
    this.heartbeatManager.start(this.sessionId);
    this.heartbeatManager.setState('idle');

    // Register assistant in registry
    this.registerInRegistry();
  }

  /**
   * Register this assistant in the global registry
   */
  private registerInRegistry(): void {
    try {
      this.registryService = getGlobalRegistry();
      if (!this.registryService.isEnabled()) return;

      // Cleanup stale assistants on startup (from previous crashed sessions)
      this.registryService.cleanupStaleAssistants();

      // Determine assistant type based on depth
      const assistantType: AssistantType = this.depth > 0 ? 'subassistant' : 'assistant';

      // Get tools and skills for capability registration
      const tools = this.toolRegistry.getTools().map((t: Tool) => t.name);
      const skills = this.skillLoader.getSkills().map((s) => s.name);

      // Register the assistant
      const assistantName = this.mgr.assistant?.getActive()?.name ||
        this.mgr.identity?.getActive()?.profile?.displayName ||
        `Assistant ${this.sessionId.slice(0, 8)}`;
      const registered = this.registryService.register({
        id: `assistant_${this.sessionId}`,
        name: assistantName,
        type: assistantType,
        sessionId: this.sessionId,
        capabilities: {
          tools,
          skills,
          models: [this.config?.llm?.model || 'anthropic:claude-sonnet-4-20250514'],
          tags: this.depth > 0 ? ['subassistant'] : ['main'],
          maxConcurrent: 5,
          maxDepth: this.config?.subassistants?.maxDepth ?? 3,
        },
        metadata: {
          cwd: this.cwd,
          assistantId: this.assistantId,
          depth: this.depth,
        },
      });

      this.registeredAssistantId = registered.id;
    } catch {
      // Registry registration failed, non-critical
    }
  }

  /**
   * Deregister this assistant from the global registry
   */
  private deregisterFromRegistry(): void {
    if (!this.registeredAssistantId || !this.registryService) return;

    try {
      this.registryService.deregister(this.registeredAssistantId);
      this.registeredAssistantId = null;
    } catch {
      // Deregistration failed, non-critical
    }
  }

  /**
   * Update assistant status in registry
   */
  private updateRegistryStatus(state: AssistantState, taskDescription?: string): void {
    if (!this.registeredAssistantId || !this.registryService) return;

    try {
      this.registryService.updateStatus(this.registeredAssistantId, {
        state,
        currentTask: state === 'processing' ? 'processing_message' : undefined,
        taskDescription,
        uptime: Math.floor((Date.now() - this.sessionStartTime) / 1000),
      });
    } catch {
      // Status update failed, non-critical
    }
  }

  /**
   * Update assistant load in registry
   */
  private updateRegistryLoad(): void {
    if (!this.registeredAssistantId || !this.registryService) return;

    try {
      const stats = this.builtinCommands.getTokenUsage();
      this.registryService.updateLoad(this.registeredAssistantId, {
        activeTasks: this.pendingToolCalls.size,
        tokensUsed: stats.inputTokens + stats.outputTokens,
        currentDepth: this.depth,
      });
    } catch {
      // Load update failed, non-critical
    }
  }

  private async persistHeartbeat(heartbeat: Heartbeat): Promise<void> {
    if (!this.heartbeatPersistence) return;

    await this.heartbeatPersistence.save({
      sessionId: this.sessionId,
      heartbeat,
      context: {
        cwd: this.cwd,
        lastMessage: this.lastUserMessage || undefined,
        lastTool: this.lastToolName || undefined,
        pendingToolCalls: this.pendingToolCalls.size > 0 ? Array.from(this.pendingToolCalls.values()) : undefined,
      },
      timestamp: new Date().toISOString(),
    });
  }

  private async checkRecovery(): Promise<void> {
    if (!this.heartbeatRecovery) return;
    const recovery = await this.heartbeatRecovery.checkForRecovery();
    if (!recovery.available || !recovery.state) return;

    const message = `\n[Recovery available from ${recovery.state.timestamp} - last state ${recovery.state.heartbeat.state}]\n`;
    this.emit({ type: 'text', content: message });
  }

  private setHeartbeatState(state: AssistantState): void {
    this.heartbeatManager?.setState(state);
    // Also update registry
    this.updateRegistryStatus(state);
    // Update load when state changes
    if (state === 'processing') {
      this.updateRegistryLoad();
    }
  }

  private recordHeartbeatActivity(type: 'message' | 'tool' | 'error'): void {
    this.heartbeatManager?.recordActivity(type);
  }

  /**
   * Inject pending messages into context at turn start
   */
  private async injectPendingMessages(): Promise<void> {
    if (!this.mgr.messages) return;

    try {
      if (this.pendingCtx.messages) {
        const previous = this.pendingCtx.messages.trim();
        this.context.removeSystemMessages((content) => content.trim() === previous);
        this.pendingCtx.messages = null;
      }

      const pending = await this.mgr.messages.getUnreadForInjection();
      if (pending.length === 0) {
        return;
      }

      // Build and store context string
      this.pendingCtx.messages = this.mgr.messages.buildInjectionContext(pending);

      // Add as system message so it appears in context
      if (this.pendingCtx.messages) {
        this.context.addSystemMessage(this.pendingCtx.messages);
      }

      // Mark messages as injected
      await this.mgr.messages.markInjected(pending.map((m) => m.id));
    } catch (error) {
      // Log but don't fail - messages are non-critical
      console.error('Failed to inject pending messages:', error);
      this.pendingCtx.messages = null;
    }
  }

  /**
   * Inject pending webhook events into context at turn start
   */
  private async injectPendingWebhookEvents(): Promise<void> {
    if (!this.mgr.webhooks) return;

    try {
      if (this.pendingCtx.webhooks) {
        const previous = this.pendingCtx.webhooks.trim();
        this.context.removeSystemMessages((content) => content.trim() === previous);
        this.pendingCtx.webhooks = null;
      }

      const pending = await this.mgr.webhooks.getPendingForInjection();
      if (pending.length === 0) {
        return;
      }

      // Build and store context string
      this.pendingCtx.webhooks = this.mgr.webhooks.buildInjectionContext(pending);

      // Add as system message so it appears in context
      if (this.pendingCtx.webhooks) {
        this.context.addSystemMessage(this.pendingCtx.webhooks);
      }

      // Mark events as injected
      await this.mgr.webhooks.markInjected(
        pending.map((e) => ({ webhookId: e.webhookId, eventId: e.id }))
      );
    } catch (error) {
      // Log but don't fail - webhooks are non-critical
      console.error('Failed to inject pending webhook events:', error);
      this.pendingCtx.webhooks = null;
    }
  }

  /**
   * Inject pending channel messages into context at turn start
   */
  private async injectPendingChannelMessages(): Promise<void> {
    if (!this.mgr.channels) return;

    try {
      if (this.pendingCtx.channels) {
        const previous = this.pendingCtx.channels.trim();
        this.context.removeSystemMessages((content) => content.trim() === previous);
        this.pendingCtx.channels = null;
      }

      const pending = this.mgr.channels.getUnreadForInjection();
      if (pending.length === 0) {
        return;
      }

      // Build and store context string
      this.pendingCtx.channels = this.mgr.channels.buildInjectionContext(pending);

      // Add as system message so it appears in context
      if (this.pendingCtx.channels) {
        this.context.addSystemMessage(this.pendingCtx.channels);
      }

      // Mark messages as read
      this.mgr.channels.markInjected(pending);
    } catch (error) {
      // Log but don't fail - channels are non-critical
      console.error('Failed to inject pending channel messages:', error);
      this.pendingCtx.channels = null;
    }
  }

  /**
   * Inject pending telephony messages into context at turn start
   */
  private async injectPendingTelephonyMessages(): Promise<void> {
    if (!this.mgr.telephony) return;

    try {
      if (this.pendingCtx.telephony) {
        const previous = this.pendingCtx.telephony.trim();
        this.context.removeSystemMessages((content) => content.trim() === previous);
        this.pendingCtx.telephony = null;
      }

      const pending = this.mgr.telephony.getUnreadForInjection();
      if (pending.length === 0) {
        return;
      }

      this.pendingCtx.telephony = this.mgr.telephony.buildInjectionContext(pending);

      if (this.pendingCtx.telephony) {
        this.context.addSystemMessage(this.pendingCtx.telephony);
      }

      this.mgr.telephony.markInjected(pending);
    } catch (error) {
      console.error('Failed to inject pending telephony messages:', error);
      this.pendingCtx.telephony = null;
    }
  }

  /**
   * Inject pending order updates into context at turn start
   */
  private async injectPendingOrderUpdates(): Promise<void> {
    if (!this.mgr.orders) return;

    try {
      if (this.pendingCtx.orders) {
        const previous = this.pendingCtx.orders.trim();
        this.context.removeSystemMessages((content) => content.trim() === previous);
        this.pendingCtx.orders = null;
      }

      const pending = this.mgr.orders.getUnreadForInjection();
      if (pending.length === 0) {
        return;
      }

      this.pendingCtx.orders = this.mgr.orders.buildInjectionContext(pending);

      if (this.pendingCtx.orders) {
        this.context.addSystemMessage(this.pendingCtx.orders);
      }

      this.mgr.orders.markInjected(pending);
    } catch (error) {
      console.error('Failed to inject pending order updates:', error);
      this.pendingCtx.orders = null;
    }
  }

  /**
   * Inject relevant memories into context at turn start
   */
  private async injectMemoryContext(userMessage: string): Promise<void> {
    if (!this.memoryInjector || !this.memoryInjector.isEnabled()) return;

    try {
      // Remove previous memory context if it exists
      if (this.pendingCtx.memory) {
        const previous = this.pendingCtx.memory.trim();
        this.context.removeSystemMessages((content) => content.trim() === previous);
        this.pendingCtx.memory = null;
      }

      // Prepare new memory injection based on user's message
      const result = await this.memoryInjector.prepareInjection(userMessage);
      if (result.content) {
        this.pendingCtx.memory = result.content;
        // Memory context will be added via buildSystemPrompt
      }
    } catch (error) {
      // Log but don't fail - memory injection is non-critical
      console.error('Failed to inject memory context:', error);
      this.pendingCtx.memory = null;
    }
  }

  /**
   * Inject environment context (datetime, cwd, project, etc.) at turn start
   */
  private async injectContextInfo(): Promise<void> {
    if (!this.contextInjector || !this.contextInjector.isEnabled()) return;

    try {
      // Remove previous context injection if it exists
      if (this.pendingCtx.injection) {
        const previous = this.pendingCtx.injection.trim();
        this.context.removeSystemMessages((content) => content.trim() === previous);
        this.pendingCtx.injection = null;
      }

      // Prepare new context injection
      const result = await this.contextInjector.prepareInjection();
      if (result.content) {
        this.pendingCtx.injection = result.content;
        // Context injection will be added via buildSystemPrompt
      }
    } catch (error) {
      // Log but don't fail - context injection is non-critical
      console.error('Failed to inject context info:', error);
      this.pendingCtx.injection = null;
    }
  }

  /**
   * Inject pending tasks from @hasna/todos REST API into context.
   * Only runs when TODOS_URL is set. Silent on failure.
   */
  private async injectTasksContext(): Promise<void> {
    if (!process.env.TODOS_URL) return;

    try {
      // Only update tasks context on first turn (they don't change per message)
      if (this.pendingCtx.tasks !== null) return;

      const { buildTasksContextPrompt } = await import('../tasks/context-builder');
      const content = await buildTasksContextPrompt();
      if (content) {
        this.pendingCtx.tasks = content;
      }
    } catch {
      // Non-critical — silently skip if todos is unavailable
    }
  }

  /**
   * Inject recent sessions from @hasna/sessions REST API into context.
   * Only runs when SESSIONS_URL is set. Silent on failure.
   */
  private async injectSessionsContext(): Promise<void> {
    if (!process.env.SESSIONS_URL) return;

    try {
      // Only update sessions context on first turn
      if (this.pendingCtx.sessions !== null) return;

      const { buildSessionsContextPrompt } = await import('../sessions/context-builder');
      const content = await buildSessionsContextPrompt();
      if (content) {
        this.pendingCtx.sessions = content;
      }
    } catch {
      // Non-critical — silently skip if sessions is unavailable
    }
  }

  private startHeartbeat(): void {
    if (!this.config) return;
    if (this.config.scheduler?.enabled === false) return;
    const interval = this.config.scheduler?.heartbeatIntervalMs ?? 30000;
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      this.tickHeartbeat();
    }, interval);
    if (typeof (this.heartbeatTimer as any).unref === 'function') {
      (this.heartbeatTimer as any).unref();
    }
  }

  private async tickHeartbeat(): Promise<void> {
    if (this.config?.scheduler?.enabled === false) return;
    try {
      const now = Date.now();
      const due = await getDueSchedules(this.cwd, now);
      for (const schedule of due) {
        if (schedule.sessionId && schedule.sessionId !== this.sessionId) {
          continue;
        }
        const alreadyQueued = this.scheduledQueue.some((item) => item.id === schedule.id);
        if (alreadyQueued) {
          continue;
        }
        let scheduleToQueue = schedule;
        if (!schedule.sessionId) {
          const claimed = await updateSchedule(this.cwd, schedule.id, (current) => {
            if (current.sessionId) return current;
            return {
              ...current,
              sessionId: this.sessionId,
              updatedAt: Date.now(),
            };
          }, { ownerId: this.sessionId });
          if (!claimed || (claimed.sessionId && claimed.sessionId !== this.sessionId)) {
            continue;
          }
          scheduleToQueue = claimed;
        }
        this.scheduledQueue.push(scheduleToQueue);
      }
      await this.drainScheduledQueue();
    } catch (error) {
      console.error('Scheduler heartbeat error:', error);
    }
  }

  private async drainScheduledQueue(): Promise<void> {
    if (this.drainingScheduled) return;
    if (this.isRunning) return;
    if (this.scheduledQueue.length === 0) return;

    this.drainingScheduled = true;
    try {
      while (this.scheduledQueue.length > 0 && !this.isRunning) {
        const schedule = this.scheduledQueue.shift();
        if (!schedule) break;

        const current = await readSchedule(this.cwd, schedule.id);
        if (
          !current ||
          current.status !== 'active' ||
          !current.nextRunAt ||
          current.nextRunAt > Date.now() ||
          (current.sessionId && current.sessionId !== this.sessionId)
        ) {
          continue;
        }

        try {
          // Determine what content to run based on action type
          // 'message' type injects custom message into assistant session
          // 'command' type (or undefined for backwards compatibility) runs the command
          const contentToRun = current.actionType === 'message'
            ? (current.message || current.command)
            : current.command;
          const result = await this.runMessage(contentToRun, 'schedule');
          const now = Date.now();
          await updateSchedule(this.cwd, schedule.id, (live) => {
            const updated: ScheduledCommand = {
              ...live,
              updatedAt: now,
              lastRunAt: now,
              lastResult: {
                ok: result.ok,
                summary: result.summary,
                error: result.error,
              },
            };

            if (live.schedule.kind === 'once') {
              updated.status = result.ok ? 'completed' : 'error';
              updated.nextRunAt = undefined;
            } else {
              updated.status = live.status === 'paused' ? 'paused' : 'active';
              updated.nextRunAt = computeNextRun(updated, now);
            }
            return updated;
          }, { ownerId: this.sessionId });
        } catch {
          // Schedule execution error handled by updateSchedule above
        }
      }
    } finally {
      this.drainingScheduled = false;
    }
  }

  /**
   * Reset context and re-apply system prompt
   */
  private resetContext(): void {
    const maxMessages = this.contextConfig?.maxMessages ?? 100;
    this.context = new AssistantContext(maxMessages);

    // Clear pending injections to prevent stale context
    this.pendingCtx.injection = null;
    this.pendingCtx.memory = null;

    if (this.systemPrompt) {
      this.context.addSystemMessage(this.systemPrompt);
    }
    if (this.extraSystemPrompt) {
      this.context.addSystemMessage(this.extraSystemPrompt);
    }
    if (this.projectContext) {
      this.setProjectContext(this.projectContext);
    }
    this.contextManager?.refreshState(this.context.getMessages());
  }

  /**
   * Build system prompt from base + extra + assistant prompt + identity + system messages
   */
  private buildSystemPrompt(messages: Message[]): string | undefined {
    const parts: string[] = [];

    if (this.systemPrompt) {
      parts.push(this.systemPrompt);
    }
    if (this.extraSystemPrompt) {
      parts.push(this.extraSystemPrompt);
    }

    const skillDescriptions = this.skillLoader.getSkillDescriptions();
    if (skillDescriptions) {
      parts.push(`## Skills\n${skillDescriptions}`);
    }

    const connectorDescriptions = this.connectorBridge.getConnectorDescriptions();
    if (connectorDescriptions) {
      parts.push(`## Connectors\n${connectorDescriptions}`);
    }

    // Add assistant-specific system prompt addition
    const assistant = this.mgr.assistant?.getActive();
    if (assistant?.settings?.systemPromptAddition) {
      parts.push(`## Assistant Instructions\n${assistant.settings.systemPromptAddition}`);
    }

    if (this.identityContext) {
      parts.push(`## Your Identity\n${this.identityContext}`);
    }

    const autoRefreshContext = ConnectorAutoRefreshManager.getInstance()
      .buildPromptSection(this.connectorBridge.getConnectors());
    if (autoRefreshContext) {
      parts.push(autoRefreshContext);
    }

    // Add voice capabilities context when voice is configured
    if (this.mgr.voice) {
      const voiceState = this.mgr.voice.getState();
      parts.push(`## Voice Capabilities\nYou have voice tools available. You can start a live voice conversation using the \`voice_talk\` tool. When the user asks to talk, have a conversation, or seems like they want voice interaction, use \`voice_talk\` to start talk mode. You can also use \`voice_say\` to speak text aloud and \`voice_listen\` to listen for speech input.\nCurrent state: ${voiceState.enabled ? 'enabled' : 'disabled'}, STT: ${voiceState.sttProvider || 'none'}, TTS: ${voiceState.ttsProvider || 'none'}`);
    }

    // Add context injection if available (datetime, cwd, project, etc.)
    if (this.pendingCtx.injection) {
      parts.push(this.pendingCtx.injection);
    }

    // Add memory injection if available
    if (this.pendingCtx.memory) {
      parts.push(this.pendingCtx.memory);
    }

    // Add tasks context if TODOS_URL is configured
    if (this.pendingCtx.tasks) {
      parts.push(this.pendingCtx.tasks);
    }

    // Add sessions context if SESSIONS_URL is configured
    if (this.pendingCtx.sessions) {
      parts.push(this.pendingCtx.sessions);
    }

    for (const msg of messages) {
      if (msg.role !== 'system') continue;
      const content = (msg.content ?? '').trim();
      if (!content) continue;
      if (parts.includes(content)) continue;
      parts.push(content);
    }

    return parts.length > 0 ? parts.join('\n\n---\n\n') : undefined;
  }

  private async initializeIdentitySystem(): Promise<void> {
    const basePath = this.storageDir;
    this.mgr.assistant = new AssistantManager(basePath);
    await this.mgr.assistant.initialize();

    if (this.mgr.assistant.listAssistants().length === 0) {
      const created = await this.mgr.assistant.createAssistant({
        name: 'Default Assistant',
        settings: { model: this.config?.llm?.model || 'anthropic:claude-opus-4-5-20251101' },
      });
      this.assistantId = created.id;
    }

    if (this.assistantId) {
      try {
        await this.mgr.assistant.switchAssistant(this.assistantId);
      } catch {
        this.assistantId = null;
      }
    }

    const active = this.mgr.assistant.getActive();
    if (active) {
      this.mgr.identity = this.mgr.assistant.getIdentityManager(active.id);
      await this.mgr.identity.initialize();
      if (this.mgr.identity.listIdentities().length === 0) {
        await this.mgr.identity.createIdentity({ name: 'Default' });
      }
      this.identityContext = await this.mgr.identity.buildSystemPromptContext();
    }
  }

  private buildContextConfig(config: AssistantsConfig): ContextConfig {
    const limits = getLimits();
    const configuredMax = config.context?.maxContextTokens ?? limits.maxTotalContextTokens;
    const maxContextTokens = Math.max(1000, Math.min(configuredMax, limits.maxTotalContextTokens));
    const summaryTriggerRatioRaw = config.context?.summaryTriggerRatio ?? 0.8;
    const summaryTriggerRatio = Math.min(0.95, Math.max(0.5, summaryTriggerRatioRaw));
    const targetContextTokensRaw =
      config.context?.targetContextTokens ?? Math.floor(maxContextTokens * 0.85);
    const targetContextTokens = Math.min(maxContextTokens, Math.max(1000, targetContextTokensRaw));
    const keepRecentMessages = Math.max(0, config.context?.keepRecentMessages ?? 10);
    const maxMessages = Math.max(keepRecentMessages + 10, config.context?.maxMessages ?? 500);

    return {
      enabled: config.context?.enabled ?? true,
      maxContextTokens,
      targetContextTokens,
      summaryTriggerRatio,
      keepRecentMessages,
      keepSystemPrompt: config.context?.keepSystemPrompt ?? true,
      summaryStrategy: config.context?.summaryStrategy ?? 'hybrid',
      summaryModel: config.context?.summaryModel,
      summaryMaxTokens: config.context?.summaryMaxTokens ?? 2000,
      maxMessages,
    };
  }

  private buildHeartbeatConfig(config: AssistantsConfig): HeartbeatRuntimeConfig | null {
    if (config.heartbeat?.enabled === false) return null;
    const intervalMs = Math.max(1000, config.heartbeat?.intervalMs ?? 15000);
    const staleThresholdMs = Math.max(intervalMs * 2, config.heartbeat?.staleThresholdMs ?? 120000);
    // Heartbeat data is now stored in SQLite (heartbeat_state table)
    const persistPath = config.heartbeat?.persistPath ?? `<db>:heartbeat_state:${this.sessionId}`;
    const historyPath = config.heartbeat?.historyPath ?? `<db>:heartbeat_history:${this.sessionId}`;

    return {
      intervalMs,
      staleThresholdMs,
      persistPath,
      historyPath,
    };
  }

  private async buildSummaryClient(contextConfig: ContextConfig): Promise<LLMClient> {
    if (!this.config || !this.llmClient) {
      throw new Error('LLM client not initialized');
    }
    const summaryModel = contextConfig.summaryModel;
    if (!summaryModel || summaryModel === this.config.llm.model) {
      return this.llmClient;
    }
    try {
      return await createLLMClient({ ...this.config.llm, model: summaryModel });
    } catch {
      return this.llmClient;
    }
  }

  /**
   * Initialize the subassistant manager for spawning child assistants
   */
  private initializeSubassistantManager(): void {
    const context: SubassistantManagerContext = {
      createSubassistantLoop: (config: SubassistantLoopConfig) => this.createSubassistantLoop(config),
      getTools: () => this.toolRegistry.getTools(),
      getParentAllowedTools: () => this.getEffectiveAllowedTools(),
      getLLMClient: () => this.llmClient,
      getLLMConfig: () => this.config?.llm ?? null,
      fireHook: async (input) => {
        // Fire SubassistantStart/SubassistantStop hooks
        const hooks = this.hookLoader.getHooks(input.hook_event_name);
        return this.hookExecutor.execute(hooks, input);
      },
      sessionStore: new SessionStore(),
    };

    // Use subassistant config from AssistantsConfig, with fallbacks to defaults
    const subassistantConfig = this.config?.subassistants ?? {};

    this.subassistantManager = new SubassistantManager(
      {
        maxDepth: subassistantConfig.maxDepth,
        maxConcurrent: subassistantConfig.maxConcurrent,
        maxTurns: subassistantConfig.maxTurns,
        defaultTimeoutMs: subassistantConfig.defaultTimeoutMs,
        defaultTools: subassistantConfig.defaultTools,
        forbiddenTools: subassistantConfig.forbiddenTools,
      },
      context
    );
  }

  /**
   * Get or create the swarm coordinator for multi-assistant orchestration
   */
  private getOrCreateSwarmCoordinator(): SwarmCoordinator | null {
    if (!this.subassistantManager) {
      return null;
    }

    if (!this.swarmCoordinator) {
      const context: SwarmCoordinatorContext = {
        subassistantManager: this.subassistantManager,
        registry: this.registryService ?? undefined,
        sessionId: this.sessionId,
        cwd: this.cwd,
        depth: this.depth,
        onChunk: this.onChunk,
        getAvailableTools: () => this.toolRegistry.getTools().map(t => t.name),
        budgetTracker: this.budgetTracker ?? undefined,
      };

      this.swarmCoordinator = new SwarmCoordinator({}, context);
    }

    return this.swarmCoordinator;
  }

  /**
   * Create a subassistant loop for spawning
   */
  private async createSubassistantLoop(config: SubassistantLoopConfig): Promise<{
    run: () => Promise<SubassistantResult>;
    stop: () => void;
  }> {
    let response = '';
    let turns = 0;
    let toolCalls = 0;
    let stopped = false;

    // Build thoroughness instructions based on config
    const thoroughnessInstructions = [
      'Work thoroughly on this task. Don\'t return after minimal effort.',
      'Verify your work before completing.',
      'If the task requires multiple steps, complete ALL steps.',
      config.minTurns > 1
        ? `You must take at least ${config.minTurns} turns before returning — do not give a superficial answer.`
        : null,
      config.workUntilDone
        ? 'Keep working until the task is fully complete. Do not stop early or return partial results.'
        : null,
    ].filter(Boolean).join('\n');

    const subassistant = new AssistantLoop({
      cwd: config.cwd,
      sessionId: config.sessionId,
      allowedTools: config.tools,
      depth: config.depth,
      llmClient: config.llmClient,
      maxTurns: config.maxTurns,
      extraSystemPrompt: `You are a subassistant spawned to complete a specific task.

Task: ${config.task}

${config.context ? `Context:\n${config.context}\n\n` : ''}${thoroughnessInstructions}

Complete this task and provide a clear summary of what you found or accomplished.
Be concise but thorough. Focus only on this task.`,
      onChunk: (chunk) => {
        if (chunk.type === 'text' && chunk.content) {
          response += chunk.content;
        }
        if (chunk.type === 'tool_use') {
          toolCalls++;
        }
        config.onChunk?.(chunk);
      },
    });

    await subassistant.initialize();

    return {
      run: async (): Promise<SubassistantResult> => {
        try {
          // Process the task - process() already handles the full assistant loop
          // including tool calls and multi-turn conversation internally
          await subassistant.process(config.task);

          // Count actual turns from messages
          const messages = subassistant.getContext().getMessages();
          turns = messages.filter((m) => m.role === 'assistant').length;

          // Get token usage from subassistant
          const usage = subassistant.getTokenUsage();
          const tokensUsed = usage.inputTokens + usage.outputTokens;

          if (stopped) {
            return {
              success: false,
              result: response.trim(),
              error: 'Subassistant stopped',
              turns,
              toolCalls,
              tokensUsed,
            };
          }

          return {
            success: true,
            result: response.trim(),
            turns,
            toolCalls,
            tokensUsed,
          };
        } catch (error) {
          // Get token usage even on error
          const usage = subassistant.getTokenUsage();
          const tokensUsed = usage.inputTokens + usage.outputTokens;

          if (stopped) {
            return {
              success: false,
              result: response.trim(),
              error: 'Subassistant stopped',
              turns,
              toolCalls,
              tokensUsed,
            };
          }

          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            turns,
            toolCalls,
            tokensUsed,
          };
        } finally {
          subassistant.shutdown();
        }
      },
      stop: () => {
        stopped = true;
        subassistant.stop();
      },
    };
  }

  /**
   * Normalize tool names to a canonical set (case-insensitive with aliases)
   */
  private normalizeAllowedTools(tools?: string[]): Set<string> | null {
    if (!tools) return null;
    if (tools.length === 0) return new Set<string>();

    const aliases: Record<string, string[]> = {
      read: ['read'],
      edit: ['write'],
      write: ['write'],
      bash: ['bash'],
      search: ['web_search'],
      web_search: ['web_search'],
      fetch: ['web_fetch', 'curl'],
      web_fetch: ['web_fetch'],
      curl: ['curl'],
      image: ['display_image'],
      display_image: ['display_image'],
    };

    const normalized = new Set<string>();
    for (const raw of tools) {
      const key = raw.trim().toLowerCase();
      if (!key) continue;
      const mapped = aliases[key];
      if (mapped) {
        for (const name of mapped) normalized.add(name);
      } else {
        normalized.add(key);
      }
    }

    return normalized.size > 0 ? normalized : null;
  }

  /**
   * Compute the effective allowed tools for this run
   */
  private getEffectiveAllowedTools(): Set<string> | null {
    if (this.allowedTools && this.currentAllowedTools) {
      const intersection = new Set<string>();
      for (const name of this.currentAllowedTools) {
        if (this.allowedTools.has(name)) {
          intersection.add(name);
        }
      }
      return intersection;
    }
    return this.currentAllowedTools || this.allowedTools;
  }

  private filterAllowedTools(tools: Tool[]): Tool[] {
    const allowed = this.getEffectiveAllowedTools();
    if (!allowed) return tools;
    return tools.filter((tool) => {
      const name = tool.name.toLowerCase();
      if (name === 'ask_user') return true;
      return allowed.has(name);
    });
  }

  private buildExecutableTools(tools: Tool[]): AISDKExecutableTool[] {
    return tools.map((tool) => ({
      ...tool,
      execute: async (toolCall, signal) => {
        const results = await this.executeToolCalls([toolCall], {
          emitResults: false,
          includeStoppedResults: true,
          signal,
        });
        return results[0] ?? {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          content: 'Tool execution stopped before a result was produced.',
          isError: true,
        };
      },
    }));
  }

  private isToolAllowed(name: string): boolean {
    const allowed = this.getEffectiveAllowedTools();
    if (!allowed) return true;
    if (name.toLowerCase() === 'ask_user') return true;
    return allowed.has(name.toLowerCase());
  }

  /**
   * Tools allowed in plan mode (read-only analysis tools).
   * Everything else is blocked.
   */
  private static readonly PLAN_MODE_ALLOWED_TOOLS = new Set([
    // File reading
    'read', 'glob', 'grep',
    // Web (read-only)
    'web_search', 'web_fetch',
    // Memory (read-only)
    'memory_list', 'memory_search', 'memory_recall', 'memory_context', 'memory_stats',
    // Tasks (read-only)
    'tasks_list', 'tasks_get',
    // User interaction
    'ask_user',
    // Diff (read-only viewing)
    'diff',
  ]);

  /**
   * Check if a tool is allowed in plan mode.
   * Only read-only, analysis-safe tools pass.
   */
  private isToolAllowedInPlanMode(name: string): boolean {
    return AssistantLoop.PLAN_MODE_ALLOWED_TOOLS.has(name.toLowerCase());
  }

  /**
   * Set the permission mode at runtime (used by /mode command and CLI flag).
   * If called before initialize(), stores the mode to apply after config loads.
   */
  setPermissionMode(mode: 'normal' | 'plan' | 'auto-accept'): void {
    if (!this.config) {
      // Store for later application during initialize()
      this.pendingPermissionMode = mode;
      return;
    }
    if (!this.config.permissions) {
      this.config.permissions = {};
    }
    this.config.permissions.mode = mode;
  }

  /**
   * Get the current permission mode
   */
  getPermissionMode(): 'normal' | 'plan' | 'auto-accept' {
    return this.config?.permissions?.mode ?? 'normal';
  }
}

function parseErrorCode(message: string): { code: ErrorCode; message: string } | null {
  const index = message.indexOf(':');
  if (index === -1) return null;
  const codeCandidate = message.slice(0, index).trim() as ErrorCode;
  const rest = message.slice(index + 1).trim();
  const codes = Object.values(ErrorCodes) as ErrorCode[];
  if (!codes.includes(codeCandidate)) return null;
  return { code: codeCandidate, message: rest || message };
}
