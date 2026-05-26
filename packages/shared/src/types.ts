import type { LLMProvider } from './llm-providers';

// ============================================
// Message Types
// ============================================

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  /** Parent message ID for branching support (forms a tree) */
  parentId?: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  documents?: DocumentAttachment[];
}

// ============================================
// Document Types (PDF support)
// ============================================

export interface DocumentAttachment {
  type: 'pdf' | 'image';
  source: DocumentSource;
  name?: string;
  mediaType?: string;
}

export type DocumentSource =
  | { type: 'base64'; mediaType: string; data: string }
  | { type: 'url'; url: string }
  | { type: 'file'; fileId: string };

export interface StreamChunk {
  type: 'text' | 'tool_use' | 'tool_result' | 'error' | 'done' | 'usage' | 'exit' | 'show_panel' | 'stopped' | 'partial_transcript';
  content?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  error?: string;
  usage?: TokenUsage;
  finishReason?: 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other' | string;
  /** Panel to show (for 'show_panel' type) */
  panel?: 'connectors' | 'projects' | 'plans' | 'tasks' | 'assistants' | 'hooks' | 'config' | 'messages' | 'guardrails' | 'budget' | 'model' | 'schedules' | 'wallet' | 'secrets' | 'identity' | 'memory' | 'inbox' | 'swarm' | 'workspace' | 'logs' | 'skills' | 'heartbeat' | 'resume' | 'webhooks' | 'channels' | 'telephony' | 'orders' | 'contacts' | 'setup' | 'people';
  /** Initial value for the panel */
  panelValue?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  maxContextTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

// ============================================
// Tool Types
// ============================================

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameters;
}

export interface ToolParameters {
  type: 'object';
  properties: Record<string, ToolProperty>;
  required?: string[];
  anyOf?: Array<Record<string, unknown>>;
  oneOf?: Array<Record<string, unknown>>;
  allOf?: Array<Record<string, unknown>>;
}

type ToolPropertyType = 'string' | 'number' | 'boolean' | 'array' | 'object';

interface ToolPropertyBase {
  description?: string;
  enum?: string[];
  items?: ToolProperty;
  default?: unknown;
  /** For object types: nested properties */
  properties?: Record<string, ToolProperty>;
  /** For object types: required property names */
  required?: string[];
}

export type ToolProperty =
  | (ToolPropertyBase & { type: ToolPropertyType | ToolPropertyType[] })
  | (ToolPropertyBase & { oneOf: ToolProperty[] })
  | (ToolPropertyBase & { anyOf: ToolProperty[] })
  | (ToolPropertyBase & { allOf: ToolProperty[] });

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  rawContent?: string;
  truncated?: boolean;
  isError?: boolean;
  toolName?: string;
}

export interface AskUserQuestion {
  id: string;
  question: string;
  options?: string[];
  placeholder?: string;
  multiline?: boolean;
  required?: boolean;
}

export interface AskUserRequest {
  title?: string;
  description?: string;
  questions: AskUserQuestion[];
}

export interface AskUserResponse {
  answers: Record<string, string>;
}

// ============================================
// Interview Types (rich multi-step wizard)
// ============================================

export interface InterviewOption {
  label: string;
  description?: string;
}

export interface InterviewQuestion {
  id: string;
  question: string;
  header?: string;
  options?: InterviewOption[];
  placeholder?: string;
  multiSelect?: boolean;
  required?: boolean;
}

export interface InterviewRequest {
  title?: string;
  description?: string;
  questions: InterviewQuestion[];
  metadata?: Record<string, unknown>;
}

export interface InterviewResponse {
  answers: Record<string, string | string[]>;
  cancelled?: boolean;
  chatRequested?: boolean;
  chatMessage?: string;
}

export interface InterviewRecord {
  id: string;
  sessionId: string;
  assistantId?: string;
  title?: string;
  questions: InterviewQuestion[];
  answers: Record<string, string | string[]>;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: number;
  completedAt?: number;
}

// ============================================
// Connector Types
// ============================================

export interface Connector {
  name: string;
  cli: string;
  description: string;
  commands: ConnectorCommand[];
  auth?: ConnectorAuth;
  /** Auto-generated tags derived from commands and description */
  tags?: string[];
  /** Last time this connector was used (ISO timestamp) */
  lastUsedAt?: string;
  /** Usage count for ranking */
  usageCount?: number;
}

export interface ConnectorCommand {
  name: string;
  description: string;
  args: ConnectorArg[];
  options: ConnectorOption[];
  /** Usage examples for the command */
  examples?: string[];
}

export interface ConnectorArg {
  name: string;
  description?: string;
  required?: boolean;
  /** Type hint for the argument */
  type?: string;
  /** Default value if optional */
  default?: string;
}

export interface ConnectorOption {
  name: string;
  description?: string;
  type: 'string' | 'number' | 'boolean';
  default?: unknown;
  alias?: string;
}

/**
 * Extended connector information for interactive UI
 */
export interface ConnectorStatus {
  authenticated: boolean;
  user?: string;
  email?: string;
  error?: string;
}

export interface ConnectorAuth {
  type: 'oauth2' | 'api_key' | 'none';
  statusCommand?: string;
}

