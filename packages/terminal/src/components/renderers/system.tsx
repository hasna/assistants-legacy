/**
 * System panel renderers: Guardrails, Budget, Model, Registry, Projects, Plans,
 * Wallet, Secrets, Dashboard, Swarm, Workspace, Heartbeat, Config.
 */
import React from 'react';
import type { AssistantsConfig } from '@hasna/assistants-shared';
import {
  GuardrailsStore, PERMISSIVE_POLICY, RESTRICTIVE_POLICY, BudgetTracker, getGlobalRegistry,
  getConfigDir, getProjectConfigDir, readHeartbeatHistoryBySession,
  listProjects, createProject, deleteProject, updateProject, readProject,
  type GuardrailsConfig, type PolicyInfo, type BudgetScope, type BudgetStatus,
  type RegisteredAssistant, type RegistryStats, type ProjectRecord, type ProjectPlan, type PlanStepStatus,
} from '@hasna/assistants-core';
import type { BudgetConfig } from '@hasna/assistants-shared';
import type { BudgetProfile } from '../../lib/budgets';
import {
  loadBudgetProfiles, createBudgetProfile, updateBudgetProfile, deleteBudgetProfile,
} from '../../lib/budgets';
import { GuardrailsPanel } from '../GuardrailsPanel';
import { BudgetsPanel } from '../BudgetsPanel';
import { ModelPanel } from '../ModelPanel';
import { AssistantsRegistryPanel } from '../AssistantsRegistryPanel';
import { ProjectsPanel } from '../ProjectsPanel';
import { PlansPanel } from '../PlansPanel';
import { WalletPanel } from '../WalletPanel';
import { SecretsPanel } from '../SecretsPanel';
import { AssistantsDashboard } from '../AssistantsDashboard';
import { SwarmPanel } from '../SwarmPanel';
import { WorkspacePanel } from '../WorkspacePanel';
import { HeartbeatPanel } from '../HeartbeatPanel';
import { ConfigPanel } from '../ConfigPanel';
import type { WalletAddInput, WalletCardEntry } from '../appHelpers';
import { deepMerge } from '../appHelpers';
import { themeColor } from '../../theme/colors';
import type { PanelRenderContext } from './context';

export function renderGuardrailsPanel(ctx: PanelRenderContext): React.ReactNode {
  const handleToggleEnabled = (enabled: boolean) => {
    if (!ctx.guardrailsStoreRef.current) {
      ctx.guardrailsStoreRef.current = new GuardrailsStore();
    }
    ctx.guardrailsStoreRef.current.setEnabled(enabled, 'project');
    const config = ctx.guardrailsStoreRef.current.loadAll();
    const policies = ctx.guardrailsStoreRef.current.listPolicies();
    ctx.setGuardrailsConfig(config);
    ctx.setGuardrailsPolicies(policies);
  };

  const handleTogglePolicy = (policyId: string, enabled: boolean) => {
    if (!ctx.guardrailsStoreRef.current) {
      ctx.guardrailsStoreRef.current = new GuardrailsStore();
    }
    ctx.guardrailsStoreRef.current.setPolicyEnabled(policyId, enabled);
    const config = ctx.guardrailsStoreRef.current.loadAll();
    const policies = ctx.guardrailsStoreRef.current.listPolicies();
    ctx.setGuardrailsConfig(config);
    ctx.setGuardrailsPolicies(policies);
  };

  const handleSetPreset = (preset: 'permissive' | 'restrictive') => {
    if (!ctx.guardrailsStoreRef.current) {
      ctx.guardrailsStoreRef.current = new GuardrailsStore();
    }
    const policy = preset === 'permissive' ? PERMISSIVE_POLICY : RESTRICTIVE_POLICY;
    ctx.guardrailsStoreRef.current.addPolicy({ ...policy }, 'project');
    ctx.guardrailsStoreRef.current.setEnabled(true, 'project');
    const config = ctx.guardrailsStoreRef.current.loadAll();
    const policies = ctx.guardrailsStoreRef.current.listPolicies();
    ctx.setGuardrailsConfig(config);
    ctx.setGuardrailsPolicies(policies);
  };

  const handleAddPolicy = (policy: any) => {
    if (!ctx.guardrailsStoreRef.current) {
      ctx.guardrailsStoreRef.current = new GuardrailsStore();
    }
    ctx.guardrailsStoreRef.current.addPolicy(policy, 'project');
    const config = ctx.guardrailsStoreRef.current.loadAll();
    const policies = ctx.guardrailsStoreRef.current.listPolicies();
    ctx.setGuardrailsConfig(config);
    ctx.setGuardrailsPolicies(policies);
  };

  const handleRemovePolicy = (policyId: string) => {
    if (!ctx.guardrailsStoreRef.current) {
      ctx.guardrailsStoreRef.current = new GuardrailsStore();
    }
    ctx.guardrailsStoreRef.current.removePolicy(policyId);
    const config = ctx.guardrailsStoreRef.current.loadAll();
    const policies = ctx.guardrailsStoreRef.current.listPolicies();
    ctx.setGuardrailsConfig(config);
    ctx.setGuardrailsPolicies(policies);
  };

  const handleUpdatePolicy = (policyId: string, updates: any) => {
    if (!ctx.guardrailsStoreRef.current) {
      ctx.guardrailsStoreRef.current = new GuardrailsStore();
    }
    const existing = ctx.guardrailsStoreRef.current.getPolicy(policyId);
    if (existing) {
      ctx.guardrailsStoreRef.current.removePolicy(policyId);
      const merged = { ...existing.policy, ...updates };
      ctx.guardrailsStoreRef.current.addPolicy(merged, existing.location as any);
    }
    const config = ctx.guardrailsStoreRef.current.loadAll();
    const policies = ctx.guardrailsStoreRef.current.listPolicies();
    ctx.setGuardrailsConfig(config);
    ctx.setGuardrailsPolicies(policies);
  };

  return (
    <box flexDirection="column" padding={1}>
      <GuardrailsPanel
        config={ctx.guardrailsConfig!}
        policies={ctx.guardrailsPolicies}
        onToggleEnabled={handleToggleEnabled}
        onTogglePolicy={handleTogglePolicy}
        onSetPreset={handleSetPreset}
        onAddPolicy={handleAddPolicy}
        onRemovePolicy={handleRemovePolicy}
        onUpdatePolicy={handleUpdatePolicy}
        onCancel={() => ctx.setShowGuardrailsPanel(false)}
      />
    </box>
  );
}

