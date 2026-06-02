import { beforeEach, describe, expect, test } from 'bun:test';
import { loadSessionById, loadSessionByIdOrLabel, type SessionLookupDeps } from '../src/session-lookup';
import type { SessionData } from '@hasna/assistants-core';

let mockAllSessions: Array<{ id: string; assistantId: string | null }> = [];
let loadSessionCalls: Array<{ id: string; assistantId?: string | null }> = [];
let mockSessionById: Record<string, SessionData> = {};
let mockSessionByAssistantId: Record<string, SessionData> = {};
let mockPersistedById: Record<string, { id: string; assistantId: string | null }> = {};
let mockPersistedByLabel: Record<string, { id: string; assistantId: string | null }> = {};

function createDeps(): SessionLookupDeps {
  return {
    storage: {
      loadSession: (id: string, assistantId?: string | null) => {
        loadSessionCalls.push({ id, assistantId });
        if (assistantId) {
          return mockSessionByAssistantId[`${assistantId}:${id}`] ?? null;
        }
        return mockSessionById[id] ?? null;
      },
      listAllSessions: () => mockAllSessions,
    },
    store: {
      load(id: string) {
        return mockPersistedById[id] ?? null;
      },

      findByLabel(label: string) {
        return mockPersistedByLabel[label] ?? null;
      },
    },
  };
}

describe('session lookup', () => {
  beforeEach(() => {
    mockAllSessions = [];
    loadSessionCalls = [];
    mockSessionById = {};
    mockSessionByAssistantId = {};
    mockPersistedById = {};
    mockPersistedByLabel = {};
  });

  test('loads assistant-scoped sessions by exact id', () => {
    mockAllSessions = [{ id: 's1', assistantId: 'system-marcus' }];
    mockSessionByAssistantId['system-marcus:s1'] = {
      cwd: '/workspace',
      messages: [{ role: 'assistant', content: 'ACK 48' }],
      startedAt: '2026-05-28T17:31:52.115Z',
      updatedAt: '2026-05-28T17:40:20.130Z',
    };

    const loaded = loadSessionById('s1', createDeps());

    expect(loadSessionCalls).toEqual([
      { id: 's1', assistantId: undefined },
      { id: 's1', assistantId: 'system-marcus' },
    ]);
    expect(loaded?.id).toBe('s1');
    expect(loaded?.assistantId).toBe('system-marcus');
    expect(loaded?.data.cwd).toBe('/workspace');
  });

  test('loads label matches with assistant id', () => {
    mockPersistedByLabel['qa-session'] = { id: 's2', assistantId: 'system-marcus' };
    mockSessionByAssistantId['system-marcus:s2'] = {
      cwd: '/workspace',
      messages: [{ role: 'assistant', content: 'continued' }],
      startedAt: '2026-05-28T17:31:52.115Z',
      updatedAt: '2026-05-28T17:40:20.130Z',
    };

    const loaded = loadSessionByIdOrLabel('qa-session', createDeps());

    expect(loadSessionCalls).toContainEqual({ id: 's2', assistantId: 'system-marcus' });
    expect(loaded?.id).toBe('s2');
    expect(loaded?.assistantId).toBe('system-marcus');
  });
});
