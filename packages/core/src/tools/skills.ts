import type { Tool } from '@hasna/assistants-shared';
import type { ToolExecutor } from './registry';
import { ToolExecutionError, ErrorCodes } from '../errors';
import { createSkill, type SkillScope } from '../skills/create';
import type { SkillLoader } from '../skills/loader';
import { SkillExecutor } from '../skills/executor';
// Registry functions moved to tools/skills-registry.ts (loaded dynamically to avoid side effects)
// Install/uninstall now use the @hasna/skills SDK via registry-adapter (installSkillFromRegistry, removeAgentInstalledSkill)
// Skill listing augments SkillLoader results with SDK-installed skills from ~/.claude/skills/

function normalizeScope(input: unknown): SkillScope | null {
  if (!input) return null;
  const value = String(input).trim().toLowerCase();
  if (value === 'project' || value === 'global') return value;
  return null;
}

function normalizeAllowedTools(input: unknown): string[] | undefined {
  if (!input) return undefined;
  if (Array.isArray(input)) {
    const tools = input.map((tool) => String(tool).trim()).filter(Boolean);
    return tools.length > 0 ? tools : undefined;
  }
  if (typeof input === 'string') {
    const tools = input.split(',').map((tool) => tool.trim()).filter(Boolean);
    return tools.length > 0 ? tools : undefined;
  }
  return undefined;
}

export class SkillTool {
  static readonly tool: Tool = {
    name: 'skill_create',
    description: 'Create a skill (SKILL.md). Requires explicit scope (project or global).',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Skill name without the "skill-" prefix.',
        },
        scope: {
          type: 'string',
          description: 'Where to create the skill.',
          enum: ['project', 'global'],
        },
        description: {
          type: 'string',
          description: 'Short description for the skill.',
        },
        content: {
          type: 'string',
          description: 'Skill body content (markdown).',
        },
        allowed_tools: {
          type: ['array', 'string'],
          description: 'Allowed tools for the skill (array or comma-separated string).',
          items: { type: 'string', description: 'Tool name' },
        },
        argument_hint: {
          type: 'string',
          description: 'Argument hint for invocation.',
        },
        overwrite: {
          type: 'boolean',
          description: 'Overwrite if skill already exists.',
          default: false,
        },
        cwd: {
          type: 'string',
          description: 'Working directory for project scope (autofilled).',
        },
      },
      required: ['name'],
    },
  };

  static readonly executor: ToolExecutor = async (input) => {
    const rawName = String(input.name || '').trim();
    if (!rawName) {
      throw new ToolExecutionError('Skill name is required.', {
        toolName: 'skill_create',
        toolInput: input,
        code: ErrorCodes.TOOL_EXECUTION_FAILED,
        recoverable: true,
        retryable: false,
        suggestion: 'Provide a skill name without the "skill-" prefix.',
      });
    }

    const scope = normalizeScope(input.scope);
    if (!scope) {
      throw new ToolExecutionError('Scope is required (project or global).', {
        toolName: 'skill_create',
        toolInput: input,
        code: ErrorCodes.TOOL_EXECUTION_FAILED,
        recoverable: true,
        retryable: false,
        suggestion: 'Ask the user: project (default) or global?',
      });
    }

    const cwd = String(input.cwd || process.cwd());
    const allowedTools = normalizeAllowedTools(input.allowed_tools ?? input.allowedTools);

    const result = await createSkill({
      name: rawName,
      scope,
      description: input.description ? String(input.description) : undefined,
      content: input.content ? String(input.content) : undefined,
      allowedTools,
      argumentHint: input.argument_hint ? String(input.argument_hint) : undefined,
      overwrite: Boolean(input.overwrite),
      cwd,
    });

    return [
      `Created skill "${result.name}" (${result.scope}).`,
      `Location: ${result.filePath}`,
      `Invoke with: $${result.name} [args] or /${result.name} [args]`,
    ].join('\n');
  };
}

