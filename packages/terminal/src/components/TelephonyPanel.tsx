import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { TelephonyManager, CallListItem, SmsListItem, PhoneNumber, RoutingRule, TelephonyStatus } from '@hasna/assistants-core';
import { useSafeInput as useInput } from '../hooks/useSafeInput';

interface TelephonyPanelProps {
  manager: TelephonyManager;
  assistantLookup?: Record<string, string>;
  onClose: () => void;
}

type Mode =
  | 'overview'
  | 'calls'
  | 'messages'
  | 'numbers'
  | 'routes'
  | 'sms-compose'
  | 'call-compose';

type Tab = 'overview' | 'calls' | 'messages' | 'numbers' | 'routes';

const MAX_VISIBLE_ROWS = 12;

function formatRelativeTime(isoDate: string | null | undefined): string {
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

function fit(value: string, width: number, align: 'left' | 'right' = 'left'): string {
  const raw = value || '';
  if (raw.length > width) {
    return width > 3 ? `${raw.slice(0, width - 3)}...` : raw.slice(0, width);
  }
  return align === 'right' ? raw.padStart(width, ' ') : raw.padEnd(width, ' ');
}

function visibleWindow(selectedIndex: number, total: number) {
  if (total <= MAX_VISIBLE_ROWS) {
    return { start: 0, end: total, above: 0, below: 0 };
  }

  const half = Math.floor(MAX_VISIBLE_ROWS / 2);
  let start = selectedIndex - half;
  let end = start + MAX_VISIBLE_ROWS;

  if (start < 0) {
    start = 0;
    end = MAX_VISIBLE_ROWS;
  }
  if (end > total) {
    end = total;
    start = Math.max(0, total - MAX_VISIBLE_ROWS);
  }

  return { start, end, above: start, below: total - end };
}

export function TelephonyPanel({ manager, assistantLookup, onClose }: TelephonyPanelProps) {
  const [mode, setMode] = useState<Mode>('overview');
  const [tab, setTab] = useState<Tab>('overview');
  const [status, setStatus] = useState<TelephonyStatus | null>(null);
  const [calls, setCalls] = useState<CallListItem[]>([]);
  const [messages, setMessages] = useState<SmsListItem[]>([]);
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [routes, setRoutes] = useState<RoutingRule[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Compose state
  const [composeTo, setComposeTo] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeStep, setComposeStep] = useState<'to' | 'body'>('to');

  const loadData = useCallback(() => {
    try {
      setStatus(manager.getStatus());
      setCalls(manager.getCallHistory({ limit: 200, scope: 'all' }));
      setMessages(manager.getSmsHistory({ limit: 200, scope: 'all' }));
      setNumbers(manager.listPhoneNumbers());
      setRoutes(manager.listRoutingRules());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [manager]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 2400);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  const listCount = useMemo(() => {
    switch (tab) {
      case 'calls':
        return calls.length;
      case 'messages':
        return messages.length;
      case 'numbers':
        return numbers.length;
      case 'routes':
        return routes.length;
      default:
        return 0;
    }
  }, [tab, calls.length, messages.length, numbers.length, routes.length]);

  useEffect(() => {
    const maxIndex = Math.max(0, listCount - 1);
    setSelectedIndex((prev) => Math.min(prev, maxIndex));
  }, [listCount]);

  const tableWindow = useMemo(
    () => visibleWindow(selectedIndex, listCount),
    [selectedIndex, listCount]
  );

  const visibleCalls = useMemo(
    () => calls.slice(tableWindow.start, tableWindow.end),
    [calls, tableWindow.start, tableWindow.end]
  );
  const visibleMessages = useMemo(
    () => messages.slice(tableWindow.start, tableWindow.end),
    [messages, tableWindow.start, tableWindow.end]
  );
  const visibleNumbers = useMemo(
    () => numbers.slice(tableWindow.start, tableWindow.end),
    [numbers, tableWindow.start, tableWindow.end]
  );
  const visibleRoutes = useMemo(
    () => routes.slice(tableWindow.start, tableWindow.end),
    [routes, tableWindow.start, tableWindow.end]
  );

  const resolveActor = useCallback((assistantId: string | null | undefined): string => {
    if (!assistantId) return 'unassigned';
    if (assistantId === 'system') return 'system';
    if (assistantLookup && assistantLookup[assistantId]) {
      return assistantLookup[assistantId];
    }
    return 'assistant';
  }, [assistantLookup]);

  const tabs: Tab[] = ['overview', 'calls', 'messages', 'numbers', 'routes'];

  useInput((input, key) => {
    // Don't handle during text input modes
    if (mode === 'sms-compose' || mode === 'call-compose') return;

    if (key.escape || input === 'q') {
      onClose();
      return;
    }

    // Tab switching handled by <tab-select> component

    // List navigation
    if (key.upArrow || input === 'k') {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((prev) => {
        const maxIndex = listCount - 1;
        return Math.min(Math.max(0, maxIndex), prev + 1);
      });
    }

    // Actions
    if (input === 's' && (tab === 'overview' || tab === 'messages')) {
      setComposeTo('');
      setComposeBody('');
      setComposeStep('to');
      setMode('sms-compose');
    } else if (input === 'c' && (tab === 'overview' || tab === 'calls')) {
      setComposeTo('');
      setComposeStep('to');
      setMode('call-compose');
    } else if (input === 'd' && tab === 'numbers' && numbers.length > 0) {
      const target = numbers[selectedIndex];
      if (target) {
        const result = manager.setDefaultPhoneNumber(target.number);
        setStatusMessage(result.success ? result.message : `Error: ${result.message}`);
        loadData();
      }
    } else if (input === 'r') {
      loadData();
      setStatusMessage('Refreshed');
    }
  });

  useInput((_input, key) => {
    if (mode !== 'sms-compose' && mode !== 'call-compose') return;
    if (key.escape) {
      setComposeTo('');
      setComposeBody('');
      setComposeStep('to');
      setMode(tab);
    }
  }, { isActive: mode === 'sms-compose' || mode === 'call-compose' });

  // Tab bar - uses OpenTUI <tab-select> intrinsic
  const tabSelectOptions = useMemo(() =>
    tabs.map((t, i) => ({
      name: `${i + 1}:${t}`,
      description: '',
      value: t,
    })), []);

  const tabBar = (
    <tab-select
      options={tabSelectOptions}
      selectedBackgroundColor="#0055aa"
      selectedTextColor="whiteBright"
      textColor="gray"
      showDescription={false}
      wrapSelection
      focused
      onChange={(index) => {
        const newTab = tabs[index];
        if (newTab) {
          setTab(newTab);
          setMode(newTab);
          setSelectedIndex(0);
        }
      }}
    />
  );

  // Header
  const headerHint = mode === 'sms-compose' || mode === 'call-compose'
    ? 'esc cancel'
    : tab === 'numbers'
      ? 'q close | 1-5 tabs | s sms | c call | d default | r refresh'
      : 'q close | 1-5 tabs | s sms | c call | r refresh';

  const header = (
    <box borderStyle="rounded" borderColor="#d4d4d8" border={["top", "bottom"]} paddingX={1} marginBottom={1}>
      <text><span fg="blue"><b>Communication</b></span><span fg="gray">{' | '}{headerHint}</span></text>
    </box>
  );

  const statusBar2 = statusMessage ? (
    <box marginBottom={1}><text fg="yellow">{statusMessage}</text></box>
  ) : null;

  const errorBar = error ? (
    <box marginBottom={1}><text fg="red">Error: {error}</text></box>
  ) : null;

  // SMS compose
  if (mode === 'sms-compose') {
    return (
      <box flexDirection="column">
        {header}
        <box paddingX={1} flexDirection="column">
          <text><b>Send SMS</b></text>
          <text> </text>
          {composeStep === 'to' ? (
            <box>
              <text>To: </text>
              <input
                value={composeTo}
                onChange={setComposeTo}
                onSubmit={() => {
                  if (composeTo.trim()) setComposeStep('body');
                }}
                focused
                placeholder="+15551234567"
              />
            </box>
          ) : (
            <box flexDirection="column">
              <text>To: {composeTo}</text>
              <box>
                <text>Body: </text>
                <input
                  value={composeBody}
                  onChange={setComposeBody}
                  onSubmit={async () => {
                    if (composeBody.trim()) {
                      const result = await manager.sendSms(composeTo.trim(), composeBody.trim());
                      setStatusMessage(result.success ? result.message : `Error: ${result.message}`);
                      setMode('messages');
                      setTab('messages');
                      loadData();
                    }
                  }}
                  focused
                  placeholder="Type your message..."
                />
              </box>
            </box>
          )}
        </box>
      </box>
    );
  }

  // Call compose
  if (mode === 'call-compose') {
    return (
      <box flexDirection="column">
        {header}
        <box paddingX={1} flexDirection="column">
          <text><b>Make Call</b></text>
          <text> </text>
          <box>
            <text>To: </text>
            <input
              value={composeTo}
              onChange={setComposeTo}
              onSubmit={async () => {
                if (composeTo.trim()) {
                  const result = await manager.makeCall(composeTo.trim());
                  setStatusMessage(result.success ? result.message : `Error: ${result.message}`);
                  setMode('calls');
                  setTab('calls');
                  loadData();
                }
              }}
              focused
              placeholder="+15551234567"
            />
          </box>
        </box>
      </box>
    );
  }

  // Overview tab
  if (tab === 'overview') {
    return (
      <box flexDirection="column">
        {header}
        {tabBar}
        {statusBar2}
        {errorBar}
        <box flexDirection="column" paddingX={1}>
          <text><b>System Status</b></text>
          <text> </text>
          {status ? (
            <>
              <text>Twilio:       {status.twilioConfigured ? <span fg="green">Connected</span> : <span fg="red">Not configured</span>}</text>
              <text>ElevenLabs:   {status.elevenLabsConfigured ? <span fg="green">Connected</span> : <span fg="red">Not configured</span>}</text>
              <text>Default #:    {status.defaultPhoneNumber ? <span fg="cyan">{status.defaultPhoneNumber}</span> : <span fg="red">Not set</span>}{' '}{status.defaultPhoneNumberSource ? <span fg="gray">{'('}{status.defaultPhoneNumberSource}{')'}</span> : null}</text>
              <text>{`Phone #s:     ${status.phoneNumbers}`}</text>
              <text>{`Active calls: ${status.activeCalls}`}</text>
              <text>{`Routes:       ${status.routingRules}`}</text>
              <text> </text>
              <text fg="gray">Press 's' to send SMS, 'c' to make a call</text>
              <text> </text>
              <text><b>Quick Setup</b></text>
              <text fg="gray">1) Set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN</text>
              <text fg="gray">2) Run /communication sync to import numbers</text>
              <text fg="gray">3) Pick a default number (numbers tab → 'd')</text>
              <text fg="gray">4) Set telephony.webhookUrl for voice calls</text>
            </>
          ) : (
            <text fg="gray">Loading...</text>
          )}
        </box>
      </box>
    );
  }

  // Calls tab
  if (tab === 'calls') {
    return (
      <box flexDirection="column">
        {header}
        {tabBar}
        {statusBar2}
        {errorBar}
        {calls.length === 0 ? (
          <box paddingX={1}><text fg="gray">No call history. Press 'c' to make a call.</text></box>
        ) : (
          <box flexDirection="column" paddingX={1}>
            {calls.map((call, i) => (
              <box key={call.id}>
                <text fg={i === selectedIndex ? 'blue' : undefined}>
                  {i === selectedIndex ? '▸ ' : '  '}
                </text>
                <text fg={call.direction === 'inbound' ? 'green' : 'cyan'}>
                  {call.direction === 'inbound' ? 'IN ' : 'OUT'}
                </text>
                <text> {call.fromNumber} → {call.toNumber}</text>
                <text fg="gray"> | {call.status}</text>
                {call.duration != null && <text fg="gray">{` | ${call.duration}s`}</text>}
                <text fg="gray"> | {formatRelativeTime(call.createdAt)}</text>
                <text fg="gray"> | by {resolveActor(call.assistantId)}</text>
              </box>
            ))}
          </box>
        )}
      </box>
    );
  }

  // Messages tab
  if (tab === 'messages') {
    return (
      <box flexDirection="column">
        {header}
        {tabBar}
        {statusBar2}
        {errorBar}
        {messages.length === 0 ? (
          <box paddingX={1}><text fg="gray">No messages. Press 's' to send an SMS.</text></box>
        ) : (
          <box flexDirection="column" paddingX={1}>
            {messages.map((msg, i) => (
              <box key={msg.id} flexDirection="column">
                <box>
                  <text fg={i === selectedIndex ? 'blue' : undefined}>
                    {i === selectedIndex ? '▸ ' : '  '}
                  </text>
                  <text fg={msg.direction === 'inbound' ? 'green' : 'cyan'}>
                    {msg.direction === 'inbound' ? 'IN ' : 'OUT'}
                  </text>
                  <text fg={msg.messageType === 'whatsapp' ? 'green' : undefined}>
                    [{msg.messageType === 'whatsapp' ? 'WA' : 'SMS'}]
                  </text>
                  <text> {msg.fromNumber} → {msg.toNumber}</text>
                  <text fg="gray"> | {formatRelativeTime(msg.createdAt)}</text>
                  <text fg="gray"> | by {resolveActor(msg.assistantId)}</text>
                </box>
                <box paddingLeft={4}>
                  <text fg="gray">{msg.bodyPreview}</text>
                </box>
              </box>
            ))}
          </box>
        )}
      </box>
    );
  }

  // Numbers tab
  if (tab === 'numbers') {
    return (
      <box flexDirection="column">
        {header}
        {tabBar}
        {statusBar2}
        {errorBar}
        {numbers.length === 0 ? (
          <box paddingX={1}><text fg="gray">No phone numbers. Run /communication sync to import from Twilio.</text></box>
        ) : (
          <box flexDirection="column" paddingX={1}>
            {numbers.map((num, i) => {
              const caps: string[] = [];
              if (num.capabilities.voice) caps.push('voice');
              if (num.capabilities.sms) caps.push('sms');
              if (num.capabilities.whatsapp) caps.push('whatsapp');
              const isDefault = status?.defaultPhoneNumber === num.number;
              return (
                <box key={num.id}>
                  <text fg={i === selectedIndex ? 'blue' : undefined}>
                    {i === selectedIndex ? '▸ ' : '  '}
                  </text>
                  {isDefault && <text fg="yellow">★ </text>}
                  <text attributes={i === selectedIndex ? 1 : undefined}><b>{num.number}</b></text>
                  {num.friendlyName && <text fg="gray"> ({num.friendlyName})</text>}
                  <text fg="gray"> [{caps.join(', ')}]{isDefault ? ' default' : ''}</text>
                </box>
              );
            })}
          </box>
        )}
      </box>
    );
  }

  // Routes tab
  if (tab === 'routes') {
    return (
      <box flexDirection="column">
        {header}
        {tabBar}
        {statusBar2}
        {errorBar}
        {routes.length === 0 ? (
          <box paddingX={1}><text fg="gray">No routing rules configured.</text></box>
        ) : (
          <box flexDirection="column" paddingX={1}>
            {routes.map((rule, i) => (
              <box key={rule.id} flexDirection="column">
                <box>
                  <text fg={i === selectedIndex ? 'blue' : undefined}>
                    {i === selectedIndex ? '▸ ' : '  '}
                  </text>
                  <text attributes={i === selectedIndex ? 1 : undefined}><b>{rule.name}</b></text>
                  <text fg="gray">{` (priority: ${rule.priority})`}</text>
                  {!rule.enabled && <text fg="red"> [DISABLED]</text>}
                </box>
                <box paddingLeft={4}>
                  <text fg="gray">
                    Type: {rule.messageType} → {rule.targetAssistantName}
                  </text>
                </box>
              </box>
            ))}
          </box>
        )}
      </box>
    );
  }

  return (
    <box flexDirection="column">
      {header}
      <text fg="gray">Loading...</text>
    </box>
  );
}
