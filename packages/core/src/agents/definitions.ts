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
