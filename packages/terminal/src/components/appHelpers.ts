import { spawn } from 'child_process';
import type { StreamChunk, HookEvent } from '@hasna/assistants-shared';

export const SHOW_ERROR_CODES = process.env.ASSISTANTS_DEBUG === '1';
export const MAX_SHELL_OUTPUT_BYTES = 64 * 1024;

export type ShellResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  truncated: boolean;
};

export type SkillDraft = {
  name?: string;
  description?: string;
  allowedTools?: string[];
  argumentHint?: string;
  content?: string;
};

export type WalletCardEntry = {
  id: string;
  name: string;
  last4: string;
  brand?: string;
  cardType?: string;
  cardholderName?: string;
  number?: string;
  expiry?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault?: boolean;
  createdAt?: string;
};

export type WalletAddInput = {
  name: string;
  cardholderName: string;
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
};

export type HookDraft = {
  event?: HookEvent;
  matcher?: string;
  type?: 'command' | 'prompt' | 'assistant';
  command?: string;
  timeout?: number;
  async?: boolean;
  name?: string;
  description?: string;
  location?: 'project' | 'user' | 'local';
};

export const HOOK_EVENT_SET = new Set<HookEvent>([
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'Notification',
  'SubassistantStart',
  'SubassistantStop',
  'PreCompact',
  'Stop',
]);

export const HOOK_TYPE_SET = new Set(['command', 'prompt', 'assistant']);
export const HOOK_LOCATION_SET = new Set(['project', 'user', 'local']);
export const HOOK_EVENT_MAP = new Map(
  Array.from(HOOK_EVENT_SET).map((ev) => [ev.toLowerCase(), ev])
);

export async function runShellCommand(command: string, cwd: string): Promise<ShellResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { cwd, shell: true, env: process.env });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let totalBytes = 0;
    let truncated = false;

    const collect = (chunk: Buffer, target: Buffer[]) => {
      if (totalBytes >= MAX_SHELL_OUTPUT_BYTES) {
        truncated = true;
        return;
      }
      const remaining = MAX_SHELL_OUTPUT_BYTES - totalBytes;
      if (chunk.length > remaining) {
        target.push(chunk.slice(0, remaining));
        totalBytes = MAX_SHELL_OUTPUT_BYTES;
        truncated = true;
        return;
      }
      target.push(chunk);
      totalBytes += chunk.length;
    };

    if (child.stdout) {
      child.stdout.on('data', (chunk: Buffer) => collect(chunk, stdoutChunks));
    }
    if (child.stderr) {
      child.stderr.on('data', (chunk: Buffer) => collect(chunk, stderrChunks));
    }

    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf8').trimEnd(),
        stderr: Buffer.concat(stderrChunks).toString('utf8').trimEnd(),
        exitCode: code,
        truncated,
      });
    });
  });
}

export function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

export function normalizeAllowedTools(input: unknown): string[] | undefined {
  if (!input) return undefined;
  if (Array.isArray(input)) {
    const tools = input.map((tool) => String(tool).trim()).filter(Boolean);
    return tools.length > 0 ? tools : undefined;
  }
  if (typeof input === 'string') {
    const tools = input.split(',').map((tool) => tool.trim()).filter(Boolean);
    return tools.length > 0 ? tools : undefined;
  }
  return undefined;
}

export async function collectStreamText(stream: AsyncGenerator<StreamChunk>): Promise<string> {
  let text = '';
  for await (const chunk of stream) {
    if (chunk.type === 'text' && chunk.content) {
      text += chunk.content;
    }
  }
  return text.trim();
}

export function formatShellResult(command: string, result: ShellResult): string {
  const sections: string[] = [
    'Local shell command executed:',
    '```bash\n$ ' + command + '\n```',
    `Exit code: ${result.exitCode ?? 'unknown'}`,
  ];

  if (result.stdout) {
    sections.push('STDOUT:\n```\n' + result.stdout + '\n```');
  } else {
    sections.push('STDOUT: (empty)');
  }

  if (result.stderr) {
    sections.push('STDERR:\n```\n' + result.stderr + '\n```');
  }

  if (result.truncated) {
    sections.push('_Output truncated after 64KB._');
  }

  return sections.join('\n\n');
}

/**
 * Bare slash commands (`/foo`) that the assistant/LLM layer handles directly and
 * should always pass through without a local "unknown command" warning.
 */
