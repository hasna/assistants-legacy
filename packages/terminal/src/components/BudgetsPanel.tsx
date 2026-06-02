import React, { useEffect, useMemo, useState } from 'react';
import type { BudgetConfig, BudgetLimits, BudgetUsage } from '@hasna/assistants-shared';
import type { BudgetStatus, BudgetScope } from '@hasna/assistants-core';
import { BudgetPanel } from './BudgetPanel';
import { Box, Text, TextInput, useInput } from '../ui/ink';
import type { BudgetProfile } from '../lib/budgets';
import { themeColor } from '../theme/colors';

interface BudgetsPanelProps {
  profiles: BudgetProfile[];
  activeProfileId: string | null;
  sessionStatus: BudgetStatus;
  swarmStatus: BudgetStatus;
  onSelectProfile: (id: string) => void;
  onCreateProfile: (name: string, config: BudgetConfig, description?: string) => Promise<void>;
  onDeleteProfile: (id: string) => Promise<void>;
  onUpdateProfile: (id: string, updates: Partial<BudgetConfig>) => Promise<void>;
  onReset: (scope: BudgetScope) => void;
  onCancel: () => void;
}

type Mode = 'list' | 'create' | 'delete-confirm' | 'edit';
type CreateStep = 'name' | 'description' | 'configure';

function cloneConfig(config?: BudgetConfig): BudgetConfig {
  return JSON.parse(JSON.stringify(config || {})) as BudgetConfig;
}

function createEmptyUsage(): BudgetUsage {
  const now = new Date().toISOString();
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    llmCalls: 0,
    toolCalls: 0,
    durationMs: 0,
    periodStartedAt: now,
    lastUpdatedAt: now,
  };
}

function createDraftStatus(scope: 'session' | 'swarm', limits?: BudgetLimits): BudgetStatus {
  return {
    scope,
    limits: limits || {},
    usage: createEmptyUsage(),
    checks: {},
    overallExceeded: false,
    warningsCount: 0,
  };
}

