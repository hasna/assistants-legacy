import React, { useState, useMemo, useEffect } from 'react';
import { InboxPanel } from './InboxPanel';
import type { Email, EmailListItem } from '@hasna/assistants-shared';
import { useSafeInput as useInput } from '../hooks/useSafeInput';
import { themeColor } from '../theme/colors';

// Maximum visible items in lists before pagination kicks in
const MAX_VISIBLE_ITEMS = 5;

type ViewMode = 'list' | 'detail' | 'delete-confirm' | 'inject-confirm';
type ActiveTab = 'assistant' | 'email';

interface MessageEntry {
  id: string;
  threadId: string;
  fromAssistantId: string;
  fromAssistantName: string;
  subject?: string;
  preview: string;
  body?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'unread' | 'read' | 'archived' | 'injected';
  createdAt: string;
  replyCount?: number;
}

interface MessagesPanelProps {
  messages: MessageEntry[];
  onRead: (id: string) => Promise<MessageEntry>;
  onDelete: (id: string) => Promise<void>;
  onInject: (id: string) => Promise<void>;
  onReply: (id: string, body: string) => Promise<void>;
  onClose: () => void;
  error?: string | null;
  // Inbox props (optional - only passed when inbox is enabled)
  inboxEmails?: EmailListItem[];
  onInboxRead?: (id: string) => Promise<Email>;
  onInboxDelete?: (id: string) => Promise<void>;
  onInboxFetch?: () => Promise<number>;
  onInboxMarkRead?: (id: string) => Promise<void>;
  onInboxMarkUnread?: (id: string) => Promise<void>;
  onInboxReply?: (id: string) => void;
  inboxError?: string | null;
  inboxEnabled?: boolean;
  /** Which tab to show initially */
  initialTab?: ActiveTab;
}

/**
 * Calculate the visible window range for paginated lists
 */
function getVisibleRange(
  selectedIndex: number,
  totalItems: number,
  maxVisible: number = MAX_VISIBLE_ITEMS
): { start: number; end: number; hasMore: { above: number; below: number } } {
  if (totalItems <= maxVisible) {
    return {
      start: 0,
      end: totalItems,
      hasMore: { above: 0, below: 0 },
    };
  }

  const halfWindow = Math.floor(maxVisible / 2);
  let start = selectedIndex - halfWindow;
  let end = selectedIndex + (maxVisible - halfWindow);

  if (start < 0) {
    start = 0;
    end = maxVisible;
  }

  if (end > totalItems) {
    end = totalItems;
    start = Math.max(0, totalItems - maxVisible);
  }

  return {
    start,
    end,
    hasMore: {
      above: start,
      below: totalItems - end,
    },
  };
}

/**
 * Format relative time
 */
function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/**
 * Get priority color
 */
function getPriorityColor(priority: MessageEntry['priority']): string {
  switch (priority) {
    case 'urgent':
      return 'red';
    case 'high':
      return 'yellow';
    case 'normal':
      return 'white';
    case 'low':
      return themeColor('muted');
    default:
      return 'white';
  }
}

/**
 * Get status icon
 */
function getStatusIcon(status: MessageEntry['status']): string {
  switch (status) {
    case 'unread':
      return '📬';
    case 'read':
      return '📖';
    case 'injected':
      return '👁️';
    case 'archived':
      return '📦';
    default:
      return '📨';
  }
}

/**
 * Tab bar component for switching between Assistant Messages and Email Inbox
 */
function TabBar({ activeTab, inboxEnabled }: { activeTab: ActiveTab; inboxEnabled: boolean }) {
  if (!inboxEnabled) return null;

  return (
    <box marginBottom={1}>
      <text
        fg={activeTab === 'assistant' ? 'cyan' : themeColor('muted')}
        attributes={activeTab === 'assistant' ? 33 : undefined}
      ><b>
        {' Assistant Messages '}
      </b></text>
      <text fg={themeColor('muted')}> | </text>
      <text
        fg={activeTab === 'email' ? 'cyan' : themeColor('muted')}
        attributes={activeTab === 'email' ? 33 : undefined}
      ><b>
        {' Email Inbox '}
      </b></text>
      <text fg={themeColor('muted')}>  [Tab] switch</text>
    </box>
  );
}

/**
 * Inner assistant messages panel (extracted from original MessagesPanel logic)
 */
