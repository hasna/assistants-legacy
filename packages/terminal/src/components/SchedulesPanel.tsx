import React, { useState, useEffect } from 'react';
import { useClearOnChange } from '../hooks/useClearOnChange';
import type { ScheduledCommand } from '@hasna/assistants-shared';
import { useSafeInput as useInput } from '../hooks/useSafeInput';
import { themeColor } from '../theme/colors';

interface SchedulesPanelProps {
  schedules: ScheduledCommand[];
  sessionId: string;
  onPause: (id: string) => Promise<void>;
  onResume: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRun: (id: string) => Promise<void>;
  onCreate: (schedule: Omit<ScheduledCommand, 'id' | 'createdAt' | 'updatedAt' | 'nextRunAt'>) => Promise<void>;
  onRefresh: () => Promise<void>;
  onClose: () => void;
}

type Mode = 'list' | 'detail' | 'delete-confirm' | 'create';
type CreateStep = 'kind' | 'cron' | 'time' | 'interval' | 'command' | 'description' | 'confirm';
type ScheduleKind = 'once' | 'cron' | 'interval';

const STATUS_ICONS: Record<ScheduledCommand['status'], string> = {
  active: '●',
  paused: '◐',
  completed: '✓',
  error: '✗',
};

const STATUS_COLORS: Record<ScheduledCommand['status'], string | undefined> = {
  active: themeColor('success'),
  paused: 'yellow',
  completed: themeColor('muted'),
  error: 'red',
};

const KIND_LABELS: Record<string, string> = {
  once: 'One-time',
  cron: 'Cron',
  random: 'Random',
  interval: 'Interval',
};

const ACTION_ICONS: Record<string, string> = {
  command: '$',
  message: '>',
};

function getActionDisplay(schedule: ScheduledCommand): { type: string; content: string } {
  const actionType = schedule.actionType || 'command';
  if (actionType === 'message' && schedule.message) {
    return { type: 'message', content: schedule.message };
  }
  return { type: 'command', content: schedule.command };
}

