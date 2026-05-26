import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSafeInput as useInput } from '../hooks/useSafeInput';
import { useTypewriter } from '../hooks/useTypewriter';
import { useGradientCycle } from '../hooks/useGradientCycle';
import {
  ALL_MODELS,
  LLM_PROVIDERS,
  getProviderInfo,
  getProviderLabel,
  getProviderForModel,
  type LLMProvider,
  type Skill,
} from '@hasna/assistants-shared';
import { themeColor } from '../theme/colors';

// ============================================
// Types
// ============================================

export interface OnboardingResult {
  apiKey: string;
  provider: LLMProvider;
  model: string;
  connectors: string[];
  connectorKeys: Record<string, string>;
  skills: string[];
}

interface OnboardingPanelProps {
  onComplete: (result: OnboardingResult) => Promise<void>;
  onCancel: () => void;
  existingApiKeys?: Record<LLMProvider, string>;
  existingModel?: string;
  discoveredConnectors: string[];
  discoveredSkills?: Skill[];
}

type Step = 'welcome' | 'intro' | 'provider-select' | 'model-select' | 'api-key' | 'connectors' | 'skills' | 'connector-keys' | 'summary';

const STEPS: Step[] = ['welcome', 'intro', 'provider-select', 'model-select', 'api-key', 'connectors', 'skills', 'connector-keys', 'summary'];

const POPULAR_CONNECTORS: Record<string, { desc: string; install: string }> = {
  notion: { desc: 'Notion workspace', install: 'connectors install notion' },
  gmail: { desc: 'Gmail email', install: 'connectors install gmail' },
  googledrive: { desc: 'Google Drive files', install: 'connectors install googledrive' },
  slack: { desc: 'Slack messaging', install: 'connectors install slack' },
  github: { desc: 'GitHub repos & issues', install: 'connectors install github' },
  calendar: { desc: 'Google Calendar', install: 'connectors install calendar' },
};

const COMPACT_LOGO = 'Hasna Assistants';

const INTRO_FEATURES = [
  'Chat with AI models - Claude, GPT, and more',
  'Install connectors to integrate Notion, Gmail, Google Drive & more',
  'Install skills to automate your workflows',
  'Persistent memory across conversations',
  'Schedules, webhooks, and autonomous operation',
];

const MAX_VISIBLE_CONNECTORS = 5;

function getVisibleRange(
  selectedIndex: number,
  totalItems: number,
  maxVisible: number = MAX_VISIBLE_CONNECTORS
): { start: number; end: number; hasMore: { above: number; below: number } } {
  if (totalItems <= maxVisible) {
    return {
      start: 0,
      end: totalItems,
      hasMore: { above: 0, below: 0 },
    };
  }

  const halfWindow = Math.floor(maxVisible / 2);
  let start = selectedIndex - halfWindow;
  let end = selectedIndex + (maxVisible - halfWindow);

  if (start < 0) {
    start = 0;
    end = maxVisible;
  }

  if (end > totalItems) {
    end = totalItems;
    start = Math.max(0, totalItems - maxVisible);
  }

  return {
    start,
    end,
    hasMore: {
      above: start,
      below: totalItems - end,
    },
  };
}

// ============================================
// Sub-components
// ============================================

export function ProgressBar({ step, total }: { step: number; total: number }) {
  const width = 30;
  const filled = Math.round((step / total) * width);
  const empty = width - filled;
  const pct = Math.round((step / total) * 100);
  return (
    <box flexDirection="row" marginBottom={1}>
      <text fg={themeColor('muted')}>Step {step} of {total}  [</text>
      <text fg={themeColor('info')}>{'='.repeat(filled)}</text>
      <text fg={themeColor('muted')}>{' '.repeat(empty)}</text>
      <text fg={themeColor('muted')}>] {pct}%</text>
    </box>
  );
}

function MaskedInput({ value, onChange, onSubmit, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  placeholder?: string;
}) {
  // Show first 7 chars + mask the rest
  const masked = value.length > 7
    ? value.slice(0, 7) + '*'.repeat(Math.min(value.length - 7, 32))
    : value;

  return (
    <box flexDirection="row">
      <text fg={themeColor('info')}>&gt; </text>
      {value.length === 0 ? (
        <input
          value={value}
          onChange={onChange}
          onSubmit={() => onSubmit(value)}
          placeholder={placeholder}
        />
      ) : (
        <input
          value={value}
          onChange={onChange}
          onSubmit={() => onSubmit(value)}
          placeholder={placeholder}
        />
      )}
    </box>
  );
}

