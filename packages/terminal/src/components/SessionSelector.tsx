import React, { useMemo, useCallback } from 'react';
import type { SessionInfo } from '@hasna/assistants-core';
import type { PersistedSessionData } from '@hasna/assistants-core';
import type { SelectOption } from '@opentui/core';
import { Modal } from './Modal';
import { themeColor } from '../theme/colors';

interface SessionSelectorProps {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onNew: () => void | Promise<void>;
  onCancel: () => void;
  /** Persisted subagent sessions (shown under their parent with a prefix) */
  subagentSessions?: PersistedSessionData[];
}

/**
 * Format date/time for session display
 */
function formatSessionTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).toLowerCase();
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).toLowerCase();
}

/**
 * Format path for display (abbreviate home directory)
 */
function formatPath(cwd: string | undefined | null): string {
  if (!cwd) return '';
  const home = process.env.HOME || '';
  if (home && cwd.startsWith(home)) {
    return '~' + cwd.slice(home.length);
  }
  return cwd;
}

/**
 * Session selector dialog — opens on Ctrl+].
 *
 * Per OpenCode spec (section 8.3):
 * - Title: "Switch Session" in Primary, Bold, Padding(0,1)
 * - SimpleList (our <select>) with session entries
 * - Shows title, date, message count
 * - Min width: 40, max: min(maxTitleLen+4, screenWidth-15), floor: 30
 * - Max visible sessions: 10
 * - Selected: Primary bg, Background fg, Bold
 * - Scrolling: centers selected item when possible
 * - Keys: up/k previous, down/j next, enter select, esc close
 */
export function SessionSelector({
  sessions,
  activeSessionId,
  onSelect,
  onNew,
  onCancel,
  subagentSessions = [],
}: SessionSelectorProps) {
  // Theme colors
  const primaryColor = themeColor('primary');
  const bgColor = themeColor('bg');
  const textColor = themeColor('text');
  const mutedColor = themeColor('muted');

  // Build select options from sessions
  const { options, initialIndex } = useMemo(() => {
    const opts: SelectOption[] = [];
    let activeIdx = 0;

    // Group subagent sessions by parent
    const subagentsByParent = new Map<string, PersistedSessionData[]>();
    for (const sub of subagentSessions) {
      if (!sub.parentSessionId) continue;
      const existing = subagentsByParent.get(sub.parentSessionId) ?? [];
      existing.push(sub);
      subagentsByParent.set(sub.parentSessionId, existing);
    }

    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      const isActive = session.id === activeSessionId;
      const time = formatSessionTime(session.updatedAt);
      const path = formatPath(session.cwd);
      const displayName = session.label || path;
      const processing = session.isProcessing ? ' (processing)' : '';
      const activeMarker = isActive ? ' *' : '';
      const msgCount = (session as any).messageCount;
      const countSuffix = msgCount != null ? ` [${msgCount} msgs]` : '';

      if (isActive) activeIdx = opts.length;

      opts.push({
        name: `${displayName}${processing}${activeMarker}`,
        description: `${time}${countSuffix}  ${session.id.slice(0, 8)}`,
        value: session.id,
      });

      // Add child subagent sessions right after their parent (display-only)
      const children = subagentsByParent.get(session.id);
      if (children) {
        for (const child of children) {
          const subTime = formatSessionTime(child.updatedAt);
          const statusTag = child.status === 'completed' ? ' (done)' : child.status === 'active' ? ' (running)' : '';
          opts.push({
            name: `  \u21B3 ${child.label || 'subagent'}${statusTag}`,
            description: subTime,
            value: `__subagent__${child.id}`,
          });
        }
      }
    }

    // Add "New session" option at the end
    opts.push({
      name: '+ New session',
      description: 'Create a new session',
      value: '__new_session__',
    });

    return { options: opts, initialIndex: activeIdx };
  }, [sessions, activeSessionId, subagentSessions]);

  const handleSelect = useCallback((_index: number, option: SelectOption | null) => {
    if (!option) return;
    const value = String(option.value);

    // Skip subagent entries
    if (value.startsWith('__subagent__')) return;

    if (value === '__new_session__') {
      onNew();
      return;
    }

    onSelect(value);
  }, [onSelect, onNew]);

  return (
    <Modal visible={true} onClose={onCancel} title="Switch Session">
      {/* Session list */}
      <select
        options={options}
        selectedIndex={initialIndex}
        onSelect={handleSelect}
        focused={true}
        showDescription={true}
        wrapSelection={true}
        showScrollIndicator={true}
        backgroundColor={bgColor}
        textColor={textColor}
        selectedBackgroundColor={primaryColor}
        selectedTextColor={bgColor}
        descriptionColor={mutedColor}
        selectedDescriptionColor={bgColor}
        flexGrow={1}
      />

      {/* Footer */}
      <box marginTop={1}>
        <text fg={mutedColor}>Enter select | Up/Down navigate | n new | Esc close</text>
      </box>
    </Modal>
  );
}
