import React, { useMemo, useState, useCallback } from 'react';
import {
  ALL_MODELS,
  LLM_PROVIDER_IDS,
  getProviderLabel,
  type ModelDefinition,
} from '@hasna/assistants-shared';
import type { SelectOption } from '@opentui/core';
import { Modal } from './Modal';
import { themeColor } from '../theme/colors';

interface ModelPickerProps {
  visible: boolean;
  currentModelId: string | null;
  onSelectModel: (modelId: string) => void;
  onClose: () => void;
}

/**
 * Model picker dialog — opens on Ctrl+T.
 *
 * Per OpenCode spec (section 8.5):
 * - Title: "Select {Provider} Model" in Primary, Bold
 * - Uses SimpleList (our <select>) to show model entries with name and provider
 * - Selected item highlighted with accent color (Primary bg, Background fg, Bold)
 * - Width: 40 (fixed), max visible: 10
 * - 60% width, 60% height overlay via Modal
 * - Scroll indicators for provider navigation (left/right arrows)
 * - Keys: up/k, down/j, left/h prev provider, right/l next provider, enter select, esc close
 */
export function ModelPicker({ visible, currentModelId, onSelectModel, onClose }: ModelPickerProps) {
  const [providerIndex, setProviderIndex] = useState(() => {
    // Start on the provider of the current model, if any
    if (currentModelId) {
      const model = ALL_MODELS.find(m => m.id === currentModelId);
      if (model) {
        const idx = LLM_PROVIDER_IDS.indexOf(model.provider as any);
        if (idx >= 0) return idx;
      }
    }
    return 0;
  });

  // Theme colors
  const primaryColor = themeColor('primary');
  const bgColor = themeColor('bg');
  const textColor = themeColor('text');
  const mutedColor = themeColor('muted');

  const currentProvider = LLM_PROVIDER_IDS[providerIndex] ?? LLM_PROVIDER_IDS[0];

  // Build options list for current provider
  const { options, modelMap, initialIndex } = useMemo(() => {
    const opts: SelectOption[] = [];
    const map = new Map<string, ModelDefinition>();

    const providerModels = ALL_MODELS.filter(m => m.provider === currentProvider);

    for (const model of providerModels) {
      const isCurrent = model.id === currentModelId;
      opts.push({
        name: model.name,
        description: getProviderLabel(model.provider),
        value: model.id,
      });
      map.set(model.id, model);
    }

    // Find initial selected index (current model or first)
    let activeIdx = 0;
    if (currentModelId) {
      const idx = opts.findIndex(o => o.value === currentModelId);
      if (idx >= 0) activeIdx = idx;
    }

    return { options: opts, modelMap: map, initialIndex: activeIdx };
  }, [currentProvider, currentModelId]);

  const handleSelect = useCallback((_index: number, option: SelectOption | null) => {
    if (!option) return;
    const value = String(option.value);
    onSelectModel(value);
    onClose();
  }, [onSelectModel, onClose]);

  if (!visible) return null;

  const providerLabel = getProviderLabel(currentProvider);
  const hasMultipleProviders = LLM_PROVIDER_IDS.length > 1;

  return (
    <Modal visible={visible} onClose={onClose} title={`Select ${providerLabel} Model`}>
      {/* Provider navigation indicators */}
      {hasMultipleProviders && (
        <box marginBottom={1} justifyContent="flex-end">
          <text fg={primaryColor}><b>
            {providerIndex > 0 ? '← ' : '  '}
            {providerLabel}
            {providerIndex < LLM_PROVIDER_IDS.length - 1 ? ' →' : '  '}
          </b></text>
        </box>
      )}

      {/* Model list */}
      {options.length > 0 ? (
        <select
          options={options}
          selectedIndex={Math.max(0, initialIndex)}
          onSelect={handleSelect}
          focused={visible}
          showDescription={true}
          wrapSelection={true}
          showScrollIndicator={true}
          backgroundColor={bgColor}
          textColor={textColor}
          selectedBackgroundColor={primaryColor}
          selectedTextColor={bgColor}
          descriptionColor={mutedColor}
          selectedDescriptionColor={bgColor}
          flexGrow={1}
          maxVisible={10}
        />
      ) : (
        <box>
          <text fg={mutedColor}>No models available for {providerLabel}</text>
        </box>
      )}

      {/* Footer */}
      <box marginTop={1}>
        <text fg={mutedColor}>Enter select | Up/Down navigate{hasMultipleProviders ? ' | Left/Right provider' : ''} | Esc close</text>
      </box>
    </Modal>
  );
}
