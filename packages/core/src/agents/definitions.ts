/**
 * Agent Definitions
 *
 * Named subagent specializations loaded from JSON files on disk.
 * Definitions live in:
 *   - ~/.assistants/agents/   (global, user-wide)
 *   - .assistants/agents/     (project-local)
 *
 * Each file is a JSON file: e.g. driveorganizer.json, emailprocessor.json
 */

import { join } from 'path';
import { homedir } from 'os';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { getConfigDir, getProjectConfigDir } from '../config';

// ============================================
// Types
// ============================================

export interface AgentDefinition {
  /** Unique name (derived from filename, e.g. "driveorganizer") */
  name: string;
  /** Human-readable description of what this agent does */
  description: string;
  /** Tool names this agent is allowed to use */
  tools?: string[];
  /** System prompt / instructions for the agent */
  systemPrompt?: string;
  /**
   * LLM provider for this assistant (e.g. "anthropic", "openai", "google").
   * Falls back to the global/default provider if unset.
   */
  provider?: string;
  /**
   * Model ID override (e.g. "claude-opus-4-6", "gpt-5.2", "gemini-2.5-flash").
   * Falls back to the global/default model if unset.
   */
  model?: string;
  /**
   * Reasoning level for models that support extended thinking.
   * Claude Code: "max" | "high" | "medium"
   * OpenAI Codex: "high" | "medium" | "low"
   * Falls back to global reasoning setting if unset.
   */
  reasoningLevel?: 'max' | 'high' | 'medium' | 'low';
  /**
   * Global role definition — applies everywhere.
   * Prepended to systemPrompt as identity context.
   * Example: "You are a senior TypeScript developer focused on testing."
   */
  globalRole?: string;
  /**
   * Per-project role overrides — keyed by project ID or name.
   * Appended to globalRole (never replaces it).
   * Example: { "platform-alumia": "In this project, focus on the web API routes." }
   */
  projectRoles?: Record<string, string>;
  /** Maximum turns the agent can take (default: 25) */
  maxTurns?: number;
  /** Minimum turns before the agent can return (default: 3) */
  minTurns?: number;
  /** If true, agent keeps going until it explicitly signals completion */
  workUntilDone?: boolean;
  /** Source scope: "global" or "project" (set at load time) */
  scope?: 'global' | 'project';
  /** Absolute path to the definition file (set at load time) */
  filePath?: string;
}

// ============================================
// Directory helpers
// ============================================

function getGlobalAgentsDir(): string {
  return join(getConfigDir(), 'agents');
}

function getProjectAgentsDir(cwd: string): string {
  return join(getProjectConfigDir(cwd), 'agents');
}

// ============================================
// Loading
// ============================================

function loadFromDir(dir: string, scope: 'global' | 'project'): AgentDefinition[] {
  if (!existsSync(dir)) return [];

  const definitions: AgentDefinition[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;

    const filePath = join(dir, entry);
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      const name = (parsed.name as string) || entry.replace(/\.json$/, '');
      const description = (parsed.description as string) || '';

      const def: AgentDefinition = {
        name,
        description,
        scope,
        filePath,
      };

      if (Array.isArray(parsed.tools)) {
        def.tools = parsed.tools.filter((t): t is string => typeof t === 'string');
      }
      if (typeof parsed.systemPrompt === 'string') {
        def.systemPrompt = parsed.systemPrompt;
      }
      if (typeof parsed.maxTurns === 'number') {
        def.maxTurns = parsed.maxTurns;
      }
      if (typeof parsed.minTurns === 'number') {
        def.minTurns = parsed.minTurns;
      }
      if (typeof parsed.workUntilDone === 'boolean') {
        def.workUntilDone = parsed.workUntilDone;
      }

      definitions.push(def);
    } catch {
      // Skip malformed files
    }
  }

  return definitions;
}

/**
 * Load all agent definitions from global and project directories.
 * Project definitions take precedence over global ones with the same name.
 */
export function loadAgentDefinitions(cwd: string): AgentDefinition[] {
  const globalDefs = loadFromDir(getGlobalAgentsDir(), 'global');
  const projectDefs = loadFromDir(getProjectAgentsDir(cwd), 'project');

  // Merge: project overrides global for same name
  const byName = new Map<string, AgentDefinition>();
  for (const def of globalDefs) {
    byName.set(def.name.toLowerCase(), def);
  }
  for (const def of projectDefs) {
    byName.set(def.name.toLowerCase(), def);
  }

  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Find an agent definition by name (case-insensitive).
 */
export function getAgentDefinition(name: string, cwd: string): AgentDefinition | null {
  const all = loadAgentDefinitions(cwd);
  const lower = name.toLowerCase();
  return all.find((d) => d.name.toLowerCase() === lower) ?? null;
}

/**
 * Save an agent definition to disk as a JSON file.
 */
export function saveAgentDefinition(
  def: AgentDefinition,
  scope: 'global' | 'project',
  cwd: string,
): string {
  const dir = scope === 'global' ? getGlobalAgentsDir() : getProjectAgentsDir(cwd);
  mkdirSync(dir, { recursive: true });

  const filePath = join(dir, `${def.name}.json`);
  const payload: Record<string, unknown> = {
    name: def.name,
    description: def.description,
  };
  if (def.tools && def.tools.length > 0) payload.tools = def.tools;
  if (def.systemPrompt) payload.systemPrompt = def.systemPrompt;
  if (def.maxTurns !== undefined) payload.maxTurns = def.maxTurns;
  if (def.minTurns !== undefined) payload.minTurns = def.minTurns;
  if (def.workUntilDone !== undefined) payload.workUntilDone = def.workUntilDone;

  writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
  return filePath;
}

/**
 * Delete an agent definition by name.
 * Returns the path of the deleted file, or null if not found.
 */
export function deleteAgentDefinition(
  name: string,
  cwd: string,
): string | null {
  // Check project first, then global
  const projectDir = getProjectAgentsDir(cwd);
  const globalDir = getGlobalAgentsDir();

  for (const dir of [projectDir, globalDir]) {
    const filePath = join(dir, `${name}.json`);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      return filePath;
    }
  }

  return null;
}

