import React, { useEffect, useState, useCallback } from 'react';
import type { AssistantsConfig } from '@hasna/assistants-shared';
import {
  ALL_MODELS,
  DEFAULT_MODEL,
  getModelDisplayName,
  getProviderModelId,
  getProviderLabel,
} from '@hasna/assistants-shared';
import { Box, Text, TextInput, useInput } from '../ui/ink';
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
    if (key.escape || input === '\x1b' || input === 'q' || input === 'Q') {
      onCancel();
      return;
    }
  }, { isActive: mode === 'sections' });

  // Editing mode handler
  useInput((input, key) => {
    if (mode !== 'editing') return;

    const section = SECTIONS[selectedSection];

    // Escape to go back (reset unsaved model selection)
    if (key.escape || input === '\x1b') {
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
  const handleFieldSubmit = useCallback((submittedValue: string = editValue) => {
    if (!editingField) return;

    const numValue = parseInt(submittedValue, 10);
    if (isNaN(numValue) || numValue < 0) {
      setMessage({ type: 'error', text: 'Invalid number' });
      return;
    }

    handleSaveField(editingField, numValue);
    setEditingField(null);
  }, [editingField, editValue]);

  // Field escape handler
  useInput((input, key) => {
    if (mode === 'editing' && editingField && (key.escape || input === '\x1b')) {
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
    if (key.escape || input === '\x1b') {
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
          <Box flexDirection="column">
            <Text bold>Configuration Overview</Text>
            <Box marginTop={1} flexDirection="column">
              <Text fg={themeColor('muted')}>Config sources (in priority order):</Text>
              <Text>  1. Local:   .assistants/config.local.json {localConfig ? 'present' : 'none'}</Text>
              <Text>  2. Project: .assistants/config.json {projectConfig ? 'present' : 'none'}</Text>
              <Text>  3. User:    ~/.hasna/assistants/config.json {userConfig ? 'present' : 'none'}</Text>
              <Text>  4. Default: Built-in defaults</Text>
            </Box>
            <Box marginTop={1} flexDirection="column">
              <Text fg={themeColor('muted')}>Current effective settings:</Text>
              <Text>  Model: {getModelDisplayName(config.llm?.model ?? DEFAULT_MODEL)}</Text>
              <Text>  Max Output Tokens: {config.llm?.maxOutputTokens ?? 8192}</Text>
              <Text>  Memory: {config.memory?.enabled ? 'enabled' : 'disabled'}</Text>
              <Text>  Voice: {config.voice?.enabled ? 'enabled' : 'disabled'}</Text>
              <Text>  Theme: {config.theme ?? 'auto'} <Text fg={themeColor('muted')}>(/theme to change)</Text></Text>
            </Box>
          </Box>
        );

      case 'model':
        return (
          <Box flexDirection="column">
            <Text bold>Model Settings</Text>
            <Box marginTop={1} flexDirection="column">
              <Text fg={themeColor('muted')}>Select model: (↑/↓)</Text>
              <Box flexDirection="column" marginTop={1} marginBottom={1}>
                {ALL_MODELS.map((model, index) => (
                  <Text
                    key={getProviderModelId(model)}
                    bg={index === selectedModelIndex ? themeColor('primary') : undefined}
                    fg={index === selectedModelIndex ? themeColor('text') : undefined}
                  >
                    {index === selectedModelIndex ? '>' : ' '} {model.name}
                    <Text fg={themeColor('muted')}> ({getProviderLabel(model.provider)})</Text>
                    <Text fg={themeColor('muted')}> - {model.description}</Text>
                  </Text>
                ))}
              </Box>
            </Box>
            <Box marginTop={1} flexDirection="column">
              <Text>Max Output Tokens: <Text fg={themeColor('info')}>{maxOutputTokens}</Text> (←/→ to adjust by 1024)</Text>
              <Text fg={themeColor('muted')}>
                {maxOutputTokens < 4096 ? 'Short responses' : maxOutputTokens > 12000 ? 'Very long responses' : 'Standard length'}
              </Text>
            </Box>
            <Box marginTop={1}>
              <Text fg={themeColor('muted')}>Press s to save | Esc to cancel</Text>
            </Box>
          </Box>
        );

      case 'context':
        return (
          <Box flexDirection="column">
            <Text bold>Context Settings</Text>
            <Box marginTop={1} flexDirection="column">
              {editingField === 'context.maxContextTokens' ? (
                <Box>
                  <Text>1. Max Context Tokens: </Text>
                  <TextInput
                    value={editValue}
                    onChange={setEditValue}
                    onSubmit={handleFieldSubmit}
                    focus
                    onCancel={() => setEditingField(null)}
                  />
                </Box>
              ) : (
                <Text>
                  1. Max Context Tokens: <Text fg={themeColor('info')}>{config.context?.maxContextTokens ?? 180000}</Text>
                  <Text fg={themeColor('muted')}> {getSource('context.maxContextTokens')}</Text>
                </Text>
              )}
              {editingField === 'context.keepRecentMessages' ? (
                <Box>
                  <Text>2. Keep Recent Messages: </Text>
                  <TextInput
                    value={editValue}
                    onChange={setEditValue}
                    onSubmit={handleFieldSubmit}
                    focus
                    onCancel={() => setEditingField(null)}
                  />
                </Box>
              ) : (
                <Text>
                  2. Keep Recent Messages: <Text fg={themeColor('info')}>{config.context?.keepRecentMessages ?? 10}</Text>
                  <Text fg={themeColor('muted')}> {getSource('context.keepRecentMessages')}</Text>
                </Text>
              )}
              <Text>
                Summary Strategy: <Text fg={themeColor('info')}>{config.context?.summaryStrategy ?? 'hybrid'}</Text>
                <Text fg={themeColor('muted')}> {getSource('context.summaryStrategy')}</Text>
              </Text>
              <Text>
                Summary Max Tokens: <Text fg={themeColor('info')}>{config.context?.summaryMaxTokens ?? 2000}</Text>
              </Text>
            </Box>
            <Box marginTop={1}>
              <Text fg={themeColor('muted')}>Press 1-2 to edit | Esc to go back</Text>
            </Box>
          </Box>
        );

      case 'memory':
        return (
          <Box flexDirection="column">
            <Text bold>Memory Settings</Text>
            <Box marginTop={1} flexDirection="column">
              <Text>
                Enabled: <Text fg={config.memory?.enabled ? themeColor('success') : themeColor('error')}>{config.memory?.enabled ? 'Yes' : 'No'}</Text>
                <Text fg={themeColor('muted')}> (t to toggle) {getSource('memory.enabled')}</Text>
              </Text>
              <Text>
                Injection: <Text fg={config.memory?.injection?.enabled ? themeColor('success') : themeColor('error')}>{config.memory?.injection?.enabled ? 'Yes' : 'No'}</Text>
              </Text>
              <Text>
                Max Injection Tokens: <Text fg={themeColor('info')}>{config.memory?.injection?.maxTokens ?? 500}</Text>
              </Text>
              <Text>
                Min Importance: <Text fg={themeColor('info')}>{config.memory?.injection?.minImportance ?? 5}</Text>
              </Text>
              <Text>
                Max Entries: <Text fg={themeColor('info')}>{config.memory?.storage?.maxEntries ?? 1000}</Text>
              </Text>
            </Box>
            <Box marginTop={1} flexDirection="column">
              <Text fg={themeColor('muted')}>Scopes:</Text>
              <Text fg={themeColor('muted')}>  Global: {config.memory?.scopes?.globalEnabled ? 'enabled' : 'disabled'}</Text>
              <Text fg={themeColor('muted')}>  Shared: {config.memory?.scopes?.sharedEnabled ? 'enabled' : 'disabled'}</Text>
              <Text fg={themeColor('muted')}>  Private: {config.memory?.scopes?.privateEnabled ? 'enabled' : 'disabled'}</Text>
            </Box>
            <Box marginTop={1}>
              <Text fg={themeColor('muted')}>Press t to toggle enabled | Esc to go back</Text>
            </Box>
          </Box>
        );

      case 'subassistants':
        return (
          <Box flexDirection="column">
            <Text bold>Subassistants Settings</Text>
            <Box marginTop={1} flexDirection="column">
              {editingField === 'subassistants.maxDepth' ? (
                <Box>
                  <Text>1. Max Depth: </Text>
                  <TextInput
                    value={editValue}
                    onChange={setEditValue}
                    onSubmit={handleFieldSubmit}
                    focus
                    onCancel={() => setEditingField(null)}
                  />
                </Box>
              ) : (
                <Text>
                  1. Max Depth: <Text fg={themeColor('info')}>{config.subassistants?.maxDepth ?? 3}</Text>
                  <Text fg={themeColor('muted')}> {getSource('subassistants.maxDepth')}</Text>
                </Text>
              )}
              {editingField === 'subassistants.maxConcurrent' ? (
                <Box>
                  <Text>2. Max Concurrent: </Text>
                  <TextInput
                    value={editValue}
                    onChange={setEditValue}
                    onSubmit={handleFieldSubmit}
                    focus
                    onCancel={() => setEditingField(null)}
                  />
                </Box>
              ) : (
                <Text>
                  2. Max Concurrent: <Text fg={themeColor('info')}>{config.subassistants?.maxConcurrent ?? 5}</Text>
                  <Text fg={themeColor('muted')}> {getSource('subassistants.maxConcurrent')}</Text>
                </Text>
              )}
              {editingField === 'subassistants.maxTurns' ? (
                <Box>
                  <Text>3. Max Turns: </Text>
                  <TextInput
                    value={editValue}
                    onChange={setEditValue}
                    onSubmit={handleFieldSubmit}
                    focus
                    onCancel={() => setEditingField(null)}
                  />
                </Box>
              ) : (
                <Text>
                  3. Max Turns: <Text fg={themeColor('info')}>{config.subassistants?.maxTurns ?? 10}</Text>
                  <Text fg={themeColor('muted')}> {getSource('subassistants.maxTurns')}</Text>
                </Text>
              )}
              <Text>
                Default Timeout: <Text fg={themeColor('info')}>{Math.round((config.subassistants?.defaultTimeoutMs ?? 120000) / 1000)}s</Text>
              </Text>
            </Box>
            <Box marginTop={1}>
              <Text fg={themeColor('muted')}>Default Tools: {(config.subassistants?.defaultTools ?? []).slice(0, 5).join(', ')}...</Text>
            </Box>
            <Box marginTop={1}>
              <Text fg={themeColor('muted')}>Press 1-3 to edit | Esc to go back</Text>
            </Box>
          </Box>
        );

      case 'voice':
        return (
          <Box flexDirection="column">
            <Text bold>Voice Settings</Text>
            <Box marginTop={1} flexDirection="column">
              <Text>
                Enabled: <Text fg={config.voice?.enabled ? themeColor('success') : themeColor('error')}>{config.voice?.enabled ? 'Yes' : 'No'}</Text>
                <Text fg={themeColor('muted')}> (t to toggle) {getSource('voice.enabled')}</Text>
              </Text>
              <Text>
                TTS Provider: <Text fg={themeColor('info')}>{config.voice?.tts?.provider ?? 'elevenlabs'}</Text>
              </Text>
              <Text>
                STT Provider: <Text fg={themeColor('info')}>{config.voice?.stt?.provider ?? 'whisper'}</Text>
              </Text>
              <Text>
                Auto Listen: <Text fg={config.voice?.autoListen ? themeColor('success') : themeColor('error')}>{config.voice?.autoListen ? 'Yes' : 'No'}</Text>
              </Text>
            </Box>
            <Box marginTop={1}>
              <Text fg={themeColor('muted')}>Press t to toggle enabled | Esc to go back</Text>
            </Box>
          </Box>
        );

      case 'statusLine': {
        const sl = config.statusLine || {};
        const showIcon = (v?: boolean) => (v ?? true) ? 'Yes' : 'No';
        const showColor = (v?: boolean) => (v ?? true) ? themeColor('success') : themeColor('error');
        return (
          <Box flexDirection="column">
            <Text bold>Status Line Settings</Text>
            <Box marginTop={1} flexDirection="column">
              <Text>1. Context %:     <Text fg={showColor(sl.showContext)}>{showIcon(sl.showContext)}</Text></Text>
              <Text>2. Session:       <Text fg={showColor(sl.showSession)}>{showIcon(sl.showSession)}</Text></Text>
              <Text>3. Elapsed Time:  <Text fg={showColor(sl.showElapsed)}>{showIcon(sl.showElapsed)}</Text></Text>
              <Text>4. Heartbeat:     <Text fg={showColor(sl.showHeartbeat)}>{showIcon(sl.showHeartbeat)}</Text></Text>
              <Text>5. Voice:         <Text fg={showColor(sl.showVoice)}>{showIcon(sl.showVoice)}</Text></Text>
              <Text>6. Queue:         <Text fg={showColor(sl.showQueue)}>{showIcon(sl.showQueue)}</Text></Text>
              <Text>7. Recent Tools:  <Text fg={showColor(sl.showRecentTools)}>{showIcon(sl.showRecentTools)}</Text></Text>
            </Box>
            <Box marginTop={1}>
              <Text fg={themeColor('muted')}>1-7 toggle metric | Esc back</Text>
            </Box>
          </Box>
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
      <Box flexDirection="column" paddingY={1}>
        <Box marginBottom={1}>
          <Text fg={themeColor('info')} bold>Save to which config?</Text>
        </Box>
        <Box flexDirection="column" borderStyle="round" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1}>
          {locations.map((loc, index) => (
            <Box key={loc.id} flexDirection="column">
              <Text
                bg={index === locationSelectIndex ? themeColor('primary') : undefined}
                fg={index === locationSelectIndex ? themeColor('text') : undefined}
              >
                {index === locationSelectIndex ? '>' : ' '} {loc.name}
              </Text>
              {index === locationSelectIndex && (
                <Text fg={themeColor('muted')}>    {loc.desc}</Text>
              )}
            </Box>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text fg={themeColor('muted')}>↑/↓ select | Enter confirm | Esc cancel</Text>
        </Box>
        {isSubmitting && (
          <Box marginTop={1}>
            <Text fg={themeColor('warning')}>Saving...</Text>
          </Box>
        )}
      </Box>
    );
  }

  // Main UI
  return (
    <Box flexDirection="column" paddingY={1}>
      <Box flexDirection="row" marginBottom={1} justifyContent="space-between">
        <Text bold>Configuration</Text>
        <Text fg={themeColor('muted')}>{mode === 'editing' ? 'Editing' : 'Sections'}</Text>
      </Box>

      <Box>
        {/* Section list */}
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={themeColor('border')} border={["top", "bottom"]}
          paddingX={1}
          marginRight={1}
          width={26}
        >
          {SECTIONS.map((section, index) => (
            <Text
              key={section.id}
              bg={index === selectedSection ? themeColor('primary') : undefined}
              fg={index === selectedSection ? themeColor('text') : undefined}
            >
              {index === selectedSection ? '>' : ' '} {section.name}
            </Text>
          ))}
        </Box>

        {/* Section content */}
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={themeColor('border')} border={["top", "bottom"]}
          paddingX={1}
          flexGrow={1}
        >
          {renderSectionContent()}
        </Box>
      </Box>

      {/* Message */}
      {message && (
        <Box marginTop={1}>
          <Text fg={message.type === 'success' ? themeColor('success') : themeColor('error')}>{message.text}</Text>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text fg={themeColor('muted')}>
          {mode === 'sections'
            ? '↑/↓ navigate | Enter edit section | 1-7 jump | Esc close'
            : 'Esc back to sections'}
        </Text>
      </Box>
    </Box>
  );
}
