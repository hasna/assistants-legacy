import React, { useState, useEffect, useMemo } from 'react';
import { getSecurityLogger, SecurityLogger } from '@hasna/assistants-core';
import type { SecurityEvent, Severity } from '@hasna/assistants-core';
import { Box, Text, useInput } from '../ui/ink';
import { themeColor } from '../theme/colors';

interface LogsPanelProps {
  onCancel: () => void;
}

type Mode = 'list' | 'detail';
type SeverityFilter = 'all' | Severity;
type EventTypeFilter = 'all' | SecurityEvent['eventType'];

const SEVERITY_ICONS: Record<Severity, string> = {
  critical: '!!',
  high: '!',
  medium: '~',
  low: '.',
};

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: themeColor('error'),
  high: themeColor('warning'),
  medium: themeColor('info'),
  low: themeColor('muted'),
};

const MAX_VISIBLE_LOG_ROWS = 12;
const SEVERITY_CYCLE: SeverityFilter[] = ['all', 'critical', 'high', 'medium', 'low'];
const EVENT_TYPE_CYCLE: EventTypeFilter[] = ['all', 'blocked_command', 'path_violation', 'validation_failure'];

const EVENT_TYPE_LABELS: Record<SecurityEvent['eventType'], string> = {
  blocked_command: 'Blocked Command',
  path_violation: 'Path Violation',
  validation_failure: 'Validation Failure',
};

