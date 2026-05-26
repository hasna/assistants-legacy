import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import {
  jsonSchema,
  stepCountIs,
  streamText,
  type LanguageModel,
  type LanguageModelUsage,
  type ModelMessage,
  type ToolSet,
} from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';
import type { EffortLevel, LLMConfig, Message, StreamChunk, Tool, ToolCall, ToolResult } from '@hasna/assistants-shared';
import { getProviderInfo, type LLMProvider } from '@hasna/assistants-shared';
import { getModelById, MODELS } from './models';

const DEFAULT_MAX_OUTPUT_TOKENS = 8192;
const DEFAULT_THINKING_BUDGET = 10000;
const DEFAULT_MAX_TOOL_STEPS = 5;

export interface AISDKExecutableTool extends Tool {
  execute?: (toolCall: ToolCall, signal?: AbortSignal) => Promise<ToolResult>;
}

export interface LLMClient {
  chat(
    messages: Message[],
    tools?: AISDKExecutableTool[],
    systemPrompt?: string
  ): AsyncGenerator<StreamChunk>;

  getModel(): string;
  getEffortLevel?(): EffortLevel;
  setEffortLevel?(level: EffortLevel): void;
}

export function parseProviderModel(modelId: string): { provider: LLMProvider; model: string } {
  const separator = modelId.indexOf(':');
  if (separator <= 0 || separator === modelId.length - 1) {
    throw new Error(
      `Invalid AI SDK model id "${modelId}". Use a provider-prefixed id like "anthropic:claude-sonnet-4-6".`
    );
  }

  const provider = modelId.slice(0, separator) as LLMProvider;
  const model = modelId.slice(separator + 1);
  if (!getProviderInfo(provider)) {
    throw new Error(`Unsupported AI SDK provider: ${provider}`);
  }
  return { provider, model };
}

/**
 * Normalize a configured model id to the canonical provider-prefixed form the
 * AI SDK client requires. Bare ids (e.g. "claude-opus-4-5" written by older
 * configs/onboarding) are prefixed by inferring the provider from the model
 * catalog. Already-prefixed or unknown ids are returned unchanged (the strict
 * parseProviderModel then validates them).
 */
export function normalizeModelId(modelId: string): string {
  if (!modelId || modelId.includes(':')) return modelId;
  // Exact bare match.
  let def = MODELS.find((m) => m.id === modelId);
  // Legacy alias: a bare id without the dated/version suffix (e.g. "claude-opus-4-5"
  // for catalog id "claude-opus-4-5-20251101"). Match the catalog id that begins
  // with "<bare>-"; pick a single unambiguous match.
  if (!def) {
    const candidates = MODELS.filter((m) => m.id.startsWith(`${modelId}-`));
    if (candidates.length >= 1) def = candidates[0];
  }
  return def ? `${def.provider}:${def.id}` : modelId;
}

export async function createLLMClient(config: LLMConfig): Promise<LLMClient> {
  return new AISDKClient(config);
}

export class AISDKClient implements LLMClient {
  private readonly configuredModel: string;
  private readonly provider: LLMProvider;
  private readonly providerModel: string;
  private readonly maxOutputTokens: number;
  private readonly temperature?: number;
  private readonly topP?: number;
  private readonly baseProviderOptions?: Record<string, unknown>;
  private effortLevel: EffortLevel;
  private readonly model: LanguageModel;

  constructor(config: LLMConfig) {
    // Normalize bare model ids (from older configs) to the canonical prefixed form.
    const normalizedModel = normalizeModelId(config.model);
    const parsed = parseProviderModel(normalizedModel);
    this.configuredModel = normalizedModel;
    this.provider = parsed.provider;
    this.providerModel = parsed.model;
    this.maxOutputTokens = config.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
    this.temperature = config.temperature;
    this.topP = config.topP;
    this.baseProviderOptions = config.providerOptions;
    this.effortLevel = config.effortLevel ?? 'medium';
    this.model = this.createModel(config);
  }

  getModel(): string {
    return this.configuredModel;
  }

  getEffortLevel(): EffortLevel {
    return this.effortLevel;
  }

  setEffortLevel(level: EffortLevel): void {
    this.effortLevel = level;
  }

