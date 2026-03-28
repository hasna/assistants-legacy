import React, { useState, useEffect } from 'react';
import type { WebhookListItem, WebhookRegistration, WebhookEventListItem, WebhooksManager } from '@hasna/assistants-core';
import { useSafeInput as useInput } from '../hooks/useSafeInput';
import { themeColor } from '../theme/colors';

interface WebhooksPanelProps {
  manager: WebhooksManager;
  onClose: () => void;
}

type Mode = 'list' | 'detail' | 'events' | 'create-name' | 'create-source' | 'create-confirm' | 'delete-confirm';

const STATUS_ICONS: Record<string, string> = {
  active: '●',
  paused: '◐',
  deleted: '✗',
};

const STATUS_COLORS: Record<string, string | undefined> = {
  active: themeColor('success'),
  paused: 'yellow',
  deleted: themeColor('muted'),
};

const EVENT_STATUS_ICONS: Record<string, string> = {
  pending: '⏳',
  injected: '📨',
  processed: '✓',
  failed: '✗',
};

function formatRelativeTime(isoDate: string | undefined): string {
  if (!isoDate) return 'never';
  const diff = Date.now() - new Date(isoDate).getTime();
  const absDiff = Math.abs(diff);
  const seconds = Math.floor(absDiff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

export function WebhooksPanel({ manager, onClose }: WebhooksPanelProps) {
  const [mode, setMode] = useState<Mode>('list');
  const [webhooks, setWebhooks] = useState<WebhookListItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookRegistration | null>(null);
  const [events, setEvents] = useState<WebhookEventListItem[]>([]);

  useEffect(() => {
    if ((mode === 'detail' || mode === 'events' || mode === 'delete-confirm') && !selectedWebhook) {
      setMode('list');
    }
  }, [mode, selectedWebhook]);
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Create wizard state
  const [createName, setCreateName] = useState('');
  const [createSource, setCreateSource] = useState('');

  const loadWebhooks = async () => {
    try {
      const list = await manager.list();
      setWebhooks(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    loadWebhooks();
  }, []);

  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, webhooks.length - 1)));
  }, [webhooks.length]);

  const loadDetail = async (webhookId: string) => {
    try {
      const webhook = await manager.get(webhookId);
      if (webhook) {
        setSelectedWebhook(webhook);
        setMode('detail');
        setShowSecret(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const loadEvents = async (webhookId: string) => {
    try {
      const evts = await manager.listEvents(webhookId, { limit: 20 });
      setEvents(evts);
      setMode('events');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useInput((input, key) => {
    if (mode === 'create-name' || mode === 'create-source') return;

    if (key.escape || input === 'q') {
      if (mode === 'list') {
        onClose();
      } else {
        setMode('list');
        setSelectedWebhook(null);
        setShowSecret(false);
        setStatusMessage(null);
      }
      return;
    }

    if (mode === 'list') {
      if (key.upArrow || input === 'k') {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow || input === 'j') {
        if (webhooks.length === 0) {
          setSelectedIndex(0);
        } else {
          setSelectedIndex((prev) => Math.min(webhooks.length - 1, prev + 1));
        }
      } else if (key.return) {
        if (webhooks.length > 0) {
          loadDetail(webhooks[selectedIndex].id);
        }
      } else if (input === 'c') {
        setCreateName('');
        setCreateSource('');
        setMode('create-name');
      } else if (input === 'd' && webhooks.length > 0) {
        loadDetail(webhooks[selectedIndex].id).then(() => setMode('delete-confirm'));
      } else if (input === 'e' && webhooks.length > 0) {
        loadEvents(webhooks[selectedIndex].id);
      } else if (input === 't' && webhooks.length > 0) {
        const wh = webhooks[selectedIndex];
        manager.sendTestEvent(wh.id).then((result) => {
          setStatusMessage(result.success ? `Test event sent to ${wh.name}` : `Error: ${result.message}`);
          loadWebhooks();
        });
      } else if (input === 'p' && webhooks.length > 0) {
        const wh = webhooks[selectedIndex];
        const newStatus = wh.status === 'active' ? 'paused' : 'active';
        manager.update({ id: wh.id, status: newStatus as 'active' | 'paused' }).then((result) => {
          setStatusMessage(result.message);
          loadWebhooks();
        });
      } else if (input === 'r') {
        loadWebhooks();
        setStatusMessage('Refreshed');
      }
    } else if (mode === 'detail') {
      if (input === 'r') {
        setShowSecret(!showSecret);
      } else if (input === 'e' && selectedWebhook) {
        loadEvents(selectedWebhook.id);
      }
    } else if (mode === 'delete-confirm') {
      if (input === 'y' && selectedWebhook) {
        manager.delete(selectedWebhook.id).then((result) => {
          setStatusMessage(result.message);
          setMode('list');
          setSelectedWebhook(null);
          loadWebhooks();
        });
      } else if (input === 'n') {
        setMode('detail');
      }
    } else if (mode === 'create-confirm') {
      if (input === 'y') {
        manager.create({ name: createName, source: createSource || 'custom' }).then((result) => {
          if (result.success) {
            setStatusMessage(`Created webhook: ${result.webhookId}`);
            // Load the new webhook detail to show URL+secret
            if (!result.webhookId) {
              setMode('list');
              loadWebhooks();
              return;
            }
            manager.get(result.webhookId).then((wh) => {
              if (wh) {
                setSelectedWebhook(wh);
                setMode('detail');
                setShowSecret(true);
              } else {
                setMode('list');
              }
              loadWebhooks();
            });
          } else {
            setStatusMessage(`Error: ${result.message}`);
            setMode('list');
          }
        });
      } else if (input === 'n') {
        setMode('list');
      }
    }
  });

  // Header
  const header = (
    <box borderStyle="rounded" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} marginBottom={1}>
      <text fg={themeColor('info')}><b>Webhooks</b></text>
      <text fg={themeColor('muted')}> | </text>
      <text fg={themeColor('muted')}>
        {mode === 'list' ? 'q:close c:create d:delete p:pause/resume t:test e:events r:refresh' :
         mode === 'detail' ? 'esc:back r:reveal/hide secret e:events' :
         mode === 'events' ? 'esc:back' :
         mode === 'delete-confirm' ? 'y:confirm n:cancel' :
         mode === 'create-confirm' ? 'y:confirm n:cancel' :
         'Enter to continue'}
      </text>
    </box>
  );

  // Status message
  const statusBar = statusMessage ? (
    <box marginBottom={1}>
      <text fg={themeColor('warning')}>{statusMessage}</text>
    </box>
  ) : null;

  // Error bar
  const errorBar = error ? (
    <box marginBottom={1}>
      <text fg={themeColor('error')}>Error: {error}</text>
    </box>
  ) : null;

  // List view
  if (mode === 'list') {
    return (
      <box flexDirection="column">
        {header}
        {statusBar}
        {errorBar}
        {webhooks.length === 0 ? (
          <box paddingX={1}>
            <text fg={themeColor('muted')}>No webhooks registered. Press 'c' to create one.</text>
          </box>
        ) : (
          <box flexDirection="column" paddingX={1}>
            {webhooks.map((wh, i) => (
              <box key={wh.id}>
                <text fg={i === selectedIndex ? 'cyan' : undefined}>
                  {i === selectedIndex ? '▸ ' : '  '}
                </text>
                <text fg={STATUS_COLORS[wh.status]}>
                  {STATUS_ICONS[wh.status] || '?'}{' '}
                </text>
                <text attributes={i === selectedIndex ? 1 : undefined}><b>
                  {wh.name}
                </b></text>
                <text fg={themeColor('muted')}>
                  {' '}({wh.source}) | {wh.deliveryCount} events | Last: {formatRelativeTime(wh.lastDeliveryAt)}
                </text>
              </box>
            ))}
          </box>
        )}
      </box>
    );
  }

  // Detail view
  if (mode === 'detail' && selectedWebhook) {
    const maskedSecret = showSecret
      ? selectedWebhook.secret
      : selectedWebhook.secret.slice(0, 10) + '•'.repeat(20);

    return (
      <box flexDirection="column">
        {header}
        {statusBar}
        <box flexDirection="column" paddingX={1}>
          <text><b>{selectedWebhook.name}</b></text>
          <text> </text>
          <text>ID:          <text fg={themeColor('info')}>{selectedWebhook.id}</text></text>
          <text>Source:      {selectedWebhook.source}</text>
          <text>Status:      <text fg={STATUS_COLORS[selectedWebhook.status]}>{selectedWebhook.status}</text></text>
          {selectedWebhook.description && (
            <text>Description: {selectedWebhook.description}</text>
          )}
          <text>URL:         <text fg={themeColor('success')}>/api/v1/webhooks/receive/{selectedWebhook.id}</text></text>
          <text>Secret:      <text fg={showSecret ? 'yellow' : themeColor('muted')}>{maskedSecret}</text> <text fg={themeColor('muted')}>(r to {showSecret ? 'hide' : 'reveal'})</text></text>
          <text>Filter:      {selectedWebhook.eventsFilter.length > 0 ? selectedWebhook.eventsFilter.join(', ') : 'all events'}</text>
          <text>Deliveries:  {selectedWebhook.deliveryCount}</text>
          <text>Created:     {new Date(selectedWebhook.createdAt).toLocaleString()}</text>
          {selectedWebhook.lastDeliveryAt && (
            <text>Last Event:  {new Date(selectedWebhook.lastDeliveryAt).toLocaleString()}</text>
          )}
        </box>
      </box>
    );
  }

  // Events view
  if (mode === 'events') {
    return (
      <box flexDirection="column">
        {header}
        {events.length === 0 ? (
          <box paddingX={1}>
            <text fg={themeColor('muted')}>No events received yet.</text>
          </box>
        ) : (
          <box flexDirection="column" paddingX={1}>
            {events.map((evt) => (
              <box key={evt.id} flexDirection="column" marginBottom={1}>
                <box>
                  <text>{EVENT_STATUS_ICONS[evt.status] || '?'} </text>
                  <text><b>{evt.eventType}</b></text>
                  <text fg={themeColor('muted')}> ({evt.id})</text>
                </box>
                <box paddingLeft={2}>
                  <text fg={themeColor('muted')}>
                    {evt.source} | {evt.status} | {new Date(evt.timestamp).toLocaleString()}
                  </text>
                </box>
                <box paddingLeft={2}>
                  <text fg={themeColor('muted')} truncate={true} wrapMode="none">
                    {evt.preview}
                  </text>
                </box>
              </box>
            ))}
          </box>
        )}
      </box>
    );
  }

  // Delete confirm
  if (mode === 'delete-confirm' && selectedWebhook) {
    return (
      <box flexDirection="column">
        {header}
        <box paddingX={1} flexDirection="column">
          <text fg={themeColor('error')}><b>Delete webhook?</b></text>
          <text> </text>
          <text>This will permanently delete "{selectedWebhook.name}" ({selectedWebhook.id})</text>
          <text>and all its event history.</text>
          <text> </text>
          <text>Press 'y' to confirm, 'n' to cancel.</text>
        </box>
      </box>
    );
  }

  // Create wizard: name
  if (mode === 'create-name') {
    return (
      <box flexDirection="column">
        {header}
        <box paddingX={1} flexDirection="column">
          <text><b>Create Webhook</b></text>
          <text> </text>
          <box>
            <text>Name: </text>
            <input
              value={createName}
              onChange={setCreateName}
              onSubmit={() => {
                if (createName.trim()) {
                  setMode('create-source');
                }
              }}
              focused
              placeholder="e.g., gmail-notifications"
            />
          </box>
        </box>
      </box>
    );
  }

  // Create wizard: source
  if (mode === 'create-source') {
    return (
      <box flexDirection="column">
        {header}
        <box paddingX={1} flexDirection="column">
          <text><b>Create Webhook</b></text>
          <text>Name: {createName}</text>
          <text> </text>
          <box>
            <text>Source: </text>
            <input
              value={createSource}
              onChange={setCreateSource}
              onSubmit={() => {
                setMode('create-confirm');
              }}
              focused
              placeholder="e.g., gmail, notion, github, custom"
            />
          </box>
        </box>
      </box>
    );
  }

  // Create wizard: confirm
  if (mode === 'create-confirm') {
    return (
      <box flexDirection="column">
        {header}
        <box paddingX={1} flexDirection="column">
          <text><b>Confirm Webhook Creation</b></text>
          <text> </text>
          <text>Name:   {createName}</text>
          <text>Source: {createSource || 'custom'}</text>
          <text> </text>
          <text>Press 'y' to create, 'n' to cancel.</text>
        </box>
      </box>
    );
  }

  return (
    <box flexDirection="column">
      {header}
      <text fg={themeColor('muted')}>Loading...</text>
    </box>
  );
}
