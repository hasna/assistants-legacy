import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, readdirSync, copyFileSync } from 'fs';
import { getProviderInfo, type AssistantsConfig, type HookConfig, type ConnectorsConfigShared } from '@hasna/assistants-shared';
import { getRuntime, hasRuntime } from './runtime';
import { deepMerge } from './utils/deep-merge';

/**
 * Merge connectors config, handling both string[] and object formats
 */
function mergeConnectorsConfig(
  base?: string[] | ConnectorsConfigShared,
  override?: string[] | ConnectorsConfigShared
): string[] | ConnectorsConfigShared | undefined {
  // Override takes precedence if defined
  if (override !== undefined) {
    // If override is an array, use it directly
    if (Array.isArray(override)) {
      return override;
    }
    // If override is an object, merge with base (if base is also object)
    if (base && !Array.isArray(base)) {
      return {
        ...base,
        ...override,
        // Merge arrays instead of replacing
        enabled: override.enabled ?? base.enabled,
        priorityConnectors: override.priorityConnectors ?? base.priorityConnectors,
      };
    }
    return override;
  }
  return base;
}

/**
 * Default system prompt - used when no ASSISTANTS.md files are found
 */
const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant by Hasna, running in the terminal. Your name and capabilities are defined by your identity configuration — do not invent a name for yourself.

## Runtime Environment
- Use **Bun** as the default runtime for JavaScript/TypeScript scripts
- When creating scripts, use the shebang \`#!/usr/bin/env bun\`
- Prefer Bun APIs (Bun.file, Bun.write, etc.) over Node.js equivalents when available
- For package management, prefer \`bun install\` over \`npm install\`

## Code Style
- Write clean, readable code with meaningful variable names
- Add comments only when the logic isn't self-evident
- Prefer simple solutions over complex abstractions
- Use TypeScript when type safety is beneficial

## Communication
- Be concise and direct in responses
- Ask clarifying questions when requirements are ambiguous
- Explain your reasoning when making architectural decisions
- Use the ask_user tool to collect structured answers when you need details

## Task Management
- Tasks are backed by the @hasna/todos SDK with local SQLite storage
- Use task tools (tasks_list, tasks_add, tasks_complete) to manage work items
- Supports priorities (high, normal, low) and recurring tasks (cron expressions or interval-based)
- Tasks can be resolved by unique ID prefix — no need to type full IDs
- Check the task queue with tasks_list before starting multi-step work
- When the user mentions "tasks", "todo", or work items, use task tools - not connectors
- Complete tasks with tasks_complete when finished, or tasks_fail if blocked
`;