  async *chat(
    messages: Message[],
    tools?: AISDKExecutableTool[],
    systemPrompt?: string
  ): AsyncGenerator<StreamChunk> {
    try {
      const result = streamText({
        model: this.model,
        system: this.buildSystemPrompt(joinPrompts(systemPrompt, collectSystemMessages(messages))),
        messages: convertMessages(messages),
        tools: tools && tools.length > 0 ? convertTools(tools) : undefined,
        stopWhen: tools?.some((item) => item.execute) ? stepCountIs(DEFAULT_MAX_TOOL_STEPS) : undefined,
        maxOutputTokens: this.maxOutputTokensForEffort(),
        temperature: this.temperature,
        topP: this.topP,
        providerOptions: this.buildProviderOptions() as any,
      });

      const emittedToolCalls = new Set<string>();
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          yield { type: 'text', content: part.text };
        } else if (part.type === 'reasoning-delta') {
          // Reasoning is intentionally not surfaced in the public stream by default.
        } else if (part.type === 'tool-call') {
          emittedToolCalls.add(part.toolCallId);
          yield {
            type: 'tool_use',
            toolCall: {
              id: part.toolCallId,
              name: part.toolName,
              input: normalizeRecord(part.input),
            },
          };
        } else if (part.type === 'tool-result') {
          yield {
            type: 'tool_result',
            toolResult: normalizeToolResult(part.output, part.toolCallId, part.toolName),
          };
        } else if (part.type === 'tool-error' && !emittedToolCalls.has(part.toolCallId)) {
          yield {
            type: 'tool_use',
            toolCall: {
              id: part.toolCallId,
              name: part.toolName,
              input: normalizeRecord(part.input),
            },
          };
          yield {
            type: 'tool_result',
            toolResult: {
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              content: formatAIError(part.error),
              isError: true,
            },
          };
        } else if (part.type === 'tool-error') {
          yield {
            type: 'tool_result',
            toolResult: {
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              content: formatAIError(part.error),
              isError: true,
            },
          };
        } else if (part.type === 'finish') {
          yield { type: 'usage', usage: mapUsage(part.totalUsage, this.contextWindow()) };
          yield { type: 'done', finishReason: part.finishReason };
        } else if (part.type === 'error') {
          yield { type: 'error', error: formatAIError(part.error) };
        }
      }
    } catch (error) {
      yield { type: 'error', error: formatAIError(error) };
    }
  }

  private createModel(config: LLMConfig): LanguageModel {
    const apiKey = resolveApiKey(this.provider, config.apiKey);
    if (!apiKey) {
      const info = getProviderInfo(this.provider);
      const envName = info?.apiKeyEnv ?? `${this.provider.toUpperCase()}_API_KEY`;
      throw new Error(
        `${envName} not found. Set ${envName} or add it to ~/.secrets before using ${this.configuredModel}.`
      );
    }

    switch (this.provider) {
      case 'anthropic':
        return createAnthropic({ apiKey, baseURL: config.baseUrl })(this.providerModel);
      case 'openai':
        return createOpenAI({ apiKey, baseURL: config.baseUrl })(this.providerModel);
      case 'xai':
        return createXai({ apiKey, baseURL: config.baseUrl })(this.providerModel);
      case 'mistral':
        return createMistral({ apiKey, baseURL: config.baseUrl })(this.providerModel);
      case 'google':
        return createGoogleGenerativeAI({ apiKey, baseURL: config.baseUrl })(this.providerModel);
    }
  }

  private buildSystemPrompt(systemPrompt?: string): string {
    return systemPrompt && systemPrompt.trim().length > 0
      ? `${getDefaultSystemPrompt()}\n\n---\n\n${systemPrompt}`
      : getDefaultSystemPrompt();
  }

  private maxOutputTokensForEffort(): number {
    if (this.effortLevel === 'low') {
      return Math.min(this.maxOutputTokens, 4096);
    }
    if (this.provider === 'anthropic' && this.effortLevel === 'high') {
      const thinkingBudget = parseInt(process.env.MAX_THINKING_TOKENS || '', 10) || DEFAULT_THINKING_BUDGET;
      return Math.max(this.maxOutputTokens, thinkingBudget + 4096);
    }
    return this.maxOutputTokens;
  }

  private buildProviderOptions(): Record<string, Record<string, unknown>> | undefined {
    const providerOptions = { ...(this.baseProviderOptions ?? {}) };

    if (this.provider === 'anthropic' && this.effortLevel === 'high') {
      const thinkingBudget = parseInt(process.env.MAX_THINKING_TOKENS || '', 10) || DEFAULT_THINKING_BUDGET;
      providerOptions.anthropic = {
        ...normalizeRecord(providerOptions.anthropic),
        thinking: { type: 'enabled', budgetTokens: thinkingBudget },
      };
    }

    if (this.provider === 'openai' && this.effortLevel !== 'medium' && supportsOpenAIReasoningEffort(this.providerModel)) {
      providerOptions.openai = {
        ...normalizeRecord(providerOptions.openai),
        reasoningEffort: this.effortLevel === 'high' ? 'high' : 'low',
      };
    }

    return Object.keys(providerOptions).length > 0
      ? (providerOptions as Record<string, Record<string, unknown>>)
      : undefined;
  }

  private contextWindow(): number {
    return getModelById(this.providerModel)?.contextWindow ?? getModelById(this.configuredModel)?.contextWindow ?? 128000;
  }
}