function AssistantMessagesContent({
  messages,
  onRead,
  onDelete,
  onInject,
  onClose,
  error,
  showTabBar,
}: {
  messages: MessageEntry[];
  onRead: (id: string) => Promise<MessageEntry>;
  onDelete: (id: string) => Promise<void>;
  onInject: (id: string) => Promise<void>;
  onClose: () => void;
  error?: string | null;
  showTabBar: boolean;
}) {
  const [mode, setMode] = useState<ViewMode>('list');
  const [messageIndex, setMessageIndex] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<MessageEntry | null>(null);
  const [injectTarget, setInjectTarget] = useState<MessageEntry | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detailMessage, setDetailMessage] = useState<MessageEntry | null>(null);

  useEffect(() => {
    setMessageIndex((prev) => Math.min(prev, Math.max(0, messages.length - 1)));
  }, [messages.length]);

  useEffect(() => {
    if (mode === 'detail' && !detailMessage) {
      setMode('list');
    }
    if (mode === 'delete-confirm' && !deleteTarget) {
      setMode('list');
    }
    if (mode === 'inject-confirm' && !injectTarget) {
      setMode('list');
    }
  }, [mode, detailMessage, deleteTarget, injectTarget]);

  // Calculate visible range for messages list
  const messageRange = useMemo(
    () => getVisibleRange(messageIndex, messages.length),
    [messageIndex, messages.length]
  );

  const currentMessage = messages[messageIndex];

  // Handle view details
  const handleViewDetails = async () => {
    if (!currentMessage) return;

    setIsProcessing(true);
    try {
      const details = await onRead(currentMessage.id);
      setDetailMessage(details);
      setMode('detail');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!deleteTarget) return;

    setIsProcessing(true);
    try {
      await onDelete(deleteTarget.id);
      setMode('list');
      setDeleteTarget(null);
      setDetailMessage(null);
      // Adjust index if needed
      if (messageIndex >= messages.length - 1 && messageIndex > 0) {
        setMessageIndex(messageIndex - 1);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle inject
  const handleInject = async () => {
    if (!injectTarget) return;

    setIsProcessing(true);
    try {
      await onInject(injectTarget.id);
      setMode('list');
      setInjectTarget(null);
      setDetailMessage(null);
    } finally {
      setIsProcessing(false);
    }
  };

  // Keyboard navigation (Tab is handled by parent)
  useInput((input, key) => {
    if (isProcessing) return;

    // Exit with q or Escape at top level
    if (input === 'q' || (key.escape && mode === 'list')) {
      onClose();
      return;
    }

    // Escape to go back
    if (key.escape) {
      if (mode === 'detail') {
        setMode('list');
        setDetailMessage(null);
      } else if (mode === 'delete-confirm') {
        setMode('detail');
        setDeleteTarget(null);
      } else if (mode === 'inject-confirm') {
        setMode('detail');
        setInjectTarget(null);
      }
      return;
    }

    // List mode navigation
    if (mode === 'list') {
      if (messages.length === 0) {
        return;
      }
      if (key.upArrow) {
        setMessageIndex((prev) => (prev === 0 ? messages.length - 1 : prev - 1));
        return;
      }
      if (key.downArrow) {
        setMessageIndex((prev) => (prev === messages.length - 1 ? 0 : prev + 1));
        return;
      }
      if (key.return && currentMessage) {
        handleViewDetails();
        return;
      }
      // Number keys for quick selection
      const num = parseInt(input, 10);
      if (!isNaN(num) && num >= 1 && num <= messages.length) {
        setMessageIndex(num - 1);
      }
      return;
    }

    // Detail mode
    if (mode === 'detail') {
      if (input === 'i') {
        if (detailMessage) {
          setInjectTarget(detailMessage);
          setMode('inject-confirm');
        }
        return;
      }
      if (input === 'x' || key.delete) {
        if (detailMessage) {
          setDeleteTarget(detailMessage);
          setMode('delete-confirm');
        }
        return;
      }
      return;
    }

    // Delete confirm mode
    if (mode === 'delete-confirm') {
      if (input === 'y') {
        handleDelete();
        return;
      }
      if (input === 'n') {
        setMode('detail');
        setDeleteTarget(null);
        return;
      }
    }

    // Inject confirm mode
    if (mode === 'inject-confirm') {
      if (input === 'y') {
        handleInject();
        return;
      }
      if (input === 'n') {
        setMode('detail');
        setInjectTarget(null);
        return;
      }
    }
  });

  // Empty state
  if (messages.length === 0) {
    return (
      <box flexDirection="column">
        {!showTabBar && (
          <box marginBottom={1}>
            <text fg={themeColor('info')}><b>Messages</b></text>
          </box>
        )}
        <box
          flexDirection="column"
          borderStyle="rounded"
          borderColor={themeColor('border')} border={["top", "bottom"]}
          paddingX={1}
          paddingY={1}
        >
          <text fg={themeColor('muted')}>No messages in inbox.</text>
          <text fg={themeColor('muted')}>Use the messages_send tool to send messages to other assistants.</text>
        </box>
        <box marginTop={1}>
          <text fg={themeColor('muted')}>q quit</text>
        </box>
      </box>
    );
  }

  // Delete confirmation
  if (mode === 'delete-confirm' && deleteTarget) {
    return (
      <box flexDirection="column">
        <box marginBottom={1}>
          <text fg={themeColor('error')}><b>Delete Message</b></text>
        </box>
        <box
          flexDirection="column"
          borderStyle="rounded"
          borderColor={themeColor('border')} border={["top", "bottom"]}
          paddingX={1}
          paddingY={1}
        >
          <text>Are you sure you want to delete this message?</text>
          <text fg={themeColor('muted')}>From: {deleteTarget.fromAssistantName}</text>
          {deleteTarget.subject && <text fg={themeColor('muted')}>Subject: {deleteTarget.subject}</text>}
          <text fg={themeColor('muted')}>This action cannot be undone.</text>
        </box>
        <box marginTop={1}>
          <text fg={themeColor('muted')}>y confirm | n cancel</text>
        </box>
      </box>
    );
  }

  // Inject confirmation
  if (mode === 'inject-confirm' && injectTarget) {
    return (
      <box flexDirection="column">
        <box marginBottom={1}>
          <text fg={themeColor('success')}><b>Inject Message</b></text>
        </box>
        <box
          flexDirection="column"
          borderStyle="rounded"
          borderColor={themeColor('border')} border={["top", "bottom"]}
          paddingX={1}
          paddingY={1}
        >
          <text>Inject this message into the current conversation?</text>
          <text fg={themeColor('muted')}>From: {injectTarget.fromAssistantName}</text>
          {injectTarget.subject && <text fg={themeColor('muted')}>Subject: {injectTarget.subject}</text>}
          <text fg={themeColor('muted')}>The message will be added to the context.</text>
        </box>
        <box marginTop={1}>
          <text fg={themeColor('muted')}>y confirm | n cancel</text>
        </box>
      </box>
    );
  }

  // Detail view
  if (mode === 'detail' && detailMessage) {
    return (
      <box flexDirection="column">
        <box marginBottom={1}>
          <text fg={themeColor('info')}><b>{getStatusIcon(detailMessage.status)} Message</b></text>
          <text fg={getPriorityColor(detailMessage.priority)}> [{detailMessage.priority}]</text>
        </box>

        <box
          flexDirection="column"
          borderStyle="rounded"
          borderColor={themeColor('border')} border={["top", "bottom"]}
          paddingX={1}
          paddingY={1}
        >
          <box>
            <text fg={themeColor('muted')}>From: </text>
            <text>{detailMessage.fromAssistantName}</text>
          </box>

          {detailMessage.subject && (
            <box>
              <text fg={themeColor('muted')}>Subject: </text>
              <text><b>{detailMessage.subject}</b></text>
            </box>
          )}

          <box>
            <text fg={themeColor('muted')}>Received: </text>
            <text>{formatRelativeTime(detailMessage.createdAt)}</text>
            <text fg={themeColor('muted')}> ({new Date(detailMessage.createdAt).toLocaleString()})</text>
          </box>

          <box marginTop={1} flexDirection="column">
            <text fg={themeColor('muted')}>Message:</text>
            <text>{detailMessage.body || detailMessage.preview}</text>
          </box>
        </box>

        {error && (
          <box marginTop={1}>
            <text fg={themeColor('error')}>{error}</text>
          </box>
        )}

        <box marginTop={1}>
          <text fg={themeColor('muted')}>
            i inject | x delete | Esc back
          </text>
        </box>
      </box>
    );
  }

  // List view (default)
  const visibleMessages = messages.slice(messageRange.start, messageRange.end);

  return (
    <box flexDirection="column">
      {!showTabBar && (
        <box marginBottom={1}>
          <text fg={themeColor('info')}><b>Messages</b></text>
          {messages.length > MAX_VISIBLE_ITEMS && (
            <text fg={themeColor('muted')}> ({messageIndex + 1}/{messages.length})</text>
          )}
        </box>
      )}

      <box
        flexDirection="column"
        borderStyle="rounded"
        borderColor={themeColor('border')} border={["top", "bottom"]}
        paddingX={1}
      >
        {messageRange.hasMore.above > 0 && (
          <box paddingY={0}>
            <text fg={themeColor('muted')}>  ↑ {messageRange.hasMore.above} more above</text>
          </box>
        )}

        {visibleMessages.map((msg, visibleIdx) => {
          const actualIdx = messageRange.start + visibleIdx;
          const isSelected = actualIdx === messageIndex;
          const prefix = isSelected ? '> ' : '  ';
          const statusIcon = getStatusIcon(msg.status);
          const priorityColor = getPriorityColor(msg.priority);
          const fromName = msg.fromAssistantName.slice(0, 12).padEnd(12);
          const subject = (msg.subject || msg.preview.slice(0, 25)).padEnd(25);

          return (
            <box key={msg.id} paddingY={0}>
              <text bg={isSelected ? themeColor('primary') : undefined} fg={isSelected ? themeColor('text') : "gray"}>
                {prefix}{statusIcon}{' '}
              </text>
              <text bg={isSelected ? themeColor('primary') : undefined} fg={isSelected ? themeColor('text') : priorityColor}>
                {msg.priority === 'urgent' ? '!' : msg.priority === 'high' ? '↑' : ' '}
              </text>
              <text bg={isSelected ? themeColor('primary') : undefined} fg={isSelected ? themeColor('text') : msg.status === 'read' ? "gray" : undefined}>
                {' '}{fromName}
              </text>
              <text bg={isSelected ? themeColor('primary') : undefined} fg={isSelected ? themeColor('text') : msg.status === 'read' ? "gray" : undefined}>
                {' '}{subject}
              </text>
              <text bg={isSelected ? themeColor('primary') : undefined} fg={isSelected ? themeColor('text') : "gray"}>
                {' '}{formatRelativeTime(msg.createdAt)}
              </text>
            </box>
          );
        })}

        {messageRange.hasMore.below > 0 && (
          <box paddingY={0}>
            <text fg={themeColor('muted')}>  ↓ {messageRange.hasMore.below} more below</text>
          </box>
        )}
      </box>

      <box marginTop={1}>
        <text fg={themeColor('muted')}>Legend: </text>
        <text>📬</text>
        <text fg={themeColor('muted')}> unread | </text>
        <text>📖</text>
        <text fg={themeColor('muted')}> read | </text>
        <text>👁️</text>
        <text fg={themeColor('muted')}> injected</text>
      </box>

      <box marginTop={1}>
        <text fg={themeColor('muted')}>
          ↑↓ select | Enter view | q quit
        </text>
      </box>
    </box>
  );
}

/**
 * Unified interactive panel for managing messages (assistant + email inbox)
 */
export function MessagesPanel({
  messages,
  onRead,
  onDelete,
  onInject,
  onReply,
  onClose,
  error,
  // Inbox props
  inboxEmails,
  onInboxRead,
  onInboxDelete,
  onInboxFetch,
  onInboxMarkRead,
  onInboxMarkUnread,
  onInboxReply,
  inboxError,
  inboxEnabled = false,
  initialTab = 'assistant',
}: MessagesPanelProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);
  const hasInbox = inboxEnabled && onInboxRead && onInboxFetch;

  // Tab switching with Tab key (only at top level of each sub-panel)
  useInput((input, key) => {
    if (!hasInbox) return;
    if (key.tab) {
      setActiveTab((prev) => (prev === 'assistant' ? 'email' : 'assistant'));
    }
  });

  // Single-tab mode (no inbox) - render assistant messages directly
  if (!hasInbox) {
    return (
      <box flexDirection="column" paddingY={1}>
        <AssistantMessagesContent
          messages={messages}
          onRead={onRead}
          onDelete={onDelete}
          onInject={onInject}
          onClose={onClose}
          error={error}
          showTabBar={false}
        />
      </box>
    );
  }

  // Dual-tab mode - render tab bar + active tab content
  return (
    <box flexDirection="column" paddingY={1}>
      <TabBar activeTab={activeTab} inboxEnabled={true} />

      {activeTab === 'assistant' ? (
        <AssistantMessagesContent
          messages={messages}
          onRead={onRead}
          onDelete={onDelete}
          onInject={onInject}
          onClose={onClose}
          error={error}
          showTabBar={true}
        />
      ) : (
        <InboxPanel
          emails={inboxEmails || []}
          onRead={onInboxRead!}
          onDelete={onInboxDelete || (async () => { throw new Error('Delete not implemented'); })}
          onFetch={onInboxFetch!}
          onMarkRead={onInboxMarkRead || (async () => {})}
          onMarkUnread={onInboxMarkUnread || (async () => {})}
          onReply={onInboxReply || (() => {})}
          onClose={onClose}
          error={inboxError}
        />
      )}
    </box>
  );
}
