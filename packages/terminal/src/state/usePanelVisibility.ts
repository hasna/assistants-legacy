import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Panel-visibility store (plan 8d98da29 P0.3 — state-store extraction).
 *
 * App.tsx previously held 35 independent `useState` booleans for panel visibility,
 * inflating the god-component's hook count and allowing inconsistent states (two
 * panels "open" at once). This centralizes them into a single `activePanel` source
 * of truth (only one panel visible at a time — which is the actual UX), while
 * exposing the original `showXxx` / `setShowXxx` interface so existing call sites
 * are unchanged.
 */
export const PANEL_IDS = [
  'sessionSelector', 'recovery', 'connectors', 'tasks', 'schedules', 'skills',
  'assistants', 'identity', 'memory', 'hooks', 'guardrails', 'budget', 'model',
  'assistantsRegistry', 'config', 'webhooks', 'channels', 'people', 'contacts',
  'telephony', 'orders', 'jobs', 'docs', 'onboarding', 'messages', 'projects',
  'plans', 'wallet', 'secrets', 'assistantsDashboard', 'swarm', 'workspace',
  'logs', 'heartbeat', 'resume',
] as const;

export type PanelId = (typeof PANEL_IDS)[number];

/** Map a PanelId to its legacy `show<Name>` getter key. */
const SHOW_KEY: Record<PanelId, string> = {
  sessionSelector: 'showSessionSelector', recovery: 'showRecoveryPanel',
  connectors: 'showConnectorsPanel', tasks: 'showTasksPanel', schedules: 'showSchedulesPanel',
  skills: 'showSkillsPanel', assistants: 'showAssistantsPanel', identity: 'showIdentityPanel',
  memory: 'showMemoryPanel', hooks: 'showHooksPanel', guardrails: 'showGuardrailsPanel',
  budget: 'showBudgetPanel', model: 'showModelPanel', assistantsRegistry: 'showAssistantsRegistryPanel',
  config: 'showConfigPanel', webhooks: 'showWebhooksPanel', channels: 'showChannelsPanel',
  people: 'showPeoplePanel', contacts: 'showContactsPanel', telephony: 'showTelephonyPanel',
  orders: 'showOrdersPanel', jobs: 'showJobsPanel', docs: 'showDocsPanel',
  onboarding: 'showOnboardingPanel', messages: 'showMessagesPanel', projects: 'showProjectsPanel',
  plans: 'showPlansPanel', wallet: 'showWalletPanel', secrets: 'showSecretsPanel',
  assistantsDashboard: 'showAssistantsDashboard', swarm: 'showSwarmPanel',
  workspace: 'showWorkspacePanel', logs: 'showLogsPanel', heartbeat: 'showHeartbeatPanel',
  resume: 'showResumePanel',
};

/** Map a PanelId to its legacy `setShow<Name>` setter key. */
const SET_KEY: Record<PanelId, string> = Object.fromEntries(
  PANEL_IDS.map((id) => [id, 'set' + SHOW_KEY[id][0].toUpperCase() + SHOW_KEY[id].slice(1)]),
) as Record<PanelId, string>;

/**
 * Pure transition for the single-source-of-truth panel state: opening a panel
 * (`v === true`) makes it active (closing any other); closing (`v === false`)
 * clears it only if it's the active one (no-op otherwise).
 */
export function nextActivePanel(prev: PanelId | null, id: PanelId, v: boolean): PanelId | null {
  if (v) return id;
  return prev === id ? null : prev;
}

/**
 * Per-panel `showXxx` getters and `setShowXxx` setters, named exactly as the
 * legacy `useState` booleans they replace. Spelled out explicitly (rather than a
 * loose index signature) so destructuring in App.tsx stays fully type-checked —
 * the legacy names are irregular (`showRecoveryPanel`, `showSessionSelector`,
 * `showAssistantsDashboard`) so a mapped type can't generate them.
 */
