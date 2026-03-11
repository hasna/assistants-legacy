/**
 * Skills registry tools — separate file with lazy SDK imports.
 * Imported dynamically at runtime to avoid bundling side effects.
 */
import type { Tool } from '@hasna/assistants-shared';
import type { ToolExecutor } from './registry';
import { ToolExecutionError, ErrorCodes } from '../errors';
import {
  searchSkillRegistry,
  listRegistrySkills,
  listSkillCategories,
  installSkillFromRegistry,
  getSkillRegistryCount,
} from '../skills/registry-adapter';

export function createSkillsRegistrySearchTool(): { tool: Tool; executor: ToolExecutor } {
  const tool: Tool = {
    name: 'skills_registry_search',
    description: `Search the @hasna/skills registry of ${getSkillRegistryCount()} pre-built skills.`,
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Search query' } },
      required: ['query'],
    },
  };
  const executor: ToolExecutor = async (input) => {
    const query = String(input.query || '').trim();
    if (!query) return 'Provide a search query to find skills.';
    const results = await searchSkillRegistry(query);
    if (results.length === 0) return `No skills found matching "${query}".`;
    const lines = results.slice(0, 15).map((s) => `• ${s.name} (${s.category}): ${s.description}`);
    return `Found ${results.length} skill(s) matching "${query}":\n\n${lines.join('\n')}`;
  };
  return { tool, executor };
}

export function createSkillsRegistryListTool(): { tool: Tool; executor: ToolExecutor } {
  const tool: Tool = {
    name: 'skills_registry_list',
    description: `List available skills from the @hasna/skills registry. Can filter by category.`,
    parameters: {
      type: 'object',
      properties: { category: { type: 'string', description: 'Category filter or "categories" to list all.' } },
    },
  };
  const executor: ToolExecutor = async (input) => {
    const category = String(input.category || '').trim();
    if (category === 'categories' || category === 'list') {
      const cats = await listSkillCategories();
      return `Available skill categories:\n\n${cats.map((c) => `• ${c}`).join('\n')}`;
    }
    const skills = await listRegistrySkills(category || undefined);
    if (skills.length === 0) return category ? `No skills in "${category}".` : 'Registry is empty.';
    const grouped = new Map<string, string[]>();
    for (const s of skills) {
      if (!grouped.has(s.category)) grouped.set(s.category, []);
      grouped.get(s.category)!.push(`  - ${s.name}: ${s.description}`);
    }
    const sections = Array.from(grouped.entries()).map(([cat, items]) => `${cat}:\n${items.join('\n')}`);
    return `${skills.length} skills available${category ? ` in "${category}"` : ''}:\n\n${sections.join('\n\n')}`;
  };
  return { tool, executor };
}

export function createSkillsRegistryInstallTool(cwd: string): { tool: Tool; executor: ToolExecutor } {
  const tool: Tool = {
    name: 'skills_registry_install',
    description: `Install a skill from the @hasna/skills registry.`,
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill name (e.g. "image", "deep-research")' },
        scope: { type: 'string', enum: ['project', 'global'], description: 'Install scope. Default: project.' },
      },
      required: ['name'],
    },
  };
  const executor: ToolExecutor = async (input) => {
    const name = String(input.name || '').trim();
    if (!name) throw new ToolExecutionError('Skill name is required.', { toolName: 'skills_registry_install', toolInput: input, code: ErrorCodes.TOOL_EXECUTION_FAILED, recoverable: true, retryable: false });
    const scope = (String(input.scope || 'project').trim() as 'project' | 'global');
    const result = await installSkillFromRegistry(name, scope, cwd);
    if (!result.success) return `Failed to install "${name}": ${result.error}`;
    return `Installed skill "${name}" to ${scope} scope.`;
  };
  return { tool, executor };
}
