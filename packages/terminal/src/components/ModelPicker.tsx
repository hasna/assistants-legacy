/** @jsxImportSource react */
import React, { useMemo, useState, useCallback } from 'react';
import {
  ALL_MODELS,
  LLM_PROVIDER_IDS,
  getProviderModelId,
  getProviderLabel,
} from '@hasna/assistants-shared';
import { Modal } from './Modal';
import { themeColor } from '../theme/colors';
import { Box, Select, Text, useInput, type SelectOption } from '../ui/ink';

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
 * - Uses the Ink Select primitive to show model entries with name and provider
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
      const model = ALL_MODELS.find(m => getProviderModelId(m) === currentModelId);
      if (model) {
        const idx = LLM_PROVIDER_IDS.indexOf(model.provider as any);
        if (idx >= 0) return idx;
      }
    }
    return 0;
  });

  // Theme colors
  const primaryColor = themeColor('primary');
  const mutedColor = themeColor('muted');

  const currentProvider = LLM_PROVIDER_IDS[providerIndex] ?? LLM_PROVIDER_IDS[0];
  const providerLabel = getProviderLabel(currentProvider);
  const hasMultipleProviders = LLM_PROVIDER_IDS.length > 1;

  // Build options list for current provider
  const { options, initialIndex } = useMemo(() => {
    const opts: SelectOption<string>[] = [];

    const providerModels = ALL_MODELS.filter(m => m.provider === currentProvider);

    for (const model of providerModels) {
      const value = getProviderModelId(model);
      opts.push({
        label: model.name,
        description: getProviderLabel(model.provider),
        value,
      });
    }

    // Find initial selected index (current model or first)
    let activeIdx = 0;
    if (currentModelId) {
      const idx = opts.findIndex(o => o.value === currentModelId);
      if (idx >= 0) activeIdx = idx;
    }

    return { options: opts, initialIndex: activeIdx };
  }, [currentProvider, currentModelId]);

  const handleSelect = useCallback((value: string) => {
    onSelectModel(value);
    onClose();
  }, [onSelectModel, onClose]);

  useInput((input, key) => {
    if (!visible || !hasMultipleProviders) return;

    if (key.leftArrow || input === 'h') {
      setProviderIndex((current) => Math.max(0, current - 1));
      return;
    }

    if (key.rightArrow || input === 'l') {
      setProviderIndex((current) => Math.min(LLM_PROVIDER_IDS.length - 1, current + 1));
    }
  }, { isActive: visible && hasMultipleProviders });

  if (!visible) return null;

  const initialValue = options[Math.max(0, initialIndex)]?.value;

  return (
    <Modal visible={visible} onClose={onClose} title={`Select ${providerLabel} Model`}>
      {/* Provider navigation indicators */}
      {hasMultipleProviders && (
        <Box marginBottom={1} justifyContent="flex-end">
          <Text fg={primaryColor} bold>
            {providerIndex > 0 ? '< ' : '  '}
            {providerLabel}
            {providerIndex < LLM_PROVIDER_IDS.length - 1 ? ' >' : '  '}
          </Text>
        </Box>
      )}

      {/* Model list */}
      {options.length > 0 ? (
        <Select
          options={options}
          value={currentModelId ?? undefined}
          defaultFocusValue={initialValue}
          focusValue={initialValue}
          onSelect={handleSelect}
          onCancel={onClose}
          isActive={visible}
          wrapSelection={true}
          visibleOptionCount={10}
          inlineDescriptions={true}
        />
      ) : (
        <Box>
          <Text fg={mutedColor}>No models available for {providerLabel}</Text>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text fg={mutedColor}>Enter select | Up/Down navigate{hasMultipleProviders ? ' | Left/Right provider' : ''} | Esc close</Text>
      </Box>
    </Modal>
  );
}
