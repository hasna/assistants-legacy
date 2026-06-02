import React, { useState, useEffect, useRef } from 'react';
import type { BudgetConfig, BudgetLimits } from '@hasna/assistants-shared';
import type { BudgetStatus, BudgetScope } from '@hasna/assistants-core';
import { Box, Text, TextInput, useInput } from '../ui/ink';
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
  if (percent >= 90) return themeColor('error');
  if (percent >= 75) return themeColor('warning');
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
  const ignoreNextEditSubmitRef = useRef(false);
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

  function startEditingField() {
    ignoreNextEditSubmitRef.current = true;
    setEditingField(true);
  }

  useInput((input, key) => {
    // Edit-limits mode
    if (mode === 'edit-limits') {
      if (editingField) {
        if (key.escape || input === '\x1b') {
          setEditingField(false);
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
          startEditingField();
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
      if (key.escape || input === '\x1b' || input === 'b' || input === 'B') {
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
      if (key.escape || input === '\x1b' || input === 'b' || input === 'B') {
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
      if (key.escape || input === '\x1b' || input === 'b' || input === 'B') {
        setMode('overview');
        return;
      }
    }

    // Quit
    if (key.escape || input === '\x1b' || input === 'q' || input === 'Q') {
      onCancel();
      return;
    }
  }, { isActive: !editingField });

  // Edit-limits mode
  if (mode === 'edit-limits') {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Box marginBottom={1}>
          <Text bold>Edit Budget Limits</Text>
          <Text fg={themeColor('muted')}> (session scope)</Text>
        </Box>

        <Box flexDirection="column" borderStyle="round" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} paddingY={1}>
          {EDIT_FIELDS.map((field, index) => {
            const isSelected = index === editFieldIndex;
            const value = editValues[field.key] || '';
            const isEditing = isSelected && editingField;

            return (
              <Box key={field.key} gap={1}>
                <Text bg={isSelected ? themeColor('primary') : undefined} fg={isSelected ? themeColor('text') : undefined}>
                  {isSelected ? '>' : ' '}
                </Text>
                <Text attributes={isSelected ? 1 : undefined} fg={isSelected ? themeColor('text') : themeColor('muted')} bold>
                  {field.label.padEnd(20)}
                </Text>
                <Box minWidth={15}>
                  {isEditing ? (
                    <Box>
                      <TextInput
                        value={value}
                        onChange={(nextValue) => {
                          const digitsOnly = nextValue.replace(/\D/g, '');
                          if (digitsOnly !== value) {
                            ignoreNextEditSubmitRef.current = false;
                          }
                          setEditValues((prev) => ({ ...prev, [field.key]: digitsOnly }));
                        }}
                        onSubmit={() => {
                          if (ignoreNextEditSubmitRef.current) {
                            ignoreNextEditSubmitRef.current = false;
                            return;
                          }
                          setEditingField(false);
                        }}
                        focus
                        placeholder=""
                      />
                      <Text fg={themeColor('muted')}> {field.unit}</Text>
                    </Box>
                  ) : (
                    <Text fg={value ? undefined : themeColor('muted')}>
                      {value || 'unlimited'}
                      {value ? <Text fg={themeColor('muted')}> {field.unit}</Text> : null}
                    </Text>
                  )}
                </Box>
              </Box>
            );
          })}

          {/* On Exceeded row */}
          <Box gap={1} marginTop={1}>
            <Text bg={editFieldIndex === EDIT_FIELDS.length ? themeColor('primary') : undefined} fg={editFieldIndex === EDIT_FIELDS.length ? themeColor('text') : undefined}>
              {editFieldIndex === EDIT_FIELDS.length ? '>' : ' '}
            </Text>
            <Text attributes={editFieldIndex === EDIT_FIELDS.length ? 1 : undefined} fg={editFieldIndex !== EDIT_FIELDS.length ? themeColor('muted') : undefined} bold>
              {'On Exceeded'.padEnd(20)}
            </Text>
            <Text fg={editOnExceeded === 'stop' ? themeColor('error') : editOnExceeded === 'pause' ? themeColor('warning') : themeColor('info')}>
              {editOnExceeded}
            </Text>
            {editFieldIndex === EDIT_FIELDS.length && (
              <Text fg={themeColor('muted')}> (Enter to cycle)</Text>
            )}
          </Box>
        </Box>

        <Box marginTop={1}>
          <Text fg={themeColor('muted')}>
            {editingField
              ? 'Type digits | Enter/Esc to confirm'
              : `↑↓ navigate | Enter to edit | [c]lear | [s]ave | [b]ack | [q]uit${onPrimaryAction ? ` | [${primaryKey}] ${primaryActionLabel}` : ''}`}
          </Text>
        </Box>
      </Box>
    );
  }

  // Preset selection mode
  if (mode === 'preset-select') {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Box marginBottom={1}>
          <Text bold>Select Budget Preset</Text>
        </Box>

        <Box flexDirection="column" borderStyle="round" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} paddingY={1}>
          {presetKeys.map((key, index) => {
            const preset = PRESET_LIMITS[key];
            const isSelected = index === selectedPreset;
            return (
              <Box key={key} marginBottom={index < presetKeys.length - 1 ? 1 : 0}>
                <Text bg={isSelected ? themeColor('primary') : undefined} fg={isSelected ? themeColor('text') : undefined}>
                  {isSelected ? '>' : ' '} <Text attributes={isSelected ? 1 : undefined} bold>{preset.name.padEnd(12)}</Text>
                  <Text fg={isSelected ? themeColor('text') : themeColor('muted')}>{preset.description}</Text>
                </Text>
              </Box>
            );
          })}
        </Box>

        <Box marginTop={1}>
          <Text fg={themeColor('muted')}>
            ↑↓ navigate | Enter to select | [b]ack | [q]uit
            {onPrimaryAction ? ` | [${primaryKey}] ${primaryActionLabel}` : ''}
          </Text>
        </Box>
      </Box>
    );
  }

  // Limits mode
  if (mode === 'limits') {
    const limits = config.session || {};

    return (
      <Box flexDirection="column" paddingY={1}>
        <Box marginBottom={1}>
          <Text bold>Budget Limits</Text>
        </Box>

        <Box flexDirection="column" borderStyle="round" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} paddingY={1}>
          <Box marginBottom={1}>
            <Text bold>Session Limits:</Text>
          </Box>

          <Box paddingLeft={1} flexDirection="column">
            <Box>
              <Text fg={themeColor('muted')}>Max Total Tokens: </Text>
              <Text>{limits.maxTotalTokens ? formatNumber(limits.maxTotalTokens) : 'unlimited'}</Text>
            </Box>
            <Box>
              <Text fg={themeColor('muted')}>Max Input Tokens: </Text>
              <Text>{limits.maxInputTokens ? formatNumber(limits.maxInputTokens) : 'unlimited'}</Text>
            </Box>
            <Box>
              <Text fg={themeColor('muted')}>Max Output Tokens: </Text>
              <Text>{limits.maxOutputTokens ? formatNumber(limits.maxOutputTokens) : 'unlimited'}</Text>
            </Box>
            <Box>
              <Text fg={themeColor('muted')}>Max LLM Calls: </Text>
              <Text>{limits.maxLlmCalls != null ? String(limits.maxLlmCalls) : 'unlimited'}</Text>
            </Box>
            <Box>
              <Text fg={themeColor('muted')}>Max Tool Calls: </Text>
              <Text>{limits.maxToolCalls != null ? String(limits.maxToolCalls) : 'unlimited'}</Text>
            </Box>
            <Box>
              <Text fg={themeColor('muted')}>Max Duration: </Text>
              <Text>{limits.maxDurationMs ? formatDuration(limits.maxDurationMs) : 'unlimited'}</Text>
            </Box>
          </Box>

          <Box marginTop={1}>
            <Text fg={themeColor('muted')}>On Exceeded: </Text>
            <Text fg={config.onExceeded === 'stop' ? themeColor('error') : config.onExceeded === 'pause' ? themeColor('warning') : themeColor('info')}>
              {config.onExceeded || 'warn'}
            </Text>
          </Box>
        </Box>

        <Box marginTop={1}>
          <Text fg={themeColor('muted')}>
            [i] edit | [b]ack | [q]uit
            {onPrimaryAction ? ` | [${primaryKey}] ${primaryActionLabel}` : ''}
          </Text>
        </Box>
      </Box>
    );
  }

  // Overview mode (default)
  const { usage, limits, overallExceeded } = sessionStatus;

  return (
    <Box flexDirection="column" paddingY={1}>
      <Box marginBottom={1}>
        <Text><Text bold>Budget</Text>{' — '}<Text fg={config.enabled ? themeColor('success') : themeColor('error')}>{config.enabled ? 'Enforcing' : 'Disabled'}</Text></Text>
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} paddingY={1}>
        {/* Status */}
        <Box marginBottom={1}>
          <Text><Text bold>Status: </Text><Text fg={overallExceeded ? themeColor('error') : config.enabled ? themeColor('success') : themeColor('muted')}>{overallExceeded ? 'EXCEEDED' : config.enabled ? 'Within limits' : 'Not enforcing'}</Text></Text>
        </Box>

        {/* Usage */}
        <Box flexDirection="column">
          <Text fg={themeColor('muted')} bold>Session Usage:</Text>

          <Box marginTop={1} flexDirection="column">
            {/* Tokens */}
            <Text>{'Tokens:'.padEnd(15)}{formatNumber(usage.totalTokens).padStart(8)}{limits.maxTotalTokens ? ` / ${formatNumber(limits.maxTotalTokens)}` : ''}{'  '}<Text fg={usageBarColor(usage.totalTokens, limits.maxTotalTokens)}>{usageBarText(usage.totalTokens, limits.maxTotalTokens)}</Text></Text>

            {/* LLM Calls */}
            <Text>{'LLM Calls:'.padEnd(15)}{String(usage.llmCalls).padStart(8)}{limits.maxLlmCalls ? ` / ${limits.maxLlmCalls}` : ''}{'  '}<Text fg={usageBarColor(usage.llmCalls, limits.maxLlmCalls)}>{usageBarText(usage.llmCalls, limits.maxLlmCalls)}</Text></Text>

            {/* Tool Calls */}
            <Text>{'Tool Calls:'.padEnd(15)}{String(usage.toolCalls).padStart(8)}{limits.maxToolCalls ? ` / ${limits.maxToolCalls}` : ''}{'  '}<Text fg={usageBarColor(usage.toolCalls, limits.maxToolCalls)}>{usageBarText(usage.toolCalls, limits.maxToolCalls)}</Text></Text>

            {/* Duration */}
            <Text>{'Duration:'.padEnd(15)}{formatDuration(usage.durationMs).padStart(8)}{limits.maxDurationMs ? ` / ${formatDuration(limits.maxDurationMs)}` : ''}{'  '}<Text fg={usageBarColor(usage.durationMs, limits.maxDurationMs)}>{usageBarText(usage.durationMs, limits.maxDurationMs)}</Text></Text>
          </Box>
        </Box>

        {/* Warnings */}
        {sessionStatus.warningsCount > 0 && (
          <Box marginTop={1}>
            <Text fg={themeColor('warning')}>{`! ${sessionStatus.warningsCount} warning${sessionStatus.warningsCount !== 1 ? 's' : ''}`}</Text>
          </Box>
        )}

        {/* Exceeded */}
        {overallExceeded && (
          <Box marginTop={1}>
            <Text fg={themeColor('error')} bold>Budget exceeded! Action: {config.onExceeded || 'warn'}</Text>
          </Box>
        )}
      </Box>

      <Box marginTop={1}>
        <Text fg={themeColor('muted')}>
          [e]nable [d]isable [r]eset [l]imits [p]reset [i] edit | [q]uit
          {onPrimaryAction ? ` | [${primaryKey}] ${primaryActionLabel}` : ''}
        </Text>
      </Box>
    </Box>
  );
}
