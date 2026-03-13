/**
 * Bookmark Tools
 *
 * Tools for saving frequently accessed files, folders, and URLs.
 * Bookmarks are persisted via MemoryStore (key-value storage).
 */

import type { Tool } from '@hasna/assistants-shared';
import type { ToolExecutor, ToolRegistry } from './registry';
import { MemoryStore } from '../memory/mementos-adapter';

// ============================================
// Types
// ============================================

interface Bookmark {
  name: string;
  path?: string;
  url?: string;
  tags: string[];
  createdAt: string;
}

// ============================================
// Constants
// ============================================

const BOOKMARK_KEY_PREFIX = 'bookmark:';
const MAX_NAME_LENGTH = 128;
const MAX_PATH_LENGTH = 1024;
const MAX_URL_LENGTH = 2048;
const MAX_TAG_LENGTH = 50;
const MAX_TAGS = 20;

// ============================================
// Tool Definitions
// ============================================

export const bookmarkSaveTool: Tool = {
  name: 'bookmark_save',
  description:
    'Save a bookmark for a frequently accessed file, folder, or URL. Use this to quickly reference important locations.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Unique name for this bookmark (e.g., "project-config", "api-docs")',
      },
      path: {
        type: 'string',
        description: 'File or directory path to bookmark',
      },
      url: {
        type: 'string',
        description: 'URL to bookmark',
      },
      tags: {
        type: 'array',
        items: { type: 'string', description: 'A tag string' },
        description: 'Optional tags for categorization and filtering',
      },
    },
    required: ['name'],
  },
};

export const bookmarkListTool: Tool = {
  name: 'bookmark_list',
  description:
    'List all saved bookmarks. Optionally filter by tag.',
  parameters: {
    type: 'object',
    properties: {
      tag: {
        type: 'string',
        description: 'Filter bookmarks by this tag',
      },
    },
  },
};

export const bookmarkGetTool: Tool = {
  name: 'bookmark_get',
  description:
    'Get details of a specific bookmark by name.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'The name of the bookmark to retrieve',
      },
    },
    required: ['name'],
  },
};

export const bookmarkDeleteTool: Tool = {
  name: 'bookmark_delete',
  description:
    'Delete a bookmark by name.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'The name of the bookmark to delete',
      },
    },
    required: ['name'],
  },
};

// ============================================
// Tool Array
// ============================================

export const bookmarkTools: Tool[] = [
  bookmarkSaveTool,
  bookmarkListTool,
  bookmarkGetTool,
  bookmarkDeleteTool,
];

// ============================================
// Validation Helpers
// ============================================

function validateRequiredString(value: unknown, fieldName: string, maxLength: number): string {
  if (value === undefined || value === null) {
    throw new Error(`${fieldName} is required`);
  }
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} cannot be empty`);
  }
  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} exceeds maximum length of ${maxLength} characters`);
  }
  return trimmed;
}

function validateOptionalString(value: unknown, fieldName: string, maxLength: number): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} exceeds maximum length of ${maxLength} characters`);
  }
  return trimmed;
}

function validateTags(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error('tags must be an array');
  }
  if (value.length > MAX_TAGS) {
    throw new Error(`tags cannot exceed ${MAX_TAGS} items`);
  }
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed && trimmed.length <= MAX_TAG_LENGTH) {
      result.push(trimmed);
    }
  }
  return result;
}

// ============================================
// Context
// ============================================

export interface BookmarkToolContext {
  getMemoryStore: () => MemoryStore | null;
}

// ============================================
// Tool Executors Factory
// ============================================

export function createBookmarkToolExecutors(
  getMemoryStore: () => MemoryStore | null
): Record<string, ToolExecutor> {
  return {
    bookmark_save: async (input): Promise<string> => {
      const store = getMemoryStore();
      if (!store) {
        return JSON.stringify({ error: 'Bookmark storage not available' });
      }

      try {
        const name = validateRequiredString(input.name, 'name', MAX_NAME_LENGTH);
        const path = validateOptionalString(input.path, 'path', MAX_PATH_LENGTH);
        const url = validateOptionalString(input.url, 'url', MAX_URL_LENGTH);
        const tags = validateTags(input.tags);

        if (!path && !url) {
          throw new Error('At least one of path or url is required');
        }

        const bookmark: Bookmark = {
          name,
          ...(path ? { path } : {}),
          ...(url ? { url } : {}),
          tags,
          createdAt: new Date().toISOString(),
        };

        store.set(`${BOOKMARK_KEY_PREFIX}${name}`, bookmark);

        return JSON.stringify({
          success: true,
          message: `Bookmark saved: ${name}`,
          bookmark,
        });
      } catch (error) {
        return JSON.stringify({
          error: error instanceof Error ? error.message : 'Failed to save bookmark',
        });
      }
    },

    bookmark_list: async (input): Promise<string> => {
      const store = getMemoryStore();
      if (!store) {
        return JSON.stringify({ error: 'Bookmark storage not available' });
      }

      try {
        const tagFilter = validateOptionalString(input.tag, 'tag', MAX_TAG_LENGTH);
        const keys = store.keys(`${BOOKMARK_KEY_PREFIX}*`);

        const bookmarks: Bookmark[] = [];
        for (const key of keys) {
          const bookmark = store.get<Bookmark>(key);
          if (!bookmark) continue;

          if (tagFilter && !bookmark.tags.includes(tagFilter)) {
            continue;
          }

          bookmarks.push(bookmark);
        }

        // Sort by creation date, newest first
        bookmarks.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

        return JSON.stringify({
          count: bookmarks.length,
          bookmarks,
        });
      } catch (error) {
        return JSON.stringify({
          error: error instanceof Error ? error.message : 'Failed to list bookmarks',
        });
      }
    },

    bookmark_get: async (input): Promise<string> => {
      const store = getMemoryStore();
      if (!store) {
        return JSON.stringify({ error: 'Bookmark storage not available' });
      }

      try {
        const name = validateRequiredString(input.name, 'name', MAX_NAME_LENGTH);
        const bookmark = store.get<Bookmark>(`${BOOKMARK_KEY_PREFIX}${name}`);

        if (!bookmark) {
          return JSON.stringify({
            found: false,
            message: `No bookmark found with name: ${name}`,
          });
        }

        return JSON.stringify({
          found: true,
          bookmark,
        });
      } catch (error) {
        return JSON.stringify({
          error: error instanceof Error ? error.message : 'Failed to get bookmark',
        });
      }
    },

    bookmark_delete: async (input): Promise<string> => {
      const store = getMemoryStore();
      if (!store) {
        return JSON.stringify({ error: 'Bookmark storage not available' });
      }

      try {
        const name = validateRequiredString(input.name, 'name', MAX_NAME_LENGTH);
        const exists = store.has(`${BOOKMARK_KEY_PREFIX}${name}`);

        if (!exists) {
          return JSON.stringify({
            success: false,
            message: `No bookmark found with name: ${name}`,
          });
        }

        store.delete(`${BOOKMARK_KEY_PREFIX}${name}`);

        return JSON.stringify({
          success: true,
          message: `Bookmark deleted: ${name}`,
        });
      } catch (error) {
        return JSON.stringify({
          error: error instanceof Error ? error.message : 'Failed to delete bookmark',
        });
      }
    },
  };
}

// ============================================
// Registration Function
// ============================================

export function registerBookmarkTools(
  registry: ToolRegistry,
  getMemoryStore: () => MemoryStore | null
): void {
  const executors = createBookmarkToolExecutors(getMemoryStore);

  for (const tool of bookmarkTools) {
    registry.register(tool, executors[tool.name]);
  }
}