export function supportsOpenAIReasoningEffort(model: string): boolean {
  return /^o\d/.test(model) || model.startsWith('gpt-5');
}

/**
 * Anthropic's tool input_schema must be a top-level object schema — it rejects
 * `oneOf`/`anyOf`/`allOf` at the top level (they're only allowed nested inside
 * properties). Some tools declare a top-level union; collapse those into a single
 * permissive object schema (merging branch properties). The tool executor still
 * validates the actual input, so loosening the advertised schema is safe.
 */
export function sanitizeToolParameters(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') {
    return { type: 'object', properties: {}, additionalProperties: true };
  }
  const s = schema as Record<string, unknown>;
  const hasTopUnion = 'oneOf' in s || 'anyOf' in s || 'allOf' in s;
  if (hasTopUnion) {
    const branches = ([] as unknown[]).concat(
      (s.oneOf as unknown[]) ?? [],
      (s.anyOf as unknown[]) ?? [],
      (s.allOf as unknown[]) ?? [],
    );
    const properties: Record<string, unknown> = {};
    for (const b of branches) {
      const props = (b as Record<string, unknown>)?.properties;
      if (props && typeof props === 'object') Object.assign(properties, props);
    }
    const out: Record<string, unknown> = { type: 'object', properties, additionalProperties: true };
    if (typeof s.description === 'string') out.description = s.description;
    return out;
  }
  // Ensure the top level is an object schema (Anthropic requires it).
  if (s.type !== 'object') {
    return { type: 'object', properties: (s.properties as Record<string, unknown>) ?? {}, additionalProperties: true };
  }
  return s;
}

export function convertTools(tools: AISDKExecutableTool[]): ToolSet {
  const converted: ToolSet = {};
  for (const item of tools) {
    const definition: ToolSet[string] = {
      description: item.description,
      inputSchema: jsonSchema(sanitizeToolParameters(item.parameters)),
    };
    if (item.execute) {
      definition.execute = async (input: unknown, options: { toolCallId: string; abortSignal?: AbortSignal }) => {
        return item.execute!(
          {
            id: options.toolCallId,
            name: item.name,
            input: normalizeRecord(input),
          },
          options.abortSignal
        );
      };
    }
    converted[item.name] = definition;
  }
  return converted;
}

export function convertMessages(messages: Message[]): ModelMessage[] {
  const converted: ModelMessage[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      continue;
    }

    if (message.role === 'assistant') {
      const content: Array<{ type: 'text'; text: string } | {
        type: 'tool-call';
        toolCallId: string;
        toolName: string;
        input: Record<string, unknown>;
      }> = [];

      if (message.content) {
        content.push({ type: 'text', text: message.content });
      }
      for (const call of message.toolCalls ?? []) {
        content.push({
          type: 'tool-call',
          toolCallId: call.id,
          toolName: call.name,
          input: call.input,
        });
      }
      if (content.length > 0) {
        converted.push({ role: 'assistant', content });
      }
      continue;
    }

    if (message.toolResults && message.toolResults.length > 0) {
      converted.push({
        role: 'tool',
        content: message.toolResults.map((result) => ({
          type: 'tool-result',
          toolCallId: result.toolCallId,
          toolName: result.toolName ?? 'unknown',
          output: normalizeToolResultOutput(result),
        })),
      } as unknown as ModelMessage);
      if (message.documents && message.documents.length > 0) {
        converted.push({
          role: 'user',
          content: [
            ...convertDocuments(message.documents),
            { type: 'text', text: message.content || 'Please analyze the attached media.' },
          ],
        } as unknown as ModelMessage);
      }
      continue;
    }

    if (message.documents && message.documents.length > 0) {
      converted.push({
        role: 'user',
        content: [
          ...convertDocuments(message.documents),
          { type: 'text', text: message.content || 'Please analyze the attached media.' },
        ],
      } as unknown as ModelMessage);
      continue;
    }

    if (message.content) {
      converted.push({ role: 'user', content: message.content });
    }
  }

  return converted;
}

export function collectSystemMessages(messages: Message[]): string | undefined {
  const content = messages
    .filter((message) => message.role === 'system' && message.content)
    .map((message) => message.content.trim())
    .filter(Boolean);
  return content.length > 0 ? content.join('\n\n') : undefined;
}

function joinPrompts(...parts: Array<string | undefined>): string | undefined {
  const content = parts
    .map((part) => part?.trim())
    .filter((part): part is string => !!part);
  return content.length > 0 ? content.join('\n\n') : undefined;
}

