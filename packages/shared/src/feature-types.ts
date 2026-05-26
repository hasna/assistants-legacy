// Feature-specific types: Identity, Jobs, Scheduler, Inbox, Wallet, Secrets, Messages
import type { StreamChunk, Tool, Skill, VoiceState } from './types';

// ============================================

export type AssistantBackend = 'ai-sdk';

export interface AssistantSettings {
  model: string;
  maxOutputTokens?: number;
  temperature?: number;
  systemPromptAddition?: string;
  enabledTools?: string[];
  disabledTools?: string[];
  skillDirectories?: string[];
  backend?: AssistantBackend;
}

export interface Assistant {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  /** Theme color for the assistant (e.g., 'cyan', 'green', '#ff6600') */
  color?: string;
  defaultIdentityId?: string;
  settings: AssistantSettings;
  isSystem?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContactEntry {
  value: string;
  label: string;
  isPrimary?: boolean;
}

export interface AddressEntry {
  street: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
  label: string;
}

export interface SocialEntry {
  platform: string;
  value: string;
  label?: string;
}

export interface IdentityProfile {
  displayName: string;
  title?: string;
  company?: string;
  bio?: string;
  timezone: string;
  locale: string;
}

export interface IdentityContacts {
  emails: ContactEntry[];
  phones: ContactEntry[];
  addresses: AddressEntry[];
  virtualAddresses?: ContactEntry[];
  social?: SocialEntry[];
}

export interface IdentityPreferences {
  language: string;
  dateFormat: string;
  communicationStyle: 'formal' | 'casual' | 'professional';
  responseLength: 'concise' | 'detailed' | 'balanced';
  codeStyle?: {
    indentation: 'tabs' | 'spaces';
    indentSize: number;
    quoteStyle: 'single' | 'double';
  };
  custom: Record<string, unknown>;
}

export interface Identity {
  id: string;
  name: string;
  isDefault: boolean;
  profile: IdentityProfile;
  contacts: IdentityContacts;
  preferences: IdentityPreferences;
  context?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActiveIdentityInfo {
  assistant: Assistant | null;
  identity: Identity | null;
}

export interface SchedulerConfig {
  enabled?: boolean;
  heartbeatIntervalMs?: number;
}

// ============================================
// Jobs Types (async job system)
// ============================================

/**
 * Per-connector job configuration
 */
export interface ConnectorJobConfig {
  /** Whether async mode is enabled for this connector */
  enabled?: boolean;
  /** Custom timeout for this connector (ms) */
  timeoutMs?: number;
}

/**
 * Jobs system configuration
 */
export interface JobsConfig {
  /** Whether jobs system is enabled (default: true) */
  enabled?: boolean;
  /** Default timeout for jobs in ms (default: 60000 = 1 minute) */
  defaultTimeoutMs?: number;
  /** Maximum age for job files in ms (default: 86400000 = 24 hours) */
  maxJobAgeMs?: number;
  /** Per-connector configuration */
  connectors?: Record<string, ConnectorJobConfig>;
}

export interface HeartbeatConfig {
  enabled?: boolean;
  intervalMs?: number;
  staleThresholdMs?: number;
  persistPath?: string;
  historyPath?: string;
  /** Enable autonomous self-scheduling (default: false). */
  autonomous?: boolean;
  /** Maximum ms the agent can sleep between heartbeats. */
  maxSleepMs?: number;
  /** Enable the watchdog safety-net schedule (default: false). */
  watchdogEnabled?: boolean;
  /** Watchdog polling interval in ms. */
  watchdogIntervalMs?: number;
}

export interface ContextConfig {
  enabled?: boolean;
  maxContextTokens?: number;
  targetContextTokens?: number;
  summaryTriggerRatio?: number;
  keepRecentMessages?: number;
  keepSystemPrompt?: boolean;
  summaryStrategy?: 'llm' | 'hybrid';
  summaryModel?: string;
  summaryMaxTokens?: number;
  maxMessages?: number;
  /**
   * Number of recent tool calls to always preserve during summarization.
   * Ensures the assistant remembers what it just did and can continue
   * multi-step operations after context compaction.
   * Default: 5
   */
  preserveLastToolCalls?: number;
  /**
   * Configuration for automatic context injection (datetime, cwd, etc.)
   */
  injection?: ContextInjectionConfigShared;
}

/**
 * Context injection configuration (shared types)
 */
export interface ContextInjectionConfigShared {
  /** Whether context injection is enabled (default: true) */
  enabled?: boolean;
  /** Maximum tokens for injected context (default: 200) */
  maxTokens?: number;
  /** Output format: "full" for markdown sections, "compact" for single line */
  format?: 'full' | 'compact';
  /** Individual injection type configurations */
  injections?: {
    datetime?: { enabled?: boolean; format?: 'ISO' | 'relative' | 'short'; includeTimezone?: boolean };
    timezone?: { enabled?: boolean };
    cwd?: { enabled?: boolean; truncate?: number };
    project?: { enabled?: boolean; includePackageJson?: boolean; includeGitInfo?: boolean };
    os?: { enabled?: boolean };
    locale?: { enabled?: boolean };
    git?: { enabled?: boolean; includeBranch?: boolean; includeStatus?: boolean; includeRecentCommits?: number };
    username?: { enabled?: boolean };
    custom?: { enabled?: boolean; text?: string };
    envVars?: { enabled?: boolean; allowed?: string[] };
  };
}


export interface ValidationConfig {
  mode?: 'strict' | 'lenient';
  maxUserMessageLength?: number;
  maxToolOutputLength?: number;
  maxTotalContextTokens?: number;
  maxFileReadSize?: number;
  perTool?: Record<string, {
    mode?: 'strict' | 'lenient';
    maxOutputLength?: number;
    allowEnv?: boolean;
    allowAll?: boolean;
    /** Allow limited global package installs via bun (e.g., bun install -g connect-*) */
    allowPackageInstall?: boolean;
  }>;
}

// ============================================
// Scheduler Types
// ============================================

export interface ScheduledCommand {
  id: string;
  createdAt: number;
  updatedAt: number;
  createdBy: 'user' | 'assistant';
  sessionId?: string;
  /** Type of action to perform when the schedule fires */
  actionType?: 'command' | 'message';
  /** Command to execute (used when actionType is 'command' or undefined for backwards compatibility) */
  command: string;
  /** Custom message to inject into assistant session (used when actionType is 'message') */
  message?: string;
  description?: string;
  status: 'active' | 'paused' | 'completed' | 'error';
  schedule: {
    kind: 'once' | 'cron' | 'random' | 'interval';
    at?: string;
    cron?: string;
    timezone?: string;
    /** For random schedules: minimum interval */
    minInterval?: number;
    /** For random schedules: maximum interval */
    maxInterval?: number;
    /** For random and interval schedules: interval unit (supports sub-minute with 'seconds') */
    unit?: 'seconds' | 'minutes' | 'hours';
    /** For interval schedules: fixed interval value (minimum 1 second) */
    interval?: number;
  };
  nextRunAt?: number;
  lastRunAt?: number;
  lastResult?: {
    ok: boolean;
    summary?: string;
    error?: string;
  };
}

// ============================================
// Client Types
// ============================================

export interface AssistantClient {
  send(message: string): Promise<void>;
  onChunk(callback: (chunk: StreamChunk) => void): void | (() => void);
  onError(callback: (error: Error) => void): void | (() => void);
  getTools(): Promise<Tool[]>;
  getSkills(): Promise<Skill[]>;