function formatRelativeTime(timestamp: number | undefined): string {
  if (!timestamp) return 'n/a';
  const now = Date.now();
  const diff = timestamp - now;
  const absDiff = Math.abs(diff);
  const isPast = diff < 0;
  const seconds = Math.floor(absDiff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let timeStr: string;
  if (days > 0) timeStr = `${days}d ${hours % 24}h`;
  else if (hours > 0) timeStr = `${hours}h ${minutes % 60}m`;
  else if (minutes > 0) timeStr = `${minutes}m`;
  else timeStr = `${seconds}s`;

  return isPast ? `${timeStr} ago` : `in ${timeStr}`;
}

function formatAbsoluteTime(timestamp: number | undefined): string {
  if (!timestamp) return 'n/a';
  return new Date(timestamp).toLocaleString();
}

function getScheduleDescription(schedule: ScheduledCommand): string {
  const { kind, cron, at, interval, unit, minInterval, maxInterval } = schedule.schedule;
  switch (kind) {
    case 'once': return at ? `At ${at}` : 'One-time';
    case 'cron': return cron || 'Cron schedule';
    case 'interval': return `Every ${interval} ${unit || 'minutes'}`;
    case 'random': return `Random ${minInterval}-${maxInterval} ${unit || 'minutes'}`;
    default: return kind;
  }
}

const KIND_OPTIONS: { id: ScheduleKind; label: string; desc: string }[] = [
  { id: 'once', label: 'One-time', desc: 'Run once at a specific ISO date/time' },
  { id: 'cron', label: 'Cron', desc: 'Run on a cron schedule (e.g. "0 9 * * *")' },
  { id: 'interval', label: 'Interval', desc: 'Run every N minutes/hours' },
];

const INTERVAL_UNITS: Array<'seconds' | 'minutes' | 'hours'> = ['seconds', 'minutes', 'hours'];

export function SchedulesPanel({
  schedules,
  sessionId,
  onPause,
  onResume,
  onDelete,
  onRun,
  onCreate,
  onRefresh,
  onClose,
}: SchedulesPanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  useClearOnChange(mode);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // Create flow state
  const [createStep, setCreateStep] = useState<CreateStep>('kind');
  const [createKindIndex, setCreateKindIndex] = useState(0);
  const [createCron, setCreateCron] = useState('');
  const [createTime, setCreateTime] = useState('');
  const [createInterval, setCreateInterval] = useState('5');
  const [createIntervalUnitIndex, setCreateIntervalUnitIndex] = useState(1); // default: minutes
  const [createCommand, setCreateCommand] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const visibleSchedules = showAll
    ? schedules
    : schedules.filter((s) => s.sessionId === sessionId || !s.sessionId);

  const sortedSchedules = [...visibleSchedules].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (b.status === 'active' && a.status !== 'active') return 1;
    return (a.nextRunAt || Infinity) - (b.nextRunAt || Infinity);
  });

  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, sortedSchedules.length)));
  }, [sortedSchedules.length]);

  const selectedSchedule = sortedSchedules[selectedIndex];

  useEffect(() => {
    if ((mode === 'detail' || mode === 'delete-confirm') && !selectedSchedule) {
      setMode('list');
    }
  }, [mode, selectedSchedule]);

  function resetCreateState() {
    setCreateStep('kind');
    setCreateKindIndex(0);
    setCreateCron('');
    setCreateTime('');
    setCreateInterval('5');
    setCreateIntervalUnitIndex(1);
    setCreateCommand('');
    setCreateDescription('');
    setCreateError(null);
  }

  const getPreviousCreateStep = (): CreateStep | null => {
    const kind = KIND_OPTIONS[createKindIndex]?.id;
    switch (createStep) {
      case 'kind':
        return null;
      case 'cron':
      case 'time':
      case 'interval':
        return 'kind';
      case 'command':
        if (kind === 'interval') return 'interval';
        if (kind === 'cron') return 'cron';
        return 'time';
      case 'description':
        return 'command';
      case 'confirm':
        return 'description';
      default:
        return 'kind';
    }
  };

  async function handleCreateSubmit() {
    const kind = KIND_OPTIONS[createKindIndex].id;
    const command = createCommand.trim();
    if (!command) {
      setCreateError('Command is required');
      setCreateStep('command');
      return;
    }

    if (kind === 'once') {
      const when = createTime.trim();
      const parsed = new Date(when);
      if (!when || isNaN(parsed.getTime())) {
        setCreateError('A valid ISO date/time is required');
        setCreateStep('time');
        return;
      }
    }

    if (kind === 'cron') {
      const cron = createCron.trim();
      const parts = cron.split(/\s+/).filter(Boolean);
      if (!cron || parts.length < 5 || parts.length > 6) {
        setCreateError('Cron expression must have 5-6 fields');
        setCreateStep('cron');
        return;
      }
    }

    const schedule: Omit<ScheduledCommand, 'id' | 'createdAt' | 'updatedAt' | 'nextRunAt'> = {
      createdBy: 'user',
      sessionId,
      command,
      description: createDescription.trim() || undefined,
      status: 'active',
      schedule: { kind },
    };

    if (kind === 'once') {
      schedule.schedule.at = createTime.trim();
    } else if (kind === 'cron') {
      schedule.schedule.cron = createCron.trim();
    } else if (kind === 'interval') {
      const val = parseInt(createInterval, 10);
      if (isNaN(val) || val <= 0) {
        setCreateError('Interval must be a positive number');
        setCreateStep('interval');
        return;
      }
      schedule.schedule.kind = 'interval';
      schedule.schedule.interval = val;
      schedule.schedule.unit = INTERVAL_UNITS[createIntervalUnitIndex];
    }

    setIsSubmitting(true);
    setCreateError(null);
    try {
      await onCreate(schedule);
      resetCreateState();
      setMode('list');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  // Create mode input - non-text steps
  useInput((input, key) => {
    if (mode !== 'create') return;

    // Steps that use TextInput handle their own input
    if (createStep === 'cron' || createStep === 'time' || createStep === 'command' || createStep === 'description') return;

    if (key.escape) {
      const prevStep = getPreviousCreateStep();
      if (prevStep) {
        setCreateStep(prevStep);
      } else {
        resetCreateState();
        setMode('list');
      }
      return;
    }

    // Kind selection
    if (createStep === 'kind') {
      if (key.upArrow) {
        setCreateKindIndex((prev) => (prev === 0 ? KIND_OPTIONS.length - 1 : prev - 1));
        return;
      }
      if (key.downArrow) {
        setCreateKindIndex((prev) => (prev === KIND_OPTIONS.length - 1 ? 0 : prev + 1));
        return;
      }
      if (key.return) {
        const kind = KIND_OPTIONS[createKindIndex].id;
        if (kind === 'once') setCreateStep('time');
        else if (kind === 'cron') setCreateStep('cron');
        else if (kind === 'interval') setCreateStep('interval');
        return;
      }
    }

    // Interval config
    if (createStep === 'interval') {
      if (key.upArrow) {
        setCreateInterval((prev) => String(Math.max(1, (parseInt(prev, 10) || 1) + 1)));
        return;
      }
      if (key.downArrow) {
        setCreateInterval((prev) => String(Math.max(1, (parseInt(prev, 10) || 1) - 1)));
        return;
      }
      if (key.leftArrow) {
        setCreateIntervalUnitIndex((prev) => (prev === 0 ? INTERVAL_UNITS.length - 1 : prev - 1));
        return;
      }
      if (key.rightArrow) {
        setCreateIntervalUnitIndex((prev) => (prev === INTERVAL_UNITS.length - 1 ? 0 : prev + 1));
        return;
      }
      if (key.return) {
        setCreateStep('command');
        return;
      }
    }

    // Confirm step
    if (createStep === 'confirm') {
      if (key.return || input === 'y' || input === 'Y') {
        handleCreateSubmit();
        return;
      }
      if (input === 'n' || input === 'N') {
        resetCreateState();
        setMode('list');
        return;
      }
    }
  }, { isActive: mode === 'create' && createStep !== 'cron' && createStep !== 'time' && createStep !== 'command' && createStep !== 'description' });

  // Create mode input - text steps (allow Esc back)
  useInput((_input, key) => {
    if (mode !== 'create') return;
    if (createStep !== 'cron' && createStep !== 'time' && createStep !== 'command' && createStep !== 'description') return;

    if (key.escape) {
      const prevStep = getPreviousCreateStep();
      if (prevStep) {
        setCreateStep(prevStep);
      } else {
        resetCreateState();
        setMode('list');
      }
    }
  }, { isActive: mode === 'create' && (createStep === 'cron' || createStep === 'time' || createStep === 'command' || createStep === 'description') });

  // List/detail/delete mode input
  useInput((input, key) => {
    if (mode === 'create') return;

    if (mode === 'delete-confirm') {
      if (input === 'y' || input === 'Y') {
        if (selectedSchedule) {
          setIsSubmitting(true);
          onDelete(selectedSchedule.id).finally(() => {
            setIsSubmitting(false);
            setMode('list');
          });
        }
        return;
      }
      if (input === 'n' || input === 'N' || key.escape) {
        setMode('list');
        return;
      }
      return;
    }

    if (mode === 'detail') {
      if (key.escape || input === 'q' || input === 'Q') {
        setMode('list');
        return;
      }
      if (input === 'p' || input === 'P') {
        if (selectedSchedule && selectedSchedule.status === 'active') {
          setIsSubmitting(true);
          onPause(selectedSchedule.id).finally(() => setIsSubmitting(false));
        }
        return;
      }
      if (input === 'r' || input === 'R') {
        if (selectedSchedule && selectedSchedule.status === 'paused') {
          setIsSubmitting(true);
          onResume(selectedSchedule.id).finally(() => setIsSubmitting(false));
        } else if (selectedSchedule) {
          setIsSubmitting(true);
          onRun(selectedSchedule.id).finally(() => setIsSubmitting(false));
        }
        return;
      }
      if (input === 'd' || input === 'D') {
        setMode('delete-confirm');
        return;
      }
      return;
    }

    // List mode
    if (key.escape || input === 'q' || input === 'Q') {
      onClose();
      return;
    }

    if (input === 'n' || input === 'N') {
      resetCreateState();
      setMode('create');
      return;
    }

    if (key.return) {
      if (selectedIndex === sortedSchedules.length) {
        // "New schedule" option at bottom
        resetCreateState();
        setMode('create');
      } else if (sortedSchedules.length > 0) {
        setMode('detail');
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => (prev === 0 ? sortedSchedules.length : prev - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => (prev === sortedSchedules.length ? 0 : prev + 1));
      return;
    }

    if (input === 'p' || input === 'P') {
      if (selectedSchedule && selectedSchedule.status === 'active') {
        setIsSubmitting(true);
        onPause(selectedSchedule.id).finally(() => setIsSubmitting(false));
      }
      return;
    }
    if (input === 'r' || input === 'R') {
      if (selectedSchedule) {
        setIsSubmitting(true);
        if (selectedSchedule.status === 'paused') {
          onResume(selectedSchedule.id).finally(() => setIsSubmitting(false));
        } else {
          onRun(selectedSchedule.id).finally(() => setIsSubmitting(false));
        }
      }
      return;
    }
    if (input === 'd' || input === 'D') {
      if (selectedSchedule) setMode('delete-confirm');
      return;
    }
    if (input === 'g' || input === 'G') {
      setShowAll((prev) => !prev);
      setSelectedIndex(0);
      return;
    }
    if (input === 'f' || input === 'F') {
      setIsSubmitting(true);
      onRefresh().finally(() => setIsSubmitting(false));
      return;
    }

    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= 1 && num <= sortedSchedules.length) {
      setSelectedIndex(num - 1);
      return;
    }
  }, { isActive: mode !== 'create' });

  // ── Create mode UI ──────────────────────────────────────────────

  if (mode === 'create') {
    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg={themeColor('info')}><b>New Schedule</b></text>
        </box>

        <box flexDirection="column" borderStyle="rounded" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} paddingY={1}>
          {/* Step 1: Kind selection */}
          {createStep === 'kind' && (
            <box flexDirection="column">
              <text><b>Select schedule type:</b></text>
              <box flexDirection="column" marginTop={1}>
                {KIND_OPTIONS.map((opt, idx) => (
                  <box key={opt.id}>
                    <text bg={idx === createKindIndex ? themeColor('primary') : undefined}>
                      {idx === createKindIndex ? '>' : ' '} {opt.label.padEnd(12)} <span fg={themeColor('muted')}>{opt.desc}</span>
                    </text>
                  </box>
                ))}
              </box>
              <box marginTop={1}>
                <text fg={themeColor('muted')}>↑↓ select | Enter confirm | Esc cancel</text>
              </box>
            </box>
          )}

          {/* Step 2a: Cron expression */}
          {createStep === 'cron' && (
            <box flexDirection="column">
              <text><b>Enter cron expression:</b></text>
              <box flexDirection="row" marginTop={1}>
                <text>Cron: </text>
                <input
                  value={createCron}
                  onChange={setCreateCron}
                  onSubmit={() => {
                    const parts = createCron.trim().split(/\s+/);
                    if (parts.length >= 5 && parts.length <= 6) {
                      setCreateStep('command');
                    }
                  }}
                  focused
                  placeholder='e.g. "0 9 * * *" (daily at 9am, 5-6 fields)'
                />
              </box>
              <box marginTop={1}>
                <text fg={themeColor('muted')}>Enter confirm | Esc back</text>
              </box>
            </box>
          )}

          {/* Step 2b: One-time ISO date */}
          {createStep === 'time' && (
            <box flexDirection="column">
              <text><b>Enter date/time (ISO 8601):</b></text>
              <box flexDirection="row" marginTop={1}>
                <text>Time: </text>
                <input
                  value={createTime}
                  onChange={setCreateTime}
                  onSubmit={() => {
                    const parsed = new Date(createTime.trim());
                    if (!isNaN(parsed.getTime()) && createTime.trim()) {
                      setCreateStep('command');
                    }
                  }}
                  focused
                  placeholder="e.g. 2026-02-08T09:00:00 (valid ISO date)"
                />
              </box>
              <box marginTop={1}>
                <text fg={themeColor('muted')}>Enter confirm | Esc back</text>
              </box>
            </box>
          )}

          {/* Step 2c: Interval config */}
          {createStep === 'interval' && (
            <box flexDirection="column">
              <text><b>Configure interval:</b></text>
              <box flexDirection="row" marginTop={1}>
                <text>Every </text>
                <text fg={themeColor('info')}><b>{createInterval}</b></text>
                <text> </text>
                <text fg={themeColor('info')}><b>{INTERVAL_UNITS[createIntervalUnitIndex]}</b></text>
              </box>
              <box marginTop={1}>
                <text fg={themeColor('muted')}>↑↓ change value | ←→ change unit | Enter confirm | Esc back</text>
              </box>
            </box>
          )}

          {/* Step 3: Command to execute */}
          {createStep === 'command' && (
            <box flexDirection="column">
              <text><b>Enter command to execute:</b></text>
              <box flexDirection="row" marginTop={1}>
                <text>$ </text>
                <input
                  value={createCommand}
                  onChange={setCreateCommand}
                  onSubmit={() => {
                    if (createCommand.trim()) setCreateStep('description');
                  }}
                  focused
                  placeholder="e.g. /summarize or any slash command"
                />
              </box>
              <box marginTop={1}>
                <text fg={themeColor('muted')}>Enter next | Esc back</text>
              </box>
            </box>
          )}

          {/* Step 4: Optional description */}
          {createStep === 'description' && (
            <box flexDirection="column">
              <text><b>Description (optional):</b></text>
              <box marginTop={1}>
                <input
                  value={createDescription}
                  onChange={setCreateDescription}
                  onSubmit={() => setCreateStep('confirm')}
                  focused
                  placeholder="What does this schedule do?"
                />
              </box>
              <box marginTop={1}>
                <text fg={themeColor('muted')}>Enter next | Esc back</text>
              </box>
            </box>
          )}

          {/* Step 5: Confirm */}
          {createStep === 'confirm' && (
            <box flexDirection="column">
              <text><b>Confirm new schedule:</b></text>
              <box flexDirection="column" marginTop={1} marginLeft={1}>
                <text>Type: <span fg={themeColor('info')}>{KIND_OPTIONS[createKindIndex].label}</span></text>
                {KIND_OPTIONS[createKindIndex].id === 'cron' && (
                  <text>Cron: <span fg={themeColor('info')}>{createCron}</span></text>
                )}
                {KIND_OPTIONS[createKindIndex].id === 'once' && (
                  <text>Time: <span fg={themeColor('info')}>{createTime}</span></text>
                )}
                {KIND_OPTIONS[createKindIndex].id === 'interval' && (
                  <text>Interval: <span fg={themeColor('info')}>Every {createInterval} {INTERVAL_UNITS[createIntervalUnitIndex]}</span></text>
                )}
                <text>Command: <span fg={themeColor('info')}>{createCommand}</span></text>
                {createDescription && <text>Description: <span fg={themeColor('muted')}>{createDescription}</span></text>}
              </box>
              <box marginTop={1}>
                <text fg={themeColor('muted')}>Enter/y create | n cancel | Esc back</text>
              </box>
            </box>
          )}

          {createError && (
            <box marginTop={1}>
              <text fg={themeColor('error')}>{createError}</text>
            </box>
          )}
        </box>

        {isSubmitting && (
          <box marginTop={1}>
            <text fg={themeColor('warning')}>Creating schedule...</text>
          </box>
        )}
      </box>
    );
  }

  // ── Delete confirmation ─────────────────────────────────────────

  if (mode === 'delete-confirm') {
    const action = selectedSchedule ? getActionDisplay(selectedSchedule) : { type: 'command', content: '' };
    const displayContent = action.content.slice(0, 50) + (action.content.length > 50 ? '...' : '');
    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg={themeColor('error')}><b>Delete Schedule</b></text>
        </box>
        <box marginBottom={1}>
          <text>
            Delete {action.type}: &quot;{displayContent}&quot;?
          </text>
        </box>
        <box marginTop={1}>
          <text>
            Press <span fg={themeColor('success')}><b>y</b></span> to confirm or{' '}
            <span fg={themeColor('error')}><b>n</b></span> to cancel
          </text>
        </box>
      </box>
    );
  }

  // ── Detail mode ─────────────────────────────────────────────────

  if (mode === 'detail' && selectedSchedule) {
    const s = selectedSchedule;
    const statusIcon = STATUS_ICONS[s.status];
    const statusColor = STATUS_COLORS[s.status];

    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg={themeColor('info')}><b>Schedule Details</b></text>
        </box>

        <box flexDirection="column" borderStyle="rounded" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} paddingY={0}>
          <box><text><b>ID: </b></text><text>{s.id}</text></box>
          <box><text><b>Status: </b></text><text fg={statusColor}>{statusIcon} {s.status}</text></box>
          <box><text><b>Type: </b></text><text>{KIND_LABELS[s.schedule.kind] || s.schedule.kind}</text></box>
          <box><text><b>Schedule: </b></text><text>{getScheduleDescription(s)}</text></box>
          {s.description && <box><text><b>Description: </b></text><text>{s.description}</text></box>}

          <box marginTop={1}><text><b>Command: </b></text></box>
          <box marginLeft={2}><text wrapMode="word" fg={themeColor('info')}>{s.command}</text></box>

          {s.message && (
            <>
              <box marginTop={1}><text><b>Message: </b></text></box>
              <box marginLeft={2}><text wrapMode="word">{s.message}</text></box>
            </>
          )}

          <box marginTop={1}><text><b>Next Run: </b></text>
            <text fg={s.status === 'active' ? themeColor('success') : undefined}>
              {formatAbsoluteTime(s.nextRunAt)} ({formatRelativeTime(s.nextRunAt)})
            </text>
          </box>
          <box><text><b>Last Run: </b></text><text>{formatAbsoluteTime(s.lastRunAt)}</text></box>

          {s.lastResult && (
            <box><text><b>Last Result: </b></text>
              <text fg={s.lastResult.ok ? themeColor('success') : themeColor('red')}>
                {s.lastResult.ok ? 'Success' : `Error: ${s.lastResult.error}`}
              </text>
            </box>
          )}

          <box><text><b>Created: </b></text><text>{formatAbsoluteTime(s.createdAt)} by {s.createdBy}</text></box>
        </box>

        <box marginTop={1}>
          <text fg={themeColor('muted')}>
            {s.status === 'active' ? '[p]ause' : s.status === 'paused' ? '[r]esume' : ''}{' '}
            [r]un now | [d]elete | Esc/q back
          </text>
        </box>

        {isSubmitting && <box marginTop={1}><text fg={themeColor('warning')}>Processing...</text></box>}
      </box>
    );
  }

  // ── List mode ───────────────────────────────────────────────────

  const activeCount = visibleSchedules.filter((s) => s.status === 'active').length;
  const pausedCount = visibleSchedules.filter((s) => s.status === 'paused').length;
  const completedCount = visibleSchedules.filter((s) => s.status === 'completed').length;
  const errorCount = visibleSchedules.filter((s) => s.status === 'error').length;

  return (
    <box flexDirection="column" paddingY={1}>
      <box flexDirection="row" marginBottom={1} justifyContent="space-between">
        <text><b>Schedules {showAll ? '(all sessions)' : '(this session)'}</b></text>
        <text fg={themeColor('muted')}>[n]ew [p]ause [r]esume [d]elete re[f]resh to[g]gle scope</text>
      </box>

      <box marginBottom={1}>
        <text fg={themeColor('muted')}>
          {activeCount} active, {pausedCount} paused, {completedCount} done, {errorCount} errors
        </text>
      </box>

      <box flexDirection="column" borderStyle="rounded" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1}>
        {sortedSchedules.length === 0 ? (
          <box paddingY={1}>
            <text fg={themeColor('muted')}>No schedules. Press n to create one.</text>
          </box>
        ) : (
          sortedSchedules.map((schedule, index) => {
            const isSelected = index === selectedIndex;
            const statusIcon = STATUS_ICONS[schedule.status];
            const statusColor = STATUS_COLORS[schedule.status];
            const nextRun = formatRelativeTime(schedule.nextRunAt);
            const action = getActionDisplay(schedule);
            const actionIcon = ACTION_ICONS[action.type];
            const content = action.content.slice(0, 30) + (action.content.length > 30 ? '...' : '');
            const kindLabel = KIND_LABELS[schedule.schedule.kind] || schedule.schedule.kind;

            return (
              <box key={schedule.id} paddingY={0}>
                <text bg={isSelected ? themeColor('primary') : undefined} fg={isSelected ? themeColor('text') : schedule.status === 'completed' ? "gray" : undefined}>
                  <span fg={statusColor}>{statusIcon}</span>
                  {' '}
                  {actionIcon} {index + 1}. {content.padEnd(32)} {kindLabel.padEnd(10)} {nextRun}
                </text>
              </box>
            );
          })
        )}

        {/* New schedule option at bottom */}
        <box marginTop={1} paddingY={0}>
          <text
            bg={selectedIndex === sortedSchedules.length ? themeColor('primary') : undefined}
            fg={selectedIndex === sortedSchedules.length ? themeColor('text') : undefined}
          >
            + New schedule (n)
          </text>
        </box>
      </box>

      {/* Compact preview of selected */}
      {sortedSchedules.length > 0 && selectedSchedule && selectedIndex < sortedSchedules.length && (
        <box marginTop={1}>
          <text fg={themeColor('muted')}>
            {getScheduleDescription(selectedSchedule)} | {selectedSchedule.status} | Enter for details
          </text>
        </box>
      )}

      <box marginTop={1}>
        <text fg={themeColor('muted')}>Enter view | ↑↓ navigate | q quit</text>
      </box>

      {isSubmitting && <box marginTop={1}><text fg={themeColor('warning')}>Processing...</text></box>}
    </box>
  );
}
