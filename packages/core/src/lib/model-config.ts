// Model configuration for @hasna/assistants
// Reads/writes ~/.hasna/assistants/config.json to store the active fine-tuned model ID

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getConfigDir } from '../config';

export const DEFAULT_MODEL = 'gpt-4o-mini';

interface ModelConfigJson {
  activeModel?: string;
  [key: string]: unknown;
}

function getModelConfigPath(): string {
  return join(getConfigDir(), 'model-config.json');
}

function readModelConfig(): ModelConfigJson {
  const configPath = getModelConfigPath();
  if (!existsSync(configPath)) return {};
  try {
    const raw = readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as ModelConfigJson;
  } catch {
    return {};
  }
}

function writeModelConfig(config: ModelConfigJson): void {
  const configDir = getConfigDir();
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  const configPath = getModelConfigPath();
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Returns the currently active fine-tuned model ID, or the default model.
 */
export function getActiveModel(): string {
  const config = readModelConfig();
  return config.activeModel ?? DEFAULT_MODEL;
}

/**
 * Sets the active fine-tuned model ID in ~/.hasna/assistants/model-config.json.
 */
export function setActiveModel(modelId: string): void {
  const config = readModelConfig();
  config.activeModel = modelId;
  writeModelConfig(config);
}

/**
 * Clears the active fine-tuned model, reverting to the default.
 */
export function clearActiveModel(): void {
  const config = readModelConfig();
  delete config.activeModel;
  writeModelConfig(config);
}