  getVoiceState(): VoiceState | null;
  getIdentityInfo(): ActiveIdentityInfo | null;
  getModel(): string | null;
  stop(): void;
  disconnect(): void;
}

// ============================================
// Inbox Types
// ============================================

/**
 * Configuration for assistant inbox feature
 */
export interface InboxConfig {
  /** Whether inbox is enabled (default: false) */
  enabled?: boolean;
  /** Email provider: 'ses' or 'resend' (default: 'ses') */
  provider?: 'ses' | 'resend';
  /** Email domain (e.g., "mail.example.com") */
  domain?: string;
  /** Email address format (default: "{assistant-name}@{domain}") */
  addressFormat?: string;

  /** S3 storage configuration */
  storage?: {
    /** S3 bucket name */
    bucket: string;
    /** AWS region */
    region: string;
    /** S3 prefix (default: "inbox/") */
    prefix?: string;
    /** AWS credentials profile for cross-account access */
    credentialsProfile?: string;
  };

  /** Amazon SES specific configuration */
  ses?: {
    /** SES region if different from storage region */
    region?: string;
    /** SES receipt rule set name */
    ruleSetName?: string;
    /** AWS credentials profile for SES (if different from storage) */
    credentialsProfile?: string;
  };

  /** Resend specific configuration */
  resend?: {
    /** Environment variable name for API key (default: "RESEND_API_KEY") */
    apiKeyEnvVar?: string;
  };

