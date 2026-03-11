/**
 * Connectors registry tools — separate file with lazy SDK imports.
 */
import type { Tool } from '@hasna/assistants-shared';
import type { ToolExecutor, ToolRegistry } from './registry';
import { ConnectorError, ErrorCodes } from '../errors';
import {
  searchConnectorRegistry,
  listRegistryConnectors,
  listConnectorCategories,
  installConnectorFromRegistry,
  getConnectorRegistryCount,
} from '../connectors/registry-adapter';

export function createConnectorsRegistrySearchTool(): { tool: Tool; executor: ToolExecutor } {
  const tool: Tool = {
    name: 'connectors_registry_search',
    description: `Search the @hasna/connectors registry of ${getConnectorRegistryCount()} pre-built API connectors.`,
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Search query (e.g. "stripe", "gmail")' } },
      required: ['query'],
    },
  };
  const executor: ToolExecutor = async (input) => {
    const query = String(input.query || '').trim();
    if (!query) return 'Provide a search query to find connectors.';
    const results = await searchConnectorRegistry(query);
    if (results.length === 0) return `No connectors found matching "${query}".`;
    const lines = results.slice(0, 15).map((c) => `• ${c.name} (${c.category}): ${c.description}`);
    return `Found ${results.length} connector(s) matching "${query}":\n\n${lines.join('\n')}`;
  };
  return { tool, executor };
}

export function createConnectorsRegistryListTool(): { tool: Tool; executor: ToolExecutor } {
  const tool: Tool = {
    name: 'connectors_registry_list',
    description: `List available connectors from the @hasna/connectors registry.`,
    parameters: {
      type: 'object',
      properties: { category: { type: 'string', description: 'Category filter or "categories" to list all.' } },
    },
  };
  const executor: ToolExecutor = async (input) => {
    const category = String(input.category || '').trim();
    if (category === 'categories' || category === 'list') {
      const cats = await listConnectorCategories();
      return `Available connector categories:\n\n${cats.map((c) => `• ${c}`).join('\n')}`;
    }
    const connectors = await listRegistryConnectors(category || undefined);
    if (connectors.length === 0) return category ? `No connectors in "${category}".` : 'Registry is empty.';
    const grouped = new Map<string, string[]>();
    for (const c of connectors) {
      if (!grouped.has(c.category)) grouped.set(c.category, []);
      grouped.get(c.category)!.push(`  - ${c.name}: ${c.description}`);
    }
    const sections = Array.from(grouped.entries()).map(([cat, items]) => `${cat}:\n${items.join('\n')}`);
    return `${connectors.length} connectors available${category ? ` in "${category}"` : ''}:\n\n${sections.join('\n\n')}`;
  };
  return { tool, executor };
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
    if (!name) throw new ConnectorError('Connector name is required.', { code: ErrorCodes.TOOL_EXECUTION_FAILED, recoverable: true });
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
