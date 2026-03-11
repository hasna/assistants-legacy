/**
 * Registry adapter for @hasna/skills
 * Provides access to the 202-skill registry for discovery and installation.
 * The native SkillLoader still handles runtime loading — this adapter adds
 * the ability to browse and install from the curated registry.
 */

import {
  SKILLS,
  CATEGORIES,
  getSkill as getRegistrySkill,
  getSkillsByCategory,
  searchSkills as searchRegistrySkills,
  getAllTags,
  installSkillForAgent,
  getInstalledSkills,
  removeSkillForAgent,
  type SkillMeta,
  type AgentTarget,
} from '@hasna/skills';

export interface RegistrySkillInfo {
  name: string;
  displayName: string;
  description: string;
  category: string;
  tags: string[];
  installed?: boolean;
}

/**
 * Search the @hasna/skills registry for available skills.
 * Returns matching skills with metadata.
 */
export function searchSkillRegistry(query: string): RegistrySkillInfo[] {
  const results = searchRegistrySkills(query);
  return results.map(metaToInfo);
}

/**
 * List all available skill categories from the registry.
 */
export function listSkillCategories(): string[] {
  return [...CATEGORIES];
}

/**
 * List all skills in the registry, optionally filtered by category.
 */
export function listRegistrySkills(category?: string): RegistrySkillInfo[] {
  if (category) {
    return getSkillsByCategory(category).map(metaToInfo);
  }
  return SKILLS.map(metaToInfo);
}

/**
 * Get details for a specific skill from the registry.
 */
export function getSkillFromRegistry(name: string): RegistrySkillInfo | null {
  const skill = getRegistrySkill(name);
  if (!skill) return null;
  return metaToInfo(skill);
}

/**
 * Install a skill from the registry into the given scope.
 * @param name - Skill name (e.g. 'image', 'deep-research')
 * @param scope - 'project' (cwd/.skill/) or 'global' (~/.skill/)
 * @param cwd - Working directory for project scope
 */
export async function installSkillFromRegistry(
  name: string,
  scope: 'project' | 'global' = 'project',
  cwd?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const agent: AgentTarget = 'assistants';
    const result = await installSkillForAgent(name, agent, {
      scope: scope === 'global' ? 'global' : 'local',
      projectDir: scope === 'project' ? cwd : undefined,
    });
    if (!result.success) {
      return { success: false, error: result.error ?? 'Installation failed' };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Get all installed skills from the registry for an agent.
 * @param scope - 'project' or 'global'
 * @param cwd - Working directory for project scope
 */
export function getInstalledRegistrySkills(
  scope: 'project' | 'global' = 'project',
  cwd?: string,
): string[] {
  try {
    return getInstalledSkills('assistants', {
      scope: scope === 'global' ? 'global' : 'local',
      projectDir: scope === 'project' ? cwd : undefined,
    });
  } catch {
    return [];
  }
}

/**
 * Remove a skill installed from the registry.
 */
export async function removeInstalledSkill(
  name: string,
  scope: 'project' | 'global' = 'project',
  cwd?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await removeSkillForAgent(name, 'assistants', {
      scope: scope === 'global' ? 'global' : 'local',
      projectDir: scope === 'project' ? cwd : undefined,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Get all tags used in the registry.
 */
export function getSkillRegistryTags(): string[] {
  return getAllTags();
}

/**
 * Get total count of skills in registry.
 */
export function getSkillRegistryCount(): number {
  return SKILLS.length;
}

function metaToInfo(meta: SkillMeta): RegistrySkillInfo {
  return {
    name: meta.name,
    displayName: meta.displayName,
    description: meta.description,
    category: meta.category,
    tags: meta.tags,
  };
}
