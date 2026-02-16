/**
 * Preference Learner
 *
 * Passive observer that auto-detects user preferences from interaction patterns.
 * When a pattern is observed enough times (threshold), it saves it as a memory.
 */

import type { GlobalMemoryManager } from './global-memory';

export interface PreferenceEvent {
  type: 'tool_param' | 'correction' | 'file_type' | 'style';
  key: string;
  value: string;
}

export class PreferenceLearner {
  private patterns: Map<string, { value: string; count: number; lastSeen: number }> = new Map();
  private threshold: number;
  private savedKeys: Set<string> = new Set();

  constructor(threshold: number = 3) {
    this.threshold = threshold;
  }

  /**
   * Observe an event that might indicate a preference
   */
  observe(event: PreferenceEvent): void {
    const patternKey = `${event.type}:${event.key}:${event.value}`;
    const existing = this.patterns.get(patternKey);

    if (existing) {
      existing.count++;
      existing.lastSeen = Date.now();
    } else {
      this.patterns.set(patternKey, {
        value: event.value,
        count: 1,
        lastSeen: Date.now(),
      });
    }
  }

  /**
   * Observe a tool call to detect parameter patterns
   */
  observeToolCall(toolName: string, params: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
        this.observe({
          type: 'tool_param',
          key: `${toolName}.${key}`,
          value: String(value),
        });
      }
    }
  }

  /**
   * Observe a file creation to detect file type preferences
   */
  observeFileCreation(filePath: string): void {
    const ext = filePath.split('.').pop()?.toLowerCase();
    if (ext) {
      this.observe({
        type: 'file_type',
        key: 'preferred_extension',
        value: ext,
      });
    }
  }

  /**
   * Observe a user correction to detect style preferences
   */
  observeCorrection(original: string, corrected: string): void {
    this.observe({
      type: 'correction',
      key: original.slice(0, 50),
      value: corrected.slice(0, 200),
    });
  }

  /**
   * Flush detected preferences to memory storage
   * Returns the number of new preferences saved
   */
  async flush(memory: GlobalMemoryManager): Promise<number> {
    let saved = 0;

    for (const [patternKey, data] of this.patterns) {
      if (data.count >= this.threshold && !this.savedKeys.has(patternKey)) {
        const [type, key] = patternKey.split(':', 2);
        const description = this.describePreference(type, key, data.value);

        if (description) {
          try {
            await memory.set(`pref:${patternKey}`, description, {
              category: 'preference',
              importance: 7,
              scope: 'global',
              source: 'system',
              tags: ['auto-detected', 'preference', type],
              summary: description,
            });
            this.savedKeys.add(patternKey);
            saved++;
          } catch {
            // Skip if save fails
          }
        }
      }
    }

    return saved;
  }

  /**
   * Get current patterns and their counts (for debugging)
   */
  getPatterns(): Array<{ key: string; value: string; count: number }> {
    return Array.from(this.patterns.entries()).map(([key, data]) => ({
      key,
      value: data.value,
      count: data.count,
    }));
  }

  /**
   * Clear all observed patterns
   */
  clear(): void {
    this.patterns.clear();
  }

  private describePreference(type: string, key: string, value: string): string | null {
    switch (type) {
      case 'tool_param':
        return `User tends to use ${key} = ${value}`;
      case 'file_type':
        return `User prefers .${value} files`;
      case 'correction':
        return `User prefers: "${value}" (corrected from similar)`;
      case 'style':
        return `User style preference: ${key} = ${value}`;
      default:
        return null;
    }
  }
}
