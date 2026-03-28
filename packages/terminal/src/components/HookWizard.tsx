import React, { useState } from 'react';
import type { HookEvent, HookHandler } from '@hasna/assistants-shared';
import type { HookLocation } from '@hasna/assistants-core';
import { useSafeInput as useInput } from '../hooks/useSafeInput';
import { themeColor } from '../theme/colors';

interface HookWizardInitial {
  event?: HookEvent;
  matcher?: string;
  type?: HookType;
  command?: string;
  timeout?: number;
  async?: boolean;
  name?: string;
  description?: string;
  location?: HookLocation;
}

interface HookWizardProps {
  onSave: (event: HookEvent, handler: HookHandler, location: HookLocation, matcher?: string) => Promise<void>;
  onCancel: () => void;
  initial?: HookWizardInitial;
  startStep?: Step;
}

const HOOK_EVENTS: HookEvent[] = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'UserPromptSubmit',
  'SessionStart',
  'SessionEnd',
  'SubassistantStart',
  'SubassistantStop',
  'PreCompact',
  'Notification',
  'Stop',
];

const HOOK_TYPES = ['command', 'prompt', 'assistant'] as const;
type HookType = typeof HOOK_TYPES[number];

const HOOK_LOCATIONS: HookLocation[] = ['project', 'user', 'local'];

type Step = 'event' | 'matcher' | 'type' | 'command' | 'timeout' | 'async' | 'name' | 'description' | 'location' | 'confirm';

