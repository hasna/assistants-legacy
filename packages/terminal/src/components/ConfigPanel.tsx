import React, { useEffect, useState, useCallback } from 'react';
import type { AssistantsConfig } from '@hasna/assistants-shared';
import { useSafeInput as useInput } from '../hooks/useSafeInput';
import {
  ALL_MODELS,
  DEFAULT_MODEL,
  getModelDisplayName,
  getProviderModelId,
  getProviderLabel,
} from '@hasna/assistants-shared';
import { themeColor } from '../theme/colors';

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
  const configModelIndex = ALL_MODELS.findIndex((m) => getProviderModelId(m) === config.llm?.model);
  const defaultModelIndex = Math.max(0, ALL_MODELS.findIndex((m) => getProviderModelId(m) === DEFAULT_MODEL));
  const [selectedModelIndex, setSelectedModelIndex] = useState(
    configModelIndex >= 0 ? configModelIndex : defaultModelIndex
  );
  const [maxOutputTokens, setMaxOutputTokens] = useState(config.llm?.maxOutputTokens ?? 8192);

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
      setMaxOutputTokens(config.llm?.maxOutputTokens ?? 8192);
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
        setMaxOutputTokens((prev: number) => Math.max(1024, prev - 1024));
        return;
      }
      if (key.rightArrow) {
        setMaxOutputTokens((prev: number) => Math.min(16384, prev + 1024));
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
            model: selectedModel ? getProviderModelId(selectedModel) : config.llm?.model ?? DEFAULT_MODEL,
            maxOutputTokens,
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
              <text fg={themeColor('muted')}>Config sources (in priority order):</text>
              <text>  1. Local:   .assistants/config.local.json {localConfig ? 'present' : 'none'}</text>
              <text>  2. Project: .assistants/config.json {projectConfig ? 'present' : 'none'}</text>
              <text>  3. User:    ~/.hasna/assistants/config.json {userConfig ? 'present' : 'none'}</text>
              <text>  4. Default: Built-in defaults</text>
            </box>
            <box marginTop={1} flexDirection="column">
              <text fg={themeColor('muted')}>Current effective settings:</text>
              <text>  Model: {getModelDisplayName(config.llm?.model ?? DEFAULT_MODEL)}</text>
              <text>  Max Output Tokens: {config.llm?.maxOutputTokens ?? 8192}</text>
              <text>  Memory: {config.memory?.enabled ? 'enabled' : 'disabled'}</text>
              <text>  Voice: {config.voice?.enabled ? 'enabled' : 'disabled'}</text>
              <text>  Theme: {config.theme ?? 'auto'} <span fg={themeColor('muted')}>(/theme to change)</span></text>
            </box>
          </box>
        );

      case 'model':
        return (
          <box flexDirection="column">
            <text><b>Model Settings</b></text>
            <box marginTop={1} flexDirection="column">
              <text fg={themeColor('muted')}>Select model: (↑/↓)</text>
              <box flexDirection="column" marginTop={1} marginBottom={1}>
                {ALL_MODELS.map((model, index) => (
                  <text
                    key={getProviderModelId(model)}
                    bg={index === selectedModelIndex ? themeColor('primary') : undefined}
                    fg={index === selectedModelIndex ? themeColor('text') : undefined}
                  >
                    {index === selectedModelIndex ? '>' : ' '} {model.name}
                    <span fg={themeColor('muted')}> ({getProviderLabel(model.provider)})</span>
                    <span fg={themeColor('muted')}> - {model.description}</span>
                  </text>
                ))}
              </box>
            </box>
            <box marginTop={1} flexDirection="column">
              <text>Max Output Tokens: <span fg={themeColor('info')}>{maxOutputTokens}</span> (←/→ to adjust by 1024)</text>
              <text fg={themeColor('muted')}>
                {maxOutputTokens < 4096 ? 'Short responses' : maxOutputTokens > 12000 ? 'Very long responses' : 'Standard length'}
              </text>
            </box>
            <box marginTop={1}>
              <text fg={themeColor('muted')}>Press s to save | Esc to cancel</text>
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
                  1. Max Context Tokens: <span fg={themeColor('info')}>{config.context?.maxContextTokens ?? 180000}</span>
                  <span fg={themeColor('muted')}> {getSource('context.maxContextTokens')}</span>
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
                  2. Keep Recent Messages: <span fg={themeColor('info')}>{config.context?.keepRecentMessages ?? 10}</span>
                  <span fg={themeColor('muted')}> {getSource('context.keepRecentMessages')}</span>
                </text>
              )}
              <text>
                Summary Strategy: <span fg={themeColor('info')}>{config.context?.summaryStrategy ?? 'hybrid'}</span>
                <span fg={themeColor('muted')}> {getSource('context.summaryStrategy')}</span>
              </text>
              <text>
                Summary Max Tokens: <span fg={themeColor('info')}>{config.context?.summaryMaxTokens ?? 2000}</span>
              </text>
            </box>
            <box marginTop={1}>
              <text fg={themeColor('muted')}>Press 1-2 to edit | Esc to go back</text>
            </box>
          </box>
        );

      case 'memory':
        return (
          <box flexDirection="column">
            <text><b>Memory Settings</b></text>
            <box marginTop={1} flexDirection="column">
              <text>
                Enabled: <span fg={config.memory?.enabled ? themeColor('success') : themeColor('red')}>{config.memory?.enabled ? 'Yes' : 'No'}</span>
                <span fg={themeColor('muted')}> (t to toggle) {getSource('memory.enabled')}</span>
              </text>
              <text>
                Injection: <span fg={config.memory?.injection?.enabled ? themeColor('success') : themeColor('red')}>{config.memory?.injection?.enabled ? 'Yes' : 'No'}</span>
              </text>
              <text>
                Max Injection Tokens: <span fg={themeColor('info')}>{config.memory?.injection?.maxTokens ?? 500}</span>
              </text>
              <text>
                Min Importance: <span fg={themeColor('info')}>{config.memory?.injection?.minImportance ?? 5}</span>
              </text>
              <text>
                Max Entries: <span fg={themeColor('info')}>{config.memory?.storage?.maxEntries ?? 1000}</span>
              </text>
            </box>
            <box marginTop={1}>
              <text fg={themeColor('muted')}>Scopes:</text>
              <text fg={themeColor('muted')}>  Global: {config.memory?.scopes?.globalEnabled ? 'enabled' : 'disabled'}</text>
              <text fg={themeColor('muted')}>  Shared: {config.memory?.scopes?.sharedEnabled ? 'enabled' : 'disabled'}</text>
              <text fg={themeColor('muted')}>  Private: {config.memory?.scopes?.privateEnabled ? 'enabled' : 'disabled'}</text>
            </box>
            <box marginTop={1}>
              <text fg={themeColor('muted')}>Press t to toggle enabled | Esc to go back</text>
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
                  1. Max Depth: <span fg={themeColor('info')}>{config.subassistants?.maxDepth ?? 3}</span>
                  <span fg={themeColor('muted')}> {getSource('subassistants.maxDepth')}</span>
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
                  2. Max Concurrent: <span fg={themeColor('info')}>{config.subassistants?.maxConcurrent ?? 5}</span>
                  <span fg={themeColor('muted')}> {getSource('subassistants.maxConcurrent')}</span>
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
                  3. Max Turns: <span fg={themeColor('info')}>{config.subassistants?.maxTurns ?? 10}</span>
                  <span fg={themeColor('muted')}> {getSource('subassistants.maxTurns')}</span>
                </text>
              )}
              <text>
                Default Timeout: <span fg={themeColor('info')}>{Math.round((config.subassistants?.defaultTimeoutMs ?? 120000) / 1000)}s</span>
              </text>
            </box>
            <box marginTop={1}>
              <text fg={themeColor('muted')}>Default Tools: {(config.subassistants?.defaultTools ?? []).slice(0, 5).join(', ')}...</text>
            </box>
            <box marginTop={1}>
              <text fg={themeColor('muted')}>Press 1-3 to edit | Esc to go back</text>
            </box>
          </box>
        );

      case 'voice':
        return (
          <box flexDirection="column">
            <text><b>Voice Settings</b></text>
            <box marginTop={1} flexDirection="column">
              <text>
                Enabled: <span fg={config.voice?.enabled ? themeColor('success') : themeColor('red')}>{config.voice?.enabled ? 'Yes' : 'No'}</span>
                <span fg={themeColor('muted')}> (t to toggle) {getSource('voice.enabled')}</span>
              </text>
              <text>
                TTS Provider: <span fg={themeColor('info')}>{config.voice?.tts?.provider ?? 'elevenlabs'}</span>
              </text>
              <text>
                STT Provider: <span fg={themeColor('info')}>{config.voice?.stt?.provider ?? 'whisper'}</span>
              </text>
              <text>
                Auto Listen: <span fg={config.voice?.autoListen ? themeColor('success') : themeColor('red')}>{config.voice?.autoListen ? 'Yes' : 'No'}</span>
              </text>
            </box>
            <box marginTop={1}>
              <text fg={themeColor('muted')}>Press t to toggle enabled | Esc to go back</text>
            </box>
          </box>
        );

      case 'statusLine': {
        const sl = config.statusLine || {};
        const showIcon = (v?: boolean) => (v ?? true) ? 'Yes' : 'No';
        const showColor = (v?: boolean) => (v ?? true) ? themeColor('success') : 'red';
        return (
          <box flexDirection="column">
            <text><b>Status Line Settings</b></text>
            <box marginTop={1} flexDirection="column">
              <text>1. Context %:     <span fg={showColor(sl.showContext)}>{showIcon(sl.showContext)}</span></text>
              <text>2. Session:       <span fg={showColor(sl.showSession)}>{showIcon(sl.showSession)}</span></text>
              <text>3. Elapsed Time:  <span fg={showColor(sl.showElapsed)}>{showIcon(sl.showElapsed)}</span></text>
              <text>4. Heartbeat:     <span fg={showColor(sl.showHeartbeat)}>{showIcon(sl.showHeartbeat)}</span></text>
              <text>5. Voice:         <span fg={showColor(sl.showVoice)}>{showIcon(sl.showVoice)}</span></text>
              <text>6. Queue:         <span fg={showColor(sl.showQueue)}>{showIcon(sl.showQueue)}</span></text>
              <text>7. Recent Tools:  <span fg={showColor(sl.showRecentTools)}>{showIcon(sl.showRecentTools)}</span></text>
            </box>
            <box marginTop={1}>
              <text fg={themeColor('muted')}>1-7 toggle metric | Esc back</text>
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
      { id: 'user', name: 'User (~/.hasna/assistants/config.json)', desc: 'Global settings for all projects' },
      { id: 'project', name: 'Project (.assistants/config.json)', desc: 'Settings for this project' },
      { id: 'local', name: 'Local (.assistants/config.local.json)', desc: 'Local overrides (gitignored)' },
    ];

    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg={themeColor('info')}><b>Save to which config?</b></text>
        </box>
        <box flexDirection="column" borderStyle="rounded" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1}>
          {locations.map((loc, index) => (
            <box key={loc.id} flexDirection="column">
              <text
                bg={index === locationSelectIndex ? themeColor('primary') : undefined}
                fg={index === locationSelectIndex ? themeColor('text') : undefined}
              >
                {index === locationSelectIndex ? '>' : ' '} {loc.name}
              </text>
              {index === locationSelectIndex && (
                <text fg={themeColor('muted')}>    {loc.desc}</text>
              )}
            </box>
          ))}
        </box>
        <box marginTop={1}>
          <text fg={themeColor('muted')}>↑/↓ select | Enter confirm | Esc cancel</text>
        </box>
        {isSubmitting && (
          <box marginTop={1}>
            <text fg={themeColor('warning')}>Saving...</text>
          </box>
        )}
      </box>
    );
  }

  // Main UI
  return (
    <box flexDirection="column" paddingY={1}>
      <box flexDirection="row" marginBottom={1} justifyContent="space-between">
        <text><b>Configuration</b></text>
        <text fg={themeColor('muted')}>{mode === 'editing' ? 'Editing' : 'Sections'}</text>
      </box>

      <box>
        {/* Section list */}
        <box
          flexDirection="column"
          borderStyle="rounded"
          borderColor={themeColor('border')} border={["top", "bottom"]}
          paddingX={1}
          marginRight={1}
          width={26}
        >
          {SECTIONS.map((section, index) => (
            <text
              key={section.id}
              bg={index === selectedSection ? themeColor('primary') : undefined}
              fg={index === selectedSection ? themeColor('text') : undefined}
            >
              {index === selectedSection ? '>' : ' '} {section.name}
            </text>
          ))}
        </box>

        {/* Section content */}
        <box
          flexDirection="column"
          borderStyle="rounded"
          borderColor={themeColor('border')} border={["top", "bottom"]}
          paddingX={1}
          flexGrow={1}
        >
          {renderSectionContent()}
        </box>
      </box>

      {/* Message */}
      {message && (
        <box marginTop={1}>
          <text fg={message.type === 'success' ? themeColor('success') : themeColor('red')}>{message.text}</text>
        </box>
      )}

      {/* Footer */}
      <box marginTop={1}>
        <text fg={themeColor('muted')}>
          {mode === 'sections'
            ? '↑/↓ navigate | Enter edit section | 1-7 jump | Esc close'
            : 'Esc back to sections'}
        </text>
      </box>
    </box>
  );
}
