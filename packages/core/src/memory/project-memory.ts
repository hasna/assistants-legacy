/**
 * Project Memory Manager
 *
 * Wraps GlobalMemoryManager with project-scoped convenience methods.
 * Uses existing 'shared' scope with scopeId = 'project:<hash>' for isolation.
 */

import { createHash } from 'crypto';
import type { GlobalMemoryManager } from './global-memory';
import type { Memory, MemoryCategory } from './types';

export class ProjectMemoryManager {
  private memory: GlobalMemoryManager;
  private projectPath: string;
  private scopeId: string;

  private originalScopeId?: string;

  constructor(memory: GlobalMemoryManager, projectPath: string) {
    this.memory = memory;
    this.projectPath = projectPath;
    this.scopeId = `project:${createHash('sha256').update(projectPath).digest('hex').slice(0, 12)}`;
  }

  /**
   * Temporarily set the memory manager's scope to this project's scope for queries
   */
  private withScope<T>(fn: () => T): T {
    this.memory.setScope('shared', this.scopeId);
    try {
      return fn();
    } finally {
      // We don't restore because setScope is cheap and the project memory
      // manager owns the scope while it's in use
    }
  }

  /**
   * Get the scope ID for this project
   */
  getScopeId(): string {
    return this.scopeId;
  }

  /**
   * Remember a fact, preference, or piece of knowledge for this project
   */
  async remember(key: string, value: string, category: MemoryCategory = 'fact', importance: number = 6): Promise<void> {
    await this.memory.set(key, value, {
      scope: 'shared',
      scopeId: this.scopeId,
      category,
      importance,
      source: 'assistant',
      tags: ['project'],
    });
  }

  /**
   * Recall memories relevant to a query within this project
   */
  async recall(query: string): Promise<Memory[]> {
    this.memory.setScope('shared', this.scopeId);
    const result = await this.memory.query({
      scope: 'shared',
      search: query,
      limit: 20,
      orderBy: 'importance',
      orderDir: 'desc',
    });
    return result.memories;
  }

  /**
   * Record a project decision with context
   */
  async recordDecision(decision: string, context?: string): Promise<void> {
    const key = `decision:${Date.now()}`;
    const value = context ? `${decision}\n\nContext: ${context}` : decision;
    await this.memory.set(key, value, {
      scope: 'shared',
      scopeId: this.scopeId,
      category: 'knowledge',
      importance: 7,
      source: 'assistant',
      tags: ['project', 'decision'],
      summary: decision.slice(0, 200),
    });
  }

  /**
   * Get all project memories as a context string for injection
   */
  async getProjectContext(): Promise<string> {
    this.memory.setScope('shared', this.scopeId);
    const result = await this.memory.query({
      scope: 'shared',
      limit: 50,
      orderBy: 'importance',
      orderDir: 'desc',
    });

    if (result.memories.length === 0) return '';

    const lines = result.memories.map(m => {
      const summary = m.summary || (typeof m.value === 'string' ? m.value.slice(0, 150) : JSON.stringify(m.value).slice(0, 150));
      return `- [${m.category}] ${summary}`;
    });

    return `## Project Memory (${this.projectPath})\n\n${lines.join('\n')}`;
  }

  /**
   * List all memories for this project
   */
  async list(category?: MemoryCategory): Promise<Memory[]> {
    this.memory.setScope('shared', this.scopeId);
    const result = await this.memory.query({
      scope: 'shared',
      category,
      limit: 100,
      orderBy: 'importance',
      orderDir: 'desc',
    });
    return result.memories;
  }

  /**
   * Forget a specific project memory
   */
  async forget(key: string): Promise<boolean> {
    return this.memory.deleteByKey(key, 'shared', this.scopeId);
  }
}
