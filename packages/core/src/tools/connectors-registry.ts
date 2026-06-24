/**
 * Connectors registry tools — separate file with lazy SDK imports.
 */
import type { Tool } from '@hasna/assistants-shared';
import type { ToolExecutor, ToolRegistry } from './registry';
import { ConnectorError, ErrorCodes } from '../errors';
import { disclosureHint, pageItems, truncateText } from '../commands/helpers';
import {
  searchConnectorRegistry,
  listRegistryConnectors,
  listConnectorCategories,
  installConnectorFromRegistry,
} from '../connectors/registry-adapter';

export function createConnectorsRegistrySearchTool(): { tool: Tool; executor: ToolExecutor } {
  const tool: Tool = {
    name: 'connectors_registry_search',
    description: `Search the @hasna/connectors registry of pre-built API connectors.`,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (e.g. "stripe", "gmail")' },
        limit: { type: 'number', description: 'Maximum rows to return (default 15, max 100)' },
        cursor: { type: 'number', description: 'Zero-based row offset for pagination' },
        verbose: { type: 'boolean', description: 'Show wider descriptions while still respecting limit' },
        json: { type: 'boolean', description: 'Return a structured JSON page instead of human text' },
      },
      required: ['query'],
    },
  };
  const executor: ToolExecutor = async (input) => {
    const query = String(input.query || '').trim();
    if (!query) return 'Provide a search query to find connectors.';
    const outputOptions = getOutputOptions(input, 15);
    const results = await searchConnectorRegistry(query);
    if (results.length === 0) return `No connectors found matching "${query}".`;
    const page = pageItems(results, outputOptions);
    if (outputOptions.json) {
      return JSON.stringify({
        connectors: page.items,
        total: page.total,
        limit: outputOptions.limit,
        cursor: outputOptions.cursor,
        nextCursor: page.nextCursor,
      }, null, 2);
    }
    const lines = page.items.map((c) => `- ${c.name} (${c.category}): ${truncateText(c.description, outputOptions.verbose ? 160 : 80)}`);
    return `Found ${page.shown}/${page.total} connector(s) matching "${truncateText(query, 80)}":\n\n${lines.join('\n')}${disclosureHint(outputOptions, page.total, page.shown, 'connectors_registry_install')}`;
  };
  return { tool, executor };
}

export function createConnectorsRegistryListTool(): { tool: Tool; executor: ToolExecutor } {
  const tool: Tool = {
    name: 'connectors_registry_list',
    description: `List available connectors from the @hasna/connectors registry.`,
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Category filter or "categories" to list all.' },
        limit: { type: 'number', description: 'Maximum rows to return (default 20, max 100)' },
        cursor: { type: 'number', description: 'Zero-based row offset for pagination' },
        verbose: { type: 'boolean', description: 'Show wider descriptions while still respecting limit' },
        json: { type: 'boolean', description: 'Return a structured JSON page instead of human text' },
      },
    },
  };
  const executor: ToolExecutor = async (input) => {
    const category = String(input.category || '').trim();
    const outputOptions = getOutputOptions(input, 20);
    if (category === 'categories' || category === 'list') {
      const cats = await listConnectorCategories();
      const page = pageItems(cats, outputOptions);
      if (outputOptions.json) {
        return JSON.stringify({
          categories: page.items,
          total: page.total,
          limit: outputOptions.limit,
          cursor: outputOptions.cursor,
          nextCursor: page.nextCursor,
        }, null, 2);
      }
      return `Available connector categories (${page.shown}/${page.total}):\n\n${page.items.map((c) => `- ${c}`).join('\n')}${disclosureHint(outputOptions, page.total, page.shown, 'connectors_registry_list')}`;
    }
    const connectors = await listRegistryConnectors(category || undefined);
    if (connectors.length === 0) return category ? `No connectors in "${category}".` : 'Registry is empty.';
    const page = pageItems(connectors, outputOptions);
    if (outputOptions.json) {
      return JSON.stringify({
        connectors: page.items,
        total: page.total,
        limit: outputOptions.limit,
        cursor: outputOptions.cursor,
        nextCursor: page.nextCursor,
      }, null, 2);
    }
    const grouped = new Map<string, string[]>();
    for (const c of page.items) {
      if (!grouped.has(c.category)) grouped.set(c.category, []);
      grouped.get(c.category)!.push(`  - ${c.name}: ${truncateText(c.description, outputOptions.verbose ? 160 : 80)}`);
    }
    const sections = Array.from(grouped.entries()).map(([cat, items]) => `${cat}:\n${items.join('\n')}`);
    return `${page.shown}/${page.total} connectors available${category ? ` in "${category}"` : ''}:\n\n${sections.join('\n\n')}${disclosureHint(outputOptions, page.total, page.shown, 'connectors_registry_install')}`;
  };
  return { tool, executor };
}

function getOutputOptions(input: Record<string, unknown>, defaultLimit: number) {
  const rawLimit = typeof input.limit === 'number' ? Math.trunc(input.limit) : defaultLimit;
  const rawCursor = typeof input.cursor === 'number' ? Math.trunc(input.cursor) : 0;
  return {
    limit: Math.max(1, Math.min(rawLimit, 100)),
    cursor: Math.max(0, rawCursor),
    verbose: input.verbose === true,
    json: input.json === true,
  };
}

export function createConnectorsRegistryInstallTool(cwd: string): { tool: Tool; executor: ToolExecutor } {
  const tool: Tool = {
    name: 'connectors_registry_install',
    description: `Install a connector from the @hasna/connectors registry.`,
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Connector name (e.g. "stripe", "figma", "gmail")' },
        scope: { type: 'string', enum: ['global', 'project'], description: 'Install scope. Default: global.' },
      },
      required: ['name'],
    },
  };
  const executor: ToolExecutor = async (input) => {
    const name = String(input.name || '').trim();
    if (!name) throw new ConnectorError('Connector name is required.', { code: ErrorCodes.TOOL_EXECUTION_FAILED, recoverable: true, connectorName: name });
    const scope = (String(input.scope || 'global').trim() as 'global' | 'project');
    const result = await installConnectorFromRegistry(name, scope, cwd);
    if (!result.success) return `Failed to install "${name}": ${result.error}`;
    return `Installed connector "${name}" to ${scope} scope.`;
  };
  return { tool, executor };
}

export function registerConnectorsRegistryTools(registry: ToolRegistry, cwd: string): void {
  const search = createConnectorsRegistrySearchTool();
  registry.register(search.tool, search.executor);
  const list = createConnectorsRegistryListTool();
  registry.register(list.tool, list.executor);
  const install = createConnectorsRegistryInstallTool(cwd);
  registry.register(install.tool, install.executor);
}