const DEFAULT_CONFIG: AssistantsConfig = {
  llm: {
    model: 'anthropic:claude-opus-4-5-20251101',
    maxOutputTokens: 8192,
    effortLevel: 'medium',
  },
  voice: {
    enabled: false,
    stt: {
      provider: 'whisper',
      model: 'whisper-1',
      language: 'en',
    },
    tts: {
      provider: 'elevenlabs',
      voiceId: '',
      model: 'eleven_v3',
      stability: 0.5,
      similarityBoost: 0.75,
      speed: 1.0,
    },
    autoListen: false,
  },
  connectors: [],
  scheduler: {
    enabled: true,
    heartbeatIntervalMs: 30000,
  },
  heartbeat: {
    enabled: true,
    intervalMs: 15000,
    staleThresholdMs: 120000,
    autonomous: false,
    maxSleepMs: 30 * 60 * 1000, // 30 min
    watchdogEnabled: false,
    watchdogIntervalMs: 60 * 60 * 1000, // 1 hour
  },
  context: {
    enabled: true,
    maxContextTokens: 180000,
    targetContextTokens: 150000,
    summaryTriggerRatio: 0.8,
    keepRecentMessages: 10,
    keepSystemPrompt: true,
    summaryStrategy: 'hybrid',
    summaryMaxTokens: 2000,
    maxMessages: 500,
    preserveLastToolCalls: 5,
    injection: {
      enabled: true,
      maxTokens: 200,
      format: 'full',
      injections: {
        datetime: { enabled: true, format: 'ISO', includeTimezone: true },
        timezone: { enabled: true },
        cwd: { enabled: true, truncate: 100 },
        project: { enabled: true, includePackageJson: false, includeGitInfo: false },
        os: { enabled: false },
        locale: { enabled: false },
        git: { enabled: false, includeBranch: true, includeStatus: false, includeRecentCommits: 0 },
        username: { enabled: false },
        custom: { enabled: false, text: '' },
        envVars: { enabled: false, allowed: ['NODE_ENV'] },
      },
    },
  },
  validation: {
    mode: 'strict',
    maxUserMessageLength: 100_000,
    maxToolOutputLength: 50_000,
    maxTotalContextTokens: 180_000,
    maxFileReadSize: 10 * 1024 * 1024,
  },
  inbox: {
    enabled: false,
    provider: 'ses',
    cache: {
      enabled: true,
      maxAgeDays: 30,
      maxSizeMb: 500,
    },
  },
  wallet: {
    enabled: false,
    storage: {
      provider: 'local',
    },
    security: {
      maxReadsPerHour: 10,
    },
  },
  secrets: {
    enabled: false,
    storage: {
      provider: 'local',
    },
    security: {
      maxReadsPerHour: 100,
    },
  },
  jobs: {
    enabled: true,
    defaultTimeoutMs: 60_000, // 1 minute
    maxJobAgeMs: 24 * 60 * 60 * 1000, // 24 hours
    connectors: {},
  },
  messages: {
    enabled: false,
    injection: {
      enabled: true,
      maxPerTurn: 5,
      minPriority: 'low',
    },
    storage: {
      maxMessages: 1000,
      maxAgeDays: 90,
    },
  },
  webhooks: {
    enabled: false,
    injection: {
      enabled: true,
      maxPerTurn: 5,
    },
    storage: {
      maxEvents: 1000,
      maxAgeDays: 30,
    },
    security: {
      maxTimestampAgeMs: 300_000, // 5 minutes
      rateLimitPerMinute: 60,
    },
  },
  channels: {
    enabled: false,
    injection: {
      enabled: true,
      maxPerTurn: 10,
    },
    storage: {
      maxMessagesPerChannel: 5000,
      maxAgeDays: 90,
    },
  },
  orders: {
    enabled: false,
    injection: {
      enabled: true,
      maxPerTurn: 5,
    },
    storage: {
      maxOrders: 5000,
      maxAgeDays: 365,
    },
  },
  telephony: {
    enabled: false,
    injection: {
      enabled: true,
      maxPerTurn: 5,
    },
    storage: {
      maxCallLogs: 1000,
      maxSmsLogs: 5000,
      maxAgeDays: 90,
    },
    voice: {
      recordCalls: false,
      maxCallDurationSeconds: 3600,
    },
  },
  memory: {
    enabled: true,
    injection: {
      enabled: true,
      maxTokens: 500,
      minImportance: 5,
      categories: ['preference', 'fact'],
      refreshInterval: 5,
    },
    storage: {
      maxEntries: 1000,
    },
    scopes: {
      globalEnabled: true,
      sharedEnabled: true,
      privateEnabled: true,
    },
  },
  subassistants: {
    maxDepth: 3,
    maxConcurrent: 5,
    maxTurns: 10,
    defaultTimeoutMs: 120_000, // 2 minutes
    defaultTools: [
      'read',
      'glob',
      'grep',
      'bash',
      'web_search',
      'web_fetch',
    ],
    forbiddenTools: [
      'assistant_spawn',      // Prevent recursive spawning at max depth
      'assistant_delegate',   // Prevent delegation at max depth
      'wallet_get',       // No wallet access
      'wallet_list',
      'secrets_get',      // No secrets access
      'secrets_list',
      'schedule_create',  // No scheduling
      'schedule_update',
      'schedule_delete',
    ],
  },
  input: {
    paste: {
      enabled: true,
      thresholds: {
        chars: 500,
        words: 100,
        lines: 20,
      },
      mode: 'placeholder',
    },
  },
  workspace: {
    mode: 'sandbox',
    customPath: null,
  },
  permissions: {
    bash: 'readonly',
    mode: 'normal',
  },
  backgroundModel: 'anthropic:claude-haiku-4-5-20251001',
};