export function HookWizard({ onSave, onCancel, initial, startStep }: HookWizardProps) {
  // Form state
  const initialEvent = initial?.event ?? 'PreToolUse';
  const initialType = initial?.type ?? 'command';
  const initialLocation = initial?.location ?? 'project';
  const [event, setEvent] = useState<HookEvent>(initialEvent);
  const [matcher, setMatcher] = useState(initial?.matcher ?? '');
  const [hookType, setHookType] = useState<HookType>(initialType);
  const [command, setCommand] = useState(initial?.command ?? '');
  const [timeout, setTimeout] = useState(String(initial?.timeout ?? 30000));
  const [isAsync, setIsAsync] = useState(Boolean(initial?.async));
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [location, setLocation] = useState<HookLocation>(initialLocation);

  // Navigation state
  const [step, setStep] = useState<Step>(startStep ?? 'event');
  const [eventIndex, setEventIndex] = useState(Math.max(0, HOOK_EVENTS.indexOf(initialEvent)));
  const [typeIndex, setTypeIndex] = useState(Math.max(0, HOOK_TYPES.indexOf(initialType)));
  const [locationIndex, setLocationIndex] = useState(Math.max(0, HOOK_LOCATIONS.indexOf(initialLocation)));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    // Global escape to cancel
    if (key.escape) {
      if (step === 'event') {
        onCancel();
      } else {
        // Go back to previous step
        goBack();
      }
      return;
    }

    // Handle each step
    switch (step) {
      case 'event':
        handleEventInput(input, key);
        break;
      case 'matcher':
        // TextInput handles this
        break;
      case 'type':
        handleTypeInput(input, key);
        break;
      case 'command':
        // TextInput handles this
        break;
      case 'timeout':
        // TextInput handles this
        break;
      case 'async':
        handleAsyncInput(input, key);
        break;
      case 'name':
        // TextInput handles this
        break;
      case 'description':
        // TextInput handles this
        break;
      case 'location':
        handleLocationInput(input, key);
        break;
      case 'confirm':
        handleConfirmInput(input, key);
        break;
    }
  }, { isActive: !['matcher', 'command', 'timeout', 'name', 'description'].includes(step) });

  const goBack = () => {
    const steps: Step[] = ['event', 'matcher', 'type', 'command', 'timeout', 'async', 'name', 'description', 'location', 'confirm'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1]);
      setError(null);
    }
  };

  const handleEventInput = (input: string, key: { upArrow: boolean; downArrow: boolean; return: boolean }) => {
    if (key.upArrow) {
      setEventIndex((prev) => (prev === 0 ? HOOK_EVENTS.length - 1 : prev - 1));
    } else if (key.downArrow) {
      setEventIndex((prev) => (prev === HOOK_EVENTS.length - 1 ? 0 : prev + 1));
    } else if (key.return) {
      setEvent(HOOK_EVENTS[eventIndex]);
      setStep('matcher');
    }
    // Number keys for quick selection
    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= 1 && num <= HOOK_EVENTS.length) {
      setEventIndex(num - 1);
    }
  };

  const handleTypeInput = (input: string, key: { upArrow: boolean; downArrow: boolean; return: boolean }) => {
    if (key.upArrow || input === 'k') {
      setTypeIndex((prev) => (prev === 0 ? HOOK_TYPES.length - 1 : prev - 1));
    } else if (key.downArrow || input === 'j') {
      setTypeIndex((prev) => (prev === HOOK_TYPES.length - 1 ? 0 : prev + 1));
    } else if (key.return) {
      setHookType(HOOK_TYPES[typeIndex]);
      setStep('command');
    }
  };

  const handleAsyncInput = (input: string, key: { return: boolean }) => {
    if (input === 'y' || input === 'Y') {
      setIsAsync(true);
      setStep('name');
    } else if (input === 'n' || input === 'N' || key.return) {
      setIsAsync(false);
      setStep('name');
    } else if (input === ' ') {
      setIsAsync(!isAsync);
    }
  };

  const handleLocationInput = (input: string, key: { upArrow: boolean; downArrow: boolean; return: boolean }) => {
    if (key.upArrow) {
      setLocationIndex((prev) => (prev === 0 ? HOOK_LOCATIONS.length - 1 : prev - 1));
    } else if (key.downArrow) {
      setLocationIndex((prev) => (prev === HOOK_LOCATIONS.length - 1 ? 0 : prev + 1));
    } else if (key.return) {
      setLocation(HOOK_LOCATIONS[locationIndex]);
      setStep('confirm');
    }
    // Number keys for quick selection
    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= 1 && num <= HOOK_LOCATIONS.length) {
      setLocationIndex(num - 1);
    }
  };

  const handleConfirmInput = async (input: string, _key: { return: boolean }) => {
    if (input === 'y' || input === 'Y') {
      await saveHook();
    } else if (input === 'n' || input === 'N') {
      onCancel();
    }
  };

  const saveHook = async () => {
    // Validate
    if (!command.trim()) {
      setError('Command/prompt is required');
      setStep('command');
      return;
    }

    const timeoutNum = parseInt(timeout, 10);
    if (isNaN(timeoutNum) || timeoutNum < 0) {
      setError('Invalid timeout value');
      setStep('timeout');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const handler: HookHandler = {
        type: hookType,
        command: hookType === 'command' ? command.trim() : undefined,
        prompt: hookType !== 'command' ? command.trim() : undefined,
        timeout: timeoutNum > 0 ? timeoutNum : undefined,
        async: isAsync || undefined,
        name: name.trim() || undefined,
        description: description.trim() || undefined,
        enabled: true,
      };

      await onSave(event, handler, location, matcher.trim() || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save hook');
      setIsSubmitting(false);
    }
  };

  const handleMatcherSubmit = () => {
    setStep('type');
  };

  const handleCommandSubmit = () => {
    if (!command.trim()) {
      setError(hookType === 'command' ? 'Command is required' : 'Prompt is required');
      return;
    }
    setError(null);
    setStep('timeout');
  };

  const handleTimeoutSubmit = () => {
    const num = parseInt(timeout, 10);
    if (isNaN(num) || num < 0) {
      setError('Invalid timeout value');
      return;
    }
    setError(null);
    setStep('async');
  };

  const handleNameSubmit = () => {
    setStep('description');
  };

  const handleDescriptionSubmit = () => {
    setStep('location');
  };

  const getLocationDescription = (loc: HookLocation): string => {
    switch (loc) {
      case 'user':
        return '~/.hasna/assistants/hooks.json (all projects)';
      case 'project':
        return '.assistants/hooks.json (this project)';
      case 'local':
        return '.assistants/hooks.local.json (gitignored)';
      default:
        return '';
    }
  };

  // Render step content
  const renderStep = () => {
    switch (step) {
      case 'event':
        return (
          <box flexDirection="column">
            <box marginBottom={1}>
              <text fg={themeColor('info')}><b>Step 1/9: Select Event</b></text>
            </box>
            <text fg={themeColor('muted')}>When should this hook run?</text>
            <box
              flexDirection="column"
              marginTop={1}
              borderStyle="rounded"
              borderColor={themeColor('border')} border={["top", "bottom"]}
              paddingX={1}
              height={Math.min(10, HOOK_EVENTS.length + 2)}
            >
              {HOOK_EVENTS.map((ev, index) => (
                <box key={ev}>
                  <text
                    bg={index === eventIndex ? themeColor('primary') : undefined}
                    fg={index === eventIndex ? themeColor('text') : undefined}
                  >
                    {index === eventIndex ? '>' : ' '} {index + 1}. {ev}
                  </text>
                </box>
              ))}
            </box>
            <box marginTop={1}>
              <text fg={themeColor('muted')}>↑↓ navigate | Enter select | Esc cancel</text>
            </box>
          </box>
        );

      case 'matcher':
        return (
          <box flexDirection="column">
            <box marginBottom={1}>
              <text fg={themeColor('info')}><b>Step 2/9: Matcher Pattern</b></text>
            </box>
            <text fg={themeColor('muted')}>Filter which {event} events trigger this hook (regex or exact match)</text>
            <text fg={themeColor('muted')}>Leave empty or use * to match all</text>
            <box marginTop={1}>
              <text>Pattern: </text>
              <input
                value={matcher}
                onChange={setMatcher}
                onSubmit={handleMatcherSubmit}
                focused
                placeholder="Bash|Edit|Write (regex) or * for all"
              />
            </box>
            <box marginTop={1}>
              <text fg={themeColor('muted')}>Enter continue | Esc back</text>
            </box>
          </box>
        );

      case 'type':
        return (
          <box flexDirection="column">
            <box marginBottom={1}>
              <text fg={themeColor('info')}><b>Step 3/9: Hook Type</b></text>
            </box>
            <text fg={themeColor('muted')}>How should the hook execute?</text>
            <box flexDirection="column" marginTop={1}>
              {HOOK_TYPES.map((type, index) => (
                <box key={type}>
                  <text
                    bg={index === typeIndex ? themeColor('primary') : undefined}
                    fg={index === typeIndex ? themeColor('text') : undefined}
                  >
                    {index === typeIndex ? '>' : ' '} {type === 'command' ? 'command  ' : type === 'prompt' ? 'prompt   ' : 'assistant'}
                    <text fg={themeColor('muted')}>
                      {type === 'command' && ' - Run a shell command'}
                      {type === 'prompt' && ' - Single-turn LLM decision'}
                      {type === 'assistant' && ' - Multi-turn assistant with tools'}
                    </text>
                  </text>
                </box>
              ))}
            </box>
            <box marginTop={1}>
              <text fg={themeColor('muted')}>↑↓ navigate | Enter select | Esc back</text>
            </box>
          </box>
        );

      case 'command':
        return (
          <box flexDirection="column">
            <box marginBottom={1}>
              <text fg={themeColor('info')}><b>Step 4/9: {hookType === 'command' ? 'Command' : 'Prompt'}</b></text>
            </box>
            {hookType === 'command' ? (
              <>
                <text fg={themeColor('muted')}>Shell command to run. Input is passed as JSON via stdin.</text>
                <text fg={themeColor('muted')}>Exit 0 = allow, Exit 2 = block, other = error</text>
              </>
            ) : (
              <>
                <text fg={themeColor('muted')}>Prompt to send to the LLM. Context will be appended.</text>
                <text fg={themeColor('muted')}>LLM should respond with {"{"}&quot;allow&quot;: boolean, &quot;reason&quot;: string{"}"}</text>
              </>
            )}
            <box marginTop={1}>
              <text>{hookType === 'command' ? 'Command' : 'Prompt'}: </text>
              <input
                value={command}
                onChange={(v) => { setCommand(v); setError(null); }}
                onSubmit={handleCommandSubmit}
                focused
                placeholder={hookType === 'command' ? './scripts/validate.sh' : 'Should this action be allowed?'}
              />
            </box>
            {error && (
              <box marginTop={1}>
                <text fg={themeColor('error')}>{error}</text>
              </box>
            )}
            <box marginTop={1}>
              <text fg={themeColor('muted')}>Enter continue | Esc back</text>
            </box>
          </box>
        );

      case 'timeout':
        return (
          <box flexDirection="column">
            <box marginBottom={1}>
              <text fg={themeColor('info')}><b>Step 5/9: Timeout</b></text>
            </box>
            <text fg={themeColor('muted')}>Maximum time to wait for hook to complete (milliseconds)</text>
            <box marginTop={1}>
              <text>Timeout: </text>
              <input
                value={timeout}
                onChange={(v) => { setTimeout(v); setError(null); }}
                onSubmit={handleTimeoutSubmit}
                focused
                placeholder="30000"
              />
              <text fg={themeColor('muted')}> ms</text>
            </box>
            {error && (
              <box marginTop={1}>
                <text fg={themeColor('error')}>{error}</text>
              </box>
            )}
            <box marginTop={1}>
              <text fg={themeColor('muted')}>Enter continue | Esc back</text>
            </box>
          </box>
        );

      case 'async':
        return (
          <box flexDirection="column">
            <box marginBottom={1}>
              <text fg={themeColor('info')}><b>Step 6/9: Async Execution</b></text>
            </box>
            <text fg={themeColor('muted')}>Run in background without blocking?</text>
            <box marginTop={1}>
              <text>Run async: </text>
              <text fg={isAsync ? themeColor('success') : themeColor('muted')}>[{isAsync ? 'Yes' : 'No '}]</text>
            </box>
            <box marginTop={1}>
              <text fg={themeColor('muted')}>y yes | n no | Space toggle | Enter continue | Esc back</text>
            </box>
          </box>
        );

      case 'name':
        return (
          <box flexDirection="column">
            <box marginBottom={1}>
              <text fg={themeColor('info')}><b>Step 7/9: Name (optional)</b></text>
            </box>
            <text fg={themeColor('muted')}>Give your hook a friendly name</text>
            <box marginTop={1}>
              <text>Name: </text>
              <input
                value={name}
                onChange={setName}
                onSubmit={handleNameSubmit}
                focused
                placeholder="Validate dangerous commands"
              />
            </box>
            <box marginTop={1}>
              <text fg={themeColor('muted')}>Enter continue | Esc back</text>
            </box>
          </box>
        );

      case 'description':
        return (
          <box flexDirection="column">
            <box marginBottom={1}>
              <text fg={themeColor('info')}><b>Step 8/9: Description (optional)</b></text>
            </box>
            <text fg={themeColor('muted')}>Short note about why this hook exists</text>
            <box marginTop={1}>
              <text>Description: </text>
              <input
                value={description}
                onChange={setDescription}
                onSubmit={handleDescriptionSubmit}
                focused
                placeholder="Block risky commands before they run"
              />
            </box>
            <box marginTop={1}>
              <text fg={themeColor('muted')}>Enter continue | Esc back</text>
            </box>
          </box>
        );

      case 'location':
        return (
          <box flexDirection="column">
            <box marginBottom={1}>
              <text fg={themeColor('info')}><b>Step 9/9: Save Location</b></text>
            </box>
            <text fg={themeColor('muted')}>Where should this hook be stored?</text>
            <box flexDirection="column" marginTop={1}>
              {HOOK_LOCATIONS.map((loc, index) => (
                <box key={loc}>
                  <text
                    bg={index === locationIndex ? themeColor('primary') : undefined}
                    fg={index === locationIndex ? themeColor('text') : undefined}
                  >
                    {index === locationIndex ? '>' : ' '} {loc.padEnd(8)}
                    <text fg={themeColor('muted')}> {getLocationDescription(loc)}</text>
                  </text>
                </box>
              ))}
            </box>
            <box marginTop={1}>
              <text fg={themeColor('muted')}>↑↓ navigate | Enter select | Esc back</text>
            </box>
          </box>
        );

      case 'confirm':
        return (
          <box flexDirection="column">
            <box marginBottom={1}>
              <text fg={themeColor('info')}><b>Confirm Hook</b></text>
            </box>
            <box flexDirection="column" borderStyle="rounded" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} paddingY={1}>
              <box><text fg={themeColor('muted')}>Event:   </text><text><b>{event}</b></text></box>
              <box><text fg={themeColor('muted')}>Matcher: </text><text>{matcher || '*'}</text></box>
              <box><text fg={themeColor('muted')}>Type:    </text><text>{hookType}</text></box>
              <box><text fg={themeColor('muted')}>{hookType === 'command' ? 'Command' : 'Prompt'}:</text><text> {command.slice(0, 40)}{command.length > 40 ? '...' : ''}</text></box>
              <box><text fg={themeColor('muted')}>Timeout: </text><text>{timeout}ms</text></box>
              <box><text fg={themeColor('muted')}>Async:   </text><text>{isAsync ? 'Yes' : 'No'}</text></box>
              {name && <box><text fg={themeColor('muted')}>Name:    </text><text>{name}</text></box>}
              {description && <box><text fg={themeColor('muted')}>Desc:    </text><text>{description}</text></box>}
              <box><text fg={themeColor('muted')}>Location:</text><text> {location}</text></box>
            </box>
            {error && (
              <box marginTop={1}>
                <text fg={themeColor('error')}>{error}</text>
              </box>
            )}
            {isSubmitting ? (
              <box marginTop={1}>
                <text fg={themeColor('warning')}>Saving hook...</text>
              </box>
            ) : (
              <box marginTop={1}>
                <text>
                  Press <text fg={themeColor('success')}><b>y</b></text> to save or{' '}
                  <text fg={themeColor('error')}><b>n</b></text> to cancel
                </text>
              </box>
            )}
          </box>
        );
      default:
        return null;
    }
  };

  return (
    <box flexDirection="column" paddingY={1}>
      <box marginBottom={1}>
        <text><b>Add Hook</b></text>
      </box>
      {renderStep()}
    </box>
  );
}
