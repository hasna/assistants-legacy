import type { Tool, Connector } from '@hasna/assistants-shared';
import type { ToolExecutor, ToolRegistry } from './registry';
import { ConnectorBridge, resolveTimeout } from './connector-bridge';
import { ConnectorAutoRefreshManager } from '../connectors/auto-refresh';

export const __test__ = {
  resolveTimeout,
};

// ============================================
// Connector Execute Tool (Generic)
// ============================================

/**
 * Generic connector execution tool that can run any connector command.
 * This reduces context usage when many connectors are available by providing
 * a single tool that can execute any discovered connector.
 */
export const connectorExecuteTool: Tool = {
  name: 'connector_execute',
  description: 'Execute a command on any discovered connector. Use connectors_list or connectors_search first to discover available connectors and their commands.',
  parameters: {
    type: 'object',
    properties: {
      connector: {
        type: 'string',
        description: 'Name of the connector to use (e.g., "notion", "gmail", "googledrive")',
      },
      command: {
        type: 'string',
        description: 'The command to run on the connector',
      },
      args: {
        type: 'array',
        description: 'Arguments to pass to the command',
        items: { type: 'string', description: 'Argument value' },
      },
      options: {
        type: 'object',
        description: 'Options to pass to the command (key-value pairs)',
      },
    },
    required: ['connector', 'command'],
  },
};

export interface ConnectorExecuteContext {
  getConnectorBridge: () => ConnectorBridge | null;
}

export function createConnectorExecuteExecutor(
  context: ConnectorExecuteContext
): ToolExecutor {
  return async (input: Record<string, unknown>): Promise<string> => {
    const bridge = context.getConnectorBridge();
    if (!bridge) {
      return JSON.stringify({
        error: 'Connector system not available',
        suggestion: 'Ensure connectors are configured and discovered',
      });
    }

    const connectorName = input.connector as string;
    if (!connectorName) {
      return JSON.stringify({
        error: 'Missing required parameter: connector',
        suggestion: 'Use connectors_list to find available connectors',
      });
    }

    const connector = bridge.getConnector(connectorName);
    if (!connector) {
      const available = bridge.getConnectors().map(c => c.name);
      return JSON.stringify({
        error: `Connector '${connectorName}' not found`,
        available: available.slice(0, 10),
        totalAvailable: available.length,
        suggestion: 'Use connectors_list to see all available connectors',
      });
    }

    // Create an executor for this connector and run it
    const executor = bridge['createExecutor'](connector);
    return executor({
      command: input.command,
      args: input.args,
      options: input.options,
      cwd: input.cwd,
    });
  };
}

export function registerConnectorExecuteTool(
  registry: ToolRegistry,
  context: ConnectorExecuteContext
): void {
  const executor = createConnectorExecuteExecutor(context);
  registry.register(connectorExecuteTool, executor);
}

// ============================================
// Connectors Search Tool
// ============================================

/**
 * Search tool for finding connectors by name, description, or command.
 * Useful when many connectors are available and user needs to find specific ones.
 */
export const connectorsSearchTool: Tool = {
  name: 'connectors_search',
  description: 'Search for connectors by name, description, or command. Use this to find the right connector for a task when many are available.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query to match against connector names, descriptions, and commands',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5, max: 20)',
      },
    },
    required: ['query'],
  },
};

export interface ConnectorSearchContext {
  getConnectorBridge: () => ConnectorBridge | null;
  onConnectorSelected?: (connectorName: string) => void;
}

export function createConnectorsSearchExecutor(
  context: ConnectorSearchContext
): ToolExecutor {
  return async (input: Record<string, unknown>): Promise<string> => {
    const bridge = context.getConnectorBridge();
    if (!bridge) {
      return JSON.stringify({
        error: 'Connector discovery not available',
        results: [],
      });
    }

    const query = (input.query as string || '').toLowerCase();
    const limit = Math.min(Math.max(1, Number(input.limit) || 5), 20);

    if (!query) {
      return JSON.stringify({
        error: 'Search query is required',
        suggestion: 'Provide a query like "email", "storage", or "calendar"',
      });
    }

    const connectors = bridge.getConnectors();
    const results: Array<{
      name: string;
      description: string;
      matchedCommands: string[];
      score: number;
    }> = [];

    for (const connector of connectors) {
      let score = 0;
      const matchedCommands: string[] = [];

      // Score name match (highest weight)
      if (connector.name.toLowerCase().includes(query)) {
        score += 10;
        if (connector.name.toLowerCase() === query) {
          score += 5; // Exact match bonus
        }
      }

      // Score description match
      if (connector.description.toLowerCase().includes(query)) {
        score += 5;
      }

      // Score command matches
      for (const cmd of connector.commands) {
        if (cmd.name.toLowerCase().includes(query)) {
          score += 2;
          matchedCommands.push(cmd.name);
        }
        if (cmd.description.toLowerCase().includes(query)) {
          score += 1;
          if (!matchedCommands.includes(cmd.name)) {
            matchedCommands.push(cmd.name);
          }
        }
      }

      if (score > 0) {
        results.push({
          name: connector.name,
          description: connector.description,
          matchedCommands: matchedCommands.slice(0, 5),
          score,
        });
      }
    }

    // Sort by score (descending) and limit results
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, limit);

    // Notify about selected connectors (for dynamic binding)
    if (context.onConnectorSelected && topResults.length > 0) {
      for (const result of topResults) {
        context.onConnectorSelected(result.name);
      }
    }

    return JSON.stringify({
      query,
      count: topResults.length,
      totalMatches: results.length,
      results: topResults.map(({ score, ...rest }) => rest),
      suggestion: topResults.length > 0
        ? `Use connector_execute with connector="${topResults[0].name}" to run commands`
        : 'Try a different search query or use connectors_list to see all available connectors',
    }, null, 2);
  };
}