function mergeConfig(base: AssistantsConfig, override?: Partial<AssistantsConfig>): AssistantsConfig {
  if (!override) return base;

  // Deep merge handles recursive object merging and array replacement.
  // Special cases that need non-generic logic are applied as post-merge fixups.
  const merged = deepMerge(base as unknown as Record<string, unknown>, override as unknown as Record<string, unknown>) as unknown as AssistantsConfig;

  // Connectors have special array-vs-object handling
  merged.connectors = mergeConnectorsConfig(base.connectors, override.connectors);

  // inbox.storage: only create if at least one config defines a bucket
  if (merged.inbox) {
    const hasBucket = base.inbox?.storage?.bucket || override.inbox?.storage?.bucket;
    if (!hasBucket) {
      merged.inbox.storage = undefined;
    }
  }

  // wallet.secrets: only create if region is configured
  if (merged.wallet) {
    const hasRegion = base.wallet?.secrets?.region || override.wallet?.secrets?.region;
    if (!hasRegion) {
      merged.wallet.secrets = undefined;
    }
  }

  return merged;
}

/**
 * Get the path to the assistants config directory
 */
export function getConfigDir(): string {
  // Priority: ASSISTANTS_DIR > ASSISTANTS_PROFILE > default ~/.hasna/assistants
  const assistantsOverride = process.env.ASSISTANTS_DIR;
  if (assistantsOverride && assistantsOverride.trim()) {
    return assistantsOverride;
  }

  const profile = process.env.ASSISTANTS_PROFILE;
  const envHome = process.env.HOME || process.env.USERPROFILE;
  const homeDir = envHome && envHome.trim().length > 0 ? envHome : homedir();

  if (profile && profile.trim()) {
    // ~/.hasna/assistants/profiles/<profile> (new path)
    const newProfileDir = join(homeDir, '.hasna', 'assistants', 'profiles', profile.trim());
    const oldProfileDir = join(homeDir, '.assistants', 'profiles', profile.trim());
    if (existsSync(oldProfileDir) && !existsSync(newProfileDir)) {
      migrateDirectory(oldProfileDir, newProfileDir);
    }
    mkdirSync(newProfileDir, { recursive: true });
    return newProfileDir;
  }

  const newDir = join(homeDir, '.hasna', 'assistants');
  const oldDir = join(homeDir, '.assistants');

  // Auto-migrate: if old dir exists and new doesn't, copy over
  if (existsSync(oldDir) && !existsSync(newDir)) {
    migrateDirectory(oldDir, newDir);
  }

  mkdirSync(newDir, { recursive: true });
  return newDir;
}

/**
 * Copy contents from old directory to new directory (shallow, files only).
 * Used for auto-migration from ~/.<service>/ to ~/.hasna/<service>/.
 */
function migrateDirectory(oldDir: string, newDir: string): void {
  mkdirSync(newDir, { recursive: true });
  try {
    for (const file of readdirSync(oldDir)) {
      const oldPath = join(oldDir, file);
      const newPath = join(newDir, file);
      try {
        // Only copy files, not directories (subdirs need recursive handling)
        const stat = require('fs').statSync(oldPath);
        if (stat.isFile()) {
          copyFileSync(oldPath, newPath);
        }
      } catch {
        // Skip files that can't be copied
      }
    }
  } catch {
    // If we can't read the old directory, just continue with the new one
  }
}

/**
 * Get the active profile name, if any.
 * Returns undefined when using the default profile.
 */
export function getActiveProfile(): string | undefined {
  const profile = process.env.ASSISTANTS_PROFILE;
  return profile && profile.trim() ? profile.trim() : undefined;
}

/**
 * Get the path to a specific config file
 */
export function getConfigPath(filename: string, baseDir?: string): string {
  return join(baseDir || getConfigDir(), filename);
}

/**
 * Get the path to the project config directory
 */
export function getProjectConfigDir(cwd: string = process.cwd()): string {
  return join(cwd, '.assistants');
}

/**
 * Get the path to the project runtime data directory.
 * Runtime-generated files (feedback, schedules, tasks, scripts, etc.)
 * go here instead of polluting the config directory.
 */
export function getProjectDataDir(cwd: string = process.cwd()): string {
  return join(cwd, '.assistants-data');
}

/**
 * Load configuration from multiple sources (merged)
 * Priority: project local > project > user > default
 */
