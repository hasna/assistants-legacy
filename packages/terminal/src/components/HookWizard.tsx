import React, { useState } from 'react';
import type { HookEvent, HookHandler } from '@hasna/assistants-shared';
import type { HookLocation } from '@hasna/assistants-core';
import { useSafeInput as useInput } from '../hooks/useSafeInput';

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
              <text fg="cyan"><b>Step 1/9: Select Event</b></text>
            </box>
            <text fg="gray">When should this hook run?</text>
            <box
              flexDirection="column"
              marginTop={1}
              borderStyle="rounded"
              borderColor="#d4d4d8" border={["top", "bottom"]}
              paddingX={1}
              height={Math.min(10, HOOK_EVENTS.length + 2)}
            >
              {HOOK_EVENTS.map((ev, index) => (
                <box key={ev}>
                  <text
                    bg={index === eventIndex ? "#0055aa" : undefined}
                    fg={index === eventIndex ? "whiteBright" : undefined}
                  >
                    {index === eventIndex ? '>' : ' '} {index + 1}. {ev}
                  </text>
                </box>
              ))}
            </box>
            <box marginTop={1}>
              <text fg="gray">↑↓ navigate | Enter select | Esc cancel</text>
            </box>
          </box>
        );

      case 'matcher':
        return (
          <box flexDirection="column">
            <box marginBottom={1}>
              <text fg="cyan"><b>Step 2/9: Matcher Pattern</b></text>
            </box>
            <text fg="gray">Filter which {event} events trigger this hook (regex or exact match)</text>
            <text fg="gray">Leave empty or use * to match all</text>
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
              <text fg="gray">Enter continue | Esc back</text>
            </box>
          </box>
        );

      case 'type':
        return (
          <box flexDirection="column">
            <box marginBottom={1}>
              <text fg="cyan"><b>Step 3/9: Hook Type</b></text>
            </box>
            <text fg="gray">How should the hook execute?</text>
            <box flexDirection="column" marginTop={1}>
              {HOOK_TYPES.map((type, index) => (
                <box key={type}>
                  <text
                    bg={index === typeIndex ? "#0055aa" : undefined}
                    fg={index === typeIndex ? "whiteBright" : undefined}
                  >
                    {index === typeIndex ? '>' : ' '} {type === 'command' ? 'command  ' : type === 'prompt' ? 'prompt   ' : 'assistant'}
                    <text fg="gray">
                      {type === 'command' && ' - Run a shell command'}
                      {type === 'prompt' && ' - Single-turn LLM decision'}
                      {type === 'assistant' && ' - Multi-turn assistant with tools'}
                    </text>
                  </text>
                </box>
              ))}
            </box>
            <box marginTop={1}>
              <text fg="gray">↑↓ navigate | Enter select | Esc back</text>
            </box>
          </box>
        );

      case 'command':
        return (
          <box flexDirection="column">
            <box marginBottom={1}>
              <text fg="cyan"><b>Step 4/9: {hookType === 'command' ? 'Command' : 'Prompt'}</b></text>
            </box>
            {hookType === 'command' ? (
              <>
                <text fg="gray">Shell command to run. Input is passed as JSON via stdin.</text>
                <text fg="gray">Exit 0 = allow, Exit 2 = block, other = error</text>
              </>
            ) : (
              <>
                <text fg="gray">Prompt to send to the LLM. Context will be appended.</text>
                <text fg="gray">LLM should respond with {"{"}&quot;allow&quot;: boolean, &quot;reason&quot;: string{"}"}</text>
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
                <text fg="red">{error}</text>
              </box>
            )}
            <box marginTop={1}>
              <text fg="gray">Enter continue | Esc back</text>
            </box>
          </box>
        );

      case 'timeout':
        return (
          <box flexDirection="column">
            <box marginBottom={1}>
              <text fg="cyan"><b>Step 5/9: Timeout</b></text>
            </box>
            <text fg="gray">Maximum time to wait for hook to complete (milliseconds)</text>
            <box marginTop={1}>
              <text>Timeout: </text>
              <input
                value={timeout}
                onChange={(v) => { setTimeout(v); setError(null); }}
                onSubmit={handleTimeoutSubmit}
                focused
                placeholder="30000"
              />
              <text fg="gray"> ms</text>
            </box>
            {error && (
              <box marginTop={1}>
                <text fg="red">{error}</text>
              </box>
            )}
            <box marginTop={1}>
              <text fg="gray">Enter continue | Esc back</text>
            </box>
          </box>
        );

      case 'async':
        return (
          <box flexDirection="column">
            <box marginBottom={1}>
              <text fg="cyan"><b>Step 6/9: Async Execution</b></text>
            </box>
            <text fg="gray">Run in background without blocking?</text>
            <box marginTop={1}>
              <text>Run async: </text>
              <text fg={isAsync ? 'green' : 'gray'}>[{isAsync ? 'Yes' : 'No '}]</text>
            </box>
            <box marginTop={1}>
              <text fg="gray">y yes | n no | Space toggle | Enter continue | Esc back</text>
            </box>
          </box>
        );

      case 'name':
        return (
          <box flexDirection="column">
            <box marginBottom={1}>
              <text fg="cyan"><b>Step 7/9: Name (optional)</b></text>
            </box>
            <text fg="gray">Give your hook a friendly name</text>
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
              <text fg="gray">Enter continue | Esc back</text>
            </box>
          </box>
        );

      case 'description':
        return (
          <box flexDirection="column">
            <box marginBottom={1}>
              <text fg="cyan"><b>Step 8/9: Description (optional)</b></text>
            </box>
            <text fg="gray">Short note about why this hook exists</text>
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
              <text fg="gray">Enter continue | Esc back</text>
            </box>
          </box>
        );

      case 'location':
        return (
          <box flexDirection="column">
            <box marginBottom={1}>
              <text fg="cyan"><b>Step 9/9: Save Location</b></text>
            </box>
            <text fg="gray">Where should this hook be stored?</text>
            <box flexDirection="column" marginTop={1}>
              {HOOK_LOCATIONS.map((loc, index) => (
                <box key={loc}>
                  <text
                    bg={index === locationIndex ? "#0055aa" : undefined}
                    fg={index === locationIndex ? "whiteBright" : undefined}
                  >
                    {index === locationIndex ? '>' : ' '} {loc.padEnd(8)}
                    <text fg="gray"> {getLocationDescription(loc)}</text>
                  </text>
                </box>
              ))}
            </box>
            <box marginTop={1}>
              <text fg="gray">↑↓ navigate | Enter select | Esc back</text>
            </box>
          </box>
        );

      case 'confirm':
        return (
          <box flexDirection="column">
            <box marginBottom={1}>
              <text fg="cyan"><b>Confirm Hook</b></text>
            </box>
            <box flexDirection="column" borderStyle="rounded" borderColor="#d4d4d8" border={["top", "bottom"]} paddingX={1} paddingY={1}>
              <box><text fg="gray">Event:   </text><text><b>{event}</b></text></box>
              <box><text fg="gray">Matcher: </text><text>{matcher || '*'}</text></box>
              <box><text fg="gray">Type:    </text><text>{hookType}</text></box>
              <box><text fg="gray">{hookType === 'command' ? 'Command' : 'Prompt'}:</text><text> {command.slice(0, 40)}{command.length > 40 ? '...' : ''}</text></box>
              <box><text fg="gray">Timeout: </text><text>{timeout}ms</text></box>
              <box><text fg="gray">Async:   </text><text>{isAsync ? 'Yes' : 'No'}</text></box>
              {name && <box><text fg="gray">Name:    </text><text>{name}</text></box>}
              {description && <box><text fg="gray">Desc:    </text><text>{description}</text></box>}
              <box><text fg="gray">Location:</text><text> {location}</text></box>
            </box>
            {error && (
              <box marginTop={1}>
                <text fg="red">{error}</text>
              </box>
            )}
            {isSubmitting ? (
              <box marginTop={1}>
                <text fg="yellow">Saving hook...</text>
              </box>
            ) : (
              <box marginTop={1}>
                <text>
                  Press <text fg="green"><b>y</b></text> to save or{' '}
                  <text fg="red"><b>n</b></text> to cancel
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
