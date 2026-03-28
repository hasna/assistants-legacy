import React, { useEffect, useState, useMemo } from 'react';
import type { HookEvent, HookMatcher, HookHandler, HookConfig, NativeHook } from '@hasna/assistants-shared';
import type { HookLocation } from '@hasna/assistants-core';
import { HookWizard } from './HookWizard';
import { useSafeInput as useInput } from '../hooks/useSafeInput';

interface NativeHookInfo {
  hook: NativeHook;
  event: HookEvent;
  enabled: boolean;
}

interface HooksPanelProps {
  hooks: HookConfig;
  nativeHooks?: NativeHookInfo[];
  onToggle: (event: HookEvent, hookId: string, enabled: boolean) => void;
  onToggleNative?: (hookId: string, enabled: boolean) => void;
  onDelete: (event: HookEvent, hookId: string) => Promise<void>;
  onAdd: (event: HookEvent, handler: HookHandler, location: HookLocation, matcher?: string) => Promise<void>;
  onGenerateDraft?: (prompt: string) => Promise<HookDraft>;
  onCancel: () => void;
}

interface FlattenedHook {
  event: HookEvent;
  matcherIndex: number;
  hookIndex: number;
  matcher: string | undefined;
  hook: HookHandler;
}

const HOOK_EVENTS: HookEvent[] = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'Notification',
  'SubassistantStart',
  'SubassistantStop',
  'PreCompact',
  'Stop',
];

type HookDraft = {
  event?: HookEvent;
  matcher?: string;
  type?: 'command' | 'prompt' | 'assistant';
  command?: string;
  timeout?: number;
  async?: boolean;
  name?: string;
  description?: string;
  location?: HookLocation;
};
type Mode = 'list' | 'delete-confirm' | 'wizard' | 'prompt';

