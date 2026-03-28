import React, { useEffect, useState, useCallback, useMemo } from 'react';
import type { Assistant, AssistantSettings, CreateAssistantOptions } from '@hasna/assistants-core';
import { useSafeInput as useInput } from '../hooks/useSafeInput';
import {
  ANTHROPIC_MODELS,
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
  MIN_TEMPERATURE,
  MAX_TEMPERATURE,
  TEMPERATURE_STEP,
  getModelDisplayName,
} from '@hasna/assistants-shared';

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
  switch (backend) {
    case 'claude-agent-sdk': return 'claude-sdk';
    case 'codex-sdk': return 'codex-sdk';
    case 'native':
    default: return 'native';
  }
}

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
    Math.max(0, ANTHROPIC_MODELS.findIndex((m) => m.id === DEFAULT_MODEL))
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
    setSelectedModelIndex(Math.max(0, ANTHROPIC_MODELS.findIndex((m) => m.id === DEFAULT_MODEL)));
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
        const modelIdx = ANTHROPIC_MODELS.findIndex((m) => m.id === assistant.settings.model);
        setSelectedModelIndex(
          modelIdx >= 0 ? modelIdx : Math.max(0, ANTHROPIC_MODELS.findIndex((m) => m.id === DEFAULT_MODEL))
        );
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
    if (key.escape || input === 'q' || input === 'Q') {
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

    if (input === 'n' || input === 'N' || key.escape) {
      setMode('list');
      return;
    }
  }, { isActive: mode === 'delete-confirm' });

  // Handle create/edit mode escape
  useInput((_input, key) => {
    if (mode !== 'create' && mode !== 'edit') return;
    const step = mode === 'create' ? createStep : editStep;
    if (step === 'name') return;

    if (key.escape) {
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
      setSelectedModelIndex((prev) => (prev === 0 ? ANTHROPIC_MODELS.length - 1 : prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedModelIndex((prev) => (prev === ANTHROPIC_MODELS.length - 1 ? 0 : prev + 1));
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

    if (key.escape) {
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

    if (key.escape) {
      if (mode === 'create') {
        setCreateStep('model');
      } else {
        setEditStep('model');
      }
      return;
    }
  }, { isActive: (mode === 'create' && createStep === 'temperature') || (mode === 'edit' && editStep === 'temperature') });

  // Handle system prompt step escape
  useInput((_input, key) => {
    const isCreateSystemPromptStep = mode === 'create' && createStep === 'systemPrompt';
    const isEditSystemPromptStep = mode === 'edit' && editStep === 'systemPrompt';
    if (!isCreateSystemPromptStep && !isEditSystemPromptStep) return;

    if (key.escape) {
      if (mode === 'create') {
        setCreateStep('temperature');
      } else {
        setEditStep('temperature');
      }
    }
  }, { isActive: (mode === 'create' && createStep === 'systemPrompt') || (mode === 'edit' && editStep === 'systemPrompt') });

  // Handle name step escape (full cancel)
  useInput((_input, key) => {
    const isCreateNameStep = mode === 'create' && createStep === 'name';
    const isEditNameStep = mode === 'edit' && editStep === 'name';
    if (!isCreateNameStep && !isEditNameStep) return;

    if (key.escape) {
      resetForm();
      setMode('list');
    }
  }, { isActive: (mode === 'create' && createStep === 'name') || (mode === 'edit' && editStep === 'name') });

  // Form submission handlers
  const handleNameSubmit = () => {
    if (!newName.trim()) return;
    if (mode === 'create') {
      setCreateStep('description');
    } else {
      setEditStep('description');
    }
  };

  const handleDescriptionSubmit = () => {
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

  const handleSystemPromptSubmit = () => {
    if (mode === 'create') {
      handleCreate();
    } else {
      handleUpdate();
    }
  };

  const handleSkipSystemPrompt = () => {
    setNewSystemPrompt('');
    if (mode === 'create') {
      handleCreate();
    } else {
      handleUpdate();
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setIsSubmitting(true);
    try {
      const settings: Partial<AssistantSettings> = {
        model: ANTHROPIC_MODELS[selectedModelIndex].id,
        temperature,
        systemPromptAddition: newSystemPrompt.trim() || undefined,
      };
      await onCreate({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        settings,
      });
      resetForm();
      setMode('list');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingAssistant || !newName.trim()) return;
    setIsSubmitting(true);
    try {
      await onUpdate(editingAssistant.id, {
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        settings: {
          ...editingAssistant.settings,
          model: ANTHROPIC_MODELS[selectedModelIndex].id,
          temperature,
          systemPromptAddition: newSystemPrompt.trim() || undefined,
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
    <box flexDirection="column">
      <box marginBottom={1}>
        <text fg="cyan"><b>{mode === 'create' ? 'Create New Assistant' : 'Edit Assistant'}</b></text>
        <text fg="gray"> - Model</text>
      </box>

      <box marginBottom={1} flexDirection="column">
        <text fg="gray">Name: {newName}</text>
        {newDescription && <text fg="gray">Description: {newDescription}</text>}
      </box>

      <box flexDirection="column" borderStyle="rounded" borderColor="#d4d4d8" border={["top", "bottom"]} paddingX={1}>
        {ANTHROPIC_MODELS.map((model, index) => (
          <box key={model.id} paddingY={0}>
            <text
              attributes={index === selectedModelIndex ? 32 : undefined}
              fg={index === selectedModelIndex ? 'cyan' : undefined}
              fg={index !== selectedModelIndex ? "gray" : undefined}
            >
              {index === selectedModelIndex ? '>' : ' '} {model.name}
              <text fg="gray"> - {model.description}</text>
            </text>
          </box>
        ))}
      </box>

      <box marginTop={1}>
        <text fg="gray">Up/Down select | Enter continue | Esc back</text>
      </box>
    </box>
  );

  // Render temperature slider
  const renderTemperatureSlider = () => {
    const sliderWidth = 20;
    const filledWidth = Math.round((temperature / MAX_TEMPERATURE) * sliderWidth);
    const emptyWidth = sliderWidth - filledWidth;
    const slider = '[' + '='.repeat(filledWidth) + ' '.repeat(emptyWidth) + ']';

    return (
      <box flexDirection="column">
        <box marginBottom={1}>
          <text fg="cyan"><b>{mode === 'create' ? 'Create New Assistant' : 'Edit Assistant'}</b></text>
          <text fg="gray"> - Temperature</text>
        </box>

        <box marginBottom={1} flexDirection="column">
          <text fg="gray">Name: {newName}</text>
          {newDescription && <text fg="gray">Description: {newDescription}</text>}
          <text fg="gray">Model: {ANTHROPIC_MODELS[selectedModelIndex].name}</text>
        </box>

        <box>
          <text>Temperature: </text>
          <text fg="cyan">{temperature.toFixed(1)}</text>
          <text fg="gray"> {slider}</text>
        </box>
        <box marginTop={1}>
          <text fg="gray">
            {temperature < 0.5 ? 'More deterministic' : temperature > 1.5 ? 'More creative' : 'Balanced'}
          </text>
        </box>

        <box marginTop={1}>
          <text fg="gray">Left/Right adjust | Enter continue | Esc back</text>
        </box>

        {isSubmitting && (
          <box marginTop={1}>
            <text fg="yellow">{mode === 'create' ? 'Creating...' : 'Saving...'}</text>
          </box>
        )}
      </box>
    );
  };

  // Create/Edit mode UI
  if (mode === 'create' || mode === 'edit') {
    const currentStep = mode === 'create' ? createStep : editStep;

    if (currentStep === 'model') {
      return (
        <box flexDirection="column" paddingY={1}>
          {renderModelSelection()}
        </box>
      );
    }

    if (currentStep === 'temperature') {
      return (
        <box flexDirection="column" paddingY={1}>
          {renderTemperatureSlider()}
        </box>
      );
    }

    if (currentStep === 'systemPrompt') {
      return (
        <box flexDirection="column" paddingY={1}>
          <box marginBottom={1}>
            <text fg="cyan"><b>{mode === 'create' ? 'Create New Assistant' : 'Edit Assistant'}</b></text>
            <text fg="gray"> - Custom Instructions</text>
          </box>

          <box marginBottom={1} flexDirection="column">
            <text fg="gray">Name: {newName}</text>
            {newDescription && <text fg="gray">Description: {newDescription}</text>}
            <text fg="gray">Model: {ANTHROPIC_MODELS[selectedModelIndex].name}</text>
            <text fg="gray">Temperature: {temperature.toFixed(1)}</text>
          </box>

          <box>
            <text>Instructions: </text>
            <input
              value={newSystemPrompt}
              onChange={setNewSystemPrompt}
              onSubmit={handleSystemPromptSubmit}
              focused
              placeholder="Custom system prompt (optional)..."
            />
          </box>
          <box marginTop={1}>
            <text fg="gray">Enter to {mode === 'create' ? 'create' : 'save'} | Tab to skip | Esc back</text>
          </box>

          {isSubmitting && (
            <box marginTop={1}>
              <text fg="yellow">{mode === 'create' ? 'Creating assistant...' : 'Updating assistant...'}</text>
            </box>
          )}
        </box>
      );
    }

    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg="cyan"><b>{mode === 'create' ? 'Create New Assistant' : 'Edit Assistant'}</b></text>
        </box>

        {currentStep === 'name' && (
          <box flexDirection="column">
            <box>
              <text>Name: </text>
              <input
                value={newName}
                onChange={setNewName}
                onSubmit={handleNameSubmit}
                focused
                placeholder="Enter assistant name..."
              />
            </box>
            <box marginTop={1}>
              <text fg="gray">Enter to continue | Esc to cancel</text>
            </box>
          </box>
        )}

        {currentStep === 'description' && (
          <box flexDirection="column">
            <box>
              <text fg="gray">Name: </text>
              <text>{newName}</text>
            </box>
            <box marginTop={1}>
              <text>Description: </text>
              <input
                value={newDescription}
                onChange={setNewDescription}
                onSubmit={handleDescriptionSubmit}
                focused
                placeholder="Enter description (optional)..."
              />
            </box>
            <box marginTop={1}>
              <text fg="gray">Enter to continue | Tab to skip | Esc to go back</text>
            </box>
          </box>
        )}

        {isSubmitting && (
          <box marginTop={1}>
            <text fg="yellow">{mode === 'create' ? 'Creating assistant...' : 'Updating assistant...'}</text>
          </box>
        )}
      </box>
    );
  }

  // Delete confirmation mode
  if (mode === 'delete-confirm') {
    const assistant = sortedAssistants[selectedIndex];
    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg="red"><b>Delete Assistant</b></text>
        </box>
        <box marginBottom={1}>
          <text>
            Are you sure you want to delete &quot;{assistant?.name}&quot;?
          </text>
        </box>
        <box>
          <text fg="gray">This action cannot be undone.</text>
        </box>
        <box marginTop={1}>
          <text>
            Press <text fg="green"><b>y</b></text> to confirm or{' '}
            <text fg="red"><b>n</b></text> to cancel
          </text>
        </box>
        {isSubmitting && (
          <box marginTop={1}>
            <text fg="yellow">Deleting...</text>
          </box>
        )}
      </box>
    );
  }

  // List mode UI
  return (
    <box flexDirection="column" paddingY={1}>
      <box marginBottom={1} justifyContent="space-between">
        <text><b>Assistants</b></text>
        <text fg="gray">[n]ew [e]dit [d]elete</text>
      </box>

      {error && (
        <box marginBottom={1}>
          <text fg="red">Error: {error}</text>
        </box>
      )}

      <box
        flexDirection="column"
        borderStyle="rounded"
        borderColor="#d4d4d8" border={["top", "bottom"]}
        paddingX={1}
      >
        {sortedAssistants.length === 0 ? (
          <box paddingY={1}>
            <text fg="gray">No assistants yet. Press n to create one.</text>
          </box>
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
              <box key={assistant.id} paddingY={0}>
                <text
                  attributes={isSelected ? 32 : undefined}
                  fg={isActive ? 'green' : undefined}
                  fg={!isSelected && !isActive ? "gray" : undefined}
                >
                  {isActive ? '*' : ' '} {index + 1}. {systemBadge}{assistant.name.padEnd(16)} {modelName.padEnd(18)} {backendLabel.padEnd(10)} T:{temp} {time}
                </text>
              </box>
            );
          })
        )}

        {/* New assistant option */}
        <box marginTop={1} paddingY={0}>
          <text
            attributes={selectedIndex === sortedAssistants.length ? 32 : undefined}
            fg={selectedIndex !== sortedAssistants.length ? "gray" : undefined}
            fg={selectedIndex === sortedAssistants.length ? 'cyan' : undefined}
          >
            + New assistant (n)
          </text>
        </box>
      </box>

      {/* Selected assistant details */}
      {sortedAssistants.length > 0 && selectedIndex < sortedAssistants.length && (
        <box marginTop={1} flexDirection="column">
          <text fg="gray">
            {sortedAssistants[selectedIndex].description || 'No description'}
          </text>
          {sortedAssistants[selectedIndex].settings.systemPromptAddition && (
            <text fg="gray">
              System prompt: {sortedAssistants[selectedIndex].settings.systemPromptAddition.slice(0, 50)}
              {(sortedAssistants[selectedIndex].settings.systemPromptAddition?.length || 0) > 50 ? '...' : ''}
            </text>
          )}
          {sortedAssistants[selectedIndex].isSystem && (
            <text fg="yellow">
              System assistant — cannot be deleted
            </text>
          )}
        </box>
      )}

      <box marginTop={1}>
        <text fg="gray">
          Enter select | e edit | d delete | Esc close | 1-{Math.max(1, sortedAssistants.length)} jump
        </text>
      </box>
    </box>
  );
}