  /** Local cache configuration */
  cache?: {
    /** Whether caching is enabled (default: true) */
    enabled?: boolean;
    /** Maximum age for cached emails in days (default: 30) */
    maxAgeDays?: number;
    /** Maximum cache size in MB (default: 500) */
    maxSizeMb?: number;
  };
}

// ============================================
// Wallet Types
// ============================================

/**
 * Configuration for assistant wallet (payment card storage)
 *
 * Cards can be stored locally (default) or in AWS Secrets Manager.
 */
export interface WalletConfig {
  /** Whether wallet is enabled (default: false) */
  enabled?: boolean;

  /** Storage backend selection */
  storage?: {
    /** Storage provider (default: "local") */
    provider?: 'local' | 'aws';
  };

  /** AWS Secrets Manager configuration */
  secrets?: {
    /** AWS region for Secrets Manager */
    region: string;
    /** Secret name prefix (default: "assistants/wallet/") */
    prefix?: string;
    /** AWS credentials profile for cross-account access */
    credentialsProfile?: string;
  };

  /** Security settings */
  security?: {
    /** Maximum card reads per hour (default: 10) */
    maxReadsPerHour?: number;
  };
}

// ============================================
// Secrets Types
// ============================================

/**
 * Configuration for assistant secrets management (API keys, tokens, passwords)
 *
 * Secrets can be stored locally (default) or in AWS Secrets Manager.
 */
export interface SecretsConfig {
  /** Whether secrets management is enabled (default: false) */
  enabled?: boolean;

  /** Storage backend configuration */
  storage?: {
    /** Storage provider (default: "local") */
    provider?: 'local' | 'aws';
    /** AWS region for Secrets Manager (required when provider is "aws") */
    region?: string;
    /** Secret name prefix (default: "assistants/secrets/") */
    prefix?: string;
    /** AWS credentials profile for cross-account access */
    credentialsProfile?: string;
  };

  /** Security settings */
  security?: {
    /** Maximum secret reads per hour (default: 100) */
    maxReadsPerHour?: number;
  };
}

// ============================================
// Messages Types (Assistant-to-Assistant)
// ============================================

/**
 * Message priority level
 */
export type MessagePriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Messages injection configuration
 */
export interface MessagesInjectionConfig {
  /** Whether to auto-inject messages at turn start (default: true) */
  enabled?: boolean;
  /** Max messages to inject per turn (default: 5) */
  maxPerTurn?: number;
  /** Only inject messages >= this priority (default: 'low') */
  minPriority?: MessagePriority;
}

/**
 * Messages storage configuration
 */
export interface MessagesStorageConfig {
  /** Base path for storage (default: ~/.hasna/assistants/messages) */
  basePath?: string;
  /** Max messages per inbox (default: 1000) */
  maxMessages?: number;
  /** Max message age in days (default: 90) */
  maxAgeDays?: number;
}

/**
 * Configuration for assistant-to-assistant messaging
 */
export interface MessagesConfig {
  /** Whether messages are enabled (default: false) */
  enabled?: boolean;
  /**
   * Backend provider for messages.
   * - 'local' (default): native SQLite storage via MessagesManager
   * - 'conversations': use @hasna/conversations SDK (enables cross-agent DMs, spaces, presence)
   */
  provider?: 'local' | 'conversations';
  /** Auto-injection settings */
  injection?: MessagesInjectionConfig;
  /** Storage settings */
  storage?: MessagesStorageConfig;
}

/**
 * Configuration for webhooks system
 * Enables external apps and connectors to push events to the assistant
 */
export interface WebhooksConfig {
  /** Whether webhooks are enabled (default: false) */
  enabled?: boolean;

  /** Auto-injection settings for webhook events */
  injection?: {
    /** Auto-inject events at turn start (default: true) */
    enabled?: boolean;
    /** Max events to inject per turn (default: 5) */
    maxPerTurn?: number;
  };

  /** Storage settings */
  storage?: {
    /** Base path (default: ~/.hasna/assistants/webhooks) */
    basePath?: string;
    /** Max events to retain per webhook (default: 1000) */
    maxEvents?: number;
    /** Max event age in days (default: 30) */
    maxAgeDays?: number;
  };

  /** Security settings */
  security?: {
    /** Max timestamp age in milliseconds for replay protection (default: 300000 = 5 min) */
    maxTimestampAgeMs?: number;
    /** Rate limit: max events per webhook per minute (default: 60) */
    rateLimitPerMinute?: number;
  };
}

/**
 * Configuration for channels (Slack-like agent collaboration)
 * Enables shared communication spaces where multiple agents can collaborate
 */
export interface ChannelsConfig {
  /** Whether channels are enabled (default: false) */
  enabled?: boolean;

