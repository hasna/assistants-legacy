import React, { useState, useEffect } from 'react';
import type { BudgetConfig, BudgetLimits } from '@hasna/assistants-shared';
import type { BudgetStatus, BudgetScope } from '@hasna/assistants-core';
import { useSafeInput as useInput } from '../hooks/useSafeInput';
import { themeColor } from '../theme/colors';

interface BudgetPanelProps {
  config: BudgetConfig;
  sessionStatus: BudgetStatus;
  swarmStatus: BudgetStatus;
  onToggleEnabled: (enabled: boolean) => void;
  onReset: (scope: BudgetScope) => void;
  onSetLimits: (scope: BudgetScope, limits: Partial<BudgetLimits>) => void;
  onSetOnExceeded?: (action: 'warn' | 'pause' | 'stop') => void;
  onPrimaryAction?: () => void;
  primaryActionLabel?: string;
  primaryActionKey?: string;
  onCancel: () => void;
}

type Mode = 'overview' | 'limits' | 'edit-limits' | 'preset-select';

interface EditField {
  key: keyof BudgetLimits;
  label: string;
  unit: string;
  /** Multiplier to convert display value to stored value (e.g., minutes -> ms) */
  toStored: (display: number) => number;
  /** Multiplier to convert stored value to display value */
  toDisplay: (stored: number) => number;
}

const EDIT_FIELDS: EditField[] = [
  { key: 'maxTotalTokens', label: 'Max Total Tokens', unit: 'tokens', toStored: (v) => v, toDisplay: (v) => v },
  { key: 'maxInputTokens', label: 'Max Input Tokens', unit: 'tokens', toStored: (v) => v, toDisplay: (v) => v },
  { key: 'maxOutputTokens', label: 'Max Output Tokens', unit: 'tokens', toStored: (v) => v, toDisplay: (v) => v },
  { key: 'maxLlmCalls', label: 'Max LLM Calls', unit: 'calls', toStored: (v) => v, toDisplay: (v) => v },
  { key: 'maxToolCalls', label: 'Max Tool Calls', unit: 'calls', toStored: (v) => v, toDisplay: (v) => v },
  { key: 'maxDurationMs', label: 'Max Duration', unit: 'min', toStored: (v) => v * 60 * 1000, toDisplay: (v) => Math.round(v / 60000) },
];

const ON_EXCEEDED_OPTIONS: Array<'warn' | 'pause' | 'stop'> = ['warn', 'pause', 'stop'];

const PRESET_LIMITS = {
  light: {
    name: 'Light',
    description: 'Low limits for quick tasks',
    session: { maxTotalTokens: 50000, maxLlmCalls: 20, maxToolCalls: 50, maxDurationMs: 10 * 60 * 1000 },
  },
  moderate: {
    name: 'Moderate',
    description: 'Balanced limits for typical work',
    session: { maxTotalTokens: 200000, maxLlmCalls: 50, maxToolCalls: 200, maxDurationMs: 30 * 60 * 1000 },
  },
  heavy: {
    name: 'Heavy',
    description: 'High limits for complex tasks',
    session: { maxTotalTokens: 500000, maxLlmCalls: 100, maxToolCalls: 500, maxDurationMs: 60 * 60 * 1000 },
  },
  unlimited: {
    name: 'Unlimited',
    description: 'No limits (monitoring only)',
    session: {},
  },
};

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(ms: number): string {
  if (ms >= 3600000) return `${Math.round(ms / 3600000)}h`;
  if (ms >= 60000) return `${Math.round(ms / 60000)}m`;
  return `${Math.round(ms / 1000)}s`;
}

function usageBarText(used: number, limit?: number): string {
  if (!limit) return 'no limit';
  const percent = Math.min(100, Math.round((used / limit) * 100));
  const barWidth = 20;
  const filledWidth = Math.round((percent / 100) * barWidth);
  const emptyWidth = barWidth - filledWidth;
  return `${'█'.repeat(filledWidth)}${'░'.repeat(emptyWidth)} ${percent}%`;
}

function usageBarColor(used: number, limit?: number): string {
  if (!limit) return themeColor('muted');
  const percent = Math.min(100, Math.round((used / limit) * 100));
  if (percent >= 90) return 'red';
  if (percent >= 75) return 'yellow';
  return themeColor('success');
}

