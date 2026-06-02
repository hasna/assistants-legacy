import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { TelephonyManager, CallListItem, SmsListItem, PhoneNumber, RoutingRule, TelephonyStatus } from '@hasna/assistants-core';
import { Box, Inline, Text, TextInput, useInput } from '../ui/ink';
import { themeColor } from '../theme/colors';

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

  const submitSmsTo = (nextTo: string) => {
    setComposeTo(nextTo);
    if (nextTo.trim()) setComposeStep('body');
  };

  const submitSmsBody = async (nextBody: string) => {
    setComposeBody(nextBody);
    if (!nextBody.trim()) return;

    const result = await manager.sendSms(composeTo.trim(), nextBody.trim());
    setStatusMessage(result.success ? result.message : `Error: ${result.message}`);
    setMode('messages');
    setTab('messages');
    loadData();
  };

  const submitCallTo = async (nextTo: string) => {
    setComposeTo(nextTo);
    if (!nextTo.trim()) return;

    const result = await manager.makeCall(nextTo.trim());
    setStatusMessage(result.success ? result.message : `Error: ${result.message}`);
    setMode('calls');
    setTab('calls');
    loadData();
  };

  useInput((input, key) => {
    // Don't handle during text input modes
    if (mode === 'sms-compose' || mode === 'call-compose') return;

    if (key.escape || input === 'q') {
      onClose();
      return;
    }

    const tabShortcut = Number(input);
    if (Number.isInteger(tabShortcut) && tabShortcut >= 1 && tabShortcut <= tabs.length) {
      const nextTab = tabs[tabShortcut - 1];
      if (nextTab) {
        setTab(nextTab);
        setMode(nextTab);
        setSelectedIndex(0);
      }
      return;
    }

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

  const tabBar = (
    <Box marginBottom={1}>
      {tabs.map((item, index) => {
        const selected = item === tab;
        return (
          <Text
            key={item}
            bg={selected ? themeColor('primary') : undefined}
            fg={selected ? themeColor('text') : "gray"}
          >
            {index > 0 ? ' ' : ''}{index + 1}:{item}
          </Text>
        );
      })}
    </Box>
  );

  // Header
  const headerHint = mode === 'sms-compose' || mode === 'call-compose'
    ? 'esc cancel'
    : tab === 'numbers'
      ? 'q close | 1-5 tabs | s sms | c call | d default | r refresh'
      : 'q close | 1-5 tabs | s sms | c call | r refresh';

  const header = (
    <Box borderStyle="round" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} marginBottom={1}>
      <Text>
        <Inline fg={themeColor('secondary')} bold>Communication</Inline>
        <Inline fg={themeColor('muted')}>{' | '}{headerHint}</Inline>
      </Text>
    </Box>
  );

  const statusBar2 = statusMessage ? (
    <Box marginBottom={1}><Text fg={themeColor('warning')}>{statusMessage}</Text></Box>
  ) : null;

  const errorBar = error ? (
    <Box marginBottom={1}><Text fg={themeColor('error')}>Error: {error}</Text></Box>
  ) : null;

  // SMS compose
  if (mode === 'sms-compose') {
    return (
      <Box flexDirection="column">
        {header}
        <Box paddingX={1} flexDirection="column">
          <Text bold>Send SMS</Text>
          <Text> </Text>
          {composeStep === 'to' ? (
            <Box>
              <Text>To: </Text>
              <TextInput
                value={composeTo}
                onChange={setComposeTo}
                onSubmit={submitSmsTo}
                focus
                placeholder="+15551234567"
              />
            </Box>
          ) : (
            <Box flexDirection="column">
              <Text>To: {composeTo}</Text>
              <Box>
                <Text>Body: </Text>
                <TextInput
                  value={composeBody}
                  onChange={setComposeBody}
                  onSubmit={(nextBody) => {
                    void submitSmsBody(nextBody);
                  }}
                  focus
                  placeholder="Type your message..."
                />
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  // Call compose
  if (mode === 'call-compose') {
    return (
      <Box flexDirection="column">
        {header}
        <Box paddingX={1} flexDirection="column">
          <Text bold>Make Call</Text>
          <Text> </Text>
          <Box>
            <Text>To: </Text>
            <TextInput
              value={composeTo}
              onChange={setComposeTo}
              onSubmit={(nextTo) => {
                void submitCallTo(nextTo);
              }}
              focus
              placeholder="+15551234567"
            />
          </Box>
        </Box>
      </Box>
    );
  }

  // Overview tab
  if (tab === 'overview') {
    return (
      <Box flexDirection="column">
        {header}
        {tabBar}
        {statusBar2}
        {errorBar}
        <Box flexDirection="column" paddingX={1}>
          <Text bold>System Status</Text>
          <Text> </Text>
          {status ? (
            <>
              <Text>Twilio:       {status.twilioConfigured ? <Inline fg={themeColor('success')}>Connected</Inline> : <Inline fg={themeColor('error')}>Not configured</Inline>}</Text>
              <Text>ElevenLabs:   {status.elevenLabsConfigured ? <Inline fg={themeColor('success')}>Connected</Inline> : <Inline fg={themeColor('error')}>Not configured</Inline>}</Text>
              <Text>
                Default #:    {status.defaultPhoneNumber ? <Inline fg={themeColor('info')}>{status.defaultPhoneNumber}</Inline> : <Inline fg={themeColor('error')}>Not set</Inline>}{' '}
                {status.defaultPhoneNumberSource ? <Inline fg={themeColor('muted')}>{'('}{status.defaultPhoneNumberSource}{')'}</Inline> : null}
              </Text>
              <Text>{`Phone #s:     ${status.phoneNumbers}`}</Text>
              <Text>{`Active calls: ${status.activeCalls}`}</Text>
              <Text>{`Routes:       ${status.routingRules}`}</Text>
              <Text> </Text>
              <Text fg={themeColor('muted')}>Press 's' to send SMS, 'c' to make a call</Text>
              <Text> </Text>
              <Text bold>Quick Setup</Text>
              <Text fg={themeColor('muted')}>1) Set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN</Text>
              <Text fg={themeColor('muted')}>2) Run /communication sync to import numbers</Text>
              <Text fg={themeColor('muted')}>3) Pick a default number (numbers tab → 'd')</Text>
              <Text fg={themeColor('muted')}>4) Set telephony.webhookUrl for voice calls</Text>
            </>
          ) : (
            <Text fg={themeColor('muted')}>Loading...</Text>
          )}
        </Box>
      </Box>
    );
  }

  // Calls tab
  if (tab === 'calls') {
    return (
      <Box flexDirection="column">
        {header}
        {tabBar}
        {statusBar2}
        {errorBar}
        {calls.length === 0 ? (
          <Box paddingX={1}><Text fg={themeColor('muted')}>No call history. Press 'c' to make a call.</Text></Box>
        ) : (
          <Box flexDirection="column" paddingX={1}>
            {calls.map((call, i) => (
              <Box key={call.id}>
                <Text fg={i === selectedIndex ? themeColor('blue') : undefined}>
                  {i === selectedIndex ? '▸ ' : '  '}
                </Text>
                <Text fg={call.direction === 'inbound' ? themeColor('success') : themeColor('cyan')}>
                  {call.direction === 'inbound' ? 'IN ' : 'OUT'}
                </Text>
                <Text> {call.fromNumber} → {call.toNumber}</Text>
                <Text fg={themeColor('muted')}> | {call.status}</Text>
                {call.duration != null && <Text fg={themeColor('muted')}>{` | ${call.duration}s`}</Text>}
                <Text fg={themeColor('muted')}> | {formatRelativeTime(call.createdAt)}</Text>
                <Text fg={themeColor('muted')}> | by {resolveActor(call.assistantId)}</Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    );
  }

  // Messages tab
  if (tab === 'messages') {
    return (
      <Box flexDirection="column">
        {header}
        {tabBar}
        {statusBar2}
        {errorBar}
        {messages.length === 0 ? (
          <Box paddingX={1}><Text fg={themeColor('muted')}>No messages. Press 's' to send an SMS.</Text></Box>
        ) : (
          <Box flexDirection="column" paddingX={1}>
            {messages.map((msg, i) => (
              <Box key={msg.id} flexDirection="column">
                <Box>
                  <Text fg={i === selectedIndex ? themeColor('blue') : undefined}>
                    {i === selectedIndex ? '▸ ' : '  '}
                  </Text>
                  <Text fg={msg.direction === 'inbound' ? themeColor('success') : themeColor('cyan')}>
                    {msg.direction === 'inbound' ? 'IN ' : 'OUT'}
                  </Text>
                  <Text fg={msg.messageType === 'whatsapp' ? themeColor('success') : undefined}>
                    [{msg.messageType === 'whatsapp' ? 'WA' : 'SMS'}]
                  </Text>
                  <Text> {msg.fromNumber} → {msg.toNumber}</Text>
                  <Text fg={themeColor('muted')}> | {formatRelativeTime(msg.createdAt)}</Text>
                  <Text fg={themeColor('muted')}> | by {resolveActor(msg.assistantId)}</Text>
                </Box>
                <Box paddingLeft={4}>
                  <Text fg={themeColor('muted')}>{msg.bodyPreview}</Text>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    );
  }

  // Numbers tab
  if (tab === 'numbers') {
    return (
      <Box flexDirection="column">
        {header}
        {tabBar}
        {statusBar2}
        {errorBar}
        {numbers.length === 0 ? (
          <Box paddingX={1}><Text fg={themeColor('muted')}>No phone numbers. Run /communication sync to import from Twilio.</Text></Box>
        ) : (
          <Box flexDirection="column" paddingX={1}>
            {numbers.map((num, i) => {
              const caps: string[] = [];
              if (num.capabilities.voice) caps.push('voice');
              if (num.capabilities.sms) caps.push('sms');
              if (num.capabilities.whatsapp) caps.push('whatsapp');
              const isDefault = status?.defaultPhoneNumber === num.number;
              return (
                <Box key={num.id}>
                  <Text fg={i === selectedIndex ? themeColor('blue') : undefined}>
                    {i === selectedIndex ? '▸ ' : '  '}
                  </Text>
                  {isDefault && <Text fg={themeColor('warning')}>★ </Text>}
                  <Text attributes={i === selectedIndex ? 1 : undefined} bold>{num.number}</Text>
                  {num.friendlyName && <Text fg={themeColor('muted')}> ({num.friendlyName})</Text>}
                  <Text fg={themeColor('muted')}> [{caps.join(', ')}]{isDefault ? ' default' : ''}</Text>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    );
  }

  // Routes tab
  if (tab === 'routes') {
    return (
      <Box flexDirection="column">
        {header}
        {tabBar}
        {statusBar2}
        {errorBar}
        {routes.length === 0 ? (
          <Box paddingX={1}><Text fg={themeColor('muted')}>No routing rules configured.</Text></Box>
        ) : (
          <Box flexDirection="column" paddingX={1}>
            {routes.map((rule, i) => (
              <Box key={rule.id} flexDirection="column">
                <Box>
                  <Text fg={i === selectedIndex ? themeColor('blue') : undefined}>
                    {i === selectedIndex ? '▸ ' : '  '}
                  </Text>
                  <Text attributes={i === selectedIndex ? 1 : undefined} bold>{rule.name}</Text>
                  <Text fg={themeColor('muted')}>{` (priority: ${rule.priority})`}</Text>
                  {!rule.enabled && <Text fg={themeColor('error')}> [DISABLED]</Text>}
                </Box>
                <Box paddingLeft={4}>
                  <Text fg={themeColor('muted')}>
                    Type: {rule.messageType} → {rule.targetAssistantName}
                  </Text>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {header}
      <Text fg={themeColor('muted')}>Loading...</Text>
    </Box>
  );
}