export function renderBudgetsPanel(ctx: PanelRenderContext): React.ReactNode {
  const session = ctx.registry.getActiveSession();
  const activeProfileId = session
    ? ctx.getSessionBudgetProfileId(session.id, ctx.budgetProfiles)
    : null;
  const activeProfile = ctx.budgetProfiles.find((p) => p.id === activeProfileId) || null;
  const baseDir = ctx.workspaceBaseDir || getConfigDir();

  const handleBudgetReset = (scope: BudgetScope) => {
    const loop = session?.client.getAssistantLoop?.();
    if (loop && typeof loop.resetBudget === 'function') {
      loop.resetBudget(scope);
    }
    if (loop && typeof loop.getBudgetStatus === 'function') {
      const summary = loop.getBudgetStatus();
      if (summary) {
        ctx.setSessionBudgetStatus(summary.session);
        ctx.setSwarmBudgetStatus(summary.swarm);
        return;
      }
    }

    if (!ctx.budgetTrackerRef.current) {
      ctx.budgetTrackerRef.current = new BudgetTracker(
        ctx.activeSessionId || 'default',
        activeProfile?.config || ctx.budgetConfig || ctx.currentConfig?.budget
      );
    }
    ctx.budgetTrackerRef.current.resetUsage(scope);
    const sessionStatus = ctx.budgetTrackerRef.current.checkBudget('session');
    const swarmStatus = ctx.budgetTrackerRef.current.checkBudget('swarm');
    ctx.setSessionBudgetStatus(sessionStatus);
    ctx.setSwarmBudgetStatus(swarmStatus);
  };

  const handleSelectProfile = async (profileId: string) => {
    if (!session) return;
    await ctx.applyBudgetProfileToSession(session, profileId, ctx.budgetProfiles);
  };

  const handleCreateProfile = async (name: string, config: BudgetConfig, description?: string) => {
    const created = await createBudgetProfile(baseDir, name, config, description);
    const profiles = await loadBudgetProfiles(baseDir, ctx.currentConfig?.budget);
    ctx.setBudgetProfiles(profiles);
    if (session) {
      await ctx.applyBudgetProfileToSession(session, created.id, profiles);
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    if (ctx.budgetProfiles.length <= 1) return;
    await deleteBudgetProfile(baseDir, profileId);
    const profiles = await loadBudgetProfiles(baseDir, ctx.currentConfig?.budget);
    ctx.setBudgetProfiles(profiles);
    if (session) {
      const fallback = profiles[0]?.id || null;
      await ctx.applyBudgetProfileToSession(session, fallback, profiles);
    }
  };

  const handleUpdateProfile = async (profileId: string, updates: Partial<BudgetConfig>) => {
    const updated = await updateBudgetProfile(baseDir, profileId, (profile) => ({
      ...profile,
      config: { ...profile.config, ...updates },
    }));
    if (!updated) return;
    const nextProfiles = await loadBudgetProfiles(baseDir, ctx.currentConfig?.budget);
    ctx.setBudgetProfiles(nextProfiles);
    if (session) {
      const currentSessionProfileId = ctx.getSessionBudgetProfileId(session.id, nextProfiles);
      if (currentSessionProfileId === profileId) {
        await ctx.applyBudgetProfileToSession(session, profileId, nextProfiles);
      }
    }
  };

  return (
    <box flexDirection="column" padding={1}>
      <BudgetsPanel
        profiles={ctx.budgetProfiles}
        activeProfileId={activeProfileId}
        sessionStatus={ctx.sessionBudgetStatus!}
        swarmStatus={ctx.swarmBudgetStatus!}
        onSelectProfile={handleSelectProfile}
        onCreateProfile={handleCreateProfile}
        onDeleteProfile={handleDeleteProfile}
        onUpdateProfile={handleUpdateProfile}
        onReset={handleBudgetReset}
        onCancel={() => ctx.setShowBudgetPanel(false)}
      />
    </box>
  );
}

export function renderModelPanel(ctx: PanelRenderContext): React.ReactNode {
  const currentModelId = ctx.activeSession?.client.getModel() || null;
  const identityInfo = ctx.activeSession?.client.getIdentityInfo?.();
  const agentName = identityInfo?.assistant?.name
    || ctx.activeSession?.assistantId
    || 'Default';
  const agentDescription = identityInfo?.assistant?.description;

  const handleOpenAgents = () => {
    ctx.setShowModelPanel(false);
    ctx.setShowAssistantsPanel(true);
  };

  return (
    <box flexDirection="column" padding={1}>
      <ModelPanel
        currentModelId={currentModelId}
        agentName={agentName}
        agentDescription={agentDescription}
        onOpenAgents={handleOpenAgents}
        onCancel={() => ctx.setShowModelPanel(false)}
      />
    </box>
  );
}

export function renderAssistantsRegistryPanel(ctx: PanelRenderContext): React.ReactNode {
  const handleAssistantsRefresh = () => {
    const assistantRegistry = getGlobalRegistry();
    const assistants = assistantRegistry.list();
    const stats = assistantRegistry.getStats();
    ctx.setAssistantsList(assistants);
    ctx.setRegistryStats(stats);
  };

  return (
    <box flexDirection="column" padding={1}>
      <AssistantsRegistryPanel
        assistants={ctx.assistantsList}
        stats={ctx.registryStats!}
        onRefresh={handleAssistantsRefresh}
        onCancel={() => ctx.setShowAssistantsRegistryPanel(false)}
      />
    </box>
  );
}

export function renderProjectsPanel(ctx: PanelRenderContext): React.ReactNode {
  const handleProjectSelect = (projectId: string) => {
    const activeSession = ctx.registry.getActiveSession();
    activeSession?.client.setActiveProjectId?.(projectId);
    ctx.setActiveProjectId(projectId);
    ctx.setShowProjectsPanel(false);
  };

  const handleProjectCreate = async (name: string, description?: string) => {
    const project = await createProject(ctx.cwd, name, description);
    const projects = await listProjects(ctx.cwd);
    ctx.setProjectsList(projects);
    const activeSession = ctx.registry.getActiveSession();
    activeSession?.client.setActiveProjectId?.(project.id);
    ctx.setActiveProjectId(project.id);
  };

  const handleProjectDelete = async (projectId: string) => {
    await deleteProject(ctx.cwd, projectId);
    const projects = await listProjects(ctx.cwd);
    ctx.setProjectsList(projects);
    if (ctx.activeProjectId === projectId) {
      const activeSession = ctx.registry.getActiveSession();
      activeSession?.client.setActiveProjectId?.(null);
      ctx.setActiveProjectId(undefined);
    }
  };

  const handleViewPlans = (projectId: string) => {
    readProject(ctx.cwd, projectId).then((project) => {
      if (project) {
        ctx.setPlansProject(project);
        ctx.setShowProjectsPanel(false);
        ctx.setShowPlansPanel(true);
      }
    });
  };

  return (
    <box flexDirection="column" padding={1}>
      <ProjectsPanel
        projects={ctx.projectsList}
        activeProjectId={ctx.activeProjectId}
        onSelect={handleProjectSelect}
        onCreate={handleProjectCreate}
        onDelete={handleProjectDelete}
        onViewPlans={handleViewPlans}
        onCancel={() => ctx.setShowProjectsPanel(false)}
      />
    </box>
  );
}

export function renderPlansPanel(ctx: PanelRenderContext): React.ReactNode {
  const plansProject = ctx.plansProject!;

  const handleCreatePlan = async (title: string) => {
    const nowTs = Date.now();
    const plan: ProjectPlan = {
      id: `plan-${nowTs}`,
      title,
      createdAt: nowTs,
      updatedAt: nowTs,
      steps: [],
    };
    const updated = await updateProject(ctx.cwd, plansProject.id, (current) => ({
      ...current,
      plans: [...current.plans, plan],
      updatedAt: nowTs,
    }));
    if (updated) ctx.setPlansProject(updated);
  };

  const handleDeletePlan = async (planId: string) => {
    const nowTs = Date.now();
    const updated = await updateProject(ctx.cwd, plansProject.id, (current) => ({
      ...current,
      plans: current.plans.filter((p) => p.id !== planId),
      updatedAt: nowTs,
    }));
    if (updated) ctx.setPlansProject(updated);
  };

  const handleAddStep = async (planId: string, text: string) => {
    const nowTs = Date.now();
    const updated = await updateProject(ctx.cwd, plansProject.id, (current) => ({
      ...current,
      plans: current.plans.map((p) =>
        p.id === planId
          ? { ...p, steps: [...p.steps, { id: `step-${nowTs}`, text, status: 'todo' as const, createdAt: nowTs, updatedAt: nowTs }], updatedAt: nowTs }
          : p
      ),
      updatedAt: nowTs,
    }));
    if (updated) ctx.setPlansProject(updated);
  };

  const handleUpdateStep = async (planId: string, stepId: string, status: PlanStepStatus) => {
    const nowTs = Date.now();
    const updated = await updateProject(ctx.cwd, plansProject.id, (current) => ({
      ...current,
      plans: current.plans.map((p) =>
        p.id === planId
          ? { ...p, steps: p.steps.map((s) => (s.id === stepId ? { ...s, status, updatedAt: nowTs } : s)), updatedAt: nowTs }
          : p
      ),
      updatedAt: nowTs,
    }));
    if (updated) ctx.setPlansProject(updated);
  };

  const handleRemoveStep = async (planId: string, stepId: string) => {
    const nowTs = Date.now();
    const updated = await updateProject(ctx.cwd, plansProject.id, (current) => ({
      ...current,
      plans: current.plans.map((p) =>
        p.id === planId
          ? { ...p, steps: p.steps.filter((s) => s.id !== stepId), updatedAt: nowTs }
          : p
      ),
      updatedAt: nowTs,
    }));
    if (updated) ctx.setPlansProject(updated);
  };

  return (
    <box flexDirection="column" padding={1}>
      <PlansPanel
        project={plansProject}
        onCreatePlan={handleCreatePlan}
        onDeletePlan={handleDeletePlan}
        onAddStep={handleAddStep}
        onUpdateStep={handleUpdateStep}
        onRemoveStep={handleRemoveStep}
        onBack={() => ctx.setShowPlansPanel(false)}
        onClose={() => ctx.setShowPlansPanel(false)}
      />
    </box>
  );
}

export function renderWalletPanel(ctx: PanelRenderContext): React.ReactNode {
  const walletManager = ctx.activeSession?.client.getWalletManager?.();

  const handleWalletGet = async (cardId: string) => {
    if (!walletManager) throw new Error('Wallet not available');
    const card = await walletManager.get(cardId);
    if (!card) throw new Error(`Card ${cardId} not found`);
    return ctx.toWalletCardEntry(card);
  };

  const handleWalletAdd = async (input: WalletAddInput) => {
    if (!walletManager) throw new Error('Wallet not available');
    const result = await walletManager.add(input);
    if (!result.success) throw new Error(result.message);
    const cards = await walletManager.list();
    ctx.setWalletCards(cards.map((card: any) => ctx.toWalletCardEntry(card)));
    ctx.setWalletError(null);
  };

  const handleWalletRemove = async (cardId: string) => {
    if (!walletManager) throw new Error('Wallet not available');
    const result = await walletManager.remove(cardId);
    if (!result.success) throw new Error(result.message);
    const cards = await walletManager.list();
    ctx.setWalletCards(cards.map((card: any) => ctx.toWalletCardEntry(card)));
    ctx.setWalletError(null);
  };

  return (
    <box flexDirection="column" padding={1}>
      <WalletPanel
        cards={ctx.walletCards}
        initialMode={ctx.walletPanelInitialMode}
        onGet={handleWalletGet}
        onAdd={handleWalletAdd}
        onRemove={handleWalletRemove}
        onClose={() => ctx.setShowWalletPanel(false)}
        error={ctx.walletError}
      />
    </box>
  );
}

export function renderSecretsPanel(ctx: PanelRenderContext): React.ReactNode {
  const secretsManager = ctx.activeSession?.client.getSecretsManager?.();

  const handleSecretsGet = async (name: string, scope?: 'global' | 'assistant') => {
    if (!secretsManager) throw new Error('Secrets not available');
    const value = await secretsManager.get(name, scope, 'plain');
    return value || '';
  };

  const handleSecretsAdd = async (input: {
    name: string;
    value: string;
    scope: 'global' | 'assistant';
    description?: string;
  }) => {
    if (!secretsManager) throw new Error('Secrets not available');
    const result = await secretsManager.set(input);
    if (!result.success) throw new Error(result.message);
    const secrets = await secretsManager.list('all');
    ctx.setSecretsList(secrets);
    ctx.setSecretsError(null);
  };

  const handleSecretsDelete = async (name: string, scope: 'global' | 'assistant') => {
    if (!secretsManager) throw new Error('Secrets not available');
    const result = await secretsManager.delete(name, scope);
    if (!result.success) throw new Error(result.message);
    const secrets = await secretsManager.list('all');
    ctx.setSecretsList(secrets);
    ctx.setSecretsError(null);
  };

  return (
    <box flexDirection="column" padding={1}>
      <SecretsPanel
        secrets={ctx.secretsList}
        initialMode={ctx.secretsPanelInitialMode}
        onGet={handleSecretsGet}
        onAdd={handleSecretsAdd}
        onDelete={handleSecretsDelete}
        onClose={() => ctx.setShowSecretsPanel(false)}
        error={ctx.secretsError}
      />
    </box>
  );
}

export function renderAssistantsDashboard(ctx: PanelRenderContext): React.ReactNode {
  const sessions = ctx.registry.listSessions();
  const sessionEntries = sessions.map((s, i) => ({
    id: s.id,
    label: s.label,
    assistantId: s.assistantId,
    assistantName: s.assistantId ? (s.label || `Assistant ${i + 1}`) : null,
    isActive: s.id === ctx.activeSessionId,
    isProcessing: s.isProcessing,
    isPaused: false,
    cwd: s.cwd,
    startedAt: s.startedAt,
    unreadMessages: 0,
  }));

  const swarmCoordinator = ctx.activeSession?.client.getSwarmCoordinator?.();
  const swarmState = swarmCoordinator?.getSerializableState?.();

  const activeLoop = ctx.activeSession?.client.getAssistantLoop?.();
  const budgetSummary = activeLoop?.getBudgetStatus?.() || null;
  const activeProjectName = ctx.activeSession?.client.getActiveProjectId?.() || null;
  const projectBudgetStatus = activeProjectName
    ? (budgetSummary?.project || null)
    : null;

  return (
    <box flexDirection="column" padding={1}>
      <AssistantsDashboard
        sessions={sessionEntries}
        projectBudget={projectBudgetStatus || undefined}
        projectName={activeProjectName || undefined}
        swarmStatus={swarmState?.status || null}
        swarmTaskProgress={swarmState ? `${swarmState.metrics.completedTasks}/${swarmState.metrics.totalTasks}` : null}
        onSwitchSession={async (sessionId) => {
          await ctx.switchToSession(sessionId);
          ctx.setShowAssistantsDashboard(false);
        }}
        onMessageAgent={(assistantId) => {
          ctx.setShowAssistantsDashboard(false);
          ctx.activeSession?.client.send(`/messages send ${assistantId}`);
        }}
        onPauseResume={(sessionId) => {
          const session = ctx.registry.getSession(sessionId);
          if (session) {
            const loop = session.client.getAssistantLoop?.();
            if (loop?.isPaused?.()) {
              loop.resume?.();
            }
          }
        }}
        onCancel={() => ctx.setShowAssistantsDashboard(false)}
      />
    </box>
  );
}

export function renderSwarmPanel(ctx: PanelRenderContext): React.ReactNode {
  const swarmCoordinator = ctx.activeSession?.client.getSwarmCoordinator?.();
  const swarmState = swarmCoordinator?.getSerializableState?.() || null;
  const swarmConfig = swarmCoordinator?.getConfig?.() || null;
  const swarmMemory = swarmCoordinator?.getMemory?.();
  const memoryStats = swarmMemory ? swarmMemory.getStats() : null;

  return (
    <box flexDirection="column" padding={1}>
      <SwarmPanel
        state={swarmState}
        config={swarmConfig}
        memoryStats={memoryStats}
        onStop={() => {
          swarmCoordinator?.stop?.();
        }}
        onCancel={() => ctx.setShowSwarmPanel(false)}
      />
    </box>
  );
}

export function renderWorkspacePanel(ctx: PanelRenderContext): React.ReactNode {
  const handleWorkspaceArchive = async (id: string) => {
    const { SharedWorkspaceManager } = await import('@hasna/assistants-core');
    const mgr = new SharedWorkspaceManager();
    mgr.archive(id);
    ctx.setWorkspacesList(mgr.list(true));
  };

  const handleWorkspaceDelete = async (id: string) => {
    const { SharedWorkspaceManager } = await import('@hasna/assistants-core');
    const mgr = new SharedWorkspaceManager();
    mgr.delete(id);
    ctx.setWorkspacesList(mgr.list(true));
  };

  return (
    <box flexDirection="column" padding={1}>
      <WorkspacePanel
        workspaces={ctx.workspacesList}
        activeWorkspaceId={ctx.activeWorkspaceId}
        onArchive={handleWorkspaceArchive}
        onDelete={handleWorkspaceDelete}
        onSelect={ctx.switchWorkspace}
        onClose={() => ctx.setShowWorkspacePanel(false)}
      />
    </box>
  );
}

export function renderHeartbeatPanel(ctx: PanelRenderContext): React.ReactNode {
  const sessionId = ctx.activeSessionId || ctx.registry.getActiveSession()?.id;
  const handleRefresh = async () => {
    if (!sessionId) {
      ctx.setHeartbeatRuns([]);
      return;
    }
    const runs = await readHeartbeatHistoryBySession(sessionId, {
      historyPath: ctx.currentConfig?.heartbeat?.historyPath,
      order: 'desc',
      baseDir: ctx.workspaceBaseDir,
    });
    ctx.setHeartbeatRuns(runs);
  };

  return (
    <box flexDirection="column" padding={1}>
      <HeartbeatPanel
        runs={ctx.heartbeatRuns}
        heartbeatState={ctx.heartbeatState}
        onRefresh={handleRefresh}
        onClose={() => ctx.setShowHeartbeatPanel(false)}
      />
    </box>
  );
}

export function renderConfigPanel(ctx: PanelRenderContext): React.ReactNode {
  const handleConfigSave = async (
    location: 'user' | 'project' | 'local',
    updates: Partial<AssistantsConfig>
  ) => {
    const { writeFile, mkdir } = await import('fs/promises');
    const { dirname } = await import('path');

    let configPath: string;
    let existingConfig: Partial<AssistantsConfig> | null;

    switch (location) {
      case 'user':
        configPath = `${ctx.workspaceBaseDir || getConfigDir()}/config.json`;
        existingConfig = ctx.userConfig;
        break;
      case 'project':
        configPath = `${getProjectConfigDir(ctx.cwd)}/config.json`;
        existingConfig = ctx.projectConfig;
        break;
      case 'local':
        configPath = `${getProjectConfigDir(ctx.cwd)}/config.local.json`;
        existingConfig = ctx.localConfig;
        break;
    }

    const newConfig = deepMerge(existingConfig || {}, updates);
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(newConfig, null, 2));
    await ctx.loadConfigFiles();
  };

  return (
    <box flexDirection="column" padding={1}>
      <ConfigPanel
        config={ctx.currentConfig!}
        userConfig={ctx.userConfig}
        projectConfig={ctx.projectConfig}
        localConfig={ctx.localConfig}
        onSave={handleConfigSave}
        onCancel={() => ctx.setShowConfigPanel(false)}
      />
    </box>
  );
}