export function BudgetPanel({
  config,
  sessionStatus,
  swarmStatus,
  onToggleEnabled,
  onReset,
  onSetLimits,
  onSetOnExceeded,
  onPrimaryAction,
  primaryActionLabel = 'apply',
  primaryActionKey = 'a',
  onCancel,
}: BudgetPanelProps) {
  const [mode, setMode] = useState<Mode>('overview');
  const [selectedPreset, setSelectedPreset] = useState(0);

  // Edit-limits state
  const [editFieldIndex, setEditFieldIndex] = useState(0);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [editOnExceeded, setEditOnExceeded] = useState<'warn' | 'pause' | 'stop'>('warn');
  const [editingField, setEditingField] = useState(false);
  // Total fields = EDIT_FIELDS.length + 1 (onExceeded row)
  const totalEditRows = EDIT_FIELDS.length + 1;
  const primaryKey = (primaryActionKey || 'a').trim().toLowerCase() || 'a';

  const presetKeys = Object.keys(PRESET_LIMITS) as (keyof typeof PRESET_LIMITS)[];

  // Reset edit state when config or status changes externally
  useEffect(() => {
    if (mode !== 'overview') {
      setMode('overview');
    }
  }, [config, sessionStatus]);

  function initEditValues() {
    const limits = config.session || {};
    const values: Record<string, string> = {};
    for (const field of EDIT_FIELDS) {
      const stored = limits[field.key] as number | undefined;
      values[field.key] = stored ? String(field.toDisplay(stored)) : '';
    }
    setEditValues(values);
    setEditOnExceeded((config.onExceeded as 'warn' | 'pause' | 'stop') || 'warn');
    setEditFieldIndex(0);
    setEditingField(false);
  }

  function saveEditValues() {
    const newLimits: Partial<BudgetLimits> = {};
    for (const field of EDIT_FIELDS) {
      const raw = editValues[field.key];
      if (!raw || raw.trim() === '') {
        (newLimits as Record<string, number | undefined>)[field.key] = undefined;
        continue;
      }

      const num = parseInt(raw, 10);
      if (!isNaN(num) && num > 0) {
        (newLimits as Record<string, number>)[field.key] = field.toStored(num);
      } else {
        (newLimits as Record<string, number | undefined>)[field.key] = undefined;
      }
    }
    onSetLimits('session', newLimits);
    // Persist onExceeded action
    if (onSetOnExceeded) {
      onSetOnExceeded(editOnExceeded);
    }
    setMode('overview');
  }

  useInput((input, key) => {
    // Edit-limits mode
    if (mode === 'edit-limits') {
      if (editingField) {
        // Currently editing a field value
        if (key.return) {
          setEditingField(false);
          return;
        }
        if (key.escape) {
          setEditingField(false);
          return;
        }
        if (key.backspace || key.delete) {
          const fieldKey = editFieldIndex < EDIT_FIELDS.length ? EDIT_FIELDS[editFieldIndex].key : null;
          if (fieldKey) {
            setEditValues((prev) => ({
              ...prev,
              [fieldKey]: (prev[fieldKey] || '').slice(0, -1),
            }));
          }
          return;
        }
        // Only accept digits for numeric fields
        if (editFieldIndex < EDIT_FIELDS.length && /^\d$/.test(input)) {
          const fieldKey = EDIT_FIELDS[editFieldIndex].key;
          setEditValues((prev) => ({
            ...prev,
            [fieldKey]: (prev[fieldKey] || '') + input,
          }));
          return;
        }
        return;
      }

      // Not currently editing - navigation mode
      if (onPrimaryAction && input.toLowerCase() === primaryKey) {
        onPrimaryAction();
        return;
      }
      if (key.upArrow) {
        setEditFieldIndex((prev) => (prev === 0 ? totalEditRows - 1 : prev - 1));
        return;
      }
      if (key.downArrow) {
        setEditFieldIndex((prev) => (prev >= totalEditRows - 1 ? 0 : prev + 1));
        return;
      }
      if (key.return || input === ' ') {
        if (editFieldIndex < EDIT_FIELDS.length) {
          // Start editing a numeric field
          setEditingField(true);
        } else {
          // Cycle onExceeded option
          const currentIdx = ON_EXCEEDED_OPTIONS.indexOf(editOnExceeded);
          setEditOnExceeded(ON_EXCEEDED_OPTIONS[(currentIdx + 1) % ON_EXCEEDED_OPTIONS.length]);
        }
        return;
      }
      // Clear field value
      if (input === 'c' || input === 'C') {
        if (editFieldIndex < EDIT_FIELDS.length) {
          const fieldKey = EDIT_FIELDS[editFieldIndex].key;
          setEditValues((prev) => ({ ...prev, [fieldKey]: '' }));
        }
        return;
      }
      // Save
      if (input === 's' || input === 'S') {
        saveEditValues();
        return;
      }
      // Cancel / back
      if (key.escape || input === 'b' || input === 'B') {
        setMode('overview');
        return;
      }
      if (input === 'q' || input === 'Q') {
        onCancel();
        return;
      }
      return;
    }

    // Preset selection mode
    if (mode === 'preset-select') {
      if (onPrimaryAction && input.toLowerCase() === primaryKey) {
        onPrimaryAction();
        return;
      }
      if (key.upArrow) {
        setSelectedPreset((prev) => (prev === 0 ? presetKeys.length - 1 : prev - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedPreset((prev) => (prev >= presetKeys.length - 1 ? 0 : prev + 1));
        return;
      }
      if (key.return || input === ' ') {
        const preset = PRESET_LIMITS[presetKeys[selectedPreset]];
        onSetLimits('session', preset.session);
        onToggleEnabled(true);
        setMode('overview');
        return;
      }
      if (key.escape || input === 'b' || input === 'B') {
        setMode('overview');
        return;
      }
      if (input === 'q' || input === 'Q') {
        onCancel();
        return;
      }
      return;
    }

    // Overview mode shortcuts
    if (mode === 'overview') {
      if (onPrimaryAction && input.toLowerCase() === primaryKey) {
        onPrimaryAction();
        return;
      }
      // Toggle enabled
      if (input === 'e' || input === 'E') {
        onToggleEnabled(true);
        return;
      }
      if (input === 'd' || input === 'D') {
        onToggleEnabled(false);
        return;
      }

      // Reset usage
      if (input === 'r' || input === 'R') {
        onReset('session');
        return;
      }

      // View limits
      if (input === 'l' || input === 'L') {
        setMode('limits');
        return;
      }

      // Set preset
      if (input === 'p' || input === 'P') {
        setMode('preset-select');
        return;
      }

      // Edit limits
      if (key.return || input === 'i' || input === 'I') {
        initEditValues();
        setMode('edit-limits');
        return;
      }
    }

    // Limits mode
    if (mode === 'limits') {
      if (onPrimaryAction && input.toLowerCase() === primaryKey) {
        onPrimaryAction();
        return;
      }
      if (input === 'i' || input === 'I' || key.return) {
        initEditValues();
        setMode('edit-limits');
        return;
      }
      if (key.escape || input === 'b' || input === 'B') {
        setMode('overview');
        return;
      }
    }

    // Quit
    if (key.escape || input === 'q' || input === 'Q') {
      onCancel();
      return;
    }
  }, { isActive: true });

  // Edit-limits mode
  if (mode === 'edit-limits') {
    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text><b>Edit Budget Limits</b></text>
          <text fg={themeColor('muted')}> (session scope)</text>
        </box>

        <box flexDirection="column" borderStyle="rounded" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} paddingY={1}>
          {EDIT_FIELDS.map((field, index) => {
            const isSelected = index === editFieldIndex;
            const value = editValues[field.key] || '';
            const isEditing = isSelected && editingField;

            return (
              <box key={field.key} gap={1}>
                <text bg={isSelected ? themeColor('primary') : undefined} fg={isSelected ? themeColor('text') : undefined}>
                  {isSelected ? '>' : ' '}
                </text>
                <text attributes={isSelected ? 1 : undefined} fg={isSelected ? themeColor('text') : "gray"}><b>
                  {field.label.padEnd(20)}
                </b></text>
                <box minWidth={15}>
                  {isEditing ? (
                    <text>
                      <text fg={themeColor('info')}>{value}</text>
                      <text fg={themeColor('info')}><b>_</b></text>
                      <text fg={themeColor('muted')}> {field.unit}</text>
                    </text>
                  ) : (
                    <text fg={value ? undefined : themeColor('muted')}>
                      {value || 'unlimited'}
                      {value ? <text fg={themeColor('muted')}> {field.unit}</text> : null}
                    </text>
                  )}
                </box>
              </box>
            );
          })}

          {/* On Exceeded row */}
          <box gap={1} marginTop={1}>
            <text bg={editFieldIndex === EDIT_FIELDS.length ? themeColor('primary') : undefined} fg={editFieldIndex === EDIT_FIELDS.length ? themeColor('text') : undefined}>
              {editFieldIndex === EDIT_FIELDS.length ? '>' : ' '}
            </text>
            <text attributes={editFieldIndex === EDIT_FIELDS.length ? 1 : undefined} fg={editFieldIndex !== EDIT_FIELDS.length ? "gray" : undefined}><b>
              {'On Exceeded'.padEnd(20)}
            </b></text>
            <text fg={editOnExceeded === 'stop' ? 'red' : editOnExceeded === 'pause' ? 'yellow' : 'cyan'}>
              {editOnExceeded}
            </text>
            {editFieldIndex === EDIT_FIELDS.length && (
              <text fg={themeColor('muted')}> (Enter to cycle)</text>
            )}
          </box>
        </box>

        <box marginTop={1}>
          <text fg={themeColor('muted')}>
            {editingField
              ? 'Type digits | Enter/Esc to confirm'
              : `↑↓ navigate | Enter to edit | [c]lear | [s]ave | [b]ack | [q]uit${onPrimaryAction ? ` | [${primaryKey}] ${primaryActionLabel}` : ''}`}
          </text>
        </box>
      </box>
    );
  }

  // Preset selection mode
  if (mode === 'preset-select') {
    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text><b>Select Budget Preset</b></text>
        </box>

        <box flexDirection="column" borderStyle="rounded" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} paddingY={1}>
          {presetKeys.map((key, index) => {
            const preset = PRESET_LIMITS[key];
            const isSelected = index === selectedPreset;
            return (
              <box key={key} marginBottom={index < presetKeys.length - 1 ? 1 : 0}>
                <text bg={isSelected ? themeColor('primary') : undefined} fg={isSelected ? themeColor('text') : undefined}>
                  {isSelected ? '>' : ' '} <text attributes={isSelected ? 1 : undefined}><b>{preset.name.padEnd(12)}</b></text>
                  <text fg={isSelected ? themeColor('text') : "gray"}>{preset.description}</text>
                </text>
              </box>
            );
          })}
        </box>

        <box marginTop={1}>
          <text fg={themeColor('muted')}>
            ↑↓ navigate | Enter to select | [b]ack | [q]uit
            {onPrimaryAction ? ` | [${primaryKey}] ${primaryActionLabel}` : ''}
          </text>
        </box>
      </box>
    );
  }

  // Limits mode
  if (mode === 'limits') {
    const limits = config.session || {};

    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text><b>Budget Limits</b></text>
        </box>

        <box flexDirection="column" borderStyle="rounded" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} paddingY={1}>
          <box marginBottom={1}>
            <text><b>Session Limits:</b></text>
          </box>

          <box paddingLeft={1} flexDirection="column">
            <box>
              <text fg={themeColor('muted')}>Max Total Tokens: </text>
              <text>{limits.maxTotalTokens ? formatNumber(limits.maxTotalTokens) : 'unlimited'}</text>
            </box>
            <box>
              <text fg={themeColor('muted')}>Max Input Tokens: </text>
              <text>{limits.maxInputTokens ? formatNumber(limits.maxInputTokens) : 'unlimited'}</text>
            </box>
            <box>
              <text fg={themeColor('muted')}>Max Output Tokens: </text>
              <text>{limits.maxOutputTokens ? formatNumber(limits.maxOutputTokens) : 'unlimited'}</text>
            </box>
            <box>
              <text fg={themeColor('muted')}>Max LLM Calls: </text>
              <text>{limits.maxLlmCalls != null ? String(limits.maxLlmCalls) : 'unlimited'}</text>
            </box>
            <box>
              <text fg={themeColor('muted')}>Max Tool Calls: </text>
              <text>{limits.maxToolCalls != null ? String(limits.maxToolCalls) : 'unlimited'}</text>
            </box>
            <box>
              <text fg={themeColor('muted')}>Max Duration: </text>
              <text>{limits.maxDurationMs ? formatDuration(limits.maxDurationMs) : 'unlimited'}</text>
            </box>
          </box>

          <box marginTop={1}>
            <text fg={themeColor('muted')}>On Exceeded: </text>
            <text fg={config.onExceeded === 'stop' ? 'red' : config.onExceeded === 'pause' ? 'yellow' : 'cyan'}>
              {config.onExceeded || 'warn'}
            </text>
          </box>
        </box>

        <box marginTop={1}>
          <text fg={themeColor('muted')}>
            [i] edit | [b]ack | [q]uit
            {onPrimaryAction ? ` | [${primaryKey}] ${primaryActionLabel}` : ''}
          </text>
        </box>
      </box>
    );
  }

  // Overview mode (default)
  const { usage, limits, overallExceeded } = sessionStatus;

  return (
    <box flexDirection="column" paddingY={1}>
      <box marginBottom={1}>
        <text><b>Budget</b>{' — '}<span fg={config.enabled ? themeColor('success') : 'red'}>{config.enabled ? 'Enforcing' : 'Disabled'}</span></text>
      </box>

      <box flexDirection="column" borderStyle="rounded" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} paddingY={1}>
        {/* Status */}
        <box marginBottom={1}>
          <text><b>Status: </b><span fg={overallExceeded ? 'red' : config.enabled ? themeColor('success') : themeColor('muted')}>{overallExceeded ? 'EXCEEDED' : config.enabled ? 'Within limits' : 'Not enforcing'}</span></text>
        </box>

        {/* Usage */}
        <box flexDirection="column">
          <text fg={themeColor('muted')}><b>Session Usage:</b></text>

          <box marginTop={1} flexDirection="column">
            {/* Tokens */}
            <text>{'Tokens:'.padEnd(15)}{formatNumber(usage.totalTokens).padStart(8)}{limits.maxTotalTokens ? ` / ${formatNumber(limits.maxTotalTokens)}` : ''}{'  '}<span fg={usageBarColor(usage.totalTokens, limits.maxTotalTokens)}>{usageBarText(usage.totalTokens, limits.maxTotalTokens)}</span></text>

            {/* LLM Calls */}
            <text>{'LLM Calls:'.padEnd(15)}{String(usage.llmCalls).padStart(8)}{limits.maxLlmCalls ? ` / ${limits.maxLlmCalls}` : ''}{'  '}<span fg={usageBarColor(usage.llmCalls, limits.maxLlmCalls)}>{usageBarText(usage.llmCalls, limits.maxLlmCalls)}</span></text>

            {/* Tool Calls */}
            <text>{'Tool Calls:'.padEnd(15)}{String(usage.toolCalls).padStart(8)}{limits.maxToolCalls ? ` / ${limits.maxToolCalls}` : ''}{'  '}<span fg={usageBarColor(usage.toolCalls, limits.maxToolCalls)}>{usageBarText(usage.toolCalls, limits.maxToolCalls)}</span></text>

            {/* Duration */}
            <text>{'Duration:'.padEnd(15)}{formatDuration(usage.durationMs).padStart(8)}{limits.maxDurationMs ? ` / ${formatDuration(limits.maxDurationMs)}` : ''}{'  '}<span fg={usageBarColor(usage.durationMs, limits.maxDurationMs)}>{usageBarText(usage.durationMs, limits.maxDurationMs)}</span></text>
          </box>
        </box>

        {/* Warnings */}
        {sessionStatus.warningsCount > 0 && (
          <box marginTop={1}>
            <text fg={themeColor('warning')}>{`! ${sessionStatus.warningsCount} warning${sessionStatus.warningsCount !== 1 ? 's' : ''}`}</text>
          </box>
        )}

        {/* Exceeded */}
        {overallExceeded && (
          <box marginTop={1}>
            <text fg={themeColor('error')}><b>Budget exceeded! Action: {config.onExceeded || 'warn'}</b></text>
          </box>
        )}
      </box>

      <box marginTop={1}>
        <text fg={themeColor('muted')}>
          [e]nable [d]isable [r]eset [l]imits [p]reset [i] edit | [q]uit
          {onPrimaryAction ? ` | [${primaryKey}] ${primaryActionLabel}` : ''}
        </text>
      </box>
    </box>
  );
}
