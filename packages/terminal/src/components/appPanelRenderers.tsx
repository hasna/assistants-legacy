/**
 * Panel rendering logic extracted from App.tsx.
 *
 * Each function renders one panel's full UI (including inline event handlers)
 * and returns a React element or null.  The App component calls these in its
 * early-return chain so that only one panel is visible at a time.
 *
 * Implementation is split by domain:
 *   renderers/work.tsx    — Connectors, Tasks, Skills, Schedules
 *   renderers/people.tsx  — Assistants, Identity, Hooks
 *   renderers/system.tsx  — Guardrails, Budget, Model, Registry, Projects, Plans,
 *                           Wallet, Secrets, Dashboard, Swarm, Workspace, Heartbeat, Config
 *   renderers/comms.tsx   — Channels, Messages
 */

import React from 'react';
import type { Connector } from '@hasna/assistants-shared';
import { getProviderInfo, LLM_PROVIDERS, type LLMProvider } from '@hasna/assistants-shared';
import { OnboardingPanel, type OnboardingResult } from './OnboardingPanel';
import { RecoveryPanel } from './RecoveryPanel';
import { SessionSelector } from './SessionSelector';
import { MemoryPanel } from './MemoryPanel';
import { ResumePanel } from './ResumePanel';
import { LogsPanel } from './LogsPanel';
import { WebhooksPanel } from './WebhooksPanel';
import { PeoplePanel } from './PeoplePanel';
import { ContactsPanel } from './ContactsPanel';
import { TelephonyPanel } from './TelephonyPanel';
import { OrdersPanel } from './OrdersPanel';
import { JobsPanel } from './JobsPanel';
import { DocsPanel } from './DocsPanel';
import { Spinner } from './Spinner';

import { renderConnectorsPanel, renderTasksPanel, renderSkillsPanel, renderSchedulesPanel } from './renderers/work';
import { renderAssistantsPanel, renderIdentityPanel, renderHooksPanel } from './renderers/people';
import {
  renderGuardrailsPanel, renderBudgetsPanel, renderModelPanel,
  renderAssistantsRegistryPanel, renderProjectsPanel, renderPlansPanel,
  renderWalletPanel, renderSecretsPanel, renderAssistantsDashboard,
  renderSwarmPanel, renderWorkspacePanel, renderHeartbeatPanel, renderConfigPanel,
} from './renderers/system';
import { renderChannelsPanel, renderMessagesPanel } from './renderers/comms';
import { CloseOnAnyKeyPanel } from './renderers/utils';
import { Box } from '../ui/ink';

export type { PanelRenderContext } from './renderers/context';

/**
 * Render a panel if one is active. Returns the JSX element to render, or null
 * if no panel is currently shown. The caller (App) should early-return the
 * result when non-null.
 */
