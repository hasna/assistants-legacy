'use client';

import { Plus, MessageSquare, PanelLeftClose, PanelLeft } from 'lucide-react';
import type { Session, GroupedSessions } from '@/hooks/use-sessions';

interface SessionSidebarProps {
  grouped: GroupedSessions;
  currentSessionId?: string;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  isCollapsed: boolean;
  onToggle: () => void;
}

export function SessionSidebar({
  grouped,
  currentSessionId,
  onSelectSession,
  onNewChat,
  isCollapsed,
  onToggle,
}: SessionSidebarProps) {
  if (isCollapsed) {
    return (
      <div className="flex w-12 flex-col items-center border-r border-border bg-card py-3">
        <button
          onClick={onToggle}
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Open sidebar"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <button
          onClick={onNewChat}
          className="mt-2 rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="New chat"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-64 flex-col border-r border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-3">
        <button
          onClick={onToggle}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Close sidebar"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
        <button
          onClick={onNewChat}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          New chat
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <SessionGroup label="Today" sessions={grouped.today} currentId={currentSessionId} onSelect={onSelectSession} />
        <SessionGroup label="Yesterday" sessions={grouped.yesterday} currentId={currentSessionId} onSelect={onSelectSession} />
        <SessionGroup label="This Week" sessions={grouped.thisWeek} currentId={currentSessionId} onSelect={onSelectSession} />
        <SessionGroup label="Older" sessions={grouped.older} currentId={currentSessionId} onSelect={onSelectSession} />
      </div>
    </div>
  );
}

function SessionGroup({
  label,
  sessions,
  currentId,
  onSelect,
}: {
  label: string;
  sessions: Session[];
  currentId?: string;
  onSelect: (id: string) => void;
}) {
  if (sessions.length === 0) return null;

  return (
    <div className="mb-3">
      <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">{label}</p>
      {sessions.map(session => (
        <button
          key={session.id}
          onClick={() => onSelect(session.id)}
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
            session.id === currentId
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {session.label || session.cwd?.split('/').pop() || session.id.slice(0, 12)}
          </span>
        </button>
      ))}
    </div>
  );
}
