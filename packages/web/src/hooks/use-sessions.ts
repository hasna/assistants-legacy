'use client';

import { useState, useCallback, useEffect } from 'react';

export interface Session {
  id: string;
  cwd: string;
  started_at: number;
  updated_at: number;
  assistant_id: string | null;
  label: string | null;
  status: string;
}

export interface GroupedSessions {
  today: Session[];
  yesterday: Session[];
  thisWeek: Session[];
  older: Session[];
}

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [grouped, setGrouped] = useState<GroupedSessions>({
    today: [],
    yesterday: [],
    thisWeek: [],
    older: [],
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      setSessions(data.sessions || []);
      setGrouped(data.grouped || { today: [], yesterday: [], thisWeek: [], older: [] });
    } catch {
      // Silent fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createSession = useCallback(async (label?: string) => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      const data = await res.json();
      await fetchSessions();
      return data.id as string;
    } catch {
      return null;
    }
  }, [fetchSessions]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return {
    sessions,
    grouped,
    isLoading,
    createSession,
    refreshSessions: fetchSessions,
  };
}
