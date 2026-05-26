// Model definitions for consistent model selection across terminal and web
import type { LLMProvider } from './llm-providers';
import { LLM_PROVIDER_IDS } from './llm-providers';

export type ModelProvider = LLMProvider;

export interface ModelDefinition {
  id: string;
  provider: ModelProvider;
  name: string;
  description: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  inputCostPer1M?: number;
  outputCostPer1M?: number;
  supportsTools?: boolean;
  supportsStreaming?: boolean;
  notes?: string;
}

/**
 * All available models across all providers
 */
export const ALL_MODELS: ModelDefinition[] = [
  // Anthropic Claude Models (current generation — March 2026)
  {
    id: 'claude-opus-4-6',
    provider: 'anthropic',
    name: 'Claude Opus 4.6',
    description: 'Most intelligent, best for agents and coding',
    contextWindow: 200000,
    maxOutputTokens: 128000,
    inputCostPer1M: 5,
    outputCostPer1M: 25,
    supportsTools: true,
    supportsStreaming: true,
    notes: '1M context available in beta. Knowledge cutoff May 2025.',
  },
  {
    id: 'claude-sonnet-4-6',
    provider: 'anthropic',
    name: 'Claude Sonnet 4.6',
    description: 'Best speed and intelligence balance',
    contextWindow: 200000,
    maxOutputTokens: 64000,
    inputCostPer1M: 3,
    outputCostPer1M: 15,
    supportsTools: true,
    supportsStreaming: true,
    notes: '1M context available in beta. Knowledge cutoff Aug 2025.',
  },
  {
    id: 'claude-haiku-4-5-20251001',
    provider: 'anthropic',
    name: 'Claude Haiku 4.5',
    description: 'Fastest, near-frontier intelligence',
    contextWindow: 200000,
    maxOutputTokens: 64000,
    inputCostPer1M: 1,
    outputCostPer1M: 5,
    supportsTools: true,
    supportsStreaming: true,
  },
  // Anthropic Claude Legacy Models
  {
    id: 'claude-sonnet-4-5-20250929',
    provider: 'anthropic',
    name: 'Claude Sonnet 4.5',
    description: 'Previous balanced model',
    contextWindow: 200000,
    maxOutputTokens: 64000,
    inputCostPer1M: 3,
    outputCostPer1M: 15,
    supportsTools: true,
    supportsStreaming: true,
    notes: '1M context available in beta',
  },
  {
    id: 'claude-opus-4-5-20251101',
    provider: 'anthropic',
    name: 'Claude Opus 4.5',
    description: 'Previous most capable model',
    contextWindow: 200000,
    maxOutputTokens: 64000,
    inputCostPer1M: 5,
    outputCostPer1M: 25,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'claude-opus-4-1-20250805',
    provider: 'anthropic',
    name: 'Claude Opus 4.1',
    description: 'High-capability legacy model',
    contextWindow: 200000,
    maxOutputTokens: 32000,
    inputCostPer1M: 15,
    outputCostPer1M: 75,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    name: 'Claude Sonnet 4',
    description: 'Balanced performance and speed',
    contextWindow: 200000,
    maxOutputTokens: 64000,
    inputCostPer1M: 3,
    outputCostPer1M: 15,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'claude-opus-4-20250514',
    provider: 'anthropic',
    name: 'Claude Opus 4',
    description: 'Legacy Opus model',
    contextWindow: 200000,
    maxOutputTokens: 32000,
    inputCostPer1M: 15,
    outputCostPer1M: 75,
    supportsTools: true,
    supportsStreaming: true,
  },
  // OpenAI GPT-5.4 Models (latest — March 2026)
  {
    id: 'gpt-5.4',
    provider: 'openai',
    name: 'GPT-5.4',
    description: 'Latest flagship, complex reasoning and coding',
    contextWindow: 1050000,
    maxOutputTokens: 128000,
    inputCostPer1M: 2.5,
    outputCostPer1M: 15,
    supportsTools: true,
    supportsStreaming: true,
    notes: '2x input pricing over 272K tokens',
  },
  {
    id: 'gpt-5.4-pro',
    provider: 'openai',
    name: 'GPT-5.4 Pro',
    description: 'Extended reasoning, high-stakes tasks',
    contextWindow: 1050000,
    maxOutputTokens: 128000,
    inputCostPer1M: 30,
    outputCostPer1M: 180,
    supportsTools: true,
    supportsStreaming: true,
  },
  // OpenAI GPT-5.2 Models
  {
    id: 'gpt-5.2',
    provider: 'openai',
    name: 'GPT-5.2 Thinking',
    description: 'Previous flagship model',
    contextWindow: 400000,
    maxOutputTokens: 128000,
    inputCostPer1M: 1.75,
    outputCostPer1M: 14,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'gpt-5.2-pro',
    provider: 'openai',
    name: 'GPT-5.2 Pro',
    description: 'Extended reasoning (legacy)',
    contextWindow: 400000,
    maxOutputTokens: 128000,
    inputCostPer1M: 21,
    outputCostPer1M: 168,
    supportsTools: true,
    supportsStreaming: true,
  },
  // OpenAI GPT-5.1 / GPT-5 Models
  {
    id: 'gpt-5.1',
    provider: 'openai',
    name: 'GPT-5.1',
    description: 'Balanced performance model',
    contextWindow: 400000,
    maxOutputTokens: 128000,
    inputCostPer1M: 1.25,
    outputCostPer1M: 10,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'gpt-5',
    provider: 'openai',
    name: 'GPT-5',
    description: 'General purpose model',
    contextWindow: 400000,
    maxOutputTokens: 128000,
    inputCostPer1M: 1.25,
    outputCostPer1M: 10,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'gpt-5-mini',
    provider: 'openai',
    name: 'GPT-5 Mini',
    description: 'Fast and cost-effective',
    contextWindow: 400000,
    maxOutputTokens: 128000,
    inputCostPer1M: 0.25,
    outputCostPer1M: 2,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'gpt-5-nano',
    provider: 'openai',
    name: 'GPT-5 Nano',
    description: 'Ultra-fast, lowest cost',
    contextWindow: 400000,
    maxOutputTokens: 128000,
    inputCostPer1M: 0.05,
    outputCostPer1M: 0.4,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'gpt-5-pro',
    provider: 'openai',
    name: 'GPT-5 Pro',
    description: 'Extended reasoning for GPT-5',
    contextWindow: 400000,
    maxOutputTokens: 128000,
    inputCostPer1M: 15,
    outputCostPer1M: 120,
    supportsTools: true,
    supportsStreaming: true,
  },
  // OpenAI GPT-4 Legacy Models
  {
    id: 'gpt-4.1',
    provider: 'openai',
    name: 'GPT-4.1',
    description: 'Legacy balanced model',
    contextWindow: 1050000,
    maxOutputTokens: 32768,
    inputCostPer1M: 2,
    outputCostPer1M: 8,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'gpt-4.1-mini',
    provider: 'openai',
    name: 'GPT-4.1 Mini',
    description: 'Legacy fast model',
    contextWindow: 1050000,
    maxOutputTokens: 32768,
    inputCostPer1M: 0.4,
    outputCostPer1M: 1.6,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'gpt-4.1-nano',
    provider: 'openai',
    name: 'GPT-4.1 Nano',
    description: 'Legacy lightweight model',
    contextWindow: 1050000,
    maxOutputTokens: 32768,
    inputCostPer1M: 0.1,
    outputCostPer1M: 0.4,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'gpt-4o',
    provider: 'openai',
    name: 'GPT-4o',
    description: 'Legacy multimodal model',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputCostPer1M: 2.5,
    outputCostPer1M: 10,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    name: 'GPT-4o Mini',
    description: 'Legacy fast mini model',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    supportsTools: true,
    supportsStreaming: true,
  },
  // OpenAI Reasoning Models
  {
    id: 'o3',
    provider: 'openai',
    name: 'o3',
    description: 'Powerful reasoning model',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    inputCostPer1M: 2,
    outputCostPer1M: 8,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'o3-pro',
    provider: 'openai',
    name: 'o3 Pro',
    description: 'Extended reasoning model',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    inputCostPer1M: 20,
    outputCostPer1M: 80,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'o3-mini',
    provider: 'openai',
    name: 'o3 Mini',
    description: 'Compact reasoning model',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    inputCostPer1M: 1.1,
    outputCostPer1M: 4.4,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'o4-mini',
    provider: 'openai',
    name: 'o4 Mini',
    description: 'Latest compact reasoning model',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    inputCostPer1M: 1.1,
    outputCostPer1M: 4.4,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'o1',
    provider: 'openai',
    name: 'o1',
    description: 'Original reasoning model',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    inputCostPer1M: 15,
    outputCostPer1M: 60,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'o1-pro',
    provider: 'openai',
    name: 'o1 Pro',
    description: 'Extended reasoning (original)',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    inputCostPer1M: 150,
    outputCostPer1M: 600,
    supportsTools: true,
    supportsStreaming: true,
  },
  // OpenAI Utility Models (image/audio generation)
  {
    id: 'gpt-image-1',
    provider: 'openai',
    name: 'GPT Image 1',
    description: 'Image generation model',
    notes: 'Used by generate_image tool',
  },
  {
    id: 'gpt-4o-mini-tts',
    provider: 'openai',
    name: 'GPT-4o Mini TTS',
    description: 'Fast text-to-speech with instructions support',
    notes: 'Used by generate_audio tool and OpenAI TTS provider',
  },
  // Mistral Models
  {
    id: 'mistral-large-latest',
    provider: 'mistral',
    name: 'Mistral Large (latest)',
    description: 'High quality general model',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    inputCostPer1M: 2,
    outputCostPer1M: 6,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'mistral-small-latest',
    provider: 'mistral',
    name: 'Mistral Small (latest)',
    description: 'Fast, cost-effective model',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    inputCostPer1M: 0.1,
    outputCostPer1M: 0.3,
    supportsTools: true,
    supportsStreaming: true,
  },
  // xAI Grok Models
  {
    id: 'grok-4',
    provider: 'xai',
    name: 'Grok 4',
    description: 'Latest flagship model',
    contextWindow: 131072,
    maxOutputTokens: 16384,
    inputCostPer1M: 3,
    outputCostPer1M: 15,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'grok-3',
    provider: 'xai',
    name: 'Grok 3',
    description: 'Prior flagship model',
    contextWindow: 131072,
    maxOutputTokens: 16384,
    inputCostPer1M: 3,
    outputCostPer1M: 15,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'grok-3-mini',
    provider: 'xai',
    name: 'Grok 3 Mini',
    description: 'Lightweight Grok variant',
    contextWindow: 131072,
    maxOutputTokens: 16384,
    inputCostPer1M: 0.3,
    outputCostPer1M: 0.5,
    supportsTools: true,
    supportsStreaming: true,
  },
  // Google Gemini Models
  {
    id: 'gemini-3-pro-preview',
    provider: 'google',
    name: 'Gemini 3 Pro Preview',
    description: 'Most capable preview model',
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    inputCostPer1M: 2,
    outputCostPer1M: 12,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'gemini-3-pro-image-preview',
    provider: 'google',
    name: 'Gemini 3 Pro Image Preview',
    description: 'Image generation preview model',
    contextWindow: 65536,
    maxOutputTokens: 32768,
    inputCostPer1M: 2,
    outputCostPer1M: 12,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'gemini-3-flash-preview',
    provider: 'google',
    name: 'Gemini 3 Flash Preview',
    description: 'Fast preview model',
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'gemini-2.5-pro',
    provider: 'google',
    name: 'Gemini 2.5 Pro',
    description: 'Most capable Gemini 2.5 model',
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    inputCostPer1M: 1.25,
    outputCostPer1M: 10,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'gemini-2.5-flash',
    provider: 'google',
    name: 'Gemini 2.5 Flash',
    description: 'Fast Gemini 2.5 model',
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'gemini-2.5-flash-lite',
    provider: 'google',
    name: 'Gemini 2.5 Flash Lite',
    description: 'Lightweight Gemini 2.5 model',
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    inputCostPer1M: 0.1,
    outputCostPer1M: 0.4,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'gemini-2.5-flash-image',
    provider: 'google',
    name: 'Gemini 2.5 Flash Image',
    description: 'Image-capable Gemini 2.5 Flash',
    contextWindow: 65536,
    maxOutputTokens: 32768,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'gemini-embedding-001',
    provider: 'google',
    name: 'Gemini Embedding 001',
    description: 'Text embedding model',
  },
] as const;