// ============================================
// Skill Types
// ============================================

export interface Skill {
  name: string;
  description: string;
  argumentHint?: string;
  allowedTools?: string[];
  disableModelInvocation?: boolean;
  userInvocable?: boolean;
  model?: string;
  context?: 'fork';
  assistant?: string;
  hooks?: HookConfig;
  content: string;
  filePath: string;
  contentLoaded?: boolean;
  source?: 'local' | 'npm';
  packageName?: string;
  version?: string;
}

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  'argument-hint'?: string;
  'allowed-tools'?: string;
  'disable-model-invocation'?: boolean;
  'user-invocable'?: boolean;
  model?: string;
  context?: 'fork';
  assistant?: string;
  hooks?: HookConfig;
  [key: string]: unknown;  // Allow additional properties
}

// ============================================
// Hook Types
// ============================================

export type HookEvent =
  | 'SessionStart'
  | 'SessionEnd'
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'PermissionRequest'
  | 'Notification'
  | 'SubassistantStart'
  | 'SubassistantStop'
  | 'PreCompact'
  | 'Stop';

export interface HookConfig {
  [event: string]: HookMatcher[];
}

export interface HookMatcher {
  matcher?: string;
  hooks: HookHandler[];
}

export interface HookHandler {
  id?: string; // Unique ID (auto-generated if not provided)
  name?: string; // Human-readable name
  description?: string; // What this hook does
  enabled?: boolean; // Whether hook is active (default true)
  type: 'command' | 'prompt' | 'assistant' | 'cli';
  command?: string;
  prompt?: string;
  model?: string;
  timeout?: number;
  async?: boolean;
  statusMessage?: string;
  cliName?: string; // Name of CLI hook (for type: 'cli')
  source?: string; // Where this hook came from ('config' | 'cli')
}

export interface HookInput {
  session_id: string;
  hook_event_name: HookEvent;
  cwd: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  prompt?: string;
  [key: string]: unknown;
}

export interface HookOutput {
  continue?: boolean;
  stopReason?: string;
  systemMessage?: string;
  additionalContext?: string;
  permissionDecision?: 'allow' | 'deny' | 'ask';
  updatedInput?: Record<string, unknown>;
  suppress?: boolean; // For Notification hook - suppress the notification
  skip?: boolean; // For PreCompact hook - skip the compaction
}

// ============================================
// Native Hook Types
// ============================================

/**
 * Native hook handler function type
 */
export type NativeHookHandler = (
  input: HookInput,
  context: NativeHookContext
) => Promise<HookOutput | null>;

/**
 * Native hook definition - system hooks that cannot be deleted
 */
export interface NativeHook {
  id: string;
  name?: string;
  description?: string;
  event: HookEvent;
  priority: number; // Lower = runs first
  handler: NativeHookHandler;
  enabled?: boolean;
}

/**
 * Context passed to native hooks
 */
export interface NativeHookContext {
  sessionId: string;
  cwd: string;
  messages: Message[];
  scopeContext?: ScopeContext;
  llmClient?: unknown; // LLMClient type from core
  config?: NativeHookConfig;
}

/**
 * Configuration for native hooks
 */
export interface NativeHookConfig {
  scopeVerification?: ScopeVerificationConfig;
  /** Autonomous heartbeat configuration passed to the auto-schedule Stop hook. */
  heartbeat?: {
    autonomous?: boolean;
    maxSleepMs?: number;
    watchdogEnabled?: boolean;
    watchdogIntervalMs?: number;
  };
}

/**
 * Configuration for scope verification feature
 */
export interface ScopeVerificationConfig {
  enabled?: boolean;
  maxRetries?: number;
  excludePatterns?: string[];
}

// ============================================
// Scope Context Types
// ============================================

/**
 * Tracks user's intent/goals for the current session
 */
export interface ScopeContext {
  originalMessage: string;
  extractedGoals: string[];
  timestamp: number;
  verificationAttempts: number;
  maxAttempts: number;
}

// ============================================
// Verification Session Types
// ============================================

/**
 * Goal analysis result from verification
 */
export interface GoalAnalysis {
  goal: string;
  met: boolean;
  evidence: string;
}

/**
 * Result of scope verification
 */
export interface VerificationResult {
  goalsMet: boolean;
  goalsAnalysis: GoalAnalysis[];
  reason: string;
  suggestions?: string[];
}

/**
 * Stored verification session for user visibility
 */
export interface VerificationSession {
  id: string;
  parentSessionId: string;
  type: 'scope-verification';
  result: 'pass' | 'fail' | 'force-continue';
  goals: string[];
  reason: string;
  suggestions?: string[];
  verificationResult: VerificationResult;
  createdAt: string;
}

// ============================================
// Session Types
// ============================================

export interface Session {
  id: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  metadata?: Record<string, unknown>;
}

// ============================================
// Multi-Session Types
// ============================================

export interface SessionInfo {
  id: string;
  cwd: string;
  startedAt: number;
  updatedAt: number;
  isProcessing: boolean;
}

// ============================================
// Config Types

// ============================================
// Extended type modules (split for maintainability)
// ============================================
export * from './config-types';
export * from './feature-types';
export * from './api-types';
