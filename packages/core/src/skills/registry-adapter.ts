/**
 * Registry adapter for @hasna/skills
 * Uses lazy imports to avoid module-level side effects in bundled context.
 */

// Type-only import (erased at runtime, no side effects)
import type { SkillMeta, AgentTarget } from '@hasna/skills';

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
  const skills = category ? lib.getSkillsByCategory(category) : lib.SKILLS;
  return skills.map((m) => ({
    name: m.name, displayName: m.displayName,
    description: m.description, category: m.category, tags: m.tags,
  }));
}

export function getSkillRegistryCount(): number {
  // Return cached count if available, otherwise 202 (known count)
  return _skillsLib ? _skillsLib.SKILLS.length : 202;
}

export async function installSkillFromRegistry(
  name: string,
  scope: 'project' | 'global' = 'project',
  cwd?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const lib = await getSkillsLib();
    const agent: AgentTarget = 'assistants';
    const result = await lib.installSkillForAgent(name, agent, {
      scope: scope === 'global' ? 'global' : 'local',
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
    return lib.getInstalledSkills('assistants', {
      scope: scope === 'global' ? 'global' : 'local',
      projectDir: scope === 'project' ? cwd : undefined,
    });
  } catch { return []; }
}

export function getSkillRegistryTags(): string[] {
  return _skillsLib ? _skillsLib.getAllTags() : [];
}