export function BudgetsPanel({
  profiles,
  activeProfileId,
  sessionStatus,
  swarmStatus,
  onSelectProfile,
  onCreateProfile,
  onDeleteProfile,
  onUpdateProfile,
  onReset,
  onCancel,
}: BudgetsPanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [createStep, setCreateStep] = useState<CreateStep>('name');
  const [draftConfig, setDraftConfig] = useState<BudgetConfig>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) || profiles[0] || null,
    [profiles, activeProfileId]
  );
  const selectedProfile = profiles[selectedIndex] || null;
  const editingProfile = editingProfileId
    ? profiles.find((p) => p.id === editingProfileId) || null
    : null;

  const draftSessionStatus = useMemo(
    () => createDraftStatus('session', draftConfig.session),
    [draftConfig]
  );
  const draftSwarmStatus = useMemo(
    () => createDraftStatus('swarm', draftConfig.swarm),
    [draftConfig]
  );

  const activeOrDraftProfileForEdit = editingProfile || selectedProfile || activeProfile;
  const showingActiveProfile = activeOrDraftProfileForEdit?.id === activeProfileId;
  const editSessionStatus = showingActiveProfile
    ? sessionStatus
    : createDraftStatus('session', activeOrDraftProfileForEdit?.config.session);
  const editSwarmStatus = showingActiveProfile
    ? swarmStatus
    : createDraftStatus('swarm', activeOrDraftProfileForEdit?.config.swarm);

  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, profiles.length));
  }, [profiles.length]);

  useEffect(() => {
    if (!editingProfileId) return;
    if (!profiles.some((profile) => profile.id === editingProfileId)) {
      setEditingProfileId(null);
      setMode('list');
    }
  }, [editingProfileId, profiles]);

  const resetCreateForm = (seed?: BudgetConfig) => {
    setNewName('');
    setNewDescription('');
    setCreateStep('name');
    setDraftConfig(cloneConfig(seed || activeProfile?.config));
  };

  const startCreateForm = () => {
    resetCreateForm(activeProfile?.config);
    setMode('create');
  };

  const finishCreateProfile = async () => {
    const name = newName.trim();
    if (!name) return;
    setIsSubmitting(true);
    try {
      await onCreateProfile(name, cloneConfig(draftConfig), newDescription.trim() || undefined);
      resetCreateForm(activeProfile?.config);
      setMode('list');
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelCreateForm = () => {
    resetCreateForm(activeProfile?.config);
    setMode('list');
  };

  useInput((input, key) => {
    if (mode === 'create') {
      if (key.escape || input === '\x1b') {
        if (createStep === 'configure') {
          setCreateStep('description');
          return;
        }
        resetCreateForm(activeProfile?.config);
        setMode('list');
      }
      return;
    }

    if (mode === 'delete-confirm') {
      if (input === 'y' || input === 'Y') {
        if (selectedProfile) {
          setIsSubmitting(true);
          void onDeleteProfile(selectedProfile.id).finally(() => {
            setIsSubmitting(false);
            setMode('list');
          });
        } else {
          setMode('list');
        }
        return;
      }
      if (input === 'n' || input === 'N' || key.escape || input === '\x1b') {
        setMode('list');
        return;
      }
      return;
    }

    if (mode === 'edit') {
      return;
    }

    if (input === 'n' || input === 'N') {
      startCreateForm();
      return;
    }

    if (input === 'e' || input === 'E') {
      if (selectedProfile) {
        setEditingProfileId(selectedProfile.id);
        setMode('edit');
      }
      return;
    }

    if (input === 'd' || input === 'D') {
      if (selectedProfile && selectedProfile.id !== activeProfileId && profiles.length > 1) {
        setMode('delete-confirm');
      }
      return;
    }

    if (key.return) {
      if (selectedIndex === profiles.length) {
        // "New profile" option
        startCreateForm();
      } else if (selectedProfile) {
        onSelectProfile(selectedProfile.id);
      }
      return;
    }

    if (key.escape || input === '\x1b' || input === 'q' || input === 'Q') {
      onCancel();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => (prev === 0 ? profiles.length : prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => (prev === profiles.length ? 0 : prev + 1));
      return;
    }
  }, { isActive: mode === 'list' || mode === 'delete-confirm' });

  if (mode === 'edit' && activeOrDraftProfileForEdit) {
    const profile = activeOrDraftProfileForEdit;

    const handleSetLimits = (scope: BudgetScope, limits: Partial<BudgetLimits>) => {
      const current = profile.config;
      void onUpdateProfile(profile.id, {
        [scope]: { ...(current[scope] || {}), ...limits },
      });
    };

    const handleToggleEnabled = (enabled: boolean) => {
      void onUpdateProfile(profile.id, { enabled });
    };

    const handleSetOnExceeded = (action: 'warn' | 'pause' | 'stop') => {
      void onUpdateProfile(profile.id, { onExceeded: action });
    };

    return (
      <BudgetPanel
        config={profile.config}
        sessionStatus={editSessionStatus}
        swarmStatus={editSwarmStatus}
        onToggleEnabled={handleToggleEnabled}
        onReset={onReset}
        onSetLimits={handleSetLimits}
        onSetOnExceeded={handleSetOnExceeded}
        onCancel={() => {
          setEditingProfileId(null);
          setMode('list');
        }}
      />
    );
  }

  if (mode === 'create') {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Box marginBottom={1}>
          <Text fg={themeColor('info')} bold>Create Budget Profile</Text>
        </Box>

        {createStep === 'name' && (
          <Box flexDirection="column">
            <Box>
              <Text>Name: </Text>
              <TextInput
                value={newName}
                onChange={setNewName}
                onSubmit={(nextName) => {
                  setNewName(nextName);
                  if (nextName.trim()) setCreateStep('description');
                }}
                onCancel={cancelCreateForm}
                focus
                placeholder="e.g. Deep Work"
              />
            </Box>
            <Box marginTop={1}>
              <Text fg={themeColor('muted')}>Enter to continue | Esc to cancel</Text>
            </Box>
          </Box>
        )}

        {createStep === 'description' && (
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
                onSubmit={(nextDescription) => {
                  setNewDescription(nextDescription);
                  if (!newName.trim()) return;
                  setCreateStep('configure');
                }}
                onCancel={cancelCreateForm}
                focus
                placeholder="Optional"
              />
            </Box>
            <Box marginTop={1}>
              <Text fg={themeColor('muted')}>Enter to configure limits | Esc to cancel</Text>
            </Box>
          </Box>
        )}

        {createStep === 'configure' && (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text fg={themeColor('muted')}>Name: </Text>
              <Text>{newName}</Text>
            </Box>
            {newDescription.trim() && (
              <Box marginBottom={1}>
                <Text fg={themeColor('muted')}>Description: </Text>
                <Text>{newDescription.trim()}</Text>
              </Box>
            )}
            <BudgetPanel
              config={draftConfig}
              sessionStatus={draftSessionStatus}
              swarmStatus={draftSwarmStatus}
              onToggleEnabled={(enabled) => {
                setDraftConfig((prev) => ({ ...prev, enabled }));
              }}
              onReset={() => {}}
              onSetLimits={(scope, limits) => {
                setDraftConfig((prev) => ({
                  ...prev,
                  [scope]: { ...(prev[scope] || {}), ...limits },
                }));
              }}
              onSetOnExceeded={(action) => {
                setDraftConfig((prev) => ({ ...prev, onExceeded: action }));
              }}
              onPrimaryAction={() => {
                if (isSubmitting) return;
                void finishCreateProfile();
              }}
              primaryActionLabel="create profile"
              primaryActionKey="a"
              onCancel={() => {
                setCreateStep('description');
              }}
            />
          </Box>
        )}

        {isSubmitting && (
          <Box marginTop={1}>
            <Text fg={themeColor('warning')}>Creating profile...</Text>
          </Box>
        )}
      </Box>
    );
  }

  if (mode === 'delete-confirm') {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Box marginBottom={1}>
          <Text fg={themeColor('error')} bold>Delete Budget Profile</Text>
        </Box>
        <Box marginBottom={1}>
          <Text>
            Delete profile "{selectedProfile?.name || ''}"?
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text>
            Press <Text fg={themeColor('success')} bold>y</Text> to confirm or{' '}
            <Text fg={themeColor('error')} bold>n</Text> to cancel
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingY={1}>
      <Box flexDirection="row" marginBottom={1} justifyContent="space-between">
        <Text bold>Budgets</Text>
        <Text fg={themeColor('muted')}>[n]ew [e]dit [d]elete</Text>
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1}>
        {profiles.length === 0 ? (
          <Box paddingY={1}>
            <Text fg={themeColor('muted')}>No budget profiles. Press n to create one.</Text>
          </Box>
        ) : (
          profiles.map((profile, index) => {
            const isSelected = index === selectedIndex;
            const isActive = profile.id === activeProfileId;
            return (
              <Box key={profile.id} paddingY={0}>
                <Text bg={isSelected ? themeColor('primary') : undefined} fg={isSelected ? themeColor('text') : isActive ? themeColor('success') : themeColor('muted')}>
                  {isActive ? '*' : ' '} {index + 1}. {profile.name.padEnd(22)} {profile.description || ''}
                </Text>
              </Box>
            );
          })
        )}

        {/* New profile option */}
        <Box marginTop={profiles.length > 0 ? 1 : 0} paddingY={0}>
          <Text
            bg={selectedIndex === profiles.length ? themeColor('primary') : undefined}
            fg={selectedIndex === profiles.length ? themeColor('text') : undefined}
          >
            + New profile (n)
          </Text>
        </Box>
      </Box>

      {selectedProfile && (
        <Box marginTop={1}>
          <Text fg={themeColor('muted')}>
            {selectedProfile.id === activeProfileId ? 'Active for this session' : 'Enter to activate'}
          </Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text fg={themeColor('muted')}>Enter activate | ↑↓ navigate | [n]ew | [e]dit | [d]elete | q quit</Text>
      </Box>
    </Box>
  );
}
