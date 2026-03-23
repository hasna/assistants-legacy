import React, { useEffect, useState, useCallback } from 'react';
import type { AssistantsConfig } from '@hasna/assistants-shared';
import { useSafeInput as useInput } from '../hooks/useSafeInput';
import {
  ALL_MODELS,
  DEFAULT_MODEL,
  getModelDisplayName,
  getProviderLabel,
} from '@hasna/assistants-shared';

type ConfigLocation = 'user' | 'project' | 'local';
type ConfigSection = 'overview' | 'model' | 'context' | 'memory' | 'subassistants' | 'voice' | 'statusLine';

interface ConfigPanelProps {
  config: AssistantsConfig;
  userConfig: Partial<AssistantsConfig> | null;
  projectConfig: Partial<AssistantsConfig> | null;
  localConfig: Partial<AssistantsConfig> | null;
  onSave: (location: ConfigLocation, updates: Partial<AssistantsConfig>) => Promise<void>;
  onCancel: () => void;
}

const SECTIONS: { id: ConfigSection; name: string }[] = [
  { id: 'overview', name: 'Overview' },
  { id: 'model', name: 'Model' },
  { id: 'context', name: 'Context' },
  { id: 'memory', name: 'Memory' },
  { id: 'subassistants', name: 'Subassistants' },
  { id: 'voice', name: 'Voice' },

  { id: 'statusLine', name: 'Status Line' },
];

type Mode = 'sections' | 'editing' | 'location-select';

