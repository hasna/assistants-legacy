/**
 * Calendar Tools
 *
 * Built-in calendar with SQLite backend for creating, listing, and deleting events.
 * Events are stored in the shared assistants.db database.
 */

import type { Tool } from '@hasna/assistants-shared';
import type { ToolExecutor, ToolRegistry } from './registry';
import { getDatabase } from '../database';
import type { DatabaseConnection } from '../database';
import { DEFAULT_COMPACT_LIMIT, MAX_COMPACT_LIMIT, truncateText } from '../commands/helpers';

// ============================================
// Types
// ============================================

interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  start_time: number;
  end_time: number | null;
  all_day: number;
  location: string | null;
  tags: string | null;
  created_at: number;
}

// ============================================
// Helpers
// ============================================

function generateId(): string {
  return `cal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

function endOfWeek(date: Date): Date {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  return endOfDay(d);
}

function startOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}

function parseDate(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed.getTime();
  }
  return null;
}

function formatEvent(event: CalendarEvent, options: { verbose?: boolean; full?: boolean } = {}): Record<string, unknown> {
  const full = options.full === true;
  const verbose = full || options.verbose === true;
  return {
    id: event.id,
    title: full ? event.title : truncateText(event.title, verbose ? 160 : 80),
    description: full ? event.description : event.description ? truncateText(event.description, verbose ? 240 : 96) : null,
    start: new Date(event.start_time).toISOString(),
    end: event.end_time ? new Date(event.end_time).toISOString() : null,
    allDay: event.all_day === 1,
    location: full ? event.location : event.location ? truncateText(event.location, verbose ? 180 : 80) : null,
    tags: event.tags ? JSON.parse(event.tags) : [],
    createdAt: new Date(event.created_at).toISOString(),
  };
}

function ensureTable(db: DatabaseConnection): void {
  db.exec(`CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    start_time INTEGER NOT NULL,
    end_time INTEGER,
    all_day INTEGER NOT NULL DEFAULT 0,
    location TEXT,
    tags TEXT,
    created_at INTEGER NOT NULL
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start_time)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_calendar_events_end ON calendar_events(end_time)');
}

// ============================================
// Tool Definitions
// ============================================

export const calendarCreateTool: Tool = {
  name: 'calendar_create',
  description:
    'Create a calendar event. Provide a title and start time (ISO 8601 string or epoch ms). Optionally provide end time, description, location, allDay flag, and tags.',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Event title',
      },
      start: {
        type: 'string',
        description: 'Start time as ISO 8601 string (e.g., "2025-03-15T09:00:00Z") or epoch ms',
      },
      end: {
        type: 'string',
        description: 'End time as ISO 8601 string or epoch ms. Optional.',
      },
      description: {
        type: 'string',
        description: 'Event description',
      },
      location: {
        type: 'string',
        description: 'Event location',
      },
      allDay: {
        type: 'boolean',
        description: 'Whether this is an all-day event',
      },
      tags: {
        type: 'array',
        items: { type: 'string', description: 'A tag string' },
        description: 'Tags for categorization',
      },
    },
    required: ['title', 'start'],
  },
};

export const calendarListTool: Tool = {
  name: 'calendar_list',
  description:
    'List calendar events. Use "range" to filter: "today", "week", "month", or provide explicit "from" and "to" ISO dates.',
  parameters: {
    type: 'object',
    properties: {
      range: {
        type: 'string',
        description: 'Predefined range: "today", "week", or "month"',
      },
      from: {
        type: 'string',
        description: 'Start of date range (ISO 8601). Used when range is not set.',
      },
      to: {
        type: 'string',
        description: 'End of date range (ISO 8601). Used when range is not set.',
      },
      tag: {
        type: 'string',
        description: 'Filter events by tag',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of events to return (default 20, max 100)',
      },
      verbose: {
        type: 'boolean',
        description: 'Include longer title/description/location text',
      },
      full: {
        type: 'boolean',
        description: 'Return full event text without compact truncation',
      },
    },
  },
};

export const calendarDeleteTool: Tool = {
  name: 'calendar_delete',
  description: 'Delete a calendar event by its id.',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The event id to delete',
      },
    },
    required: ['id'],
  },
};

export const calendarTodayTool: Tool = {
  name: 'calendar_today',
  description: "Shorthand to list today's calendar events.",
  parameters: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum events to return (default 20, max 100)',
      },
      verbose: {
        type: 'boolean',
        description: 'Include longer title/description/location text',
      },
      full: {
        type: 'boolean',
        description: 'Return full event text without compact truncation',
      },
    },
  },
};

// ============================================
// Tool Array
// ============================================

export const calendarTools: Tool[] = [
  calendarCreateTool,
  calendarListTool,
  calendarDeleteTool,
  calendarTodayTool,
];

// ============================================
// Tool Executors Factory
// ============================================

