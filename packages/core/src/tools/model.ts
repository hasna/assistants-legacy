/**
 * Model Management Tools
 *
 * Tools for listing available models and switching the active model.
 */

import type { Tool } from '@hasna/assistants-shared';
import type { ToolExecutor, ToolRegistry } from './registry';
import { MODELS, getModelById, getModelsByProvider, getModelsGroupedByProvider } from '../llm/models';
import { LLM_PROVIDER_IDS, type LLMProvider } from '@hasna/assistants-shared';
import { DEFAULT_COMPACT_LIMIT, MAX_COMPACT_LIMIT, pageItems, truncateText } from '../commands/helpers';

// ============================================
// Types
// ============================================

export interface ModelToolsContext {
  getModel: () => string | null;
  switchModel: (modelId: string) => Promise<void>;
  getLLMConfig?: () => import('@hasna/assistants-shared').LLMConfig | null;
}

// ============================================
// Tool Definitions
// ============================================

export const modelListTool: Tool = {
  name: 'model_list',
  description: 'List all available LLM models with their details (provider, context window, cost, capabilities).',
  parameters: {
    type: 'object',
    properties: {
      provider: {
        type: 'string',
        enum: LLM_PROVIDER_IDS,
        description: 'Optional: Filter to only show models from a specific provider',
      },
      source: {
        type: 'string',
        enum: ['static'],
        description: 'Optional: model source. AI SDK migration uses the static registry only.',
      },
      limit: {
        type: 'number',
        description: 'Maximum models to return (default 20, max 100)',
      },
      cursor: {
        type: 'number',
        description: 'Zero-based offset for pagination',
      },
      verbose: {
        type: 'boolean',
        description: 'Include longer descriptions and notes',
      },
      full: {
        type: 'boolean',
        description: 'Return all models without compact truncation',
      },
    },
    required: [],
  },
};

export const modelGetTool: Tool = {
  name: 'model_get',
  description: 'Get detailed information about a specific model by ID.',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The model ID to retrieve details for',
      },
    },
    required: ['id'],
  },
};

export const modelCurrentTool: Tool = {
  name: 'model_current',
  description: 'Get information about the currently active model.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export const modelSwitchTool: Tool = {
  name: 'model_switch',
  description: 'DEPRECATED: Models are tied to agents. To change the model, switch to a different agent using the /agents command or the agents panel.',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The model ID (not supported — switch agent instead)',
      },
    },
    required: ['id'],
  },
};

export const modelTools: Tool[] = [
  modelListTool,
  modelGetTool,
  modelCurrentTool,
  modelSwitchTool,
];

// ============================================
// Tool Executors Factory
// ============================================

export function createModelToolExecutors(
  context: ModelToolsContext
): Record<string, ToolExecutor> {
  return {
    model_list: async (input: Record<string, unknown>): Promise<string> => {
      const providerFilter = input.provider as LLMProvider | undefined;
      const source = (input.source as string | undefined) || 'static';

      let models;
      if (source !== 'static') {
        return JSON.stringify({
          success: false,
          error: 'Live model listing was removed in the AI SDK migration. Use source="static".',
        });
      }
      if (providerFilter) {
        models = getModelsByProvider(providerFilter);
      } else {
        models = MODELS;
      }

      const currentModel = context.getModel();
      const grouped = getModelsGroupedByProvider();
      const full = input.full === true;
      const verbose = full || input.verbose === true;
      const limitInput = typeof input.limit === 'number' ? input.limit : DEFAULT_COMPACT_LIMIT;
      const cursorInput = typeof input.cursor === 'number' ? input.cursor : 0;
      const limit = full ? Math.max(models.length, 1) : Math.min(Math.max(Math.floor(limitInput), 1), MAX_COMPACT_LIMIT);
      const cursor = Math.max(Math.floor(cursorInput), 0);
      const page = pageItems(models, { limit, cursor });

      const list = page.items.map((m) => ({
        id: `${m.provider}:${m.id}`,
        name: truncateText(m.name, verbose ? 120 : 56),
        provider: m.provider,
        description: truncateText(m.description, verbose ? 240 : 96),
        contextWindow: m.contextWindow,
        maxOutputTokens: m.maxOutputTokens,
        inputCostPer1M: m.inputCostPer1M ?? null,
        outputCostPer1M: m.outputCostPer1M ?? null,
        supportsTools: m.supportsTools ?? true,
        supportsStreaming: m.supportsStreaming ?? true,
        isCurrent: `${m.provider}:${m.id}` === currentModel,
        notes: m.notes ? truncateText(m.notes, verbose ? 240 : 96) : null,
      }));

      const providerCounts = LLM_PROVIDER_IDS.reduce((acc, provider) => {
        acc[provider] = (grouped[provider] || []).length;
        return acc;
      }, {} as Record<string, number>);

      return JSON.stringify({
        success: true,
        currentModel,
        total: models.length,
        shown: list.length,
        limit,
        cursor,
        nextCursor: page.nextCursor,
        providers: providerCounts,
        models: list,
        hint: page.nextCursor !== null
          ? `Pass cursor=${page.nextCursor} for more. Pass full=true for all models.`
          : 'Pass verbose=true for longer descriptions, or full=true for all models.',
      });
    },

    model_get: async (input: Record<string, unknown>): Promise<string> => {
      const id = input.id as string;
      if (!id) {
        return JSON.stringify({
          success: false,
          error: 'Model ID is required',
        });
      }

      const model = getModelById(id);
      if (!model) {
        return JSON.stringify({
          success: false,
          error: `Model "${id}" not found. Use model_list to see available models.`,
        });
      }

      const currentModel = context.getModel();

      return JSON.stringify({
        success: true,
        model: {
          id: model.id,
          name: model.name,
          provider: model.provider,
          description: model.description,
          contextWindow: model.contextWindow,
          maxOutputTokens: model.maxOutputTokens,
          inputCostPer1M: model.inputCostPer1M ?? null,
          outputCostPer1M: model.outputCostPer1M ?? null,
          supportsTools: model.supportsTools ?? true,
          supportsStreaming: model.supportsStreaming ?? true,
          notes: model.notes || null,
          isCurrent: model.id === currentModel,
        },
      });
    },

    model_current: async (): Promise<string> => {
      const currentModelId = context.getModel();
      if (!currentModelId) {
        return JSON.stringify({
          success: false,
          error: 'No model currently active',
        });
      }

      const model = getModelById(currentModelId);
      if (!model) {
        return JSON.stringify({
          success: true,
          modelId: currentModelId,
          name: currentModelId,
          note: 'Model details not found in registry',
        });
      }

      return JSON.stringify({
        success: true,
        model: {
          id: model.id,
          name: model.name,
          provider: model.provider,
          description: model.description,
          contextWindow: model.contextWindow,
          maxOutputTokens: model.maxOutputTokens,
          inputCostPer1M: model.inputCostPer1M ?? null,
          outputCostPer1M: model.outputCostPer1M ?? null,
        },
      });
    },

    model_switch: async (_input: Record<string, unknown>): Promise<string> => {
      return JSON.stringify({
        success: false,
        error: 'Models are tied to agents. To change the model, switch to a different agent using /agents or the agents panel (tab key). Each agent has a fixed model configured in its settings.',
      });
    },
  };
}

// ============================================
// Registration Function
// ============================================

export function registerModelTools(
  registry: ToolRegistry,
  context: ModelToolsContext
): void {
  const executors = createModelToolExecutors(context);

  for (const tool of modelTools) {
    registry.register(tool, executors[tool.name]);
  }
}
