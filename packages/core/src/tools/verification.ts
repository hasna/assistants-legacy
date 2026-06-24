/**
 * Verification Tools
 *
 * Tools for managing scope verification sessions and settings.
 */

import type { Tool, VerificationSession } from '@hasna/assistants-shared';
import type { ToolExecutor, ToolRegistry } from './registry';
import { VerificationSessionStore } from '../sessions/verification';
import { nativeHookRegistry } from '../hooks';
import { getConfigDir } from '../config';
import { truncateText } from '../commands/helpers';

// ============================================
// Types
// ============================================

export interface VerificationToolsContext {
  sessionId: string;
}

// ============================================
// Tool Definitions
// ============================================

export const verificationListTool: Tool = {
  name: 'verification_list',
  description: 'List recent verification sessions. Shows scope verification results for goal-based tasks.',
  parameters: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of sessions to return (default: 10, max: 50)',
      },
      sessionOnly: {
        type: 'boolean',
        description: 'Only show sessions from the current parent session (default: false)',
      },
      verbose: {
        type: 'boolean',
        description: 'Include longer goal/reason previews',
      },
      full: {
        type: 'boolean',
        description: 'Return full goal/reason fields in list output',
      },
    },
    required: [],
  },
};

export const verificationGetTool: Tool = {
  name: 'verification_get',
  description: 'Get detailed information about a specific verification session.',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The verification session ID (full or partial match)',
      },
      full: {
        type: 'boolean',
        description: 'Return full evidence, reason, and suggestions',
      },
      verbose: {
        type: 'boolean',
        description: 'Include longer evidence/reason previews',
      },
    },
    required: ['id'],
  },
};

export const verificationStatusTool: Tool = {
  name: 'verification_status',
  description: 'Get the current status of scope verification (enabled/disabled, max retries).',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export const verificationEnableTool: Tool = {
  name: 'verification_enable',
  description: 'Enable scope verification. When enabled, goal completion is verified before proceeding.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export const verificationDisableTool: Tool = {
  name: 'verification_disable',
  description: 'Disable scope verification.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export const verificationTools: Tool[] = [
  verificationListTool,
  verificationGetTool,
  verificationStatusTool,
  verificationEnableTool,
  verificationDisableTool,
];

// ============================================
// Tool Executors Factory
// ============================================

export function createVerificationToolExecutors(
  context: VerificationToolsContext
): Record<string, ToolExecutor> {
  return {
    verification_list: async (input: Record<string, unknown>): Promise<string> => {
      const store = new VerificationSessionStore(getConfigDir());
      const limit = Math.min(50, Math.max(1, typeof input.limit === 'number' ? input.limit : 10));
      const sessionOnly = input.sessionOnly === true;
      const full = input.full === true;
      const verbose = full || input.verbose === true;

      let sessions: VerificationSession[];

      if (sessionOnly) {
        sessions = store.getByParentSession(context.sessionId).slice(0, limit);
      } else {
        sessions = store.listRecent(limit);
      }

      if (sessions.length === 0) {
        return JSON.stringify({
          success: true,
          total: 0,
          sessions: [],
          message: sessionOnly ? 'No verification sessions for current session' : 'No verification sessions found',
        });
      }

      const formatted = sessions.map((s) => ({
        id: s.id,
        result: s.result,
        goals: full ? s.goals : s.goals.map((goal) => truncateText(goal, verbose ? 200 : 96)),
        goalsMet: s.goals.length > 0 ? s.verificationResult.goalsAnalysis.filter((a) => a.met).length : 0,
        goalsTotal: s.goals.length,
        reason: full ? s.reason : truncateText(s.reason, verbose ? 240 : 120),
        createdAt: s.createdAt,
        parentSessionId: s.parentSessionId,
      }));

      return JSON.stringify({
        success: true,
        total: sessions.length,
        sessionOnly,
        sessions: formatted,
        hint: full ? undefined : 'Pass verbose=true for longer previews or full=true for complete goal/reason text.',
      });
    },

    verification_get: async (input: Record<string, unknown>): Promise<string> => {
      const id = input.id as string;
      const full = input.full === true;
      const verbose = full || input.verbose === true;
      if (!id) {
        return JSON.stringify({
          success: false,
          error: 'Session ID is required',
        });
      }

      const store = new VerificationSessionStore(getConfigDir());

      // Try direct match first
      let session = store.get(id);

      // Try partial match if not found
      if (!session) {
        const sessions = store.listRecent(100);
        session = sessions.find((s) => s.id.startsWith(id)) || null;
      }

      if (!session) {
        return JSON.stringify({
          success: false,
          error: `Verification session "${id}" not found`,
        });
      }

      const goalsAnalysis = session.verificationResult.goalsAnalysis.map((a) => ({
        goal: full ? a.goal : truncateText(a.goal, verbose ? 240 : 120),
        met: a.met,
        evidence: full ? a.evidence : truncateText(a.evidence, verbose ? 320 : 160),
      }));

      return JSON.stringify({
        success: true,
        session: {
          id: session.id,
          type: session.type,
          result: session.result,
          parentSessionId: session.parentSessionId,
          createdAt: session.createdAt,
          goals: full ? session.goals : session.goals.map((goal) => truncateText(goal, verbose ? 240 : 120)),
          goalsAnalysis,
          reason: full ? session.reason : truncateText(session.reason, verbose ? 320 : 160),
          suggestions: full ? session.suggestions : (session.suggestions ?? []).map((suggestion) => truncateText(suggestion, verbose ? 240 : 120)),
          summary: {
            goalsMet: goalsAnalysis.filter((a) => a.met).length,
            goalsTotal: goalsAnalysis.length,
          },
        },
        hint: full ? undefined : 'Pass full=true for full evidence, reason, and suggestions.',
      });
    },

    verification_status: async (): Promise<string> => {
      const config = nativeHookRegistry.getConfig();
      const enabled = config.scopeVerification?.enabled !== false;
      const maxRetries = config.scopeVerification?.maxRetries ?? 2;

      return JSON.stringify({
        success: true,
        verification: {
          enabled,
          maxRetries,
        },
      });
    },

    verification_enable: async (): Promise<string> => {
      const currentConfig = nativeHookRegistry.getConfig();

      nativeHookRegistry.setConfig({
        ...currentConfig,
        scopeVerification: {
          ...currentConfig.scopeVerification,
          enabled: true,
        },
      });

      return JSON.stringify({
        success: true,
        message: 'Scope verification enabled',
        status: {
          enabled: true,
          maxRetries: currentConfig.scopeVerification?.maxRetries ?? 2,
        },
      });
    },

    verification_disable: async (): Promise<string> => {
      const currentConfig = nativeHookRegistry.getConfig();

      nativeHookRegistry.setConfig({
        ...currentConfig,
        scopeVerification: {
          ...currentConfig.scopeVerification,
          enabled: false,
        },
      });

      return JSON.stringify({
        success: true,
        message: 'Scope verification disabled',
        status: {
          enabled: false,
          maxRetries: currentConfig.scopeVerification?.maxRetries ?? 2,
        },
      });
    },
  };
}

// ============================================
// Registration Function
// ============================================

export function registerVerificationTools(
  registry: ToolRegistry,
  context: VerificationToolsContext
): void {
  const executors = createVerificationToolExecutors(context);

  for (const tool of verificationTools) {
    registry.register(tool, executors[tool.name]);
  }
}