export function renderActivePanel(ctx: import('./renderers/context').PanelRenderContext): React.ReactNode {

  // Initializing spinner
  if (ctx.isInitializing && !ctx.showRecoveryPanel && !ctx.showOnboardingPanel) {
    return (
      <Box flexDirection="column" padding={1}>
        <Spinner label="Initializing..." />
      </Box>
    );
  }

  // Onboarding panel
  if (ctx.showOnboardingPanel) {
    const existingKeys = LLM_PROVIDERS.reduce((acc, provider) => {
      const key = process.env[provider.apiKeyEnv];
      if (key) acc[provider.id] = key;
      return acc;
    }, {} as Record<LLMProvider, string>);
    const discovered = ctx.connectorBridgeRef.current?.fastDiscover() || [];
    const discoveredNames = discovered.map((c: Connector) => c.name);

    return (
      <OnboardingPanel
        onComplete={ctx.handleOnboardingComplete}
        onCancel={ctx.handleOnboardingCancel}
        existingApiKeys={existingKeys}
        discoveredConnectors={discoveredNames}
        discoveredSkills={[]}
      />
    );
  }

  // Recovery panel
  if (ctx.showRecoveryPanel && ctx.recoverableSessions.length > 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <RecoveryPanel
          sessions={ctx.recoverableSessions}
          onRecover={ctx.handleRecover}
          onStartFresh={ctx.handleStartFresh}
        />
      </Box>
    );
  }

  // Session selector
  if (ctx.showSessionSelector) {
    const subagentSessions = ctx.registry.getStore().listSubagentSessions();
    return (
      <Box flexDirection="column" padding={1}>
        <SessionSelector
          sessions={ctx.sessions}
          activeSessionId={ctx.activeSessionId}
          onSelect={(sessionId) => {
            ctx.setShowSessionSelector(false);
            void ctx.switchToSession(sessionId);
          }}
          onNew={() => {
            ctx.setShowSessionSelector(false);
            void ctx.handleNewSession();
          }}
          onCancel={() => ctx.setShowSessionSelector(false)}
          subagentSessions={subagentSessions}
        />
      </Box>
    );
  }

  if (ctx.showConnectorsPanel) return renderConnectorsPanel(ctx);
  if (ctx.showTasksPanel) return renderTasksPanel(ctx);
  if (ctx.showSkillsPanel) return renderSkillsPanel(ctx);
  if (ctx.showSchedulesPanel) return renderSchedulesPanel(ctx);
  if (ctx.showAssistantsPanel) return renderAssistantsPanel(ctx);
  if (ctx.showIdentityPanel) return renderIdentityPanel(ctx);

  // Memory panel
  if (ctx.showMemoryPanel) {
    return (
      <Box flexDirection="column" padding={1}>
        <MemoryPanel
          memories={ctx.memoryList}
          stats={ctx.memoryStats}
          error={ctx.memoryError}
          onRefresh={ctx.refreshMemoryList}
          onClose={() => {
            ctx.setShowMemoryPanel(false);
            ctx.setMemoryError(null);
          }}
        />
      </Box>
    );
  }

  if (ctx.showHooksPanel) return renderHooksPanel(ctx);
  if (ctx.showGuardrailsPanel && ctx.guardrailsConfig) return renderGuardrailsPanel(ctx);
  if (ctx.showBudgetPanel && ctx.sessionBudgetStatus && ctx.swarmBudgetStatus) return renderBudgetsPanel(ctx);
  if (ctx.showModelPanel) return renderModelPanel(ctx);
  if (ctx.showAssistantsRegistryPanel && ctx.registryStats) return renderAssistantsRegistryPanel(ctx);
  if (ctx.showProjectsPanel) return renderProjectsPanel(ctx);
  if (ctx.showPlansPanel && ctx.plansProject) return renderPlansPanel(ctx);
  if (ctx.showWalletPanel) return renderWalletPanel(ctx);
  if (ctx.showSecretsPanel) return renderSecretsPanel(ctx);
  if (ctx.showAssistantsDashboard) return renderAssistantsDashboard(ctx);
  if (ctx.showSwarmPanel) return renderSwarmPanel(ctx);
  if (ctx.showWorkspacePanel) return renderWorkspacePanel(ctx);

  // Resume panel
  if (ctx.showResumePanel) {
    return (
      <Box flexDirection="column" padding={1}>
        <ResumePanel
          sessions={ctx.resumeSessions}
          activeCwd={ctx.cwd}
          initialFilter={ctx.resumeFilter}
          onResume={(session) => {
            void ctx.resumeFromSavedSession(session);
          }}
          onRefresh={ctx.refreshResumeSessions}
          onClose={() => ctx.setShowResumePanel(false)}
        />
      </Box>
    );
  }

  if (ctx.showHeartbeatPanel) return renderHeartbeatPanel(ctx);

  // Logs panel
  if (ctx.showLogsPanel) {
    return (
      <Box flexDirection="column" padding={1}>
        <LogsPanel onCancel={() => ctx.setShowLogsPanel(false)} />
      </Box>
    );
  }

  if (ctx.showConfigPanel && ctx.currentConfig) return renderConfigPanel(ctx);

  // Webhooks panel
  if (ctx.showWebhooksPanel) {
    const webhooksManager = ctx.activeSession?.client.getWebhooksManager?.();
    if (!webhooksManager) {
      return (
        <CloseOnAnyKeyPanel
          message="Webhooks are not enabled. Set webhooks.enabled: true in config."
          onClose={() => ctx.setShowWebhooksPanel(false)}
        />
      );
    }
    return (
      <WebhooksPanel
        manager={webhooksManager}
        onClose={() => ctx.setShowWebhooksPanel(false)}
      />
    );
  }

  if (ctx.showChannelsPanel) return renderChannelsPanel(ctx);

  // People panel
  if (ctx.showPeoplePanel) {
    const peopleManager = ctx.activeSession?.client.getPeopleManager?.();
    if (!peopleManager) {
      return (
        <CloseOnAnyKeyPanel
          message="People system is not available."
          onClose={() => ctx.setShowPeoplePanel(false)}
        />
      );
    }
    return (
      <PeoplePanel
        manager={peopleManager}
        onClose={() => ctx.setShowPeoplePanel(false)}
      />
    );
  }

  // Contacts panel
  if (ctx.showContactsPanel) {
    return (
      <ContactsPanel onClose={() => ctx.setShowContactsPanel(false)} />
    );
  }

  // Telephony panel
  if (ctx.showTelephonyPanel) {
    const telephonyManager = ctx.activeSession?.client.getTelephonyManager?.();
    if (!telephonyManager) {
      return (
        <CloseOnAnyKeyPanel
          message="Communication is not enabled. Set telephony.enabled: true in config."
          onClose={() => ctx.setShowTelephonyPanel(false)}
        />
      );
    }
    const assistantManager = ctx.activeSession?.client.getAssistantManager?.();
    const assistantLookup = assistantManager
      ? assistantManager.listAssistants().reduce((acc: Record<string, string>, assistant: any) => {
        acc[assistant.id] = assistant.name;
        return acc;
      }, {} as Record<string, string>)
      : undefined;
    return (
      <TelephonyPanel
        manager={telephonyManager}
        assistantLookup={assistantLookup}
        onClose={() => ctx.setShowTelephonyPanel(false)}
      />
    );
  }

  // Orders panel
  if (ctx.showOrdersPanel) {
    const ordersManager = ctx.activeSession?.client.getOrdersManager?.();
    if (!ordersManager) {
      return (
        <CloseOnAnyKeyPanel
          message="Orders are not enabled. Set orders.enabled: true in config."
          onClose={() => ctx.setShowOrdersPanel(false)}
        />
      );
    }
    return (
      <OrdersPanel
        manager={ordersManager}
        onClose={() => ctx.setShowOrdersPanel(false)}
      />
    );
  }

  // Jobs panel
  if (ctx.showJobsPanel) {
    const jobsManager = ctx.activeSession?.client.getJobManager?.();
    if (!jobsManager) {
      return (
        <CloseOnAnyKeyPanel
          message="Jobs are not enabled. Set jobs.enabled: true in config."
          onClose={() => ctx.setShowJobsPanel(false)}
        />
      );
    }
    return (
      <JobsPanel
        manager={jobsManager}
        onClose={() => ctx.setShowJobsPanel(false)}
      />
    );
  }

  // Docs panel
  if (ctx.showDocsPanel) {
    return <DocsPanel onClose={() => ctx.setShowDocsPanel(false)} />;
  }

  if (ctx.showMessagesPanel) return renderMessagesPanel(ctx);

  return null;
}