export function createSkillListTool(getLoader: () => SkillLoader | null) {
  const tool: Tool = {
    name: 'skills_list',
    description: 'List available skills and their descriptions.',
    parameters: {
      type: 'object',
      properties: {
        cwd: {
          type: 'string',
          description: 'Project directory to scan for skills.',
        },
      },
    },
  };

  const executor: ToolExecutor = async (input) => {
    const loader = getLoader();
    if (!loader) {
      throw new ToolExecutionError('Skill loader is not available.', {
        toolName: 'skills_list',
        toolInput: input,
        code: ErrorCodes.TOOL_EXECUTION_FAILED,
        recoverable: true,
        retryable: false,
      });
    }
    const cwd = typeof input.cwd === 'string' && input.cwd.trim().length > 0 ? input.cwd : process.cwd();

    // Load from legacy .skill/ directories
    await loader.loadAll(cwd, { includeContent: false });

    // Also load from SDK-installed skill directories (~/.claude/skills/, .claude/skills/)
    try {
      const { getAgentSkillsDirs } = await import('../skills/registry-adapter');
      const agentDirs = await getAgentSkillsDirs('both', cwd);
      await Promise.all(agentDirs.map(dir => loader.loadFromDirectory(dir, { includeContent: false })));
    } catch {
      // SDK unavailable — continue with legacy results only
    }

    const descriptions = loader.getSkillDescriptions();
    return descriptions || 'No skills loaded.';
  };

  return { tool, executor };
}

export function createSkillReadTool(getLoader: () => SkillLoader | null) {
  const tool: Tool = {
    name: 'skill_read',
    description: 'Load and return the full content of a skill.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Skill name to load.',
        },
      },
      required: ['name'],
    },
  };

  const executor: ToolExecutor = async (input) => {
    const loader = getLoader();
    if (!loader) {
      throw new ToolExecutionError('Skill loader is not available.', {
        toolName: 'skill_read',
        toolInput: input,
        code: ErrorCodes.TOOL_EXECUTION_FAILED,
        recoverable: true,
        retryable: false,
      });
    }
    const name = String(input.name || '').trim();
    if (!name) {
      throw new ToolExecutionError('Skill name is required.', {
        toolName: 'skill_read',
        toolInput: input,
        code: ErrorCodes.TOOL_EXECUTION_FAILED,
        recoverable: false,
        retryable: false,
      });
    }
    // Try SDK-installed paths first, then fall back to SkillLoader
    try {
      const { getAgentSkillsDirs } = await import('../skills/registry-adapter');
      const agentDirs = await getAgentSkillsDirs('both', process.cwd());
      await Promise.all(agentDirs.map(dir => loader.loadFromDirectory(dir, { includeContent: true })));
    } catch {}

    const skill = await loader.ensureSkillContent(name);
    if (!skill) {
      throw new ToolExecutionError(`Skill "${name}" not found.`, {
        toolName: 'skill_read',
        toolInput: input,
        code: ErrorCodes.TOOL_NOT_FOUND,
        recoverable: true,
        retryable: false,
      });
    }
    return skill.content || '(empty skill content)';
  };

  return { tool, executor };
}

export function createSkillExecuteTool(getLoader: () => SkillLoader | null) {
  const skillExecutor = new SkillExecutor();

  const tool: Tool = {
    name: 'skill_execute',
    description: 'Execute a skill by name with optional arguments. Returns the prepared skill content for you to follow.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Skill name to execute (e.g., "commit", "review-pr").',
        },
        arguments: {
          type: 'string',
          description: 'Arguments to pass to the skill (replaces $ARGUMENTS in skill content).',
        },
      },
      required: ['name'],
    },
  };

  const executor: ToolExecutor = async (input) => {
    const loader = getLoader();
    if (!loader) {
      throw new ToolExecutionError('Skill loader is not available.', {
        toolName: 'skill_execute',
        toolInput: input,
        code: ErrorCodes.TOOL_EXECUTION_FAILED,
        recoverable: true,
        retryable: false,
      });
    }

    const name = String(input.name || '').trim();
    if (!name) {
      throw new ToolExecutionError('Skill name is required.', {
        toolName: 'skill_execute',
        toolInput: input,
        code: ErrorCodes.TOOL_EXECUTION_FAILED,
        recoverable: false,
        retryable: false,
        suggestion: 'Use skills_list to see available skills.',
      });
    }

    // Ensure skill content is loaded
    const skill = await loader.ensureSkillContent(name);
    if (!skill) {
      throw new ToolExecutionError(`Skill "${name}" not found.`, {
        toolName: 'skill_execute',
        toolInput: input,
        code: ErrorCodes.TOOL_NOT_FOUND,
        recoverable: true,
        retryable: false,
        suggestion: 'Use skills_list to see available skills.',
      });
    }

    // Parse arguments into array
    const argsString = String(input.arguments || '').trim();
    const args = argsString ? argsString.split(/\s+/) : [];

    // Prepare skill content with argument substitution
    const preparedContent = await skillExecutor.prepare(skill, args);

    // Build response with skill metadata and content
    const lines: string[] = [
      `## Executing Skill: ${skill.name}`,
      '',
    ];

    if (skill.description) {
      lines.push(`**Description:** ${skill.description}`);
      lines.push('');
    }

    if (skill.allowedTools && skill.allowedTools.length > 0) {
      lines.push(`**Allowed Tools:** ${skill.allowedTools.join(', ')}`);
      lines.push('');
    }

    if (args.length > 0) {
      lines.push(`**Arguments:** ${args.join(' ')}`);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
    lines.push('## Skill Instructions');
    lines.push('');
    lines.push(preparedContent);

    return lines.join('\n');
  };

  return { tool, executor };
}