  /** Auto-injection settings for channel messages */
  injection?: {
    /** Auto-inject unread messages at turn start (default: true) */
    enabled?: boolean;
    /** Max messages to inject per turn across all channels (default: 10) */
    maxPerTurn?: number;
  };

  /** Storage settings */
  storage?: {
    /** Max messages to retain per channel (default: 5000) */
    maxMessagesPerChannel?: number;
    /** Max message age in days (default: 90) */
    maxAgeDays?: number;
  };
}

/**
 * Configuration for telephony (Twilio + ElevenLabs Conversational AI)
 * Enables phone numbers, SMS, WhatsApp, and real-time voice calls
 */
export interface TelephonyConfig {
  /** Whether telephony is enabled (default: false) */
  enabled?: boolean;

  /** Twilio webhook base URL (e.g., "https://app.example.com") */
  webhookUrl?: string;

  /** Default phone number for outbound calls/SMS */
  defaultPhoneNumber?: string;

  /** ElevenLabs Conversational AI Agent ID */
  elevenLabsAgentId?: string;

  /** Auto-injection settings for incoming calls/SMS */
  injection?: {
    /** Auto-inject events at turn start (default: true) */
    enabled?: boolean;
    /** Max events to inject per turn (default: 5) */
    maxPerTurn?: number;
  };

  /** Storage settings */
  storage?: {
    /** Max call logs to retain (default: 1000) */
    maxCallLogs?: number;
    /** Max SMS logs to retain (default: 5000) */
    maxSmsLogs?: number;
    /** Max log age in days (default: 90) */
    maxAgeDays?: number;
  };

  /** Voice settings */
  voice?: {
    /** Whether to record calls (default: false) */
    recordCalls?: boolean;
    /** Max call duration in seconds (default: 3600 = 1 hour) */
    maxCallDurationSeconds?: number;
  };
}

/**
 * Configuration for orders (full-lifecycle order management)
 * Enables tracking, creating, modifying, cancelling, and returning orders across stores/vendors
 */
export interface OrdersConfig {
  /** Whether orders are enabled (default: false) */
  enabled?: boolean;

  /** Auto-injection settings for order status changes */
  injection?: {
    /** Auto-inject recent order updates at turn start (default: true) */
    enabled?: boolean;
    /** Max order updates to inject per turn (default: 5) */
    maxPerTurn?: number;
  };

  /** Storage settings */
  storage?: {
    /** Max orders to retain (default: 5000) */
    maxOrders?: number;
    /** Max order age in days (default: 365) */
    maxAgeDays?: number;
  };
}

/**
 * Email address with optional display name
 */
export interface EmailAddress {
  /** Display name (e.g., "John Doe") */
  name?: string;
  /** Email address (e.g., "john@example.com") */
  address: string;
}

/**
 * Email attachment metadata
 */
export interface EmailAttachment {
  /** Filename of the attachment */
  filename: string;
  /** MIME content type */
  contentType: string;
  /** Size in bytes */
  size: number;
  /** Content-ID for inline attachments */
  contentId?: string;
  /** Local file path if downloaded */
  localPath?: string;
}

/**
 * Full email data structure
 */
export interface Email {
  /** Unique email ID (derived from S3 key or message-id) */
  id: string;
  /** RFC Message-ID header */
  messageId: string;
  /** Sender */
  from: EmailAddress;
  /** Recipients */
  to: EmailAddress[];
  /** CC recipients */
  cc?: EmailAddress[];
  /** Email subject */
  subject: string;
  /** Received date (ISO 8601) */
  date: string;
  /** Email body */
  body: {
    /** Plain text body */
    text?: string;
    /** HTML body */
    html?: string;
  };
  /** Attachments */
  attachments?: EmailAttachment[];
  /** Email headers */
  headers: Record<string, string>;
  /** Raw email content (EML) */
  raw?: string;
  /** S3 object key */
  s3Key?: string;
  /** When cached locally (ISO 8601) */
  cachedAt?: string;
}

/**
 * Summary email item for listing
 */
export interface EmailListItem {
  /** Unique email ID */
  id: string;
  /** RFC Message-ID header */
  messageId: string;
  /** Formatted sender string (name or address) */
  from: string;
  /** Email subject */
  subject: string;
  /** Received date (ISO 8601) */
  date: string;
  /** Whether email has attachments */
  hasAttachments: boolean;
  /** Whether email has been read */
  isRead: boolean;
}

// ============================================
// User & Authentication Types