export async function loadConfig(
  cwd: string = process.cwd(),
  baseDir?: string
): Promise<AssistantsConfig> {
  let config: AssistantsConfig = { ...DEFAULT_CONFIG };

  // Load user config
  const userConfigPath = getConfigPath('config.json', baseDir);
  const legacyUserConfigPath = getConfigPath('settings.json', baseDir);
  const userConfig = (await loadJsonFile<Partial<AssistantsConfig>>(userConfigPath))
    || (await loadJsonFile<Partial<AssistantsConfig>>(legacyUserConfigPath));
  config = mergeConfig(config, migrateConfigKeys(userConfig) || undefined);

  // Load project config
  const projectConfigPath = join(getProjectConfigDir(cwd), 'config.json');
  const projectConfig = await loadJsonFile<Partial<AssistantsConfig>>(projectConfigPath);
  config = mergeConfig(config, migrateConfigKeys(projectConfig) || undefined);

  // Load project local config (git-ignored)
  const localConfigPath = join(getProjectConfigDir(cwd), 'config.local.json');
  const localConfig = await loadJsonFile<Partial<AssistantsConfig>>(localConfigPath);
  config = mergeConfig(config, migrateConfigKeys(localConfig) || undefined);

  return validateConfig(config);
}

/**
 * Validate config at load time. LLM model ids are intentionally strict after
 * the AI SDK migration; unprefixed legacy ids must fail instead of falling back.
 */
function validateConfig(config: AssistantsConfig): AssistantsConfig {
  const warn = (msg: string) => process.stderr.write(`[assistants-config] ${msg}\n`);

  // llm.model must be an AI SDK provider-prefixed id.
  const modelId = config.llm?.model;
  const separator = typeof modelId === 'string' ? modelId.indexOf(':') : -1;
  const modelProvider = separator > 0 ? modelId.slice(0, separator) : null;
  if (!modelProvider || separator === modelId.length - 1 || !getProviderInfo(modelProvider as never)) {
    throw new Error(
      `Invalid llm.model "${modelId}". Use an AI SDK provider-prefixed id like "anthropic:claude-sonnet-4-6".`
    );
  }

  // llm.maxOutputTokens must be positive
  if (config.llm?.maxOutputTokens !== undefined && (typeof config.llm.maxOutputTokens !== 'number' || config.llm.maxOutputTokens <= 0)) {
    warn(`Invalid llm.maxOutputTokens "${config.llm.maxOutputTokens}", falling back to 8192`);
    config.llm.maxOutputTokens = 8192;
  }
  // permissions.bash must be a valid level
  const validBashPerms = ['none', 'readonly', 'readwrite'];
  if (config.permissions?.bash && !validBashPerms.includes(config.permissions.bash)) {
    warn(`Unknown permissions.bash "${config.permissions.bash}", falling back to "readonly"`);
    config.permissions.bash = 'readonly';
  }

  // permissions.mode must be valid
  const validModes = ['normal', 'plan', 'auto-accept'];
  if (config.permissions?.mode && !validModes.includes(config.permissions.mode)) {
    warn(`Unknown permissions.mode "${config.permissions.mode}", falling back to "normal"`);
    config.permissions.mode = 'normal';
  }

  // workspace.mode must be valid
  const validWorkspaceModes = ['sandbox', 'unrestricted'];
  if (config.workspace?.mode && !validWorkspaceModes.includes(config.workspace.mode)) {
    warn(`Unknown workspace.mode "${config.workspace.mode}", falling back to "sandbox"`);
    config.workspace.mode = 'sandbox';
  }

  // context.maxContextTokens must be positive
  if (config.context?.maxContextTokens !== undefined && (typeof config.context.maxContextTokens !== 'number' || config.context.maxContextTokens <= 0)) {
    warn(`Invalid context.maxContextTokens, falling back to 180000`);
    config.context.maxContextTokens = 180000;
  }

  return config;
}

/**
 * Migrate old config keys to new names for backwards compatibility
 * Handles: subagents → subassistants, budget.agent → budget.assistant
 */
function migrateConfigKeys(config: Partial<AssistantsConfig> | null): Partial<AssistantsConfig> | null {
  if (!config) return null;
  const c = config as Record<string, unknown>;
  // subagents → subassistants
  if (c.subagents && !c.subassistants) {
    c.subassistants = c.subagents;
    delete c.subagents;
  }
  // budget.agent → budget.assistant
  if (config.budget) {
    const b = config.budget as Record<string, unknown>;
    if (b.agent && !b.assistant) {
      b.assistant = b.agent;
      delete b.agent;
    }
  }
  return config;
}

/**
 * Load hooks configuration from multiple sources (merged)
 */
