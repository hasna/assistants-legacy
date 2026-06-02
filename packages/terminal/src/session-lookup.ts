import { SessionStorage, SessionStore } from '@hasna/assistants-core';

type SavedSessionInfo = {
  id: string;
  assistantId?: string | null;
};

type PersistedSessionInfo = {
  id: string;
  assistantId: string | null;
};

type SessionStorageApi = {
  loadSession: typeof SessionStorage.loadSession;
  listAllSessions?: () => SavedSessionInfo[];
};

type SessionStoreApi = {
  load?: (id: string) => PersistedSessionInfo | null;
  findByLabel: (label: string) => PersistedSessionInfo | null;
};

export type SessionLookupDeps = {
  storage?: SessionStorageApi;
  store?: SessionStoreApi;
};

export type LoadedSession = {
  id: string;
  assistantId: string | null;
  data: NonNullable<ReturnType<typeof SessionStorage.loadSession>>;
};

function getStorage(deps?: SessionLookupDeps): SessionStorageApi {
  return deps?.storage ?? SessionStorage;
}

function getStore(deps?: SessionLookupDeps): SessionStoreApi {
  return deps?.store ?? new SessionStore();
}

export function loadSessionById(id: string, deps?: SessionLookupDeps): LoadedSession | null {
  const storage = getStorage(deps);
  let data = storage.loadSession(id);
  if (data) {
    return { id, assistantId: null, data };
  }

  const allSessions =
    typeof storage.listAllSessions === 'function'
      ? storage.listAllSessions()
      : [];
  const matchingSavedSession = allSessions.find((session) => session.id === id);
  if (matchingSavedSession) {
    const assistantId = matchingSavedSession.assistantId ?? null;
    data = storage.loadSession(id, assistantId);
    if (data) {
      return { id, assistantId, data };
    }
  }

  const store = getStore(deps);
  const persisted = store.load?.(id);
  if (persisted) {
    data = storage.loadSession(persisted.id, persisted.assistantId);
    if (data) {
      return { id: persisted.id, assistantId: persisted.assistantId, data };
    }
  }

  return null;
}

export function loadSessionByLabel(label: string, deps?: SessionLookupDeps): LoadedSession | null {
  const storage = getStorage(deps);
  const store = getStore(deps);
  const match = store.findByLabel(label);
  if (!match) {
    return null;
  }

  const data =
    storage.loadSession(match.id, match.assistantId) ??
    storage.loadSession(match.id);
  return data ? { id: match.id, assistantId: match.assistantId, data } : null;
}

export function loadSessionByIdOrLabel(ref: string, deps?: SessionLookupDeps): LoadedSession | null {
  return loadSessionById(ref, deps) ?? loadSessionByLabel(ref, deps);
}