export function ConfigPanel({
  config,
  userConfig,
  projectConfig,
  localConfig,
  onSave,
  onCancel,
}: ConfigPanelProps) {
  const [selectedSection, setSelectedSection] = useState(0);
  const [mode, setMode] = useState<Mode>('sections');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saveLocation, setSaveLocation] = useState<ConfigLocation>('project');
  const [locationSelectIndex, setLocationSelectIndex] = useState(1); // Default to project
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Model editing state
  const configModelIndex = ALL_MODELS.findIndex((m) => m.id === config.llm?.model);
  const defaultModelIndex = Math.max(0, ALL_MODELS.findIndex((m) => m.id === DEFAULT_MODEL));
  const [selectedModelIndex, setSelectedModelIndex] = useState(
    configModelIndex >= 0 ? configModelIndex : defaultModelIndex
  );
  const [maxTokens, setMaxTokens] = useState(config.llm?.maxTokens ?? 8192);

  // Clear message after 3 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // Section navigation
  useInput((input, key) => {
    if (mode !== 'sections') return;

    // Navigate sections
    if (key.upArrow) {
      setSelectedSection((prev) => (prev === 0 ? SECTIONS.length - 1 : prev - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedSection((prev) => (prev === SECTIONS.length - 1 ? 0 : prev + 1));
      return;
    }

    // Number keys for quick jump
    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= 1 && num <= SECTIONS.length) {
      setSelectedSection(num - 1);
      return;
    }

    // Enter to edit section
    if (key.return) {
      const section = SECTIONS[selectedSection];
      if (section.id !== 'overview') {
        setMode('editing');
      }
      return;
    }

    // Escape or q to close
    if (key.escape || input === 'q' || input === 'Q') {
      onCancel();
      return;
    }
  }, { isActive: mode === 'sections' });

  // Editing mode handler
  useInput((input, key) => {
    if (mode !== 'editing') return;

    const section = SECTIONS[selectedSection];

    // Escape to go back (reset unsaved model selection)
    if (key.escape) {
      setEditingField(null);
      setSelectedModelIndex(configModelIndex >= 0 ? configModelIndex : defaultModelIndex);
      setMaxTokens(config.llm?.maxTokens ?? 8192);
      setMode('sections');
      return;
    }

    // Model section specific controls
    if (section.id === 'model' && !editingField) {
      if (key.upArrow) {
        setSelectedModelIndex((prev) => (prev === 0 ? ALL_MODELS.length - 1 : prev - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedModelIndex((prev) => (prev === ALL_MODELS.length - 1 ? 0 : prev + 1));
        return;
      }
      if (key.leftArrow) {
        setMaxTokens((prev: number) => Math.max(1024, prev - 1024));
        return;
      }
      if (key.rightArrow) {
        setMaxTokens((prev: number) => Math.min(16384, prev + 1024));
        return;
      }
      if (key.return || input === 's' || input === 'S') {
        // Save model settings
        setMode('location-select');
        return;
      }
    }

    // Toggle boolean values
    if (input === 't' || input === 'T') {
      if (section.id === 'memory') {
        handleSaveField('memory.enabled', !config.memory?.enabled);
      } else if (section.id === 'voice') {
        handleSaveField('voice.enabled', !config.voice?.enabled);
      }
      return;
    }

    // Number input for numeric fields
    if (section.id === 'context' && !editingField) {
      if (input === '1') {
        setEditingField('context.maxContextTokens');
        setEditValue(String(config.context?.maxContextTokens ?? 180000));
      } else if (input === '2') {
        setEditingField('context.keepRecentMessages');
        setEditValue(String(config.context?.keepRecentMessages ?? 10));
      }
      return;
    }

    if (section.id === 'subassistants' && !editingField) {
      if (input === '1') {
        setEditingField('subassistants.maxDepth');
        setEditValue(String(config.subassistants?.maxDepth ?? 3));
      } else if (input === '2') {
        setEditingField('subassistants.maxConcurrent');
        setEditValue(String(config.subassistants?.maxConcurrent ?? 5));
      } else if (input === '3') {
        setEditingField('subassistants.maxTurns');
        setEditValue(String(config.subassistants?.maxTurns ?? 10));
      }
      return;
    }


    if (section.id === 'statusLine' && !editingField) {
      const sl = config.statusLine || {};
      const toggleField = (field: string, current?: boolean) => {
        handleSaveField(`statusLine.${field}`, !(current ?? true));
      };
      if (input === '1') { toggleField('showContext', sl.showContext); return; }
      if (input === '2') { toggleField('showSession', sl.showSession); return; }
      if (input === '3') { toggleField('showElapsed', sl.showElapsed); return; }
      if (input === '4') { toggleField('showHeartbeat', sl.showHeartbeat); return; }
      if (input === '5') { toggleField('showVoice', sl.showVoice); return; }
      if (input === '6') { toggleField('showQueue', sl.showQueue); return; }
      if (input === '7') { toggleField('showRecentTools', sl.showRecentTools); return; }
      return;
    }
  }, { isActive: mode === 'editing' && !editingField });

  // Text input submit handler
  const handleFieldSubmit = useCallback(() => {
    if (!editingField) return;

    const numValue = parseInt(editValue, 10);
    if (isNaN(numValue) || numValue < 0) {
      setMessage({ type: 'error', text: 'Invalid number' });
      return;
    }

    handleSaveField(editingField, numValue);
    setEditingField(null);
  }, [editingField, editValue]);

  // Field escape handler
  useInput((_input, key) => {
    if (mode === 'editing' && editingField && key.escape) {
      setEditingField(null);
    }
  }, { isActive: mode === 'editing' && !!editingField });

  // Location select handler
  useInput((input, key) => {
    if (mode !== 'location-select') return;

    const locations: ConfigLocation[] = ['user', 'project', 'local'];

    if (key.upArrow) {
      setLocationSelectIndex((prev) => (prev === 0 ? 2 : prev - 1));
      return;
    }
    if (key.downArrow) {
      setLocationSelectIndex((prev) => (prev === 2 ? 0 : prev + 1));
      return;
    }
    if (key.return) {
      setSaveLocation(locations[locationSelectIndex]);
      performSave(locations[locationSelectIndex]);
      return;
    }
    if (key.escape) {
      setMode('editing');
      return;
    }
  }, { isActive: mode === 'location-select' });

  // Save a single field
  const handleSaveField = async (field: string, value: unknown) => {
    const updates = buildUpdates(field, value);
    await performSave(saveLocation, updates);
  };

  // Build nested updates object
  const buildUpdates = (field: string, value: unknown): Partial<AssistantsConfig> => {
    const parts = field.split('.');
    const updates: Record<string, unknown> = {};
    let current = updates;

    for (let i = 0; i < parts.length - 1; i++) {
      current[parts[i]] = {};
      current = current[parts[i]] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;

    return updates as Partial<AssistantsConfig>;
  };

  // Perform save
  const performSave = async (location: ConfigLocation, updates?: Partial<AssistantsConfig>) => {
    setIsSubmitting(true);
    try {
      const section = SECTIONS[selectedSection];
      let saveUpdates = updates;

      // If no updates provided, use current editing state
      if (!saveUpdates && section.id === 'model') {
        const selectedModel = ALL_MODELS[selectedModelIndex];
        saveUpdates = {
          llm: {
            provider: selectedModel?.provider ?? config.llm?.provider ?? 'anthropic',
            model: selectedModel?.id ?? config.llm?.model ?? DEFAULT_MODEL,
            maxTokens,
          },
        };
      }

      if (saveUpdates) {
        await onSave(location, saveUpdates);
        setMessage({ type: 'success', text: `Saved to ${location} config` });
      }
      setMode('sections');
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Save failed' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get source indicator for a value
  const getSource = (path: string): string => {
    const parts = path.split('.');
    const getValue = (obj: Record<string, unknown> | null | undefined, keys: string[]): unknown => {
      if (!obj) return undefined;
      let current: unknown = obj;
      for (const key of keys) {
        if (current && typeof current === 'object' && key in current) {
          current = (current as Record<string, unknown>)[key];
        } else {
          return undefined;
        }
      }
      return current;
    };

    if (getValue(localConfig as Record<string, unknown>, parts) !== undefined) return '[local]';
    if (getValue(projectConfig as Record<string, unknown>, parts) !== undefined) return '[project]';
    if (getValue(userConfig as Record<string, unknown>, parts) !== undefined) return '[user]';
    return '[default]';
  };

  // Render section content
  const renderSectionContent = () => {
    const section = SECTIONS[selectedSection];

    switch (section.id) {
      case 'overview':
        return (
          <box flexDirection="column">
            <text><b>Configuration Overview</b></text>
            <box marginTop={1} flexDirection="column">
              <text fg="gray">Config sources (in priority order):</text>
              <text>  1. Local:   .assistants/config.local.json {localConfig ? 'present' : 'none'}</text>
              <text>  2. Project: .assistants/config.json {projectConfig ? 'present' : 'none'}</text>
              <text>  3. User:    ~/.assistants/config.json {userConfig ? 'present' : 'none'}</text>
              <text>  4. Default: Built-in defaults</text>
            </box>
            <box marginTop={1} flexDirection="column">
              <text fg="gray">Current effective settings:</text>
              <text>  Model: {getModelDisplayName(config.llm?.model ?? DEFAULT_MODEL)}</text>
              <text>  Max Tokens: {config.llm?.maxTokens ?? 8192}</text>
              <text>  Memory: {config.memory?.enabled ? 'enabled' : 'disabled'}</text>
              <text>  Voice: {config.voice?.enabled ? 'enabled' : 'disabled'}</text>
            </box>
          </box>
        );

      case 'model':
        return (
          <box flexDirection="column">
            <text><b>Model Settings</b></text>
            <box marginTop={1} flexDirection="column">
              <text fg="gray">Select model: (↑/↓)</text>
              <box flexDirection="column" marginTop={1} marginBottom={1}>
                {ALL_MODELS.map((model, index) => (
                  <text
                    key={model.id}
                    attributes={index === selectedModelIndex ? 32 : undefined}
                    fg={index === selectedModelIndex ? 'cyan' : undefined}
                    fg={index !== selectedModelIndex ? "gray" : undefined}
                  >
                    {index === selectedModelIndex ? '>' : ' '} {model.name}
                    <text fg="gray"> ({getProviderLabel(model.provider)})</text>
                    <text fg="gray"> - {model.description}</text>
                  </text>
                ))}
              </box>
            </box>
            <box marginTop={1} flexDirection="column">
              <text>Max Tokens: <text fg="cyan">{maxTokens}</text> (←/→ to adjust by 1024)</text>
              <text fg="gray">
                {maxTokens < 4096 ? 'Short responses' : maxTokens > 12000 ? 'Very long responses' : 'Standard length'}
              </text>
            </box>
            <box marginTop={1}>
              <text fg="gray">Press s to save | Esc to cancel</text>
            </box>
          </box>
        );

      case 'context':
        return (
          <box flexDirection="column">
            <text><b>Context Settings</b></text>
            <box marginTop={1} flexDirection="column">
              {editingField === 'context.maxContextTokens' ? (
                <box>
                  <text>1. Max Context Tokens: </text>
                  <input
                    value={editValue}
                    onChange={setEditValue}
                    onSubmit={handleFieldSubmit}
                    focused
                  />
                </box>
              ) : (
                <text>
                  1. Max Context Tokens: <text fg="cyan">{config.context?.maxContextTokens ?? 180000}</text>
                  <text fg="gray"> {getSource('context.maxContextTokens')}</text>
                </text>
              )}
              {editingField === 'context.keepRecentMessages' ? (
                <box>
                  <text>2. Keep Recent Messages: </text>
                  <input
                    value={editValue}
                    onChange={setEditValue}
                    onSubmit={handleFieldSubmit}
                    focused
                  />
                </box>
              ) : (
                <text>
                  2. Keep Recent Messages: <text fg="cyan">{config.context?.keepRecentMessages ?? 10}</text>
                  <text fg="gray"> {getSource('context.keepRecentMessages')}</text>
                </text>
              )}
              <text>
                Summary Strategy: <text fg="cyan">{config.context?.summaryStrategy ?? 'hybrid'}</text>
                <text fg="gray"> {getSource('context.summaryStrategy')}</text>
              </text>
              <text>
                Summary Max Tokens: <text fg="cyan">{config.context?.summaryMaxTokens ?? 2000}</text>
              </text>
            </box>
            <box marginTop={1}>
              <text fg="gray">Press 1-2 to edit | Esc to go back</text>
            </box>
          </box>
        );

      case 'memory':
        return (
          <box flexDirection="column">
            <text><b>Memory Settings</b></text>
            <box marginTop={1} flexDirection="column">
              <text>
                Enabled: <text fg={config.memory?.enabled ? 'green' : 'red'}>{config.memory?.enabled ? 'Yes' : 'No'}</text>
                <text fg="gray"> (t to toggle) {getSource('memory.enabled')}</text>
              </text>
              <text>
                Injection: <text fg={config.memory?.injection?.enabled ? 'green' : 'red'}>{config.memory?.injection?.enabled ? 'Yes' : 'No'}</text>
              </text>
              <text>
                Max Injection Tokens: <text fg="cyan">{config.memory?.injection?.maxTokens ?? 500}</text>
              </text>
              <text>
                Min Importance: <text fg="cyan">{config.memory?.injection?.minImportance ?? 5}</text>
              </text>
              <text>
                Max Entries: <text fg="cyan">{config.memory?.storage?.maxEntries ?? 1000}</text>
              </text>
            </box>
            <box marginTop={1}>
              <text fg="gray">Scopes:</text>
              <text fg="gray">  Global: {config.memory?.scopes?.globalEnabled ? 'enabled' : 'disabled'}</text>
              <text fg="gray">  Shared: {config.memory?.scopes?.sharedEnabled ? 'enabled' : 'disabled'}</text>
              <text fg="gray">  Private: {config.memory?.scopes?.privateEnabled ? 'enabled' : 'disabled'}</text>
            </box>
            <box marginTop={1}>
              <text fg="gray">Press t to toggle enabled | Esc to go back</text>
            </box>
          </box>
        );

      case 'subassistants':
        return (
          <box flexDirection="column">
            <text><b>Subassistants Settings</b></text>
            <box marginTop={1} flexDirection="column">
              {editingField === 'subassistants.maxDepth' ? (
                <box>
                  <text>1. Max Depth: </text>
                  <input
                    value={editValue}
                    onChange={setEditValue}
                    onSubmit={handleFieldSubmit}
                    focused
                  />
                </box>
              ) : (
                <text>
                  1. Max Depth: <text fg="cyan">{config.subassistants?.maxDepth ?? 3}</text>
                  <text fg="gray"> {getSource('subassistants.maxDepth')}</text>
                </text>
              )}
              {editingField === 'subassistants.maxConcurrent' ? (
                <box>
                  <text>2. Max Concurrent: </text>
                  <input
                    value={editValue}
                    onChange={setEditValue}
                    onSubmit={handleFieldSubmit}
                    focused
                  />
                </box>
              ) : (
                <text>
                  2. Max Concurrent: <text fg="cyan">{config.subassistants?.maxConcurrent ?? 5}</text>
                  <text fg="gray"> {getSource('subassistants.maxConcurrent')}</text>
                </text>
              )}
              {editingField === 'subassistants.maxTurns' ? (
                <box>
                  <text>3. Max Turns: </text>
                  <input
                    value={editValue}
                    onChange={setEditValue}
                    onSubmit={handleFieldSubmit}
                    focused
                  />
                </box>
              ) : (
                <text>
                  3. Max Turns: <text fg="cyan">{config.subassistants?.maxTurns ?? 10}</text>
                  <text fg="gray"> {getSource('subassistants.maxTurns')}</text>
                </text>
              )}
              <text>
                Default Timeout: <text fg="cyan">{Math.round((config.subassistants?.defaultTimeoutMs ?? 120000) / 1000)}s</text>
              </text>
            </box>
            <box marginTop={1}>
              <text fg="gray">Default Tools: {(config.subassistants?.defaultTools ?? []).slice(0, 5).join(', ')}...</text>
            </box>
            <box marginTop={1}>
              <text fg="gray">Press 1-3 to edit | Esc to go back</text>
            </box>
          </box>
        );

      case 'voice':
        return (
          <box flexDirection="column">
            <text><b>Voice Settings</b></text>
            <box marginTop={1} flexDirection="column">
              <text>
                Enabled: <text fg={config.voice?.enabled ? 'green' : 'red'}>{config.voice?.enabled ? 'Yes' : 'No'}</text>
                <text fg="gray"> (t to toggle) {getSource('voice.enabled')}</text>
              </text>
              <text>
                TTS Provider: <text fg="cyan">{config.voice?.tts?.provider ?? 'elevenlabs'}</text>
              </text>
              <text>
                STT Provider: <text fg="cyan">{config.voice?.stt?.provider ?? 'whisper'}</text>
              </text>
              <text>
                Auto Listen: <text fg={config.voice?.autoListen ? 'green' : 'red'}>{config.voice?.autoListen ? 'Yes' : 'No'}</text>
              </text>
            </box>
            <box marginTop={1}>
              <text fg="gray">Press t to toggle enabled | Esc to go back</text>
            </box>
          </box>
        );

      case 'statusLine': {
        const sl = config.statusLine || {};
        const showIcon = (v?: boolean) => (v ?? true) ? 'Yes' : 'No';
        const showColor = (v?: boolean) => (v ?? true) ? 'green' : 'red';
        return (
          <box flexDirection="column">
            <text><b>Status Line Settings</b></text>
            <box marginTop={1} flexDirection="column">
              <text>1. Context %:     <text fg={showColor(sl.showContext)}>{showIcon(sl.showContext)}</text></text>
              <text>2. Session:       <text fg={showColor(sl.showSession)}>{showIcon(sl.showSession)}</text></text>
              <text>3. Elapsed Time:  <text fg={showColor(sl.showElapsed)}>{showIcon(sl.showElapsed)}</text></text>
              <text>4. Heartbeat:     <text fg={showColor(sl.showHeartbeat)}>{showIcon(sl.showHeartbeat)}</text></text>
              <text>5. Voice:         <text fg={showColor(sl.showVoice)}>{showIcon(sl.showVoice)}</text></text>
              <text>6. Queue:         <text fg={showColor(sl.showQueue)}>{showIcon(sl.showQueue)}</text></text>
              <text>7. Recent Tools:  <text fg={showColor(sl.showRecentTools)}>{showIcon(sl.showRecentTools)}</text></text>
            </box>
            <box marginTop={1}>
              <text fg="gray">1-7 toggle metric | Esc back</text>
            </box>
          </box>
        );
      }

      default:
        return null;
    }
  };

  // Location select dialog
  if (mode === 'location-select') {
    const locations: { id: ConfigLocation; name: string; desc: string }[] = [
      { id: 'user', name: 'User (~/.assistants/config.json)', desc: 'Global settings for all projects' },
      { id: 'project', name: 'Project (.assistants/config.json)', desc: 'Settings for this project' },
      { id: 'local', name: 'Local (.assistants/config.local.json)', desc: 'Local overrides (gitignored)' },
    ];

    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg="cyan"><b>Save to which config?</b></text>
        </box>
        <box flexDirection="column" borderStyle="rounded" borderColor="#d4d4d8" borderLeft={false} borderRight={false} paddingX={1}>
          {locations.map((loc, index) => (
            <box key={loc.id} flexDirection="column">
              <text
                attributes={index === locationSelectIndex ? 32 : undefined}
                fg={index === locationSelectIndex ? 'cyan' : undefined}
              >
                {index === locationSelectIndex ? '>' : ' '} {loc.name}
              </text>
              {index === locationSelectIndex && (
                <text fg="gray">    {loc.desc}</text>
              )}
            </box>
          ))}
        </box>
        <box marginTop={1}>
          <text fg="gray">↑/↓ select | Enter confirm | Esc cancel</text>
        </box>
        {isSubmitting && (
          <box marginTop={1}>
            <text fg="yellow">Saving...</text>
          </box>
        )}
      </box>
    );
  }

  // Main UI
  return (
    <box flexDirection="column" paddingY={1}>
      <box marginBottom={1} justifyContent="space-between">
        <text><b>Configuration</b></text>
        <text fg="gray">{mode === 'editing' ? 'Editing' : 'Sections'}</text>
      </box>

      <box>
        {/* Section list */}
        <box
          flexDirection="column"
          borderStyle="rounded"
          borderColor="#d4d4d8" borderLeft={false} borderRight={false}
          paddingX={1}
          marginRight={1}
          width={26}
        >
          {SECTIONS.map((section, index) => (
            <text
              key={section.id}
              attributes={index === selectedSection ? 32 : undefined}
              fg={index === selectedSection ? 'cyan' : undefined}
              fg={index !== selectedSection ? "gray" : undefined}
            >
              {index === selectedSection ? '>' : ' '} {section.name}
            </text>
          ))}
        </box>

        {/* Section content */}
        <box
          flexDirection="column"
          borderStyle="rounded"
          borderColor="#d4d4d8" borderLeft={false} borderRight={false}
          paddingX={1}
          flexGrow={1}
        >
          {renderSectionContent()}
        </box>
      </box>

      {/* Message */}
      {message && (
        <box marginTop={1}>
          <text fg={message.type === 'success' ? 'green' : 'red'}>{message.text}</text>
        </box>
      )}

      {/* Footer */}
      <box marginTop={1}>
        <text fg="gray">
          {mode === 'sections'
            ? '↑/↓ navigate | Enter edit section | 1-7 jump | Esc close'
            : 'Esc back to sections'}
        </text>
      </box>
    </box>
  );
}
