export type LLMProvider = 'anthropic' | 'openai' | 'xai' | 'mistral' | 'google';

export interface LLMProviderDefinition {
  id: LLMProvider;
  label: string;
  apiKeyEnv: string;
  defaultBaseUrl?: string;
  description?: string;
  docsUrl?: string;
}

export const LLM_PROVIDERS: LLMProviderDefinition[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    description: 'Claude models',
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    apiKeyEnv: 'OPENAI_API_KEY',
    defaultBaseUrl: 'https://api.openai.com/v1',
    description: 'GPT and o-series models',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'xai',
    label: 'xAI',
    apiKeyEnv: 'XAI_API_KEY',
    defaultBaseUrl: 'https://api.x.ai/v1',
    description: 'Grok models (OpenAI-compatible API)',
    docsUrl: 'https://docs.x.ai/api',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    apiKeyEnv: 'MISTRAL_API_KEY',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    description: 'Mistral models',
    docsUrl: 'https://console.mistral.ai/',
  },
  {
    id: 'google',
    label: 'Google Gemini',
    apiKeyEnv: 'GEMINI_API_KEY',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    description: 'Gemini models (OpenAI-compatible API)',
    docsUrl: 'https://aistudio.google.com/app/apikey',
  },
];

export const LLM_PROVIDER_IDS: LLMProvider[] = LLM_PROVIDERS.map((p) => p.id);

export const LLM_PROVIDER_LABELS: Record<LLMProvider, string> = LLM_PROVIDERS.reduce(
  (acc, provider) => {
    acc[provider.id] = provider.label;
    return acc;
  },
  {} as Record<LLMProvider, string>
);

export function getProviderInfo(provider: LLMProvider): LLMProviderDefinition | undefined {
  return LLM_PROVIDERS.find((p) => p.id === provider);
}

export function getProviderLabel(provider: LLMProvider): string {
  return LLM_PROVIDER_LABELS[provider] || provider;
}
