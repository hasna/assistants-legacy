import React, { useEffect, useState, useCallback, useMemo } from 'react';
import type { Assistant, AssistantSettings, CreateAssistantOptions } from '@hasna/assistants-core';
import { Box, Text, TextInput, useInput } from '../ui/ink';
import {
  ALL_MODELS,
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
  MIN_TEMPERATURE,
  MAX_TEMPERATURE,
  TEMPERATURE_STEP,
  getModelDisplayName,
  getProviderModelId,
} from '@hasna/assistants-shared';
import { themeColor } from '../theme/colors';

interface AssistantsPanelProps {
  assistants: Assistant[];
  activeAssistantId?: string;
  onSelect: (assistantId: string) => void;
  onCreate: (options: CreateAssistantOptions) => Promise<void>;
  onUpdate: (id: string, updates: Partial<{ name: string; description: string; settings: Record<string, unknown> }>) => Promise<void>;
  onDelete: (assistantId: string) => Promise<void>;
  onCancel: () => void;
  error?: string | null;
  onClearError?: () => void;
}

/**
 * Format date for assistant display
 */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).toLowerCase();
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  }).toLowerCase();
}

type Mode = 'list' | 'create' | 'edit' | 'delete-confirm';
type CreateStep = 'name' | 'description' | 'model' | 'temperature' | 'systemPrompt';

function getBackendLabel(backend?: string): string {
  return backend || 'ai-sdk';
}

const DEFAULT_MODEL_INDEX = Math.max(0, ALL_MODELS.findIndex((m) => getProviderModelId(m) === DEFAULT_MODEL));

