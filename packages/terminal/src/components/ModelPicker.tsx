import React, { useMemo, useState, useCallback } from 'react';
import {
  ALL_MODELS,
  LLM_PROVIDER_IDS,
  getProviderLabel,
  type ModelDefinition,
} from '@hasna/assistants-shared';
import type { SelectOption } from '@opentui/core';
import { Modal } from './Modal';

interface ModelPickerProps {
  visible: boolean;
  currentModelId: string | null;
  onSelectModel: (modelId: string) => void;
  onClose: () => void;
}

/**
 * Model picker modal — opens on Ctrl+T.
 * Shows all models grouped by provider using the native <select> component.
 */
export function ModelPicker({ visible, currentModelId, onSelectModel, onClose }: ModelPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Build options list grouped by provider
  const { options, modelMap } = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const opts: SelectOption[] = [];
    const map = new Map<string, ModelDefinition>();

    for (const providerId of LLM_PROVIDER_IDS) {
      const providerModels = ALL_MODELS.filter((m) => {
        if (m.provider !== providerId) return false;
        if (q && !m.name.toLowerCase().includes(q) && !m.id.toLowerCase().includes(q)) return false;
        return true;
      });

      if (providerModels.length === 0) continue;

      // Add provider header as a non-selectable separator
      opts.push({
        name: `── ${getProviderLabel(providerId)} ──`,
        description: '',
        value: `__provider__${providerId}`,
      });

      for (const model of providerModels) {
        const isCurrent = model.id === currentModelId;
        const suffix = isCurrent ? ' (current)' : '';
        opts.push({
          name: `${model.name}${suffix}`,
          description: model.id,
          value: model.id,
        });
        map.set(model.id, model);
      }
    }

    return { options: opts, modelMap: map };
  }, [searchQuery, currentModelId]);

  // Find initial selected index (current model or first real model)
  const initialIndex = useMemo(() => {
    if (currentModelId) {
      const idx = options.findIndex((o) => o.value === currentModelId);
      if (idx >= 0) return idx;
    }
    // Find first non-header option
    return options.findIndex((o) => !String(o.value).startsWith('__provider__'));
  }, [options, currentModelId]);

  const handleSelect = useCallback((_index: number, option: SelectOption | null) => {
    if (!option) return;
    const value = String(option.value);
    // Skip provider headers
    if (value.startsWith('__provider__')) return;
    onSelectModel(value);
    onClose();
  }, [onSelectModel, onClose]);

  const handleChange = useCallback((index: number, option: SelectOption | null) => {
    // Skip over provider headers — could implement skip logic here if needed
  }, []);

  if (!visible) return null;

  return (
    <Modal visible={visible} onClose={onClose} title="Select Model (Ctrl+T)">
      {/* Search input */}
      <box marginBottom={1}>
        <text fg="#888888">/ </text>
        <input
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search models..."
          focused={visible}
        />
      </box>

      {/* Model list */}
      {options.length > 0 ? (
        <select
          options={options}
          selectedIndex={Math.max(0, initialIndex)}
          onSelect={handleSelect}
          onChange={handleChange}
          focused={visible && !searchQuery}
          showDescription={true}
          wrapSelection={true}
          showScrollIndicator={true}
          backgroundColor="#1a1a2e"
          textColor="#cccccc"
          selectedBackgroundColor="#3333aa"
          selectedTextColor="#ffffff"
          descriptionColor="#666688"
          selectedDescriptionColor="#aaaacc"
          flexGrow={1}
        />
      ) : (
        <box>
          <text fg="#666666">No models match "{searchQuery}"</text>
        </box>
      )}

      {/* Footer */}
      <box marginTop={1}>
        <text fg="#555555">Enter select | Up/Down navigate | Esc close</text>
      </box>
    </Modal>
  );
}