export async function loadHooksConfig(
  cwd: string = process.cwd(),
  baseDir?: string
): Promise<HookConfig> {
  const hooks: HookConfig = {};

  // Load user hooks
  const userHooksPath = getConfigPath('hooks.json', baseDir);
  const userHooks = await loadJsonFile<{ hooks: HookConfig }>(userHooksPath);
  if (userHooks?.hooks) {
    mergeHooks(hooks, userHooks.hooks);
  }

  // Load project hooks
  const projectHooksPath = join(getProjectConfigDir(cwd), 'hooks.json');
  const projectHooks = await loadJsonFile<{ hooks: HookConfig }>(projectHooksPath);
  if (projectHooks?.hooks) {
    mergeHooks(hooks, projectHooks.hooks);
  }

  return hooks;
}

/**
 * Merge hooks from source into target
 */
function mergeHooks(target: HookConfig, source: HookConfig): void {
  for (const [event, matchers] of Object.entries(source)) {
    if (!target[event]) {
      target[event] = [];
    }
    target[event].push(...matchers);
  }
}

/**
 * Load a JSON file, returning null if it doesn't exist
 */
async function loadJsonFile<T>(path: string): Promise<T | null> {
  try {
    if (!hasRuntime()) {
      // Fallback to fs/promises if runtime not initialized
      const { readFile, access } = await import('fs/promises');
      try {
        await access(path);
      } catch {
        return null;
      }
      const content = await readFile(path, 'utf-8');
      return JSON.parse(content) as T;
    }
    const runtime = getRuntime();
    const file = runtime.file(path);
    if (!(await file.exists())) {
      return null;
    }
    return await file.json();
  } catch {
    return null;
  }
}

/**
 * Ensure the config directory exists (using native fs for speed)
 */
export async function ensureConfigDir(sessionId?: string, baseDir?: string): Promise<void> {
  const { mkdir } = await import('fs/promises');
  const configDir = baseDir || getConfigDir();

  // Create only directories for files that stay on disk.
  // All data storage is in assistants.db now.
  const dirs = [
    mkdir(configDir, { recursive: true }),
    mkdir(join(configDir, 'logs'), { recursive: true }),
    mkdir(join(configDir, 'temp'), { recursive: true }),
    mkdir(join(configDir, 'messages'), { recursive: true }),
    mkdir(join(configDir, 'backups'), { recursive: true }),
  ];

  // Create session-specific temp folder if provided
  if (sessionId) {
    dirs.push(mkdir(join(configDir, 'temp', sessionId), { recursive: true }));
  }

  await Promise.all(dirs);
}

/**
 * Get the temp folder path for a session
 */
export function getTempFolder(sessionId: string, baseDir?: string): string {
  return join(baseDir || getConfigDir(), 'temp', sessionId);
}

/**
 * Load system prompt from ASSISTANTS.md files
 * Priority: project .assistants/ASSISTANTS.md > global ~/.hasna/assistants/ASSISTANTS.md
 * If both exist, they are concatenated (global first, then project)
 */
export async function loadSystemPrompt(
  cwd: string = process.cwd(),
  baseDir?: string
): Promise<string | null> {
  const prompts: string[] = [];

  // Load global system prompt
  const globalPromptPath = getConfigPath('ASSISTANTS.md', baseDir);
  const globalPrompt = await loadTextFile(globalPromptPath);
  if (globalPrompt) prompts.push(globalPrompt);

  // Load project system prompt
  const projectPromptPath = join(getProjectConfigDir(cwd), 'ASSISTANTS.md');
  const projectPrompt = await loadTextFile(projectPromptPath);
  if (projectPrompt) prompts.push(projectPrompt);

  if (prompts.length === 0) {
    // Use default system prompt when no user prompts exist
    return DEFAULT_SYSTEM_PROMPT;
  }

  return prompts.join('\n\n---\n\n');
}

/**
 * Load a text file, returning null if it doesn't exist
 */
async function loadTextFile(path: string): Promise<string | null> {
  try {
    if (!hasRuntime()) {
      // Fallback to fs/promises if runtime not initialized
      const { readFile, access } = await import('fs/promises');
      try {
        await access(path);
      } catch {
        return null;
      }
      return await readFile(path, 'utf-8');
    }
    const runtime = getRuntime();
    const file = runtime.file(path);
    if (!(await file.exists())) {
      return null;
    }
    return await file.text();
  } catch {
    return null;
  }
}
