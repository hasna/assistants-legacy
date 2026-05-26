import {
  ALL_MODELS,
  DEFAULT_MODEL,
  getProviderModelId,
  type ModelDefinition,
} from '@hasna/assistants-shared';

export interface WebModel extends ModelDefinition {
  id: string;
  default?: boolean;
}

export const WEB_MODELS: WebModel[] = ALL_MODELS.map((model) => ({
  ...model,
  id: getProviderModelId(model),
  default: getProviderModelId(model) === DEFAULT_MODEL,
}));

export { DEFAULT_MODEL };
export const WEB_MODEL_IDS = new Set(WEB_MODELS.map((model) => model.id));
