/**
 * System Assistant Definitions
 *
 * Built-in assistants that are always present and cannot be deleted.
 * Built-in assistants backed by the AI SDK runtime.
 */

import type { Assistant, AssistantBackend } from './types';

export const SYSTEM_ASSISTANT_IDS = {
  marcus: 'system-marcus',
} as const;

export type SystemAssistantId = (typeof SYSTEM_ASSISTANT_IDS)[keyof typeof SYSTEM_ASSISTANT_IDS];

export const DEFAULT_SYSTEM_ASSISTANT_ID = SYSTEM_ASSISTANT_IDS.marcus;

interface SystemAssistantDefinition {
  id: string;
  name: string;
  description: string;
  avatar: string;
  backend: AssistantBackend;
  model: string;
  systemPromptAddition?: string;
}

const SYSTEM_ASSISTANT_DEFINITIONS: SystemAssistantDefinition[] = [
  {
    id: SYSTEM_ASSISTANT_IDS.marcus,
    name: 'Marcus',
    description: 'Your default AI assistant. Friendly, capable, and ready to help with any task.',
    avatar: '🤖',
    backend: 'ai-sdk',
    model: 'anthropic:claude-opus-4-5-20251101',
  },
];

/**
 * Build a full Assistant object from a system assistant definition.
 */
export function buildSystemAssistant(def: SystemAssistantDefinition): Assistant {
  const now = new Date().toISOString();
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    avatar: def.avatar,
    isSystem: true,
    settings: {
      model: def.model,
      backend: def.backend,
      systemPromptAddition: def.systemPromptAddition,
    },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get all system assistant definitions for seeding.
 */
export function getSystemAssistantDefinitions(): SystemAssistantDefinition[] {
  return SYSTEM_ASSISTANT_DEFINITIONS;
}

/**
 * Check if an assistant ID belongs to a system assistant.
 */
export function isSystemAssistantId(id: string): boolean {
  return Object.values(SYSTEM_ASSISTANT_IDS).includes(id as SystemAssistantId);
}
