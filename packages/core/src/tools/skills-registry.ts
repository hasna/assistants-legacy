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
} from '../skills/registry-adapter';
import { DEFAULT_COMPACT_LIMIT, MAX_COMPACT_LIMIT, pageItems, truncateText } from '../commands/helpers';

function getOptions(input: Record<string, unknown>, total: number): {
  verbose: boolean;
  full: boolean;
  limit: number;
  cursor: number;
} {
  const full = input.full === true;
  const verbose = full || input.verbose === true;
  const limitInput = typeof input.limit === 'number' ? input.limit : DEFAULT_COMPACT_LIMIT;
  const cursorInput = typeof input.cursor === 'number' ? input.cursor : 0;
  return {
    verbose,
    full,
    limit: full ? Math.max(total, 1) : Math.min(Math.max(Math.floor(limitInput), 1), MAX_COMPACT_LIMIT),
    cursor: Math.max(Math.floor(cursorInput), 0),
  };
}

function hint(shown: number, total: number, nextCursor: number | null, detail: string): string {
  if (nextCursor !== null) {
    return `\nShowing ${shown} of ${total}. Pass cursor=${nextCursor} for more, or full=true for all ${detail}.`;
  }
  return `\nPass verbose=true for longer descriptions, or full=true for all ${detail}.`;
}

export function createSkillsRegistrySearchTool(): { tool: Tool; executor: ToolExecutor } {
  const tool: Tool = {
    name: 'skills_registry_search',
    description: `Search the @hasna/skills registry of pre-built skills.`,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Maximum results to return (default 20, max 100)' },
        cursor: { type: 'number', description: 'Zero-based offset for pagination' },
        verbose: { type: 'boolean', description: 'Include longer descriptions' },
        full: { type: 'boolean', description: 'Return all results without compact truncation' },
      },
      required: ['query'],
    },
  };
  const executor: ToolExecutor = async (input) => {
    const query = String(input.query || '').trim();
    if (!query) return 'Provide a search query to find skills.';
    const results = await searchSkillRegistry(query);
    if (results.length === 0) return `No skills found matching "${query}".`;
    const options = getOptions(input, results.length);
    const page = pageItems(results, options);
    const lines = page.items.map((s) => `• ${s.name} (${s.category}): ${truncateText(s.description, options.verbose ? 180 : 80)}`);
    return `Found ${page.shown}/${results.length} skill(s) matching "${query}":\n\n${lines.join('\n')}${!options.full ? hint(page.shown, page.total, page.nextCursor, 'matches') : ''}`;
  };
  return { tool, executor };
}

export function createSkillsRegistryListTool(): { tool: Tool; executor: ToolExecutor } {
  const tool: Tool = {
    name: 'skills_registry_list',
    description: `List available skills from the @hasna/skills registry. Can filter by category.`,
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Category filter or "categories" to list all.' },
        limit: { type: 'number', description: 'Maximum skills/categories to return (default 20, max 100)' },
        cursor: { type: 'number', description: 'Zero-based offset for pagination' },
        verbose: { type: 'boolean', description: 'Include longer descriptions' },
        full: { type: 'boolean', description: 'Return all rows without compact truncation' },
      },
    },
  };
  const executor: ToolExecutor = async (input) => {
    const category = String(input.category || '').trim();
    if (category === 'categories' || category === 'list') {
      const cats = await listSkillCategories();
      const options = getOptions(input, cats.length);
      const page = pageItems(cats, options);
      return `Available skill categories (${page.shown}/${page.total}):\n\n${page.items.map((c) => `• ${c}`).join('\n')}${!options.full ? hint(page.shown, page.total, page.nextCursor, 'categories') : ''}`;
    }
    const skills = await listRegistrySkills(category || undefined);
    if (skills.length === 0) return category ? `No skills in "${category}".` : 'Registry is empty.';
    const options = getOptions(input, skills.length);
    const page = pageItems(skills, options);
    const grouped = new Map<string, string[]>();
    for (const s of page.items) {
      if (!grouped.has(s.category)) grouped.set(s.category, []);
      grouped.get(s.category)!.push(`  - ${s.name}: ${truncateText(s.description, options.verbose ? 180 : 80)}`);
    }
    const sections = Array.from(grouped.entries()).map(([cat, items]) => `${cat}:\n${items.join('\n')}`);
    return `${page.shown}/${skills.length} skills available${category ? ` in "${category}"` : ''}:\n\n${sections.join('\n\n')}${!options.full ? hint(page.shown, page.total, page.nextCursor, 'skills') : ''}`;
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