export class SkillInstallTool {
  static readonly tool: Tool = {
    name: 'skill_install',
    description: 'Install a skill from the @hasna/skills registry into the claude skills directory (~/.claude/skills/ or .claude/skills/).',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Skill name from the registry (e.g. "deepresearch", "commit", "review-pr").',
        },
        scope: {
          type: 'string',
          description: 'Where to install: global (~/.claude/skills/) or project (.claude/skills/). Defaults to global.',
          enum: ['project', 'global'],
        },
        cwd: {
          type: 'string',
          description: 'Working directory for project scope (autofilled).',
        },
      },
      required: ['name'],
    },
  };

  static readonly executor: ToolExecutor = async (input) => {
    const rawName = String(input.name || '').trim();
    if (!rawName) {
      throw new ToolExecutionError('Skill name is required.', {
        toolName: 'skill_install',
        toolInput: input,
        code: ErrorCodes.TOOL_EXECUTION_FAILED,
        recoverable: true,
        retryable: false,
        suggestion: 'Provide a skill name from the registry, e.g. "deepresearch".',
      });
    }

    const rawScope = String(input.scope || '').trim().toLowerCase();
    const scope: 'project' | 'global' = rawScope === 'project' ? 'project' : 'global';
    const cwd = String(input.cwd || process.cwd());

    // Use @hasna/skills SDK to install into ~/.claude/skills/ or .claude/skills/
    const { installSkillFromRegistry } = await import('../skills/registry-adapter');
    const result = await installSkillFromRegistry(rawName, scope, cwd);

    if (!result.success) {
      throw new ToolExecutionError(result.error ?? 'Skill installation failed.', {
        toolName: 'skill_install',
        toolInput: input,
        code: ErrorCodes.TOOL_EXECUTION_FAILED,
        recoverable: true,
        retryable: true,
        suggestion: `Check that "${rawName}" exists in the registry with skills_registry_search.`,
      });
    }

    const { getAgentSkillsDirs } = await import('../skills/registry-adapter');
    const [installDir] = await getAgentSkillsDirs(scope, cwd);
    return [
      `Installed skill "${rawName}" (${scope} scope).`,
      `Location: ${installDir}/skill-${rawName}/SKILL.md`,
      `Invoke with: /${rawName} [args] or skill_execute name="${rawName}"`,
    ].join('\n');
  };
}

export class SkillUninstallTool {
  static readonly tool: Tool = {
    name: 'skill_uninstall',
    description: 'Uninstall a skill installed via the @hasna/skills SDK from the claude skills directory.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Skill name to uninstall (e.g. "deepresearch").',
        },
        scope: {
          type: 'string',
          description: 'Where to uninstall from: global (~/.claude/skills/) or project (.claude/skills/). Defaults to global.',
          enum: ['project', 'global'],
        },
        cwd: {
          type: 'string',
          description: 'Working directory for project scope (autofilled).',
        },
      },
      required: ['name'],
    },
  };

  static readonly executor: ToolExecutor = async (input) => {
    const rawName = String(input.name || '').trim();
    if (!rawName) {
      throw new ToolExecutionError('Skill name is required.', {
        toolName: 'skill_uninstall',
        toolInput: input,
        code: ErrorCodes.TOOL_EXECUTION_FAILED,
        recoverable: true,
        retryable: false,
      });
    }

    const rawScope = String(input.scope || '').trim().toLowerCase();
    const scope: 'project' | 'global' = rawScope === 'project' ? 'project' : 'global';
    const cwd = String(input.cwd || process.cwd());

    const { removeAgentInstalledSkill } = await import('../skills/registry-adapter');
    const removed = await removeAgentInstalledSkill(rawName, scope, cwd);

    if (!removed) {
      throw new ToolExecutionError(`Skill "${rawName}" not found in ${scope} scope.`, {
        toolName: 'skill_uninstall',
        toolInput: input,
        code: ErrorCodes.TOOL_NOT_FOUND,
        recoverable: true,
        retryable: false,
        suggestion: 'Use skills_list to see installed skills.',
      });
    }

    return `Uninstalled skill "${rawName}" from ${scope} scope (~/.claude/skills/ or .claude/skills/).`;
  };
}

// Registry tools moved to tools/skills-registry.ts (loaded dynamically)