// ============================================
// Main Component
// ============================================

export function OnboardingPanel({
  onComplete,
  onCancel,
  existingApiKeys,
  existingModel,
  discoveredConnectors,
  discoveredSkills,
}: OnboardingPanelProps) {
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const initialProvider = (existingModel && getProviderForModel(existingModel)) || 'anthropic';
  const initialProviderIndex = Math.max(0, LLM_PROVIDERS.findIndex((p) => p.id === initialProvider));
  const initialModels = ALL_MODELS.filter((m) => m.provider === initialProvider);
  const initialModelList = initialModels.length > 0 ? initialModels : ALL_MODELS;
  const initialModelIndex = existingModel
    ? initialModelList.findIndex((m) => m.id === existingModel)
    : 0;
  const [selectedProviderIndex, setSelectedProviderIndex] = useState(initialProviderIndex);
  const [selectedModelIndex, setSelectedModelIndex] = useState(initialModelIndex >= 0 ? initialModelIndex : 0);
  const [apiKey, setApiKey] = useState(existingApiKeys?.[initialProvider] || '');
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [apiKeyValidated, setApiKeyValidated] = useState(!!existingApiKeys?.[initialProvider]);
  const [enabledConnectors, setEnabledConnectors] = useState<Set<string>>(
    () => new Set(discoveredConnectors)
  );
  const [connectorKeysNeeded] = useState<string[]>([]); // Connectors needing API keys
  const currentStepRef = useRef(currentStep);
  currentStepRef.current = currentStep;

  // useSafeInput handles Escape; avoid toggling raw mode directly to prevent conflicts.
  const [connectorKeys, setConnectorKeys] = useState<Record<string, string>>({});
  const [connectorKeyIndex, setConnectorKeyIndex] = useState(0);
  const [connectorKeyValue, setConnectorKeyValue] = useState('');
  const [introRevealCount, setIntroRevealCount] = useState(0);
  const [isCompact] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const submitGuardRef = useRef(false);

  // Skills state
  const skillsList = discoveredSkills || [];
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0);

  const selectedProvider = LLM_PROVIDERS[selectedProviderIndex]?.id || 'anthropic';
  const providerModels = ALL_MODELS.filter((m) => m.provider === selectedProvider);
  const availableModels = providerModels.length > 0 ? providerModels : ALL_MODELS;

  useEffect(() => {
    const existingKey = existingApiKeys?.[selectedProvider] || '';
    setApiKey(existingKey);
    setApiKeyValidated(!!existingKey);
    setApiKeyError(null);
    if (selectedModelIndex >= availableModels.length) {
      setSelectedModelIndex(0);
    }
  }, [selectedProvider, existingApiKeys, availableModels.length]);

  useEffect(() => {
    submitGuardRef.current = false;
  }, [currentStep]);

  const logoColor = useGradientCycle(600);
  const { displayed: subtitle, done: subtitleDone } = useTypewriter(
    'Your personal AI assistant for the terminal.',
    25,
    currentStep === 'welcome'
  );

  // isCompact reserved for future use

  // Animate intro bullets
  useEffect(() => {
    if (currentStep !== 'intro') return;
    if (introRevealCount >= INTRO_FEATURES.length) return;

    const timer = setTimeout(() => {
      setIntroRevealCount((prev) => prev + 1);
    }, 400);

    return () => clearTimeout(timer);
  }, [currentStep, introRevealCount]);

  const stepIndex = STEPS.indexOf(currentStep) + 1;

  const goNext = useCallback(() => {
    const idx = STEPS.indexOf(currentStep);
    if (idx < STEPS.length - 1) {
      let nextStep = STEPS[idx + 1];
      // Skip connector-keys step if no keys needed
      if (nextStep === 'connector-keys' && connectorKeysNeeded.length === 0) {
        nextStep = 'summary';
      }
      setCurrentStep(nextStep);
    }
  }, [currentStep, connectorKeysNeeded]);

  const goBack = useCallback(() => {
    const idx = STEPS.indexOf(currentStep);
    if (idx > 0) {
      let prevStep = STEPS[idx - 1];
      // Skip connector-keys step going back too
      if (prevStep === 'connector-keys' && connectorKeysNeeded.length === 0) {
        prevStep = 'skills';
      }
      setCurrentStep(prevStep);
    }
  }, [currentStep, connectorKeysNeeded]);

  const handleComplete = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const selectedModel = availableModels[selectedModelIndex] || availableModels[0];
      await onComplete({
        apiKey,
        provider: selectedProvider,
        model: selectedModel ? selectedModel.id : (existingModel || ''),
        connectors: Array.from(enabledConnectors),
        connectorKeys,
        skills: skillsList.map(s => s.name),
      });
    } finally {
      setIsSaving(false);
    }
  }, [apiKey, selectedModelIndex, enabledConnectors, connectorKeys, onComplete, isSaving, selectedProvider, availableModels, existingModel, skillsList]);

  const submitApiKey = useCallback((value: string) => {
    if (submitGuardRef.current) return;
    submitGuardRef.current = true;
    const key = value.trim();
    const existingKey = existingApiKeys?.[selectedProvider];
    if (!key && existingKey) {
      // Keep existing key
      setApiKey(existingKey);
      setApiKeyValidated(true);
      goNext();
      return;
    }
    if (!key) {
      setApiKeyError('API key is required');
      submitGuardRef.current = false;
      return;
    }
    if (selectedProvider === 'anthropic' && !key.startsWith('sk-ant-')) {
      setApiKeyError('Invalid key format. Anthropic keys start with "sk-ant-"');
      submitGuardRef.current = false;
      return;
    }
    setApiKeyValidated(true);
    goNext();
  }, [existingApiKeys, selectedProvider, goNext]);

  const submitConnectorKey = useCallback((value: string) => {
    if (submitGuardRef.current) return;
    submitGuardRef.current = true;
    const currentConnector = connectorKeysNeeded[connectorKeyIndex];
    if (!currentConnector) {
      goNext();
      return;
    }
    const trimmed = value.trim();
    if (trimmed) {
      setConnectorKeys((prev) => ({ ...prev, [currentConnector]: trimmed }));
    }
    setConnectorKeyValue('');
    if (connectorKeyIndex < connectorKeysNeeded.length - 1) {
      setConnectorKeyIndex((prev) => prev + 1);
      submitGuardRef.current = false;
    } else {
      goNext();
    }
  }, [connectorKeysNeeded, connectorKeyIndex, goNext]);

  // Input handling
  useInput((input, key) => {
    if (key.escape) {
      if (currentStep === 'welcome') {
        onCancel();
      } else {
        goBack();
      }
      return;
    }
    if (key.leftArrow || key.backspace || input === 'b' || input === 'B') {
      if (currentStep !== 'welcome') {
        goBack();
        return;
      }
    }

    // Step-specific input handling
    switch (currentStep) {
      case 'welcome':
        if (key.return) goNext();
        break;

      case 'intro':
        if (key.return) goNext();
        break;

      case 'provider-select':
        if (key.upArrow) {
          setSelectedProviderIndex((prev) => Math.max(0, prev - 1));
        } else if (key.downArrow) {
          setSelectedProviderIndex((prev) => Math.min(LLM_PROVIDERS.length - 1, prev + 1));
        } else if (key.return) {
          goNext();
        }
        break;

      case 'api-key':
        // TextInput handles this
        break;

      case 'model-select':
        if (key.upArrow) {
          setSelectedModelIndex((prev) => Math.max(0, prev - 1));
        } else if (key.downArrow) {
          setSelectedModelIndex((prev) => Math.min(availableModels.length - 1, prev + 1));
        } else if (key.return) {
          goNext();
        }
        break;

      case 'connectors': {
        const connectorList = getConnectorDisplayList();
        if (key.upArrow) {
          setSelectedConnectorIndex((prev) => Math.max(0, prev - 1));
        } else if (key.downArrow) {
          setSelectedConnectorIndex((prev) => Math.min(connectorList.length - 1, prev + 1));
        } else if (input === ' ') {
          // Toggle connector selection
          const item = connectorList[selectedConnectorIndex];
          if (item) {
            setEnabledConnectors((prev) => {
              const next = new Set(prev);
              if (next.has(item.name)) {
                next.delete(item.name);
              } else {
                next.add(item.name);
              }
              return next;
            });
          }
        } else if (key.return) {
          goNext();
        }
        break;
      }

      case 'skills':
        if (key.upArrow) {
          setSelectedSkillIndex((prev) => Math.max(0, prev - 1));
        } else if (key.downArrow) {
          setSelectedSkillIndex((prev) => Math.min(Math.max(0, skillsList.length - 1), prev + 1));
        } else if (key.return) {
          goNext();
        }
        break;

      case 'connector-keys':
        // TextInput handles this
        break;

      case 'summary':
        if (key.return) {
          handleComplete();
        } else if (!isSaving && input) {
          const keyInput = input.toLowerCase();
          if (keyInput === 'p') {
            setCurrentStep('provider-select');
          } else if (keyInput === 'm') {
            setCurrentStep('model-select');
          } else if (keyInput === 'k') {
            setCurrentStep('api-key');
          } else if (keyInput === 'c') {
            setCurrentStep('connectors');
          } else if (keyInput === 's') {
            setCurrentStep('skills');
          }
        }
        break;
    }
  }, { isActive: currentStep !== 'api-key' && currentStep !== 'connector-keys' });

  // Handle Escape on text-input steps; TextInput owns enter/typing behavior.
  useInput((_input, key) => {
    if (currentStep === 'api-key') {
      if (key.escape) {
        goBack();
      }
      return;
    }
    if (currentStep === 'connector-keys') {
      if (key.escape) {
        goBack();
      }
    }
  }, { isActive: currentStep === 'api-key' || currentStep === 'connector-keys' });

  // Connector display list
  const [selectedConnectorIndex, setSelectedConnectorIndex] = useState(0);

  const getConnectorDisplayList = useCallback(() => {
    const items: Array<{ name: string; desc: string; installed: boolean; install?: string }> = [];

    // Installed connectors first
    for (const name of discoveredConnectors) {
      const info = POPULAR_CONNECTORS[name];
      items.push({
        name,
        desc: info?.desc || `${name} connector`,
        installed: true,
      });
    }

    // Popular uninstalled suggestions
    for (const [name, info] of Object.entries(POPULAR_CONNECTORS)) {
      if (!discoveredConnectors.includes(name)) {
        items.push({
          name,
          desc: info.desc,
          installed: false,
          install: info.install,
        });
      }
    }

    return items;
  }, [discoveredConnectors]);

  useEffect(() => {
    const list = getConnectorDisplayList();
    setSelectedConnectorIndex((prev) => Math.min(prev, Math.max(0, list.length - 1)));
  }, [getConnectorDisplayList]);

  // ============================================
  // Render: Welcome
  // ============================================
  if (currentStep === 'welcome') {
    return (
      <box flexDirection="column" paddingX={1}>
        <box marginTop={1} marginBottom={1}>
          <text fg={logoColor}><b>{COMPACT_LOGO}</b></text>
        </box>
        <box flexDirection="row" marginBottom={1}>
          <text fg={themeColor('info')}>&gt; </text>
          <text>{subtitle}</text>
          {!subtitleDone && <text fg={themeColor('info')}>_</text>}
        </box>
        <text fg={themeColor('muted')}>Press Enter to get started...</text>
        <text fg={themeColor('muted')}>Press Escape to skip</text>
      </box>
    );
  }

  // ============================================
  // Render: Intro
  // ============================================
  if (currentStep === 'intro') {
    return (
      <box flexDirection="column" paddingX={1}>
        <ProgressBar step={stepIndex} total={STEPS.length} />
        <text><b>What can assistants do?</b></text>
        <box flexDirection="column" marginTop={1} marginBottom={1}>
          {INTRO_FEATURES.slice(0, introRevealCount).map((feature, i) => (
            <box flexDirection="row" key={i}>
              <text fg={themeColor('info')}>  &gt; </text>
              <text>{feature}</text>
            </box>
          ))}
          {introRevealCount < INTRO_FEATURES.length && (
            <text fg={themeColor('muted')}>  ...</text>
          )}
        </box>
        <text fg={themeColor('muted')}>Press Enter to continue...</text>
        <text fg={themeColor('muted')}>Esc or B to go back</text>
      </box>
    );
  }

  // ============================================
  // Render: Provider Select
  // ============================================
  if (currentStep === 'provider-select') {
    return (
      <box flexDirection="column" paddingX={1}>
        <ProgressBar step={stepIndex} total={STEPS.length} />
        <text><b>Choose your provider</b></text>
        <box flexDirection="column" marginTop={1} marginBottom={1}>
          {LLM_PROVIDERS.map((provider, i) => (
            <box flexDirection="row" key={provider.id}>
              <text fg={i === selectedProviderIndex ? themeColor('cyan') : themeColor('muted')}>
                {i === selectedProviderIndex ? '  > ' : '    '}
              </text>
              <text attributes={i === selectedProviderIndex ? 1 : undefined} fg={i === selectedProviderIndex ? themeColor('white') : undefined}><b>
                {provider.label}
              </b></text>
              <text fg={themeColor('muted')}>  {provider.description}</text>
            </box>
          ))}
        </box>
        <text fg={themeColor('muted')}>Arrow keys to move, Enter to continue</text>
        <text fg={themeColor('muted')}>Esc or B to go back</text>
      </box>
    );
  }

  // ============================================
  // Render: API Key
  // ============================================
  if (currentStep === 'api-key') {
    const providerInfo = getProviderInfo(selectedProvider);
    const providerLabel = getProviderLabel(selectedProvider);
    const envName = providerInfo?.apiKeyEnv || 'API_KEY';
    const existingKey = existingApiKeys?.[selectedProvider];
    return (
      <box flexDirection="column" paddingX={1}>
        <ProgressBar step={stepIndex} total={STEPS.length} />
        <text><b>Let's set up your API key</b></text>
        <box marginTop={1} marginBottom={1} flexDirection="column">
          <text>assistants uses {providerLabel}. You'll need an API key.</text>
          {providerInfo?.docsUrl ? (
            <box flexDirection="row">
              <span>Get one at: </span>
              <span fg={themeColor('info')}><u>{providerInfo.docsUrl}</u></span>
            </box>
          ) : null}
        </box>
        {existingKey ? (
          <box flexDirection="column">
            <text fg={themeColor('success')}>Existing API key detected: {existingKey.slice(0, 10)}...{existingKey.slice(-4)}</text>
            <box marginTop={1}>
              <text fg={themeColor('muted')}>Press Enter to keep it, or type a new key:</text>
            </box>
          </box>
        ) : null}
        <box marginTop={1}>
          <text>Enter your {providerLabel} API key ({envName}):</text>
        </box>
        <box flexDirection="row">
          <text fg={themeColor('info')}>&gt; </text>
            <input
              value={apiKey}
              onChange={(v) => {
                setApiKey(v);
                setApiKeyError(null);
                setApiKeyValidated(false);
              }}
              onSubmit={() => submitApiKey(apiKey)}
              focused
              placeholder={selectedProvider === 'anthropic' ? 'sk-ant-...' : 'api-key'}
            />
        </box>
        {apiKeyError && (
          <box marginTop={1}>
            <text fg={themeColor('error')}>{apiKeyError}</text>
          </box>
        )}
        {apiKeyValidated && (
          <box marginTop={1}>
            <text fg={themeColor('success')}>Key validated successfully!</text>
          </box>
        )}
        <box marginTop={1}>
          <text fg={themeColor('muted')}>Escape to go back</text>
        </box>
      </box>
    );
  }

  // ============================================
  // Render: Model Selection
  // ============================================
  if (currentStep === 'model-select') {
    return (
      <box flexDirection="column" paddingX={1}>
        <ProgressBar step={stepIndex} total={STEPS.length} />
        <text><b>Choose your default model</b></text>
        <box flexDirection="column" marginTop={1} marginBottom={1}>
          {availableModels.map((model, i) => (
            <box flexDirection="row" key={model.id}>
              <text fg={i === selectedModelIndex ? themeColor('cyan') : themeColor('muted')}>
                {i === selectedModelIndex ? '  > ' : '    '}
              </text>
              <text attributes={i === selectedModelIndex ? 1 : undefined} fg={i === selectedModelIndex ? themeColor('white') : undefined}><b>
                {model.name}
              </b></text>
              <text fg={themeColor('muted')}>  {model.description}</text>
            </box>
          ))}
        </box>
        <text fg={themeColor('muted')}>Arrow keys to select, Enter to confirm</text>
        <text fg={themeColor('muted')}>Esc or B to go back</text>
      </box>
    );
  }

  // ============================================
  // Render: Connectors
  // ============================================
  if (currentStep === 'connectors') {
    const connectorList = getConnectorDisplayList();
    const visibleRange = getVisibleRange(selectedConnectorIndex, connectorList.length);
    const visibleConnectors = connectorList.slice(visibleRange.start, visibleRange.end);

    return (
      <box flexDirection="column" paddingX={1}>
        <ProgressBar step={stepIndex} total={STEPS.length} />
        <text><b>Connectors</b></text>
        <box marginTop={1} marginBottom={1} flexDirection="column">
          <text fg={themeColor('muted')}>Select connectors to enable. Uninstalled ones will be installed automatically.</text>
        </box>
        <box flexDirection="column">
          {visibleRange.hasMore.above > 0 && (
            <text fg={themeColor('muted')}>  ^ {visibleRange.hasMore.above} more above</text>
          )}
          {visibleConnectors.map((connector, visibleIdx) => {
            const actualIdx = visibleRange.start + visibleIdx;
            const isSelected = actualIdx === selectedConnectorIndex;
            const enabled = enabledConnectors.has(connector.name);
            const desc = connector.desc || '';
            const descDisplay = desc.length > 32 ? desc.slice(0, 29) + '...' : desc;
            const checkbox = enabled ? 'x' : ' ';
            return (
              <box flexDirection="row" key={connector.name}>
                <text fg={isSelected ? themeColor('cyan') : themeColor('muted')}>
                  {isSelected ? '> ' : '  '}
                </text>
                <text fg={enabled ? themeColor('success') : themeColor('muted')}>
                  [{checkbox}]
                </text>
                <text> {connector.name}</text>
                <text fg={themeColor('muted')}>  {descDisplay}</text>
              </box>
            );
          })}
          {visibleRange.hasMore.below > 0 && (
            <text fg={themeColor('muted')}>  v {visibleRange.hasMore.below} more below</text>
          )}
        </box>
        <box marginTop={1} flexDirection="column">
          <text fg={themeColor('muted')}>Arrow keys to move, Space to toggle, Enter to continue</text>
          <text fg={themeColor('muted')}>Esc or B to go back</text>
        </box>
      </box>
    );
  }

  // ============================================
  // Render: Skills
  // ============================================
  if (currentStep === 'skills') {
    return (
      <box flexDirection="column" paddingX={1}>
        <ProgressBar step={stepIndex} total={STEPS.length} />
        <text><b>Skills</b></text>
        <box marginTop={1} marginBottom={1} flexDirection="column">
          <text fg={themeColor('muted')}>Skills teach your assistant specialized workflows.</text>
          <box flexDirection="row">
            <text fg={themeColor('muted')}>Install skills with: </text>
            <text fg={themeColor('info')}>bun add -g @hasna/skills</text>
          </box>
        </box>
        {skillsList.length > 0 ? (
          <box flexDirection="column">
            {skillsList.map((skill, i) => {
              const isSelected = i === selectedSkillIndex;
              return (
                <box flexDirection="row" key={skill.name}>
                  <text fg={isSelected ? themeColor('cyan') : themeColor('muted')}>
                    {isSelected ? '> ' : '  '}
                  </text>
                  <text fg={themeColor('success')}>[x]</text>
                  <text> /{skill.name}</text>
                  {skill.description && (
                    <text fg={themeColor('muted')}>  {skill.description.length > 40 ? skill.description.slice(0, 37) + '...' : skill.description}</text>
                  )}
                </box>
              );
            })}
          </box>
        ) : (
          <box marginBottom={1} flexDirection="row">
            <text fg={themeColor('muted')}>  No skills installed. Run </text>
            <text fg={themeColor('info')}>bun add -g @hasna/skills</text>
            <text fg={themeColor('muted')}> to get started.</text>
          </box>
        )}
        <box marginTop={1} flexDirection="column">
          <text fg={themeColor('muted')}>Press Enter to continue...</text>
          <text fg={themeColor('muted')}>Esc or B to go back</text>
        </box>
      </box>
    );
  }

  // ============================================
  // Render: Connector Keys
  // ============================================
  if (currentStep === 'connector-keys') {
    const currentConnector = connectorKeysNeeded[connectorKeyIndex];
    if (!currentConnector) {
      // No more keys needed, advance
      goNext();
      return null;
    }

    return (
      <box flexDirection="column" paddingX={1}>
        <ProgressBar step={stepIndex} total={STEPS.length} />
        <text><b>Configure connector: {currentConnector}</b></text>
        <box marginTop={1}>
          <text>Enter API key for {currentConnector}:</text>
        </box>
        <box flexDirection="row">
          <text fg={themeColor('info')}>&gt; </text>
          <input
            value={connectorKeyValue}
            onChange={setConnectorKeyValue}
            onSubmit={() => submitConnectorKey(connectorKeyValue)}
            focused
            placeholder="Enter API key or press Enter to skip"
          />
        </box>
        <box marginTop={1}>
          <text fg={themeColor('muted')}>{connectorKeyIndex + 1} of {connectorKeysNeeded.length} connectors</text>
        </box>
      </box>
    );
  }

  // ============================================
  // Render: Summary
  // ============================================
  if (currentStep === 'summary') {
    const maskedKey = apiKey.length > 14
      ? apiKey.slice(0, 10) + '...' + apiKey.slice(-4)
      : apiKey.slice(0, 7) + '...';
    const selectedModel = availableModels[selectedModelIndex] || availableModels[0];
    const modelLabel = selectedModel ? `${selectedModel.name} (${getProviderLabel(selectedProvider)})` : 'unknown';
    const connectorList = Array.from(enabledConnectors).join(', ') || 'none';
    const skillsDisplay = skillsList.length > 0 ? skillsList.map(s => s.name).join(', ') : 'none';
    const modelDisplay = modelLabel.length > 24 ? modelLabel.slice(0, 21) + '...' : modelLabel.padEnd(24);

    return (
      <box flexDirection="column" paddingX={1}>
        <ProgressBar step={stepIndex} total={STEPS.length} />
        <text fg={themeColor('success')}><b>You're all set!</b></text>
        <box marginTop={1} flexDirection="column">
          <text fg={themeColor('muted')}>{'┌─────────────────────────────────────┐'}</text>
          <text fg={themeColor('muted')}>{'│'} Configuration Summary{'              │'}</text>
          <text fg={themeColor('muted')}>{'├─────────────────────────────────────┤'}</text>
          <text fg={themeColor('muted')}>{'│'} API Key:    {maskedKey.padEnd(24)}{'│'}</text>
          <text fg={themeColor('muted')}>{'│'} Model:      {modelDisplay}{'│'}</text>
          <text fg={themeColor('muted')}>{'│'} Connectors: {connectorList.length > 24 ? connectorList.slice(0, 21) + '...' : connectorList.padEnd(24)}{'│'}</text>
          <text fg={themeColor('muted')}>{'│'} Skills:     {skillsDisplay.length > 24 ? skillsDisplay.slice(0, 21) + '...' : skillsDisplay.padEnd(24)}{'│'}</text>
          <text fg={themeColor('muted')}>{'│'} Config:     {'~/.hasna/assistants/'.padEnd(24)}{'│'}</text>
          <text fg={themeColor('muted')}>{'└─────────────────────────────────────┘'}</text>
        </box>
        <box marginTop={1}>
          {isSaving ? (
            <text fg={themeColor('warning')}>Saving configuration...</text>
          ) : (
            <text fg={themeColor('muted')}>Press Enter to start chatting...</text>
          )}
        </box>
        {!isSaving && (
          <box marginTop={1} flexDirection="column">
            <text fg={themeColor('muted')}>Edit: (P)rovider  (M)odel  (K)ey  (C)onnectors  (S)kills</text>
            <text fg={themeColor('muted')}>Esc or B to go back</text>
          </box>
        )}
      </box>
    );
  }

  return null;
}