/**
 * Get the effective system prompt for an agent in a given project context.
 *
 * Composition order:
 *   1. globalRole (if set) — identity/base role
 *   2. projectRoles[projectId] (if set) — project-specific addendum
 *   3. systemPrompt (if set) — task-specific instructions
 *
 * This lets you separate stable identity (globalRole) from per-project focus
 * (projectRoles) from task instructions (systemPrompt).
 */
export function getEffectiveSystemPrompt(
  def: AgentDefinition,
  projectId?: string,
): string {
  const parts: string[] = [];

  if (def.globalRole) parts.push(def.globalRole);

  if (projectId && def.projectRoles) {
    const projectRole = def.projectRoles[projectId];
    if (projectRole) parts.push(projectRole);
  }

  if (def.systemPrompt) parts.push(def.systemPrompt);

  return parts.join('\n\n');
}

/**
 * Set a per-project role on an agent definition file.
 * Updates the JSON on disk.
 */
export function setProjectRole(
  name: string,
  projectId: string,
  role: string,
  cwd: string,
): string {
  const def = loadAgentDefinitions(cwd).find(d => d.name === name);
  if (!def || !def.filePath) throw new Error(`Agent definition not found: ${name}`);

  const raw = JSON.parse(readFileSync(def.filePath, 'utf-8'));
  if (!raw.projectRoles) raw.projectRoles = {};
  raw.projectRoles[projectId] = role;
  writeFileSync(def.filePath, JSON.stringify(raw, null, 2) + '\n', 'utf-8');
  return def.filePath;
}

/**
 * Sync agent definitions to `.claude/agents/` as Claude Code markdown files.
 * Format: YAML frontmatter (name, model, provider, etc.) + markdown body (system prompt).
 *
 * @param agents - Agent definitions to sync (defaults to all loaded agents)
 * @param targetDir - Target directory (default: `.claude/agents` in cwd)
 * @param cwd - Working directory for loading agents
 */
export function syncToClaudeAgents(
  cwd: string,
  targetDir?: string,
): { synced: string[]; errors: string[] } {
  const agents = loadAgentDefinitions(cwd);
  const agentsDir = targetDir ?? join(cwd, '.claude', 'agents');

  mkdirSync(agentsDir, { recursive: true });

  const synced: string[] = [];
  const errors: string[] = [];

  for (const agent of agents) {
    try {
      const frontmatter: Record<string, string | number | boolean | undefined> = {
        name: agent.name,
        description: agent.description,
      };
      if (agent.model) frontmatter.model = agent.model;
      if (agent.provider) frontmatter.provider = agent.provider;
      if (agent.reasoningLevel) frontmatter.reasoning_level = agent.reasoningLevel;
      if (agent.maxTurns !== undefined) frontmatter.max_turns = agent.maxTurns;
      if (agent.tools?.length) frontmatter.tools = agent.tools.join(', ');

      // Build the effective system prompt as the markdown body
      const body = getEffectiveSystemPrompt(agent);

      const yamlLines = Object.entries(frontmatter)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}: ${v}`);

      const content = ['---', ...yamlLines, '---', '', body || ''].join('\n');

      const outPath = join(agentsDir, `${agent.name}.md`);
      writeFileSync(outPath, content, 'utf-8');
      synced.push(outPath);
    } catch (e) {
      errors.push(`${agent.name}: ${String(e)}`);
    }
  }

  return { synced, errors };
}

/**
 * Set provider/model/reasoningLevel on an agent definition file.
 */
export function setAgentModelConfig(
  name: string,
  config: { provider?: string; model?: string; reasoningLevel?: AgentDefinition['reasoningLevel'] },
  cwd: string,
): string {
  const def = loadAgentDefinitions(cwd).find(d => d.name === name);
  if (!def || !def.filePath) throw new Error(`Agent definition not found: ${name}`);

  const raw = JSON.parse(readFileSync(def.filePath, 'utf-8'));
  if (config.provider !== undefined) raw.provider = config.provider;
  if (config.model !== undefined) raw.model = config.model;
  if (config.reasoningLevel !== undefined) raw.reasoningLevel = config.reasoningLevel;
  writeFileSync(def.filePath, JSON.stringify(raw, null, 2) + '\n', 'utf-8');
  return def.filePath;
}

/**
 * Remove a per-project role from an agent definition file.
 */
export function removeProjectRole(
  name: string,
  projectId: string,
  cwd: string,
): string {
  const def = loadAgentDefinitions(cwd).find(d => d.name === name);
  if (!def || !def.filePath) throw new Error(`Agent definition not found: ${name}`);

  const raw = JSON.parse(readFileSync(def.filePath, 'utf-8'));
  if (raw.projectRoles) delete raw.projectRoles[projectId];
  writeFileSync(def.filePath, JSON.stringify(raw, null, 2) + '\n', 'utf-8');
  return def.filePath;
}