export function AssistantsPanel({
  assistants,
  activeAssistantId,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
  onCancel,
  error,
  onClearError,
}: AssistantsPanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [createStep, setCreateStep] = useState<CreateStep>('name');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create form state
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [selectedModelIndex, setSelectedModelIndex] = useState(
    DEFAULT_MODEL_INDEX
  );
  const [temperature, setTemperature] = useState(DEFAULT_TEMPERATURE);
  const [newSystemPrompt, setNewSystemPrompt] = useState('');

  // Edit state
  const [editingAssistant, setEditingAssistant] = useState<Assistant | null>(null);
  const [editStep, setEditStep] = useState<CreateStep>('name');

  const sortedAssistants = useMemo(() => {
    const system = assistants.filter((a) => a.isSystem);
    const user = assistants.filter((a) => !a.isSystem);
    return [...system, ...user];
  }, [assistants]);

  // Adjust selected index when assistants change
  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, sortedAssistants.length));
  }, [sortedAssistants.length]);

  // Reset form state
  const resetForm = useCallback(() => {
    setNewName('');
    setNewDescription('');
    setSelectedModelIndex(DEFAULT_MODEL_INDEX);
    setTemperature(DEFAULT_TEMPERATURE);
    setNewSystemPrompt('');
    setCreateStep('name');
    setEditingAssistant(null);
    setEditStep('name');
  }, []);

  useEffect(() => {
    if (mode === 'delete-confirm' && (sortedAssistants.length === 0 || selectedIndex >= sortedAssistants.length)) {
      setMode('list');
    }
  }, [mode, sortedAssistants.length, selectedIndex]);

  useEffect(() => {
    if (mode !== 'edit') return;
    if (!editingAssistant || !sortedAssistants.some((a) => a.id === editingAssistant.id)) {
      resetForm();
      setMode('list');
    }
  }, [mode, editingAssistant, sortedAssistants, resetForm]);

  // Handle list mode input
  useInput((input, key) => {
    if (mode !== 'list') return;

    // New assistant
    if (input === 'n' || input === 'N') {
      onClearError?.();
      resetForm();
      setMode('create');
      return;
    }

    // Edit assistant
    if (input === 'e' || input === 'E') {
      if (sortedAssistants.length > 0 && selectedIndex < sortedAssistants.length) {
        onClearError?.();
        const assistant = sortedAssistants[selectedIndex];
        setEditingAssistant(assistant);
        setNewName(assistant.name);
        setNewDescription(assistant.description || '');
        const modelIdx = ALL_MODELS.findIndex((m) => getProviderModelId(m) === assistant.settings.model);
        setSelectedModelIndex(modelIdx >= 0 ? modelIdx : DEFAULT_MODEL_INDEX);
        setTemperature(assistant.settings.temperature ?? DEFAULT_TEMPERATURE);
        setNewSystemPrompt(assistant.settings.systemPromptAddition || '');
        setEditStep('name');
        setMode('edit');
      }
      return;
    }

    // Delete assistant
    if (input === 'd' || input === 'D') {
      if (sortedAssistants.length > 0 && selectedIndex < sortedAssistants.length) {
        const assistant = sortedAssistants[selectedIndex];
        if (assistant.isSystem) {
          return; // Cannot delete system assistants
        }
        onClearError?.();
        setMode('delete-confirm');
      }
      return;
    }

    // Escape or q: cancel
    if (key.escape || input === '\x1b' || input === 'q' || input === 'Q') {
      onClearError?.();
      onCancel();
      return;
    }

    // Enter: select/switch assistant
    if (key.return) {
      onClearError?.();
      if (selectedIndex === sortedAssistants.length) {
        // "New assistant" option
        resetForm();
        setMode('create');
      } else {
        onSelect(sortedAssistants[selectedIndex].id);
      }
      return;
    }

    // Arrow navigation with wraparound
    if (key.upArrow) {
      setSelectedIndex((prev) => (prev === 0 ? sortedAssistants.length : prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => (prev === sortedAssistants.length ? 0 : prev + 1));
      return;
    }

    // Number keys for quick selection (1-9)
    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= 1 && num <= sortedAssistants.length) {
      setSelectedIndex(num - 1);
      return;
    }
  }, { isActive: mode === 'list' });

  // Handle delete confirmation input
  useInput((input, key) => {
    if (mode !== 'delete-confirm') return;

    if (input === 'y' || input === 'Y') {
      const assistant = sortedAssistants[selectedIndex];
      if (assistant) {
        setIsSubmitting(true);
        onDelete(assistant.id).finally(() => {
          setIsSubmitting(false);
          setMode('list');
        });
      }
      return;
    }

    if (input === 'n' || input === 'N' || key.escape || input === '\x1b') {
      setMode('list');
      return;
    }
  }, { isActive: mode === 'delete-confirm' });

  // Handle create/edit mode escape
  useInput((input, key) => {
    if (mode !== 'create' && mode !== 'edit') return;
    const step = mode === 'create' ? createStep : editStep;
    if (step === 'name') return;

    if (key.escape || input === '\x1b') {
      if (mode === 'create') {
        if (createStep === 'description') setCreateStep('name');
        else if (createStep === 'model') setCreateStep('description');
        else if (createStep === 'temperature') setCreateStep('model');
        else if (createStep === 'systemPrompt') setCreateStep('temperature');
      } else {
        if (editStep === 'description') setEditStep('name');
        else if (editStep === 'model') setEditStep('description');
        else if (editStep === 'temperature') setEditStep('model');
        else if (editStep === 'systemPrompt') setEditStep('temperature');
      }
    }
  }, { isActive: mode === 'create' || mode === 'edit' });

  // Handle create/edit tab skips
  useInput((_input, key) => {
    if (mode !== 'create' && mode !== 'edit') return;
    if (!key.tab || key.shift) return;
    const step = mode === 'create' ? createStep : editStep;

    if (step === 'description') {
      handleSkipDescription();
      return;
    }
    if (step === 'systemPrompt') {
      handleSkipSystemPrompt();
    }
  }, { isActive: mode === 'create' || mode === 'edit' });

  // Handle model selection input
  useInput((input, key) => {
    const isCreateModelStep = mode === 'create' && createStep === 'model';
    const isEditModelStep = mode === 'edit' && editStep === 'model';
    if (!isCreateModelStep && !isEditModelStep) return;

    if (key.upArrow) {
      setSelectedModelIndex((prev) => (prev === 0 ? ALL_MODELS.length - 1 : prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedModelIndex((prev) => (prev === ALL_MODELS.length - 1 ? 0 : prev + 1));
      return;
    }

    if (key.return) {
      if (mode === 'create') {
        setCreateStep('temperature');
      } else {
        setEditStep('temperature');
      }
      return;
    }

    if (key.escape || input === '\x1b') {
      if (mode === 'create') {
        setCreateStep('description');
      } else {
        setEditStep('description');
      }
      return;
    }
  }, { isActive: (mode === 'create' && createStep === 'model') || (mode === 'edit' && editStep === 'model') });

  // Handle temperature input
  useInput((input, key) => {
    const isCreateTempStep = mode === 'create' && createStep === 'temperature';
    const isEditTempStep = mode === 'edit' && editStep === 'temperature';
    if (!isCreateTempStep && !isEditTempStep) return;

    if (key.leftArrow) {
      setTemperature((prev) => Math.max(MIN_TEMPERATURE, parseFloat((prev - TEMPERATURE_STEP).toFixed(1))));
      return;
    }

    if (key.rightArrow) {
      setTemperature((prev) => Math.min(MAX_TEMPERATURE, parseFloat((prev + TEMPERATURE_STEP).toFixed(1))));
      return;
    }

    if (key.return) {
      if (mode === 'create') {
        setCreateStep('systemPrompt');
      } else {
        setEditStep('systemPrompt');
      }
      return;
    }

    if (key.escape || input === '\x1b') {
      if (mode === 'create') {
        setCreateStep('model');
      } else {
        setEditStep('model');
      }
      return;
    }
  }, { isActive: (mode === 'create' && createStep === 'temperature') || (mode === 'edit' && editStep === 'temperature') });

  // Handle system prompt step escape
  useInput((input, key) => {
    const isCreateSystemPromptStep = mode === 'create' && createStep === 'systemPrompt';
    const isEditSystemPromptStep = mode === 'edit' && editStep === 'systemPrompt';
    if (!isCreateSystemPromptStep && !isEditSystemPromptStep) return;

    if (key.escape || input === '\x1b') {
      if (mode === 'create') {
        setCreateStep('temperature');
      } else {
        setEditStep('temperature');
      }
    }
  }, { isActive: (mode === 'create' && createStep === 'systemPrompt') || (mode === 'edit' && editStep === 'systemPrompt') });

  // Handle name step escape (full cancel)
  useInput((input, key) => {
    const isCreateNameStep = mode === 'create' && createStep === 'name';
    const isEditNameStep = mode === 'edit' && editStep === 'name';
    if (!isCreateNameStep && !isEditNameStep) return;

    if (key.escape || input === '\x1b') {
      resetForm();
      setMode('list');
    }
  }, { isActive: (mode === 'create' && createStep === 'name') || (mode === 'edit' && editStep === 'name') });

  // Form submission handlers
  const handleNameSubmit = (submittedName: string) => {
    setNewName(submittedName);
    if (!submittedName.trim()) return;
    if (mode === 'create') {
      setCreateStep('description');
    } else {
      setEditStep('description');
    }
  };

  const handleDescriptionSubmit = (submittedDescription: string) => {
    setNewDescription(submittedDescription);
    if (mode === 'create') {
      setCreateStep('model');
    } else {
      setEditStep('model');
    }
  };

  const handleSkipDescription = () => {
    setNewDescription('');
    if (mode === 'create') {
      setCreateStep('model');
    } else {
      setEditStep('model');
    }
  };

  const handleSystemPromptSubmit = (submittedPrompt: string) => {
    setNewSystemPrompt(submittedPrompt);
    if (mode === 'create') {
      handleCreate({ systemPrompt: submittedPrompt });
    } else {
      handleUpdate({ systemPrompt: submittedPrompt });
    }
  };

  const handleSkipSystemPrompt = () => {
    setNewSystemPrompt('');
    if (mode === 'create') {
      handleCreate({ systemPrompt: '' });
    } else {
      handleUpdate({ systemPrompt: '' });
    }
  };

  const handleCreate = async (overrides: { name?: string; description?: string; systemPrompt?: string } = {}) => {
    const submittedName = (overrides.name ?? newName).trim();
    if (!submittedName) return;
    const submittedDescription = (overrides.description ?? newDescription).trim();
    const submittedSystemPrompt = (overrides.systemPrompt ?? newSystemPrompt).trim();
    setIsSubmitting(true);
    try {
      const settings: Partial<AssistantSettings> = {
        model: getProviderModelId(ALL_MODELS[selectedModelIndex]),
        temperature,
        systemPromptAddition: submittedSystemPrompt || undefined,
      };
      await onCreate({
        name: submittedName,
        description: submittedDescription || undefined,
        settings,
      });
      resetForm();
      setMode('list');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (overrides: { name?: string; description?: string; systemPrompt?: string } = {}) => {
    const submittedName = (overrides.name ?? newName).trim();
    if (!editingAssistant || !submittedName) return;
    const submittedDescription = (overrides.description ?? newDescription).trim();
    const submittedSystemPrompt = (overrides.systemPrompt ?? newSystemPrompt).trim();
    setIsSubmitting(true);
    try {
      await onUpdate(editingAssistant.id, {
        name: submittedName,
        description: submittedDescription || undefined,
        settings: {
          ...editingAssistant.settings,
          model: getProviderModelId(ALL_MODELS[selectedModelIndex]),
          temperature,
          systemPromptAddition: submittedSystemPrompt || undefined,
        } as Record<string, unknown>,
      });
      resetForm();
      setMode('list');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render model selection
  const renderModelSelection = () => (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text fg={themeColor('info')} bold>{mode === 'create' ? 'Create New Assistant' : 'Edit Assistant'}</Text>
        <Text fg={themeColor('muted')}> - Model</Text>
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <Text fg={themeColor('muted')}>Name: {newName}</Text>
        {newDescription && <Text fg={themeColor('muted')}>Description: {newDescription}</Text>}
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1}>
        {ALL_MODELS.map((model, index) => (
          <Box key={getProviderModelId(model)} paddingY={0}>
            <Text
              bg={index === selectedModelIndex ? themeColor('primary') : undefined}
              fg={index === selectedModelIndex ? themeColor('text') : undefined}
            >
              {index === selectedModelIndex ? '>' : ' '} {model.name}
              <Text fg={themeColor('muted')}> - {model.description}</Text>
            </Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text fg={themeColor('muted')}>Up/Down select | Enter continue | Esc back</Text>
      </Box>
    </Box>
  );

  // Render temperature slider
  const renderTemperatureSlider = () => {
    const sliderWidth = 20;
    const filledWidth = Math.round((temperature / MAX_TEMPERATURE) * sliderWidth);
    const emptyWidth = sliderWidth - filledWidth;
    const slider = '[' + '='.repeat(filledWidth) + ' '.repeat(emptyWidth) + ']';

    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text fg={themeColor('info')} bold>{mode === 'create' ? 'Create New Assistant' : 'Edit Assistant'}</Text>
          <Text fg={themeColor('muted')}> - Temperature</Text>
        </Box>

        <Box marginBottom={1} flexDirection="column">
          <Text fg={themeColor('muted')}>Name: {newName}</Text>
          {newDescription && <Text fg={themeColor('muted')}>Description: {newDescription}</Text>}
          <Text fg={themeColor('muted')}>Model: {ALL_MODELS[selectedModelIndex].name}</Text>
        </Box>

        <Box>
          <Text>Temperature: </Text>
          <Text fg={themeColor('info')}>{temperature.toFixed(1)}</Text>
          <Text fg={themeColor('muted')}> {slider}</Text>
        </Box>
        <Box marginTop={1}>
          <Text fg={themeColor('muted')}>
            {temperature < 0.5 ? 'More deterministic' : temperature > 1.5 ? 'More creative' : 'Balanced'}
          </Text>
        </Box>

        <Box marginTop={1}>
          <Text fg={themeColor('muted')}>Left/Right adjust | Enter continue | Esc back</Text>
        </Box>

        {isSubmitting && (
          <Box marginTop={1}>
            <Text fg={themeColor('warning')}>{mode === 'create' ? 'Creating...' : 'Saving...'}</Text>
          </Box>
        )}
      </Box>
    );
  };

  // Create/Edit mode UI
  if (mode === 'create' || mode === 'edit') {
    const currentStep = mode === 'create' ? createStep : editStep;

    if (currentStep === 'model') {
      return (
        <Box flexDirection="column" paddingY={1}>
          {renderModelSelection()}
        </Box>
      );
    }

    if (currentStep === 'temperature') {
      return (
        <Box flexDirection="column" paddingY={1}>
          {renderTemperatureSlider()}
        </Box>
      );
    }

    if (currentStep === 'systemPrompt') {
      return (
        <Box flexDirection="column" paddingY={1}>
          <Box marginBottom={1}>
            <Text fg={themeColor('info')} bold>{mode === 'create' ? 'Create New Assistant' : 'Edit Assistant'}</Text>
            <Text fg={themeColor('muted')}> - Custom Instructions</Text>
          </Box>

          <Box marginBottom={1} flexDirection="column">
            <Text fg={themeColor('muted')}>Name: {newName}</Text>
            {newDescription && <Text fg={themeColor('muted')}>Description: {newDescription}</Text>}
            <Text fg={themeColor('muted')}>Model: {ALL_MODELS[selectedModelIndex].name}</Text>
            <Text fg={themeColor('muted')}>Temperature: {temperature.toFixed(1)}</Text>
          </Box>

          <Box>
            <Text>Instructions: </Text>
            <TextInput
              value={newSystemPrompt}
              onChange={setNewSystemPrompt}
              onSubmit={handleSystemPromptSubmit}
              focus
              placeholder="Custom system prompt (optional)..."
            />
          </Box>
          <Box marginTop={1}>
            <Text fg={themeColor('muted')}>Enter to {mode === 'create' ? 'create' : 'save'} | Tab to skip | Esc back</Text>
          </Box>

          {isSubmitting && (
            <Box marginTop={1}>
              <Text fg={themeColor('warning')}>{mode === 'create' ? 'Creating assistant...' : 'Updating assistant...'}</Text>
            </Box>
          )}
        </Box>
      );
    }

    return (
      <Box flexDirection="column" paddingY={1}>
        <Box marginBottom={1}>
          <Text fg={themeColor('info')} bold>{mode === 'create' ? 'Create New Assistant' : 'Edit Assistant'}</Text>
        </Box>

        {currentStep === 'name' && (
          <Box flexDirection="column">
            <Box>
              <Text>Name: </Text>
              <TextInput
                value={newName}
                onChange={setNewName}
                onSubmit={handleNameSubmit}
                focus
                placeholder="Enter assistant name..."
              />
            </Box>
            <Box marginTop={1}>
              <Text fg={themeColor('muted')}>Enter to continue | Esc to cancel</Text>
            </Box>
          </Box>
        )}

        {currentStep === 'description' && (
          <Box flexDirection="column">
            <Box>
              <Text fg={themeColor('muted')}>Name: </Text>
              <Text>{newName}</Text>
            </Box>
            <Box marginTop={1}>
              <Text>Description: </Text>
              <TextInput
                value={newDescription}
                onChange={setNewDescription}
                onSubmit={handleDescriptionSubmit}
                focus
                placeholder="Enter description (optional)..."
              />
            </Box>
            <Box marginTop={1}>
              <Text fg={themeColor('muted')}>Enter to continue | Tab to skip | Esc to go back</Text>
            </Box>
          </Box>
        )}

        {isSubmitting && (
          <Box marginTop={1}>
            <Text fg={themeColor('warning')}>{mode === 'create' ? 'Creating assistant...' : 'Updating assistant...'}</Text>
          </Box>
        )}
      </Box>
    );
  }

  // Delete confirmation mode
  if (mode === 'delete-confirm') {
    const assistant = sortedAssistants[selectedIndex];
    return (
      <Box flexDirection="column" paddingY={1}>
        <Box marginBottom={1}>
          <Text fg={themeColor('error')} bold>Delete Assistant</Text>
        </Box>
        <Box marginBottom={1}>
          <Text>
            Are you sure you want to delete "{assistant?.name}"?
          </Text>
        </Box>
        <Box>
          <Text fg={themeColor('muted')}>This action cannot be undone.</Text>
        </Box>
        <Box marginTop={1}>
          <Text>
            Press <Text fg={themeColor('success')} bold>y</Text> to confirm or{' '}
            <Text fg={themeColor('error')} bold>n</Text> to cancel
          </Text>
        </Box>
        {isSubmitting && (
          <Box marginTop={1}>
            <Text fg={themeColor('warning')}>Deleting...</Text>
          </Box>
        )}
      </Box>
    );
  }

  // List mode UI
  return (
    <Box flexDirection="column" paddingY={1}>
      <Box flexDirection="row" marginBottom={1} justifyContent="space-between">
        <Text bold>Assistants</Text>
        <Text fg={themeColor('muted')}>[n]ew [e]dit [d]elete</Text>
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text fg={themeColor('error')}>Error: {error}</Text>
        </Box>
      )}

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={themeColor('border')} border={["top", "bottom"]}
        paddingX={1}
      >
        {sortedAssistants.length === 0 ? (
          <Box paddingY={1}>
            <Text fg={themeColor('muted')}>No assistants yet. Press n to create one.</Text>
          </Box>
        ) : (
          sortedAssistants.map((assistant, index) => {
            const isActive = assistant.id === activeAssistantId;
            const isSelected = index === selectedIndex;
            const modelName = getModelDisplayName(assistant.settings.model);
            const temp = assistant.settings.temperature?.toFixed(1) ?? DEFAULT_TEMPERATURE.toFixed(1);
            const time = formatTime(assistant.updatedAt);
            const backendLabel = getBackendLabel(assistant.settings.backend);
            const systemBadge = assistant.isSystem ? '[system] ' : '';

            return (
              <Box key={assistant.id} paddingY={0}>
                <Text
                  bg={isSelected ? themeColor('primary') : undefined}
                  fg={isSelected ? themeColor('text') : undefined}
                >
                  {isActive ? '*' : ' '} {index + 1}. {systemBadge}{assistant.name.padEnd(16)} {modelName.padEnd(18)} {backendLabel.padEnd(10)} T:{temp} {time}
                </Text>
              </Box>
            );
          })
        )}

        {/* New assistant option */}
        <Box marginTop={1} paddingY={0}>
          <Text
            bg={selectedIndex === sortedAssistants.length ? themeColor('primary') : undefined}
            fg={selectedIndex === sortedAssistants.length ? themeColor('text') : undefined}
          >
            + New assistant (n)
          </Text>
        </Box>
      </Box>

      {/* Selected assistant details */}
      {sortedAssistants.length > 0 && selectedIndex < sortedAssistants.length && (
        <Box marginTop={1} flexDirection="column">
          <Text fg={themeColor('muted')}>
            {sortedAssistants[selectedIndex].description || 'No description'}
          </Text>
          {sortedAssistants[selectedIndex].settings.systemPromptAddition && (
            <Text fg={themeColor('muted')}>
              System prompt: {sortedAssistants[selectedIndex].settings.systemPromptAddition.slice(0, 50)}
              {(sortedAssistants[selectedIndex].settings.systemPromptAddition?.length || 0) > 50 ? '...' : ''}
            </Text>
          )}
          {sortedAssistants[selectedIndex].isSystem && (
            <Text fg={themeColor('warning')}>
              System assistant — cannot be deleted
            </Text>
          )}
        </Box>
      )}

      <Box marginTop={1}>
        <Text fg={themeColor('muted')}>
          Enter select | e edit | d delete | Esc close | 1-{Math.max(1, sortedAssistants.length)} jump
        </Text>
      </Box>
    </Box>
  );
}