export const LLM_HANDLED_COMMANDS = new Set([
  '/about', '/help', '/status', '/tokens', '/cost', '/compact',
  '/voice', '/context', '/diff', '/feedback', '/verification',
  '/whoami', '/agents', '/call', '/communication', '/init', '/logs',
]);

/**
 * Decide whether a submitted input is an unrecognized bare slash command that
 * should be rejected locally (to avoid wasting an LLM turn).
 *
 * A bare `/word` is recognized if it is LLM-handled OR present in the loaded
 * command registry (panel commands like /webhooks, /channels, /people are
 * registered there and handled by the agent). Anything with arguments or non
 * bare-slash input is never treated as unknown here.
 */
export function isUnrecognizedSlashCommand(
  trimmedInput: string,
  registeredCommandNames: string[],
): boolean {
  if (!/^\/\w+$/.test(trimmedInput) || trimmedInput.startsWith('/say ')) return false;
  const cmdBase = trimmedInput.split(/\s+/)[0].toLowerCase();
  if (LLM_HANDLED_COMMANDS.has(cmdBase)) return false;
  const registered = new Set(registeredCommandNames.map((n) => n.toLowerCase()));
  return !registered.has(cmdBase);
}

export function formatElapsedDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  // Show "<1s" for very quick responses (sub-second)
  if (totalSeconds === 0) return '<1s';
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}m ${secs}s`;
}

/**
 * Deep merge two objects
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const output = { ...target };
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceValue = source[key];
    const targetValue = target[key];
    if (
      sourceValue &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      output[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[keyof T];
    } else if (sourceValue !== undefined) {
      output[key] = sourceValue as T[keyof T];
    }
  }
  return output;
}

export interface AppProps {
  cwd: string;
  version?: string;
  permissionMode?: 'normal' | 'plan' | 'auto-accept';
  onExit?: () => void;
}

// Activity entry for tracking tool calls and text during a turn
export interface ActivityEntry {
  id: string;
  type: 'text' | 'tool_call' | 'tool_result';
  content?: string;
  toolCall?: import('@hasna/assistants-shared').ToolCall;
  toolResult?: import('@hasna/assistants-shared').ToolResult;
  timestamp: number;
}

// Per-session UI state
export interface SessionUIState {
  messages: import('@hasna/assistants-shared').Message[];
  currentResponse: string;
  activityLog: ActivityEntry[];
  toolCalls: import('@hasna/assistants-shared').ToolCall[];
  toolResults: import('@hasna/assistants-shared').ToolResult[];
  tokenUsage: import('@hasna/assistants-shared').TokenUsage | undefined;

  voiceState: import('@hasna/assistants-shared').VoiceState | undefined;
  heartbeatState: import('@hasna/assistants-shared').HeartbeatState | undefined;
  identityInfo: import('@hasna/assistants-shared').ActiveIdentityInfo | undefined;
  processingStartTime: number | undefined;
  currentTurnTokens: number;
  error: string | null;
  lastWorkedFor: string | undefined;
}

export interface AskUserState {
  sessionId: string;
  request: import('@hasna/assistants-shared').AskUserRequest;
  index: number;
  answers: Record<string, string>;
  resolve: (response: import('@hasna/assistants-shared').AskUserResponse) => void;
  reject: (error: Error) => void;
}

export interface InterviewState {
  sessionId: string;
  interviewId: string;
  request: import('@hasna/assistants-shared').InterviewRequest;
  resolve: (response: import('@hasna/assistants-shared').InterviewResponse) => void;
  reject: (error: Error) => void;
}

export interface IdentityPanelIntent {
  id?: string;
  mode?: 'detail' | 'edit';
}

export const MESSAGE_CHUNK_LINES = 12;
export const MESSAGE_WRAP_CHARS = 120;
export const CONNECTOR_INSTALL_PATTERN = /\b(connect-[a-z0-9._-]+(?:@[a-z0-9._-]+)?|@hasna\/[a-z0-9._-]+(?:@[a-z0-9._-]+)?)\b/i;

/**
 * Whether a stream chunk represents the start of genuinely visible assistant
 * output (streamed text or a tool call). Used to decide when a new turn may
 * clear a previously surfaced error banner: a bare terminal chunk — e.g. a
 * 'done' immediately trailing an 'error' from an API failure — must NOT clear
 * the error, otherwise the failure renders as dead air. Only real output should
 * reset the banner.
 */
export function chunkStartsVisibleOutput(chunkType: string): boolean {
  return chunkType === 'text' || chunkType === 'tool_use';
}
