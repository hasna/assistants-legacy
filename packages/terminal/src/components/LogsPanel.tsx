import React, { useState, useEffect, useMemo } from 'react';
import { getSecurityLogger, SecurityLogger } from '@hasna/assistants-core';
import type { SecurityEvent, Severity } from '@hasna/assistants-core';
import { useSafeInput as useInput } from '../hooks/useSafeInput';

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
  critical: 'red',
  high: 'yellow',
  medium: 'cyan',
  low: 'gray',
};

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

  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, filteredEvents.length - 1)));
  }, [filteredEvents.length]);

  const selectedEvent = filteredEvents[selectedIndex];

  useEffect(() => {
    if (mode === 'detail' && !selectedEvent) {
      setMode('list');
    }
  }, [mode, selectedEvent]);

  useInput((input, key) => {
    if (mode === 'detail') {
      if (key.escape || input === 'q' || input === 'Q') {
        setMode('list');
        return;
      }
      return;
    }

    // List mode
    if (key.escape || input === 'q' || input === 'Q') {
      onCancel();
      return;
    }

    if (key.return && filteredEvents.length > 0) {
      setMode('detail');
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => (prev === 0 ? Math.max(0, filteredEvents.length - 1) : prev - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => (prev >= filteredEvents.length - 1 ? 0 : prev + 1));
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
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg="cyan"><b>Log Entry Details</b></text>
        </box>

        <box flexDirection="column" borderStyle="rounded" borderColor="#d4d4d8" border={["top", "bottom"]} paddingX={1} paddingY={0}>
          <box><text><b>Timestamp: </b></text><text>{new Date(e.timestamp).toLocaleString()} ({formatRelativeTime(e.timestamp)})</text></box>
          <box><text><b>Severity: </b></text><text fg={severityColor}>{SEVERITY_ICONS[e.severity]} {e.severity}</text></box>
          <box><text><b>Event Type: </b></text><text>{EVENT_TYPE_LABELS[e.eventType] || e.eventType}</text></box>
          <box><text><b>Session: </b></text><text fg="gray">{e.sessionId}</text></box>

          <box marginTop={1}><text><b>Details:</b></text></box>
          {e.details.tool && (
            <box marginLeft={2}><text><b>Tool: </b></text><text>{e.details.tool}</text></box>
          )}
          {e.details.command && (
            <box marginLeft={2}><text><b>Command: </b></text><text fg="cyan" wrapMode="word">{e.details.command}</text></box>
          )}
          {e.details.path && (
            <box marginLeft={2}><text><b>Path: </b></text><text wrapMode="word">{e.details.path}</text></box>
          )}
          <box marginLeft={2}><text><b>Reason: </b></text><text wrapMode="word">{e.details.reason}</text></box>
        </box>

        <box marginTop={1}>
          <text fg="gray">Esc/q back</text>
        </box>
      </box>
    );
  }

  // ── List View ─────────────────────────────────────────────────────

  const hasFilters = severityFilter !== 'all' || eventTypeFilter !== 'all';

  return (
    <box flexDirection="column" paddingY={1}>
      <box flexDirection="row" marginBottom={1} justifyContent="space-between">
        <text><b>Security Logs</b></text>
        <text fg="gray">{String(filteredEvents.length)}{' event'}{filteredEvents.length !== 1 ? 's' : ''}</text>
      </box>

      {hasFilters && (
        <box marginBottom={1}>
          <text fg="gray">Filters: </text>
          {severityFilter !== 'all' && (
            <text fg={SEVERITY_COLORS[severityFilter]}>[severity: {severityFilter}] </text>
          )}
          {eventTypeFilter !== 'all' && (
            <text fg="cyan">[type: {eventTypeFilter}] </text>
          )}
        </box>
      )}

      <box flexDirection="column" borderStyle="rounded" borderColor="#d4d4d8" border={["top", "bottom"]} paddingX={1}>
        {filteredEvents.length === 0 ? (
          <box paddingY={1}>
            <text fg="gray">
              {allEvents.length === 0
                ? 'No security events recorded.'
                : 'No events match current filters.'}
            </text>
          </box>
        ) : (
          filteredEvents.map((event, index) => {
            const isSelected = index === selectedIndex;
            const severityColor = SEVERITY_COLORS[event.severity];
            const icon = SEVERITY_ICONS[event.severity];
            const time = formatRelativeTime(event.timestamp);
            const reason = event.details?.reason || event.details?.command || event.details?.path || 'n/a';

            return (
              <box key={`${event.timestamp}-${index}`} paddingY={0}>
                <text bg={isSelected ? "#0055aa" : undefined} fg={isSelected ? "whiteBright" : undefined}>
                  <span fg={severityColor}>{icon.padEnd(2)}</span>
                  {' '}{time.padEnd(8)}{' '}{event.eventType.padEnd(20)}{' '}{truncate(reason, 40)}
                </text>
              </box>
            );
          })
        )}
      </box>

      <box marginTop={1}>
        <text fg="gray">
          ↑↓ navigate | Enter details | [s]everity filter | [t]ype filter | [r]efresh | q quit
        </text>
      </box>
    </box>
  );
}
