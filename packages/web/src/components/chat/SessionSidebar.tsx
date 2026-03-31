'use client';

import { useState } from 'react';
import { Plus, MessageSquare, PanelLeftClose, PanelLeft, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/dashboard/confirm-dialog';
import { toast } from '@/lib/toast';
import type { Session, GroupedSessions } from '@/hooks/use-sessions';

interface SessionSidebarProps {
  grouped: GroupedSessions;
  currentSessionId?: string;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onSessionDeleted?: () => void;
  isCollapsed: boolean;
  onToggle: () => void;
}

export function SessionSidebar({
  grouped,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onSessionDeleted,
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
        <SessionGroup label="Today" sessions={grouped.today} currentId={currentSessionId} onSelect={onSelectSession} onDeleted={onSessionDeleted} />
        <SessionGroup label="Yesterday" sessions={grouped.yesterday} currentId={currentSessionId} onSelect={onSelectSession} onDeleted={onSessionDeleted} />
        <SessionGroup label="This Week" sessions={grouped.thisWeek} currentId={currentSessionId} onSelect={onSelectSession} onDeleted={onSessionDeleted} />
        <SessionGroup label="Older" sessions={grouped.older} currentId={currentSessionId} onSelect={onSelectSession} onDeleted={onSessionDeleted} />
      </div>
    </div>
  );
}

function SessionGroup({
  label,
  sessions,
  currentId,
  onSelect,
  onDeleted,
}: {
  label: string;
  sessions: Session[];
  currentId?: string;
  onSelect: (id: string) => void;
  onDeleted?: () => void;
}) {
  if (sessions.length === 0) return null;

  return (
    <div className="mb-3">
      <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">{label}</p>
      {sessions.map(session => (
        <SessionItem
          key={session.id}
          session={session}
          isCurrent={session.id === currentId}
          onSelect={() => onSelect(session.id)}
          onDeleted={onDeleted}
        />
      ))}
    </div>
  );
}

function SessionItem({
  session,
  isCurrent,
  onSelect,
  onDeleted,
}: {
  session: Session;
  isCurrent: boolean;
  onSelect: () => void;
  onDeleted?: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const displayName = session.label || session.cwd?.split('/').pop() || session.id.slice(0, 12);

  const handleRename = async () => {
    const newLabel = renameValue.trim();
    if (!newLabel) { setIsRenaming(false); return; }
    try {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel }),
      });
      if (res.ok) {
        toast.success('Session renamed');
        session.label = newLabel;
      } else {
        toast.error('Failed to rename');
      }
    } catch {
      toast.error('Failed to rename');
    }
    setIsRenaming(false);
  };

  const handleDelete = async () => {
    setConfirmDelete(false);
    try {
      const res = await fetch(`/api/sessions/${session.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Session deleted');
        onDeleted?.();
      } else {
        toast.error('Failed to delete');
      }
    } catch {
      toast.error('Failed to delete');
    }
  };

  if (isRenaming) {
    return (
      <div className="flex items-center gap-1 px-2 py-1">
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setIsRenaming(false); }}
          onBlur={handleRename}
          className="flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
    );
  }

  return (
    <>
      <div
        className={`group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
          isCurrent
            ? 'bg-accent text-foreground'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
        }`}
      >
        <button onClick={onSelect} className="flex flex-1 items-center gap-2 min-w-0">
          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{displayName}</span>
        </button>
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            className="rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-accent transition-opacity"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 z-50 rounded-lg border border-border bg-card shadow-lg py-1 w-32" onMouseLeave={() => setShowMenu(false)}>
              <button
                onClick={() => { setShowMenu(false); setRenameValue(displayName); setIsRenaming(true); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent transition-colors"
              >
                <Pencil className="h-3 w-3" /> Rename
              </button>
              <button
                onClick={() => { setShowMenu(false); setConfirmDelete(true); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-3 w-3" /> Delete
              </button>
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete "${displayName}"?`}
        description="This will permanently delete this session and all its messages."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </>
  );
}