function convertDocuments(documents: NonNullable<Message['documents']>): Array<Record<string, unknown>> {
  return documents.map((document) => {
    if (document.source.type === 'url') {
      return {
        type: 'file',
        data: new URL(document.source.url),
        mediaType: document.mediaType ?? document.source.url.split('.').pop() ?? 'application/octet-stream',
        filename: document.name,
      };
    }
    if (document.source.type === 'base64') {
      return {
        type: 'file',
        data: document.source.data,
        mediaType: document.mediaType ?? document.source.mediaType,
        filename: document.name,
      };
    }
    return {
      type: 'text',
      text: `[Attached ${document.type}: ${document.name ?? document.source.fileId}]`,
    };
  });
}

function mapUsage(usage: LanguageModelUsage, maxContextTokens: number): NonNullable<StreamChunk['usage']> {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const totalTokens = usage.totalTokens ?? inputTokens + outputTokens;
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    maxContextTokens,
    ...(usage.inputTokenDetails.cacheReadTokens ? { cacheReadTokens: usage.inputTokenDetails.cacheReadTokens } : {}),
    ...(usage.inputTokenDetails.cacheWriteTokens ? { cacheWriteTokens: usage.inputTokenDetails.cacheWriteTokens } : {}),
  };
}

function getDefaultSystemPrompt(): string {
  return `You are a helpful personal AI assistant running in the terminal.

You have access to various tools and connectors:
- Connectors installed via \`connectors install <name>\`. To install a new connector, use the bash tool to run \`connectors install <name>\`. To run a connector operation, use \`connectors run <name> <command>\`.
- Filesystem operations (read, write, search files)
- Shell command execution
- Scheduling tools for recurring or delayed commands

Guidelines:
- Be concise and direct
- Don't introduce yourself or say your name
- Use tools proactively to accomplish tasks
- Format output nicely for the terminal (use markdown)
- If a task requires multiple steps, break it down clearly
- Never say you are "tired", "need rest", or that responses will be shorter — always respond fully

Current date: ${new Date().toISOString().split('T')[0]}`;
}

function resolveApiKey(provider: LLMProvider, override?: string): string | undefined {
  if (override) return override;
  const envName = getProviderInfo(provider)?.apiKeyEnv;
  if (!envName) return undefined;
  return process.env[envName] || loadApiKeyFromSecrets(envName);
}

function loadApiKeyFromSecrets(envName: string): string | undefined {
  const homeDir = process.env.HOME || process.env.USERPROFILE || homedir();
  const secretsPath = join(homeDir, '.secrets');
  if (!existsSync(secretsPath)) return undefined;
  try {
    const content = readFileSync(secretsPath, 'utf-8');
    const match = content.match(new RegExp(`export\\s+${envName}\\s*=\\s*['\\"]?([^'\\\"\\n]+)['\\"]?`));
    return match ? match[1] : undefined;
  } catch {
    return undefined;
  }
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeToolResult(output: unknown, toolCallId: string, toolName: string): ToolResult {
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    const record = output as Partial<ToolResult>;
    if (typeof record.content === 'string') {
      return {
        toolCallId: typeof record.toolCallId === 'string' ? record.toolCallId : toolCallId,
        toolName: typeof record.toolName === 'string' ? record.toolName : toolName,
        content: record.content,
        rawContent: record.rawContent,
        truncated: record.truncated,
        isError: record.isError,
      };
    }
  }

  const content = typeof output === 'string' ? output : JSON.stringify(output);
  return {
    toolCallId,
    toolName,
    content: content ?? '',
    rawContent: content ?? '',
  };
}

function normalizeToolResultOutput(result: ToolResult): Record<string, unknown> {
  if (result.isError) {
    return { type: 'error-text', value: result.content };
  }

  if (result.rawContent !== undefined && result.rawContent !== null) {
    if (typeof result.rawContent === 'string') {
      try {
        return { type: 'json', value: JSON.parse(result.rawContent) };
      } catch {
        return { type: 'text', value: result.rawContent };
      }
    }
    return { type: 'json', value: result.rawContent };
  }

  return { type: 'text', value: result.content };
}

export function formatAIError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message.trim().length > 0) {
      const code = typeof record.code === 'string' ? ` (${record.code})` : '';
      return `${record.message}${code}`;
    }
    if (record.error && typeof record.error === 'object') {
      const nested = record.error as Record<string, unknown>;
      if (typeof nested.message === 'string' && nested.message.trim().length > 0) {
        const code = typeof nested.code === 'string' || typeof nested.code === 'number'
          ? ` (${nested.code})`
          : '';
        return `${nested.message}${code}`;
      }
    }
    try {
      return JSON.stringify(error);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }
  return String(error);
}
