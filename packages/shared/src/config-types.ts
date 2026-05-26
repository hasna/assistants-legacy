import type { HookConfig, HookEvent, HookHandler } from './types';
import type { SchedulerConfig, HeartbeatConfig, ContextConfig, ValidationConfig, InboxConfig, WalletConfig, SecretsConfig, JobsConfig, MessagesConfig, WebhooksConfig, ChannelsConfig, TelephonyConfig, OrdersConfig } from './feature-types';

// ============================================

/**
 * Status line configuration for terminal UI
 * Controls which metrics are shown in the bottom status bar
 */
export interface StatusLineConfig {
  /** Show context usage percentage (default: true) */
  showContext?: boolean;
  /** Show session index when multiple sessions exist (default: true) */
  showSession?: boolean;
  /** Show processing elapsed time (default: true) */
  showElapsed?: boolean;
  /** Show heartbeat indicator (default: true) */
  showHeartbeat?: boolean;
  /** Show voice indicator (default: true) */
  showVoice?: boolean;
  /** Show queue length (default: true) */
  showQueue?: boolean;
  /** Show recent tool calls (default: true) */
  showRecentTools?: boolean;
  /** Show verbose tool names (default: false) */
  verboseTools?: boolean;
}

export interface AssistantsConfig {
  llm: LLMConfig;
  voice?: VoiceConfig;
  connectors?: string[] | ConnectorsConfigShared;
  skills?: string[];
  hooks?: HookConfig;
  scheduler?: SchedulerConfig;
  heartbeat?: HeartbeatConfig;
  context?: ContextConfig;

  validation?: ValidationConfig;
  inbox?: InboxConfig;
  wallet?: WalletConfig;
  secrets?: SecretsConfig;
  jobs?: JobsConfig;
  messages?: MessagesConfig;
  webhooks?: WebhooksConfig;
  channels?: ChannelsConfig;
  telephony?: TelephonyConfig;
  orders?: OrdersConfig;
  memory?: MemoryConfigShared;
  subassistants?: SubassistantConfigShared;
  input?: InputConfig;
  budget?: BudgetConfig;
  guardrails?: GuardrailsConfigShared;
  capabilities?: CapabilitiesConfigShared;
  statusLine?: StatusLineConfig;
  /** Workspace configuration — controls where the AI writes files */
  workspace?: WorkspaceConfig;
  /** Permissions configuration — controls tool access levels */
  permissions?: PermissionsConfig;
  /** Model used for lightweight background tasks (session naming, etc.). Default: claude-haiku-4-5-20251001 */
  backgroundModel?: string;
  /** Color theme for the terminal UI. 'auto' detects the terminal background. Default: 'auto'. */
  theme?: 'auto' | 'dark' | 'light';
}

/**
 * Bash permission level:
 * - 'none': bash tool is completely disabled
 * - 'readonly': only safe read commands (ls, cat, grep, find, git status/log/diff, etc.)
 * - 'readwrite': broader commands allowed but destructive ops still blocked (rm -rf, mkfs, dd, etc.)
 */
export type BashPermissionLevel = 'none' | 'readonly' | 'readwrite';

/**
 * Permission mode controls the overall tool access policy:
 * - 'normal': standard behavior with per-tool permission checks
 * - 'plan': read-only mode — only analysis tools allowed (read, glob, grep, web_search, web_fetch, memory)
 * - 'auto-accept': all tool calls are auto-approved without confirmation
 */
export type PermissionMode = 'normal' | 'plan' | 'auto-accept';

/**
 * Permissions configuration for controlling tool access levels
 */
export interface PermissionsConfig {
  /** Bash tool permission level (default: 'readonly') */
  bash?: BashPermissionLevel;
  /** Overall permission mode (default: 'normal') */
  mode?: PermissionMode;
}

/**
 * Workspace configuration for controlling where the AI writes files.
 * - 'sandbox' (default): writes only to .assistants-data/scripts/{session}/
 * - 'project': writes anywhere within the project (cwd), except dangerous dirs
 * - 'custom': writes to a user-specified absolute path
 */
export interface WorkspaceConfig {
  /** Workspace write mode (default: 'sandbox') */
  mode?: 'sandbox' | 'project' | 'custom';
  /** Absolute path for 'custom' mode (ignored in other modes) */
  customPath?: string | null;
}

/**
 * Budget configuration for resource limits
 * Controls token, time, and tool-call limits per session/assistant/swarm
 */
