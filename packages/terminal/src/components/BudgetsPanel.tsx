import React, { useEffect, useMemo, useState } from 'react';
import { useClearOnChange } from '../hooks/useClearOnChange';
import type { BudgetConfig, BudgetLimits, BudgetUsage } from '@hasna/assistants-shared';
import type { BudgetStatus, BudgetScope } from '@hasna/assistants-core';
import { BudgetPanel } from './BudgetPanel';
import { useSafeInput as useInput } from '../hooks/useSafeInput';
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
  useClearOnChange(mode);
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

  useInput((input, key) => {
    if (mode === 'create') {
      if (key.escape) {
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
      if (input === 'n' || input === 'N' || key.escape) {
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

    if (key.escape || input === 'q' || input === 'Q') {
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
  }, { isActive: true });

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
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg={themeColor('info')}><b>Create Budget Profile</b></text>
        </box>

        {createStep === 'name' && (
          <box flexDirection="column">
            <box>
              <text>Name: </text>
              <input
                value={newName}
                onChange={setNewName}
                onSubmit={() => {
                  if (newName.trim()) setCreateStep('description');
                }}
                focused
                placeholder="e.g. Deep Work"
              />
            </box>
            <box marginTop={1}>
              <text fg={themeColor('muted')}>Enter to continue | Esc to cancel</text>
            </box>
          </box>
        )}

        {createStep === 'description' && (
          <box flexDirection="column">
            <box>
              <text fg={themeColor('muted')}>Name: </text>
              <text>{newName}</text>
            </box>
            <box marginTop={1}>
              <text>Description: </text>
              <input
                value={newDescription}
                onChange={setNewDescription}
                onSubmit={() => {
                  if (!newName.trim()) return;
                  setCreateStep('configure');
                }}
                focused
                placeholder="Optional"
              />
            </box>
            <box marginTop={1}>
              <text fg={themeColor('muted')}>Enter to configure limits | Esc to cancel</text>
            </box>
          </box>
        )}

        {createStep === 'configure' && (
          <box flexDirection="column">
            <box marginBottom={1}>
              <text fg={themeColor('muted')}>Name: </text>
              <text>{newName}</text>
            </box>
            {newDescription.trim() && (
              <box marginBottom={1}>
                <text fg={themeColor('muted')}>Description: </text>
                <text>{newDescription.trim()}</text>
              </box>
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
          </box>
        )}

        {isSubmitting && (
          <box marginTop={1}>
            <text fg={themeColor('warning')}>Creating profile...</text>
          </box>
        )}
      </box>
    );
  }

  if (mode === 'delete-confirm') {
    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg={themeColor('error')}><b>Delete Budget Profile</b></text>
        </box>
        <box marginBottom={1}>
          <text>
            Delete profile &quot;{selectedProfile?.name || ''}&quot;?
          </text>
        </box>
        <box marginTop={1}>
          <text>
            Press <span fg={themeColor('success')}><b>y</b></span> to confirm or{' '}
            <span fg={themeColor('error')}><b>n</b></span> to cancel
          </text>
        </box>
      </box>
    );
  }

  return (
    <box flexDirection="column" paddingY={1}>
      <box flexDirection="row" marginBottom={1} justifyContent="space-between">
        <text><b>Budgets</b></text>
        <text fg={themeColor('muted')}>[n]ew [e]dit [d]elete</text>
      </box>

      <box flexDirection="column" borderStyle="rounded" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1}>
        {profiles.length === 0 ? (
          <box paddingY={1}>
            <text fg={themeColor('muted')}>No budget profiles. Press n to create one.</text>
          </box>
        ) : (
          profiles.map((profile, index) => {
            const isSelected = index === selectedIndex;
            const isActive = profile.id === activeProfileId;
            return (
              <box key={profile.id} paddingY={0}>
                <text bg={isSelected ? themeColor('primary') : undefined} fg={isSelected ? themeColor('text') : isActive ? themeColor('success') : "gray"}>
                  {isActive ? '*' : ' '} {index + 1}. {profile.name.padEnd(22)} {profile.description || ''}
                </text>
              </box>
            );
          })
        )}

        {/* New profile option */}
        <box marginTop={profiles.length > 0 ? 1 : 0} paddingY={0}>
          <text
            bg={selectedIndex === profiles.length ? themeColor('primary') : undefined}
            fg={selectedIndex === profiles.length ? themeColor('text') : undefined}
          >
            + New profile (n)
          </text>
        </box>
      </box>

      {selectedProfile && (
        <box marginTop={1}>
          <text fg={themeColor('muted')}>
            {selectedProfile.id === activeProfileId ? 'Active for this session' : 'Enter to activate'}
          </text>
        </box>
      )}

      <box marginTop={1}>
        <text fg={themeColor('muted')}>Enter activate | ↑↓ navigate | [n]ew | [e]dit | [d]elete | q quit</text>
      </box>
    </box>
  );
}