export function HooksPanel({
  hooks,
  nativeHooks = [],
  onToggle,
  onToggleNative,
  onDelete,
  onAdd,
  onGenerateDraft,
  onCancel,
}: HooksPanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [promptValue, setPromptValue] = useState('');
  const [promptError, setPromptError] = useState<string | null>(null);
  const [wizardInitial, setWizardInitial] = useState<HookDraft | null>(null);
  const [wizardStartStep, setWizardStartStep] = useState<'confirm' | 'event' | 'command'>('event');
  const [isGenerating, setIsGenerating] = useState(false);

  // Flatten hooks into a navigable list grouped by event
  const flattenedHooks = useMemo(() => {
    const items: FlattenedHook[] = [];
    for (const event of HOOK_EVENTS) {
      const matchers = hooks[event] ?? [];
      for (let mi = 0; mi < matchers.length; mi++) {
        const matcher = matchers[mi];
        for (let hi = 0; hi < matcher.hooks.length; hi++) {
          items.push({
            event: event as HookEvent,
            matcherIndex: mi,
            hookIndex: hi,
            matcher: matcher.matcher,
            hook: matcher.hooks[hi],
          });
        }
      }
    }
    return items;
  }, [hooks]);

  // Group by event for display
  const groupedHooks = useMemo(() => {
    const groups: Map<HookEvent, FlattenedHook[]> = new Map();
    for (const item of flattenedHooks) {
      if (!groups.has(item.event)) {
        groups.set(item.event, []);
      }
      groups.get(item.event)!.push(item);
    }
    return groups;
  }, [flattenedHooks]);

  // Total items for navigation
  const totalItems = nativeHooks.length + flattenedHooks.length;

  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, totalItems - 1)));
  }, [totalItems]);

  // Get selected item info
  const isNativeSelected = selectedIndex < nativeHooks.length;
  const selectedNativeHook = isNativeSelected ? nativeHooks[selectedIndex] : null;
  const selectedUserHook = !isNativeSelected ? flattenedHooks[selectedIndex - nativeHooks.length] : null;

  useInput((input, key) => {
    if (mode === 'prompt') {
      if (key.escape) {
        setMode('list');
        setPromptError(null);
      }
      return;
    }
    // In delete confirmation mode
    if (mode === 'delete-confirm') {
      if (input === 'y' || input === 'Y') {
        const item = flattenedHooks[selectedIndex - nativeHooks.length];
        if (item && item.hook.id) {
          setIsSubmitting(true);
          onDelete(item.event, item.hook.id).finally(() => {
            setIsSubmitting(false);
            setMode('list');
          });
        } else {
          setMode('list');
        }
        return;
      }
      if (input === 'n' || input === 'N' || key.escape) {
        setMode('list');
        return;
      }
      return;
    }

    // List mode shortcuts
    if (input === 'e' || input === 'E') {
      // Enable hook
      if (isNativeSelected && selectedNativeHook) {
        onToggleNative?.(selectedNativeHook.hook.id, true);
      } else if (selectedUserHook && selectedUserHook.hook.id) {
        onToggle(selectedUserHook.event, selectedUserHook.hook.id, true);
      }
      return;
    }

    if (input === 'd' || input === 'D') {
      // Disable hook
      if (isNativeSelected && selectedNativeHook) {
        onToggleNative?.(selectedNativeHook.hook.id, false);
      } else if (selectedUserHook && selectedUserHook.hook.id) {
        onToggle(selectedUserHook.event, selectedUserHook.hook.id, false);
      }
      return;
    }

    if (input === 'x' || input === 'X') {
      // Delete hook (only user hooks can be deleted)
      if (!isNativeSelected && selectedUserHook) {
        setMode('delete-confirm');
      }
      return;
    }

    if (input === 'a' || input === 'A') {
      // Add new hook
      setWizardInitial(null);
      setWizardStartStep('event');
      setMode('wizard');
      return;
    }

    if (input === 'p' || input === 'P') {
      // Add new hook via prompt
      setPromptValue('');
      setPromptError(null);
      setMode('prompt');
      return;
    }

    // Escape or q: cancel
    if (key.escape || input === 'q' || input === 'Q') {
      onCancel();
      return;
    }

    // Arrow navigation with wraparound
    if (key.upArrow) {
      if (totalItems === 0) return;
      setSelectedIndex((prev) => (prev === 0 ? totalItems - 1 : prev - 1));
      return;
    }

    if (key.downArrow) {
      if (totalItems === 0) return;
      setSelectedIndex((prev) => (prev === totalItems - 1 ? 0 : prev + 1));
      return;
    }
  }, { isActive: true });

  // Get the selected hook for details (use the computed values from above)
  const selectedHook = selectedUserHook;

  // Format hook name
  const getHookName = (hook: HookHandler): string => {
    if (hook.name) return hook.name;
    if (hook.command) {
      const cmd = hook.command.slice(0, 25);
      return cmd + (hook.command.length > 25 ? '...' : '');
    }
    if (hook.prompt) {
      const p = hook.prompt.slice(0, 25);
      return p + (hook.prompt.length > 25 ? '...' : '');
    }
    return hook.type;
  };

  // Format hook type badge
  const getTypeBadge = (type: string): string => {
    switch (type) {
      case 'command': return 'cmd';
      case 'prompt': return 'llm';
      case 'assistant': return 'ast';
      default: return type.slice(0, 3);
    }
  };

  // Delete confirmation mode
  if (mode === 'delete-confirm') {
    const item = flattenedHooks[selectedIndex - nativeHooks.length];
    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg="red"><b>Delete Hook</b></text>
        </box>
        <box marginBottom={1}>
          <text>
            Are you sure you want to delete &quot;{getHookName(item?.hook ?? { type: 'command' })}&quot;?
          </text>
        </box>
        <box marginTop={1}>
          <text>
            Press <text fg="green"><b>y</b></text> to confirm or{' '}
            <text fg="red"><b>n</b></text> to cancel
          </text>
        </box>
      </box>
    );
  }

  // Wizard mode
  if (mode === 'wizard') {
    return (
      <HookWizard
        initial={wizardInitial ?? undefined}
        startStep={wizardStartStep}
        onSave={async (event, handler, location, matcher) => {
          await onAdd(event, handler, location, matcher);
          setMode('list');
        }}
        onCancel={() => setMode('list')}
      />
    );
  }

  if (mode === 'prompt') {
    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg="cyan"><b>Create Hook from Prompt</b></text>
        </box>
        <text fg="gray">Describe the behavior you want (event, matcher, action).</text>
        <box marginTop={1}>
          <text>Prompt: </text>
          <input
            value={promptValue}
            onChange={(value) => {
              setPromptValue(value);
              setPromptError(null);
            }}
            onSubmit={async () => {
              const prompt = promptValue.trim();
              if (!prompt) {
                setPromptError('Prompt is required');
                return;
              }
              if (!onGenerateDraft) {
                setPromptError('Hook generation is not available.');
                return;
              }
              setIsGenerating(true);
              setPromptError(null);
              try {
                const draft = await onGenerateDraft(prompt);
                setWizardInitial(draft);
                setWizardStartStep(draft.command ? 'confirm' : 'command');
                setMode('wizard');
              } catch (err) {
                setPromptError(err instanceof Error ? err.message : String(err));
              } finally {
                setIsGenerating(false);
              }
            }}
            focused
            placeholder="e.g. Block dangerous bash commands like rm -rf"
          />
        </box>
        {promptError && (
          <box marginTop={1}>
            <text fg="red">{promptError}</text>
          </box>
        )}
        <box marginTop={1}>
          <text fg="gray">Enter generate | Esc back</text>
        </box>
        {isGenerating && (
          <box marginTop={1}>
            <text fg="yellow">Generating hook draft...</text>
          </box>
        )}
      </box>
    );
  }

  // Total hooks count
  const totalHooks = flattenedHooks.length + nativeHooks.length;

  // List mode UI
  return (
    <box flexDirection="column" paddingY={1}>
      <box marginBottom={1} justifyContent="space-between">
        <text><b>Hooks</b></text>
        <text fg="gray">{totalHooks} hook{totalHooks !== 1 ? 's' : ''}</text>
      </box>

      <box
        flexDirection="column"
        borderStyle="rounded"
        borderColor="#d4d4d8" border={["top", "bottom"]}
        paddingX={1}
        height={Math.min(18, totalHooks + 4)}
        overflow="hidden"
      >
        {/* Native Hooks Section */}
        {nativeHooks.length > 0 && (
          <box flexDirection="column" marginBottom={1}>
            <box>
              <text fg="cyan"><b>Native</b></text>
              <text fg="gray"> ({nativeHooks.length})</text>
            </box>
            {nativeHooks.map((item, index) => {
              const isSelected = index === selectedIndex && selectedIndex < nativeHooks.length;
              return (
                <box key={item.hook.id} paddingLeft={2}>
                  <text
                    attributes={isSelected ? 32 : undefined}
                    fg={item.enabled ? undefined : 'gray'}
                  >
                    {isSelected ? '>' : ' '}{' '}
                    <text fg={item.enabled ? 'green' : 'red'}>[{item.enabled ? 'on ' : 'off'}]</text>{' '}
                    <text attributes={isSelected ? 1 : undefined}><b>{(item.hook.name || item.hook.id).padEnd(22)}</b></text>{' '}
                    <text fg="gray">nat</text>{' '}
                    <text fg="gray">@{item.event}</text>
                  </text>
                </box>
              );
            })}
          </box>
        )}

        {/* User Hooks Section */}
        {flattenedHooks.length === 0 && nativeHooks.length === 0 ? (
          <box paddingY={1}>
            <text fg="gray">No hooks configured.</text>
          </box>
        ) : flattenedHooks.length > 0 ? (
          <>
            <box>
              <text fg="gray"><b>User Hooks</b></text>
              <text fg="gray"> ({flattenedHooks.length})</text>
            </box>
            {/* Render grouped by event */}
            {Array.from(groupedHooks.entries()).map(([event, eventHooks]) => (
              <box key={event} flexDirection="column">
                <box paddingLeft={1}>
                  <text fg="gray"><b>{event}</b></text>
                  <text fg="gray"> ({eventHooks.length})</text>
                </box>
                {eventHooks.map((item) => {
                  const globalIndex = flattenedHooks.indexOf(item) + nativeHooks.length;
                  const isSelected = globalIndex === selectedIndex;
                  const isEnabled = item.hook.enabled !== false;

                  return (
                    <box key={item.hook.id ?? `${item.matcherIndex}-${item.hookIndex}`} paddingLeft={2}>
                      <text
                        attributes={isSelected ? 32 : undefined}
                        fg={isEnabled ? undefined : 'gray'}
                      >
                        {isSelected ? '>' : ' '}{' '}
                        <text fg={isEnabled ? 'green' : 'red'}>[{isEnabled ? 'on ' : 'off'}]</text>{' '}
                        <text attributes={isSelected ? 1 : undefined}><b>{getHookName(item.hook).padEnd(22)}</b></text>{' '}
                        <text fg="gray">{getTypeBadge(item.hook.type)}</text>{' '}
                        {item.matcher && <text fg="gray">@{item.matcher}</text>}
                      </text>
                    </box>
                  );
                })}
              </box>
            ))}
          </>
        ) : null}
      </box>

      {/* Selected native hook details */}
      {selectedNativeHook && (
        <box marginTop={1} flexDirection="column">
          <box>
            <text fg="gray">Type: </text>
            <text fg="cyan">native</text>
          </box>
          <box>
            <text fg="gray">Event: </text>
            <text>{selectedNativeHook.event}</text>
          </box>
          <box>
            <text fg="gray">ID: </text>
            <text>{selectedNativeHook.hook.id}</text>
          </box>
          {selectedNativeHook.hook.description && (
            <box>
              <text fg="gray">Description: </text>
              <text>{selectedNativeHook.hook.description}</text>
            </box>
          )}
        </box>
      )}

      {/* Selected user hook details */}
      {selectedHook && (
        <box marginTop={1} flexDirection="column">
          <box>
            <text fg="gray">Type: </text>
            <text>{selectedHook.hook.type}</text>
            {selectedHook.hook.async && <text fg="yellow"> (async)</text>}
          </box>
          {selectedHook.matcher && (
            <box>
              <text fg="gray">Matcher: </text>
              <text>{selectedHook.matcher}</text>
            </box>
          )}
          {selectedHook.hook.description && (
            <box>
              <text fg="gray">Description: </text>
              <text>{selectedHook.hook.description}</text>
            </box>
          )}
          {selectedHook.hook.command && (
            <box>
              <text fg="gray">Command: </text>
              <text>{selectedHook.hook.command.slice(0, 50)}{selectedHook.hook.command.length > 50 ? '...' : ''}</text>
            </box>
          )}
          {selectedHook.hook.timeout && (
            <box>
              <text fg="gray">Timeout: </text>
              <text>{selectedHook.hook.timeout}ms</text>
            </box>
          )}
        </box>
      )}

      <box marginTop={1}>
        <text fg="gray">
          [a]dd [p]rompt [e]nable [d]isable {!isNativeSelected && '[x]delete '} [q]uit | ↑↓ navigate
        </text>
      </box>
    </box>
  );
}