export function createCalendarToolExecutors(): Record<string, ToolExecutor> {
  let tableReady = false;

  function getDb(): DatabaseConnection {
    const db = getDatabase();
    if (!tableReady) {
      ensureTable(db);
      tableReady = true;
    }
    return db;
  }

  return {
    calendar_create: async (input): Promise<string> => {
      try {
        const title = input.title as string | undefined;
        if (!title || typeof title !== 'string' || !title.trim()) {
          return JSON.stringify({ error: 'title is required' });
        }

        const startTime = parseDate(input.start);
        if (startTime === null) {
          return JSON.stringify({ error: 'start is required and must be a valid date (ISO 8601 string or epoch ms)' });
        }

        const endTime = parseDate(input.end);
        const allDay = input.allDay === true || input.allDay === 'true' ? 1 : 0;
        const description = typeof input.description === 'string' ? input.description.trim() || null : null;
        const location = typeof input.location === 'string' ? input.location.trim() || null : null;
        const tags = Array.isArray(input.tags) ? JSON.stringify(input.tags.filter((t: unknown) => typeof t === 'string')) : null;

        const id = generateId();
        const now = Date.now();

        const db = getDb();
        db.prepare(
          'INSERT INTO calendar_events (id, title, description, start_time, end_time, all_day, location, tags, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(id, title.trim(), description, startTime, endTime, allDay, location, tags, now);

        const event = db.query<CalendarEvent>('SELECT * FROM calendar_events WHERE id = ?').get(id);

        return JSON.stringify({
          success: true,
          message: `Event created: ${title.trim()}`,
          event: event ? formatEvent(event) : { id },
        });
      } catch (error) {
        return JSON.stringify({
          error: error instanceof Error ? error.message : 'Failed to create event',
        });
      }
    },

    calendar_list: async (input): Promise<string> => {
      try {
        const db = getDb();
        const now = new Date();
        let fromTime: number;
        let toTime: number;

        const range = typeof input.range === 'string' ? input.range.toLowerCase() : undefined;

        if (range === 'today') {
          fromTime = startOfDay(now).getTime();
          toTime = endOfDay(now).getTime();
        } else if (range === 'week') {
          fromTime = startOfWeek(now).getTime();
          toTime = endOfWeek(now).getTime();
        } else if (range === 'month') {
          fromTime = startOfMonth(now).getTime();
          toTime = endOfMonth(now).getTime();
        } else if (input.from || input.to) {
          fromTime = parseDate(input.from) ?? 0;
          toTime = parseDate(input.to) ?? Number.MAX_SAFE_INTEGER;
        } else {
          // Default: show upcoming events from now
          fromTime = startOfDay(now).getTime();
          toTime = Number.MAX_SAFE_INTEGER;
        }

        const limit = input.full === true
          ? MAX_COMPACT_LIMIT
          : typeof input.limit === 'number' && input.limit > 0
            ? Math.min(input.limit, MAX_COMPACT_LIMIT)
            : DEFAULT_COMPACT_LIMIT;

        const events = db.query<CalendarEvent>(
          'SELECT * FROM calendar_events WHERE start_time >= ? AND start_time <= ? ORDER BY start_time ASC LIMIT ?'
        ).all(fromTime, toTime, limit);

        let filtered = events;
        if (typeof input.tag === 'string' && input.tag.trim()) {
          const tagFilter = input.tag.trim().toLowerCase();
          filtered = events.filter((e) => {
            if (!e.tags) return false;
            try {
              const tags: string[] = JSON.parse(e.tags);
              return tags.some((t) => t.toLowerCase() === tagFilter);
            } catch {
              return false;
            }
          });
        }

        return JSON.stringify({
          count: filtered.length,
          limit,
          range: range || (input.from || input.to ? 'custom' : 'upcoming'),
          events: filtered.map((event) => formatEvent(event, { verbose: input.verbose === true, full: input.full === true })),
          hint: input.full === true ? undefined : 'Pass verbose=true for longer text or full=true for full event fields.',
        });
      } catch (error) {
        return JSON.stringify({
          error: error instanceof Error ? error.message : 'Failed to list events',
        });
      }
    },

    calendar_delete: async (input): Promise<string> => {
      try {
        const id = input.id as string | undefined;
        if (!id || typeof id !== 'string' || !id.trim()) {
          return JSON.stringify({ error: 'id is required' });
        }

        const db = getDb();
        const event = db.query<CalendarEvent>('SELECT * FROM calendar_events WHERE id = ?').get(id.trim());

        if (!event) {
          return JSON.stringify({
            success: false,
            message: `No event found with id: ${id.trim()}`,
          });
        }

        db.prepare('DELETE FROM calendar_events WHERE id = ?').run(id.trim());

        return JSON.stringify({
          success: true,
          message: `Event deleted: ${event.title}`,
          event: formatEvent(event),
        });
      } catch (error) {
        return JSON.stringify({
          error: error instanceof Error ? error.message : 'Failed to delete event',
        });
      }
    },

    calendar_today: async (input): Promise<string> => {
      try {
        const db = getDb();
        const now = new Date();
        const fromTime = startOfDay(now).getTime();
        const toTime = endOfDay(now).getTime();

        const limit = input.full === true
          ? MAX_COMPACT_LIMIT
          : typeof input.limit === 'number' && input.limit > 0
            ? Math.min(input.limit, MAX_COMPACT_LIMIT)
            : DEFAULT_COMPACT_LIMIT;

        const events = db.query<CalendarEvent>(
          'SELECT * FROM calendar_events WHERE start_time >= ? AND start_time <= ? ORDER BY start_time ASC LIMIT ?'
        ).all(fromTime, toTime, limit);

        return JSON.stringify({
          count: events.length,
          limit,
          date: now.toISOString().split('T')[0],
          events: events.map((event) => formatEvent(event, { verbose: input.verbose === true, full: input.full === true })),
          hint: input.full === true ? undefined : 'Pass verbose=true for longer text or full=true for full event fields.',
        });
      } catch (error) {
        return JSON.stringify({
          error: error instanceof Error ? error.message : 'Failed to list today\'s events',
        });
      }
    },
  };
}

// ============================================
// Registration Function
// ============================================

export function registerCalendarTools(registry: ToolRegistry): void {
  const executors = createCalendarToolExecutors();

  for (const tool of calendarTools) {
    registry.register(tool, executors[tool.name]);
  }
}