export const DEFAULT_MODEL = 'anthropic:claude-opus-4-6';

export const DEFAULT_TEMPERATURE = 1.0;
export const MIN_TEMPERATURE = 0.0;
export const MAX_TEMPERATURE = 2.0;
export const TEMPERATURE_STEP = 0.1;

export const DEFAULT_MAX_TOKENS = 8192;

/**
 * Format a model as an AI SDK provider-prefixed ID.
 */
export function getProviderModelId(model: ModelDefinition): string {
  return `${model.provider}:${model.id}`;
}

/**
 * Get a model definition by AI SDK provider-prefixed ID.
 */
export function getModelById(modelId: string): ModelDefinition | undefined {
  const separator = modelId.indexOf(':');
  if (separator > 0 && separator < modelId.length - 1) {
    const provider = modelId.slice(0, separator) as ModelProvider;
    const id = modelId.slice(separator + 1);
    return ALL_MODELS.find((m) => m.provider === provider && m.id === id);
  }
  return undefined;
}

/**
 * Get all models for a specific provider
 */
export function getModelsByProvider(provider: ModelProvider): ModelDefinition[] {
  return ALL_MODELS.filter((m) => m.provider === provider);
}

/**
 * Get the provider for a model ID
 */
export function getProviderForModel(modelId: string): ModelProvider | undefined {
  return getModelById(modelId)?.provider;
}

/**
 * Get model display name by ID
 */
export function getModelDisplayName(modelId: string): string {
  const model = getModelById(modelId);
  return model?.name ?? modelId;
}

/**
 * Clamp maxOutputTokens to the model's maximum output tokens
 */
export function clampMaxOutputTokens(modelId: string, maxOutputTokens: number): number {
  const model = getModelById(modelId);
  const modelMax = model?.maxOutputTokens ?? 8192;
  return Math.min(maxOutputTokens, modelMax);
}

/**
 * Get models grouped by provider for UI display
 */
export function getModelsGroupedByProvider(): Record<ModelProvider, ModelDefinition[]> {
  const grouped = {} as Record<ModelProvider, ModelDefinition[]>;
  for (const provider of LLM_PROVIDER_IDS) {
    grouped[provider] = [];
  }
  for (const model of ALL_MODELS) {
    grouped[model.provider].push(model);
  }
  return grouped;
}