export interface BudgetConfig {
  /** Whether budget enforcement is enabled (default: false) */
  enabled?: boolean;
  /** Session-level limits */
  session?: BudgetLimits;
  /** Per-assistant limits (for multi-assistant scenarios) */
  assistant?: BudgetLimits;
  /** Swarm-level limits (aggregate across all assistants) */
  swarm?: BudgetLimits;
  /** Per-project limits (aggregate across sessions for a project) */
  project?: BudgetLimits;
  /** Action to take when budget is exceeded */
  onExceeded?: 'warn' | 'pause' | 'stop';
  /** Whether to persist budget state across restarts */
  persist?: boolean;
}

/**
 * Budget limits specification
 */
export interface BudgetLimits {
  /** Maximum input tokens per period */
  maxInputTokens?: number;
  /** Maximum output tokens per period */
  maxOutputTokens?: number;
  /** Maximum total tokens per period */
  maxTotalTokens?: number;
  /** Maximum LLM API calls per period */
  maxLlmCalls?: number;
  /** Maximum tool calls per period */
  maxToolCalls?: number;
  /** Maximum execution time in milliseconds per period */
  maxDurationMs?: number;
  /** Period for rolling limits (e.g., 'session', 'hour', 'day') */
  period?: 'session' | 'hour' | 'day';
}

/**
 * Budget usage tracking state
 */
export interface BudgetUsage {
  /** Input tokens consumed */
  inputTokens: number;
  /** Output tokens consumed */
  outputTokens: number;
  /** Total tokens consumed */
  totalTokens: number;
  /** Number of LLM API calls */
  llmCalls: number;
  /** Number of tool calls */
  toolCalls: number;
  /** Execution time in milliseconds */
  durationMs: number;
  /** When the current period started */
  periodStartedAt: string;
  /** When usage was last updated */
  lastUpdatedAt: string;
}

/**
 * Input handling configuration
 * Controls how large pastes and input are handled in terminal and web UIs
 */
export interface InputConfig {
  /** Paste handling settings */
  paste?: PasteConfig;
}

/**
 * Paste handling configuration
 */
export interface PasteConfig {
  /** Whether large paste handling is enabled (default: true) */
  enabled?: boolean;
  /** Paste detection thresholds */
  thresholds?: {
    /** Character threshold for large paste detection (default: 500) */
    chars?: number;
    /** Word threshold for large paste detection (default: 100) */
    words?: number;
    /** Line threshold for large paste detection (default: 20) */
    lines?: number;
  };
  /**
   * Display mode when large paste is detected
   * - 'placeholder': Show summary placeholder (default)
   * - 'preview': Show collapsed preview with expand option
   * - 'confirm': Ask user to confirm before accepting
   * - 'inline': No special handling, show full content
   */
  mode?: 'placeholder' | 'preview' | 'confirm' | 'inline';
}

/**
 * Guardrails configuration for security and safety policies
 * Controls tool access, data sensitivity, and approval requirements
 */
export interface GuardrailsConfigShared {
  /** Whether guardrails enforcement is enabled (default: false) */
  enabled?: boolean;
  /** Default action when no policy matches */
  defaultAction?: 'allow' | 'deny' | 'require_approval' | 'warn';
  /** Whether to log all policy evaluations */
  logEvaluations?: boolean;
  /** Whether to persist policy state */
  persist?: boolean;
}

/**
 * Capabilities configuration for assistant permissions and limits
 * Controls orchestration rights, tool access, and resource constraints
 */
export interface CapabilitiesConfigShared {
  /** Whether capability enforcement is enabled (default: false) */
  enabled?: boolean;
  /** Orchestration level preset: 'none' | 'limited' | 'standard' | 'full' | 'coordinator' */
  orchestrationLevel?: 'none' | 'limited' | 'standard' | 'full' | 'coordinator';
  /** Maximum concurrent subassistants this assistant can spawn */
  maxConcurrentSubassistants?: number;
  /** Maximum subassistant depth (nesting level) */
  maxSubassistantDepth?: number;
  /** Tool access policy: 'allow_all' | 'allow_list' | 'deny_list' */
  toolPolicy?: 'allow_all' | 'allow_list' | 'deny_list';
  /** Allowed tool patterns (when policy is 'allow_list') */
  allowedTools?: string[];
  /** Denied tool patterns (when policy is 'deny_list') */
  deniedTools?: string[];
  /** Whether to persist capability state */
  persist?: boolean;
}

/**
 * Connectors configuration for AssistantsConfig
 * Controls how connector tools are registered and exposed to the LLM
 */
