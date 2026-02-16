export interface WebModel {
  id: string;
  name: string;
  provider: 'anthropic';
  default?: boolean;
}

export const WEB_MODELS: WebModel[] = [
  { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', provider: 'anthropic', default: true },
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'anthropic' },
];

export const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
export const WEB_MODEL_IDS = new Set(WEB_MODELS.map((model) => model.id));