export type PanelLegacyApi = {
  showSessionSelector: boolean;
  setShowSessionSelector: Dispatch<SetStateAction<boolean>>;
  showRecoveryPanel: boolean;
  setShowRecoveryPanel: Dispatch<SetStateAction<boolean>>;
  showConnectorsPanel: boolean;
  setShowConnectorsPanel: Dispatch<SetStateAction<boolean>>;
  showTasksPanel: boolean;
  setShowTasksPanel: Dispatch<SetStateAction<boolean>>;
  showSchedulesPanel: boolean;
  setShowSchedulesPanel: Dispatch<SetStateAction<boolean>>;
  showSkillsPanel: boolean;
  setShowSkillsPanel: Dispatch<SetStateAction<boolean>>;
  showAssistantsPanel: boolean;
  setShowAssistantsPanel: Dispatch<SetStateAction<boolean>>;
  showIdentityPanel: boolean;
  setShowIdentityPanel: Dispatch<SetStateAction<boolean>>;
  showMemoryPanel: boolean;
  setShowMemoryPanel: Dispatch<SetStateAction<boolean>>;
  showHooksPanel: boolean;
  setShowHooksPanel: Dispatch<SetStateAction<boolean>>;
  showGuardrailsPanel: boolean;
  setShowGuardrailsPanel: Dispatch<SetStateAction<boolean>>;
  showBudgetPanel: boolean;
  setShowBudgetPanel: Dispatch<SetStateAction<boolean>>;
  showModelPanel: boolean;
  setShowModelPanel: Dispatch<SetStateAction<boolean>>;
  showAssistantsRegistryPanel: boolean;
  setShowAssistantsRegistryPanel: Dispatch<SetStateAction<boolean>>;
  showConfigPanel: boolean;
  setShowConfigPanel: Dispatch<SetStateAction<boolean>>;
  showWebhooksPanel: boolean;
  setShowWebhooksPanel: Dispatch<SetStateAction<boolean>>;
  showChannelsPanel: boolean;
  setShowChannelsPanel: Dispatch<SetStateAction<boolean>>;
  showPeoplePanel: boolean;
  setShowPeoplePanel: Dispatch<SetStateAction<boolean>>;
  showContactsPanel: boolean;
  setShowContactsPanel: Dispatch<SetStateAction<boolean>>;
  showTelephonyPanel: boolean;
  setShowTelephonyPanel: Dispatch<SetStateAction<boolean>>;
  showOrdersPanel: boolean;
  setShowOrdersPanel: Dispatch<SetStateAction<boolean>>;
  showJobsPanel: boolean;
  setShowJobsPanel: Dispatch<SetStateAction<boolean>>;
  showDocsPanel: boolean;
  setShowDocsPanel: Dispatch<SetStateAction<boolean>>;
  showOnboardingPanel: boolean;
  setShowOnboardingPanel: Dispatch<SetStateAction<boolean>>;
  showMessagesPanel: boolean;
  setShowMessagesPanel: Dispatch<SetStateAction<boolean>>;
  showProjectsPanel: boolean;
  setShowProjectsPanel: Dispatch<SetStateAction<boolean>>;
  showPlansPanel: boolean;
  setShowPlansPanel: Dispatch<SetStateAction<boolean>>;
  showWalletPanel: boolean;
  setShowWalletPanel: Dispatch<SetStateAction<boolean>>;
  showSecretsPanel: boolean;
  setShowSecretsPanel: Dispatch<SetStateAction<boolean>>;
  showAssistantsDashboard: boolean;
  setShowAssistantsDashboard: Dispatch<SetStateAction<boolean>>;
  showSwarmPanel: boolean;
  setShowSwarmPanel: Dispatch<SetStateAction<boolean>>;
  showWorkspacePanel: boolean;
  setShowWorkspacePanel: Dispatch<SetStateAction<boolean>>;
  showLogsPanel: boolean;
  setShowLogsPanel: Dispatch<SetStateAction<boolean>>;
  showHeartbeatPanel: boolean;
  setShowHeartbeatPanel: Dispatch<SetStateAction<boolean>>;
  showResumePanel: boolean;
  setShowResumePanel: Dispatch<SetStateAction<boolean>>;
};

export type PanelVisibility = {
  activePanel: PanelId | null;
  setActivePanel: (id: PanelId | null) => void;
  closeAllPanels: () => void;
} & PanelLegacyApi;

export function usePanelVisibility(): PanelVisibility {
  const [activePanel, setActivePanel] = useState<PanelId | null>(null);

  // Stable setters — created once. setActivePanel is referentially stable.
  // Each accepts a React SetStateAction so it's a drop-in for the useState setters
  // it replaces (functional updaters resolve against the panel's current visibility).
  const setters = useMemo(() => {
    const s: Record<string, Dispatch<SetStateAction<boolean>>> = {};
    for (const id of PANEL_IDS) {
      s[SET_KEY[id]] = (action: SetStateAction<boolean>) =>
        setActivePanel((prev) => {
          const current = prev === id;
          const v = typeof action === 'function' ? action(current) : action;
          return nextActivePanel(prev, id, v);
        });
    }
    return s;
  }, []);

  const result: Record<string, unknown> = {
    activePanel,
    setActivePanel: (id: PanelId | null) => setActivePanel(id),
    closeAllPanels: () => setActivePanel(null),
    ...setters,
  };
  for (const id of PANEL_IDS) result[SHOW_KEY[id]] = activePanel === id;
  return result as PanelVisibility;
}