export function registerConnectorsSearchTool(
  registry: ToolRegistry,
  context: ConnectorSearchContext
): void {
  const executor = createConnectorsSearchExecutor(context);
  registry.register(connectorsSearchTool, executor);
}

// ============================================
// Connectors List Tool
// ============================================

export const connectorsListTool: Tool = {
  name: 'connectors_list',
  description: 'List all discovered connectors and their available commands. Use this to discover what connectors are available and what operations they support.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Optional: filter to a specific connector by name',
      },
      verbose: {
        type: 'boolean',
        description: 'Optional: include detailed command information (default: false)',
      },
      page: {
        type: 'number',
        description: 'Optional: page number for paginated results (default: 1)',
      },
      limit: {
        type: 'number',
        description: 'Optional: items per page (default: 10, max: 50)',
      },
    },
    required: [],
  },
};

export interface ConnectorListContext {
  getConnectorBridge: () => ConnectorBridge | null;
  /** Optional callback when a connector is explicitly viewed (for dynamic binding) */
  onConnectorSelected?: (connectorName: string) => void;
}

export function createConnectorsListExecutor(
  context: ConnectorListContext
): ToolExecutor {
  return async (input: Record<string, unknown>): Promise<string> => {
    const bridge = context.getConnectorBridge();
    if (!bridge) {
      return JSON.stringify({
        error: 'Connector discovery not available',
        connectors: [],
      });
    }

    const connectors = bridge.getConnectors();
    const autoRefreshManager = ConnectorAutoRefreshManager.getInstance();
    await autoRefreshManager.start();
    const filterName = input.name as string | undefined;
    const verbose = input.verbose === true;
    const page = Math.max(1, Number(input.page) || 1);
    const limit = Math.min(Math.max(1, Number(input.limit) || 10), 50);

    // Filter by name if specified
    let filtered = filterName
      ? connectors.filter((c) => c.name.toLowerCase() === filterName.toLowerCase())
      : connectors;

    if (filtered.length === 0 && filterName) {
      // Try partial match
      filtered = connectors.filter((c) =>
        c.name.toLowerCase().includes(filterName.toLowerCase())
      );

      if (filtered.length === 0) {
        return JSON.stringify({
          error: `Connector '${filterName}' not found`,
          available: connectors.slice(0, 10).map((c) => c.name),
          totalAvailable: connectors.length,
          suggestion: 'Use connectors_search to find connectors by functionality',
        });
      }
    }

    // Notify about explicitly viewed connector (for dynamic binding)
    if (context.onConnectorSelected && filterName && filtered.length === 1) {
      context.onConnectorSelected(filtered[0].name);
    }

    // Apply pagination
    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginated = filtered.slice(startIndex, startIndex + limit);

    const result = paginated.map((connector) => {
      const autoRefreshEntry = autoRefreshManager.get(connector.name);
      const base: Record<string, unknown> = {
        name: connector.name,
        description: connector.description,
        autoRefresh: autoRefreshEntry
          ? {
              enabled: autoRefreshEntry.enabled,
              schedule: autoRefreshEntry.schedule,
              nextRunAt: autoRefreshEntry.nextRunAt,
              lastRunAt: autoRefreshEntry.lastRunAt,
              lastResult: autoRefreshEntry.lastResult,
            }
          : null,
        commands: verbose
          ? connector.commands.map((cmd) => ({
              name: cmd.name,
              description: cmd.description,
              args: cmd.args.map((a) => ({
                name: a.name,
                description: a.description,
                required: a.required,
                type: a.type,
              })),
              options: cmd.options.map((o) => ({
                name: o.name,
                description: o.description,
                type: o.type,
                default: o.default,
              })),
            }))
          : connector.commands.map((cmd) => cmd.name),
      };
      return base;
    });

    return JSON.stringify(
      {
        count: result.length,
        total,
        page,
        limit,
        totalPages,
        hasMore: page < totalPages,
        connectors: result,
        ...(total > limit && !filterName ? {
          tip: 'Use connectors_search to find specific connectors, or connector_execute to run commands directly',
        } : {}),
      },
      null,
      2
    );
  };
}

export function registerConnectorsListTool(
  registry: ToolRegistry,
  context: ConnectorListContext
): void {
  const executor = createConnectorsListExecutor(context);
  registry.register(connectorsListTool, executor);
}

// Registry tools moved to tools/connectors-registry.ts (loaded dynamically)