export interface ConnectorsConfigShared {
  /** List of connector names to enable (empty = auto-discover all) */
  enabled?: string[];
  /**
   * Maximum number of connector tools to register in LLM context.
   * When exceeded, only `connector_execute` and `connectors_search` are available.
   * Set to 0 for unlimited (default behavior).
   * Recommended: 5-10 for optimal context usage.
   * Default: 0 (unlimited)
   */
  maxToolsInContext?: number;
  /**
   * Whether to use dynamic binding (register tools on demand after search).
   * When true, connector tools are only registered after user explicitly
   * selects them via connectors_search or connector tool name.
   * Default: false
   */
  dynamicBinding?: boolean;
  /**
   * Priority connectors that are always registered regardless of limit.
   * These connectors will have their tools available immediately.
   */
  priorityConnectors?: string[];
}

/**
 * Subassistant configuration for AssistantsConfig (shared types)
 * Controls limits and behavior of spawned subassistants
 */
export interface SubassistantConfigShared {
  /** Maximum recursion depth for nested subassistants (default: 3) */
  maxDepth?: number;
  /** Maximum concurrent subassistants per parent (default: 5) */
  maxConcurrent?: number;
  /** Maximum turns per subassistant (default: 10, max: 25) */
  maxTurns?: number;
  /** Default timeout in milliseconds (default: 120000 = 2 minutes) */
  defaultTimeoutMs?: number;
  /** Default tools for subassistants if not specified */
  defaultTools?: string[];
  /** Tools that subassistants cannot use (security) */
  forbiddenTools?: string[];
}

/**
 * Memory configuration for AssistantsConfig (shared types)
 */
export interface MemoryConfigShared {
  /** Whether memory system is enabled (default: true) */
  enabled?: boolean;
  /** Memory injection settings */
  injection?: {
    /** Whether auto-injection is enabled (default: true) */
    enabled?: boolean;
    /** Maximum tokens for injected memories (default: 500) */
    maxTokens?: number;
    /** Minimum importance to include (default: 5) */
    minImportance?: number;
    /** Categories to include (default: ['preference', 'fact']) */
    categories?: ('preference' | 'fact' | 'knowledge' | 'history')[];
    /** Refresh interval in turns (default: 5) */
    refreshInterval?: number;
  };
  /** Storage settings */
  storage?: {
    /** Maximum number of memory entries (default: 1000) */
    maxEntries?: number;
    /** Default TTL in milliseconds for new entries */
    defaultTTL?: number;
  };
  /** Scope settings */
  scopes?: {
    /** Whether global scope is enabled (default: true) */
    globalEnabled?: boolean;
    /** Whether shared scope is enabled (default: true) */
    sharedEnabled?: boolean;
    /** Whether private scope is enabled (default: true) */
    privateEnabled?: boolean;
  };
}

export type EffortLevel = 'low' | 'medium' | 'high';

export interface LLMConfig {
  /**
   * AI SDK provider-prefixed model id, e.g. "anthropic:claude-sonnet-4-6"
   * or "openai:gpt-5". Unprefixed model ids are not supported.
   */
  model: string;
  /** Optional override for tests or embedded deployments. Prefer env/.secrets in normal use. */
  apiKey?: string;
  /** Optional provider base URL override where supported by the provider package. */
  baseUrl?: string;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  providerOptions?: Record<string, unknown>;
  /** Effort/thinking level. Provider-specific options are mapped by the AI SDK runtime. */
  effortLevel?: EffortLevel;
}

export interface VoiceConfig {
  enabled: boolean;
  stt: STTConfig;
  tts: TTSConfig;
  wake?: WakeConfig;
  autoListen?: boolean;
  /** Whether to auto-send messages after silence in talk mode (default: true) */
  autoSend?: boolean;
}

export interface STTConfig {
  provider: 'whisper' | 'elevenlabs' | 'system';
  model?: string;
  language?: string;
}

export interface TTSConfig {
  provider: 'openai' | 'elevenlabs' | 'system';
  voiceId?: string;
  model?: string;
  stability?: number;
  similarityBoost?: number;
  speed?: number;
  /** Speaking style instructions (OpenAI gpt-4o-mini-tts only) */
  instructions?: string;
}

export interface WakeConfig {
  enabled: boolean;
  word: string;
}

export interface VoiceState {
  enabled: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  isTalking: boolean;
  sttProvider?: string;
  ttsProvider?: string;
}

export type HeartbeatAssistantState = 'idle' | 'processing' | 'waiting_input' | 'error' | 'stopped';

export interface HeartbeatState {
  enabled: boolean;
  state: HeartbeatAssistantState;
  lastActivity: string;
  uptimeSeconds: number;
  isStale: boolean;
  /** Interval in ms between heartbeats (if available). */
  intervalMs?: number;
  /** ISO timestamp for the next planned heartbeat (if available). */
  nextHeartbeatAt?: string;
}

// ============================================
// Identity & Assistant Types
