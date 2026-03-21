/**
 * Registry adapter for @hasna/skills
 * Uses lazy imports to avoid module-level side effects in bundled context.
 */

// Type-only import (erased at runtime, no side effects)
import type { SkillMeta, AgentTarget, Category } from '@hasna/skills';

// Lazy loader — called only when registry functions are actually used
let _skillsLib: typeof import('@hasna/skills') | null = null;
async function getSkillsLib(): Promise<typeof import('@hasna/skills')> {
  if (!_skillsLib) {
    _skillsLib = await import('@hasna/skills');
  }
  return _skillsLib;
}

export interface RegistrySkillInfo {
  name: string;
  displayName: string;
  description: string;
  category: string;
  tags: string[];
}

export async function searchSkillRegistry(query: string): Promise<RegistrySkillInfo[]> {
  const lib = await getSkillsLib();
  return lib.searchSkills(query).map((m) => ({
    name: m.name, displayName: m.displayName,
    description: m.description, category: m.category, tags: m.tags,
  }));
}

export async function listSkillCategories(): Promise<string[]> {
  const lib = await getSkillsLib();
  return [...lib.CATEGORIES];
}

export async function listRegistrySkills(category?: string): Promise<RegistrySkillInfo[]> {
  const lib = await getSkillsLib();
  const skills = category ? lib.getSkillsByCategory(category as Category) : lib.SKILLS;
  return skills.map((m) => ({
    name: m.name, displayName: m.displayName,
    description: m.description, category: m.category, tags: m.tags,
  }));
}

export function getSkillRegistryCount(): number {
  return _skillsLib ? _skillsLib.SKILLS.length : 0;
}

export async function installSkillFromRegistry(
  name: string,
  scope: 'project' | 'global' = 'project',
  cwd?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const lib = await getSkillsLib();
    const agent: AgentTarget = 'claude';
    const result = await lib.installSkillForAgent(name, {
      agent,
      scope,
      projectDir: scope === 'project' ? cwd : undefined,
    });
    if (!result.success) return { success: false, error: result.error ?? 'Installation failed' };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getInstalledRegistrySkills(scope: 'project' | 'global' = 'project', cwd?: string): Promise<string[]> {
  try {
    const lib = await getSkillsLib();
    const targetDir = lib.getAgentSkillsDir('claude', scope, scope === 'project' ? cwd : undefined);
    return lib.getInstalledSkills(targetDir);
  } catch { return []; }
}

export function getSkillRegistryTags(): string[] {
  return _skillsLib ? _skillsLib.getAllTags() : [];
}

/**
 * Returns the file-system directories where @hasna/skills SDK installs
 * skills for the claude agent (global: ~/.claude/skills, project: .claude/skills).
 */
export async function getAgentSkillsDirs(
  scope: 'global' | 'project' | 'both' = 'both',
  cwd?: string,
): Promise<string[]> {
  const lib = await getSkillsLib();
  const dirs: string[] = [];
  if (scope === 'global' || scope === 'both') {
    dirs.push(lib.getAgentSkillsDir('claude', 'global'));
  }
  if (scope === 'project' || scope === 'both') {
    dirs.push(lib.getAgentSkillsDir('claude', 'project', cwd ?? process.cwd()));
  }
  return dirs;
}

/**
 * Remove a skill that was installed via installSkillForAgent.
 */
export async function removeAgentInstalledSkill(
  name: string,
  scope: 'project' | 'global' = 'global',
  cwd?: string,
): Promise<boolean> {
  const lib = await getSkillsLib();
  return lib.removeSkillForAgent(name, {
    agent: 'claude',
    scope,
    projectDir: scope === 'project' ? cwd : undefined,
  });
}