function formatRelativeTime(isoTimestamp: string): string {
  const now = Date.now();
  const ts = new Date(isoTimestamp).getTime();
  const diff = now - ts;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

function eventKey(event: SecurityEvent): string {
  return `${event.timestamp}|${event.eventType}|${event.severity}|${event.sessionId}|${JSON.stringify(event.details)}`;
}

function visibleWindow(selectedIndex: number, total: number): { start: number; end: number; above: number; below: number } {
  if (total <= MAX_VISIBLE_LOG_ROWS) {
    return { start: 0, end: total, above: 0, below: 0 };
  }

  const half = Math.floor(MAX_VISIBLE_LOG_ROWS / 2);
  let start = selectedIndex - half;
  let end = start + MAX_VISIBLE_LOG_ROWS;

  if (start < 0) {
    start = 0;
    end = MAX_VISIBLE_LOG_ROWS;
  }

  if (end > total) {
    end = total;
    start = Math.max(0, end - MAX_VISIBLE_LOG_ROWS);
  }

  return {
    start,
    end,
    above: start,
    below: total - end,
  };
}

function readAllEvents(): SecurityEvent[] {
  const logger = getSecurityLogger();
  const inMemory = logger.getEvents({});
  const persisted = SecurityLogger.readPersistedEvents({ logFile: logger.getLogFile() });
  const deduped = new Map<string, SecurityEvent>();
  for (const event of [...persisted, ...inMemory]) {
    deduped.set(eventKey(event), event);
  }
  const combined = Array.from(deduped.values());
  combined.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return combined;
}

export function LogsPanel({ onCancel }: LogsPanelProps) {
  const [mode, setMode] = useState<Mode>('list');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [eventTypeFilter, setEventTypeFilter] = useState<EventTypeFilter>('all');
  const [allEvents, setAllEvents] = useState<SecurityEvent[]>(() => readAllEvents());

  const loadEvents = () => {
    setAllEvents(readAllEvents());
  };

  useEffect(() => {
    loadEvents();
    const timer = setInterval(() => {
      loadEvents();
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const filteredEvents = useMemo(() => {
    return allEvents.filter((event) => {
      if (severityFilter !== 'all' && event.severity !== severityFilter) return false;
      if (eventTypeFilter !== 'all' && event.eventType !== eventTypeFilter) return false;
      return true;
    });
  }, [allEvents, severityFilter, eventTypeFilter]);

  const selectedEvent = filteredEvents[selectedIndex];

  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, filteredEvents.length - 1)));
  }, [filteredEvents.length]);

  useEffect(() => {
    if (mode === 'detail' && !selectedEvent) {
      setMode('list');
    }
  }, [mode, selectedEvent]);

  // Handle non-navigation keys (escape, filters, refresh)
  useInput((input, key) => {
    const isEscape = key.escape || input === '\x1b';

    if (mode === 'detail') {
      if (isEscape || input === 'q' || input === 'Q') {
        setMode('list');
        return;
      }
      return;
    }

    // List mode
    if (isEscape || input === 'q' || input === 'Q') {
      onCancel();
      return;
    }

    if (key.upArrow || input === 'k' || input === 'K') {
      if (filteredEvents.length === 0) return;
      setSelectedIndex((prev) => (prev === 0 ? filteredEvents.length - 1 : prev - 1));
      return;
    }

    if (key.downArrow || input === 'j' || input === 'J') {
      if (filteredEvents.length === 0) return;
      setSelectedIndex((prev) => (prev >= filteredEvents.length - 1 ? 0 : prev + 1));
      return;
    }

    if (key.return) {
      if (selectedEvent) setMode('detail');
      return;
    }

    // Severity filter cycle
    if (input === 's' || input === 'S') {
      setSeverityFilter((prev) => {
        const idx = SEVERITY_CYCLE.indexOf(prev);
        return SEVERITY_CYCLE[(idx + 1) % SEVERITY_CYCLE.length];
      });
      setSelectedIndex(0);
      return;
    }

    // Event type filter cycle
    if (input === 't' || input === 'T') {
      setEventTypeFilter((prev) => {
        const idx = EVENT_TYPE_CYCLE.indexOf(prev);
        return EVENT_TYPE_CYCLE[(idx + 1) % EVENT_TYPE_CYCLE.length];
      });
      setSelectedIndex(0);
      return;
    }

    // Manual refresh
    if (input === 'r' || input === 'R') {
      loadEvents();
      return;
    }
  });

  // ── Detail View ───────────────────────────────────────────────────

  if (mode === 'detail' && selectedEvent) {
    const e = selectedEvent;
    const severityColor = SEVERITY_COLORS[e.severity];

    return (
      <Box flexDirection="column" paddingY={1}>
        <Box marginBottom={1}>
          <Text fg={themeColor('info')} bold>Log Entry Details</Text>
        </Box>

        <Box flexDirection="column" borderStyle="round" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} paddingY={0}>
          <Box><Text bold>Timestamp: </Text><Text>{new Date(e.timestamp).toLocaleString()} ({formatRelativeTime(e.timestamp)})</Text></Box>
          <Box><Text bold>Severity: </Text><Text fg={severityColor}>{SEVERITY_ICONS[e.severity]} {e.severity}</Text></Box>
          <Box><Text bold>Event Type: </Text><Text>{EVENT_TYPE_LABELS[e.eventType] || e.eventType}</Text></Box>
          <Box><Text bold>Session: </Text><Text fg={themeColor('muted')}>{e.sessionId}</Text></Box>

          <Box marginTop={1}><Text bold>Details:</Text></Box>
          {e.details.tool && (
            <Box marginLeft={2}><Text bold>Tool: </Text><Text>{e.details.tool}</Text></Box>
          )}
          {e.details.command && (
            <Box marginLeft={2}><Text bold>Command: </Text><Text fg={themeColor('info')} wrapMode="word">{e.details.command}</Text></Box>
          )}
          {e.details.path && (
            <Box marginLeft={2}><Text bold>Path: </Text><Text wrapMode="word">{e.details.path}</Text></Box>
          )}
          <Box marginLeft={2}><Text bold>Reason: </Text><Text wrapMode="word">{e.details.reason}</Text></Box>
        </Box>

        <Box marginTop={1}>
          <Text fg={themeColor('muted')}>Esc/q back</Text>
        </Box>
      </Box>
    );
  }

  // ── List View ─────────────────────────────────────────────────────

  const hasFilters = severityFilter !== 'all' || eventTypeFilter !== 'all';
  const tableWindow = visibleWindow(selectedIndex, filteredEvents.length);
  const visibleEvents = filteredEvents.slice(tableWindow.start, tableWindow.end);

  return (
    <Box flexDirection="column" paddingY={1}>
      <Box flexDirection="row" marginBottom={1} justifyContent="space-between">
        <Text bold>Security Logs</Text>
        <Text fg={themeColor('muted')}>{String(filteredEvents.length)}{' event'}{filteredEvents.length !== 1 ? 's' : ''}</Text>
      </Box>

      {hasFilters && (
        <Box marginBottom={1}>
          <Text fg={themeColor('muted')}>Filters: </Text>
          {severityFilter !== 'all' && (
            <Text fg={SEVERITY_COLORS[severityFilter]}>[severity: {severityFilter}] </Text>
          )}
          {eventTypeFilter !== 'all' && (
            <Text fg={themeColor('info')}>[type: {eventTypeFilter}] </Text>
          )}
        </Box>
      )}

      <Box flexDirection="column" borderStyle="round" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1}>
        {filteredEvents.length === 0 ? (
          <Box paddingY={1}>
            <Text fg={themeColor('muted')}>
              {allEvents.length === 0
                ? 'No security events recorded.'
                : 'No events match current filters.'}
            </Text>
          </Box>
        ) : (
          <>
            {tableWindow.above > 0 ? (
              <Text fg={themeColor('muted')}>{`... ${tableWindow.above} more above`}</Text>
            ) : null}

            {visibleEvents.map((event, visibleIndex) => {
              const actualIndex = tableWindow.start + visibleIndex;
              const isSelected = actualIndex === selectedIndex;
              const icon = SEVERITY_ICONS[event.severity];
              const time = formatRelativeTime(event.timestamp);
              const reason = event.details?.reason || event.details?.command || event.details?.path || 'n/a';
              const row = `${isSelected ? '> ' : '  '}${icon.padEnd(2)} ${time.padEnd(8)} ${event.eventType.padEnd(20)} ${truncate(reason, 40)}`;
              return (
                <Text
                  key={eventKey(event)}
                  bg={isSelected ? themeColor('primary') : undefined}
                  fg={isSelected ? themeColor('text') : SEVERITY_COLORS[event.severity]}
                >
                  {row}
                </Text>
              );
            })}

            {tableWindow.below > 0 ? (
              <Text fg={themeColor('muted')}>{`... ${tableWindow.below} more below`}</Text>
            ) : null}
          </>
        )}
      </Box>

      <Box marginTop={1}>
        <Text fg={themeColor('muted')}>
          ↑↓ navigate | Enter details | [s]everity filter | [t]ype filter | [r]efresh | q quit
        </Text>
      </Box>
    </Box>
  );
}
