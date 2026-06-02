import React from 'react';
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getSecurityLogger } from '@hasna/assistants-core';
import { DEFAULT_MODEL, type LLMProvider } from '@hasna/assistants-shared';
import { renderInk } from './utils/ink-test-harness';

const { LogsPanel } = await import('../src/components/LogsPanel');
const { SecretsPanel } = await import('../src/components/SecretsPanel');
const { WorkspacePanel } = await import('../src/components/WorkspacePanel');
const { SkillsPanel } = await import('../src/components/SkillsPanel');
const { IdentityPanel } = await import('../src/components/IdentityPanel');
const { BudgetPanel } = await import('../src/components/BudgetPanel');
const { BudgetsPanel } = await import('../src/components/BudgetsPanel');
const { ModelPanel } = await import('../src/components/ModelPanel');
const { MemoryPanel } = await import('../src/components/MemoryPanel');
const { ProjectsPanel } = await import('../src/components/ProjectsPanel');
const { ConnectorsPanel } = await import('../src/components/ConnectorsPanel');
const { TasksPanel } = await import('../src/components/TasksPanel');
const { SchedulesPanel } = await import('../src/components/SchedulesPanel');
const { HooksPanel } = await import('../src/components/HooksPanel');
const { HeartbeatPanel } = await import('../src/components/HeartbeatPanel');
const { InboxPanel } = await import('../src/components/InboxPanel');
const { WalletPanel } = await import('../src/components/WalletPanel');
const { PlansPanel } = await import('../src/components/PlansPanel');
const { ConfigPanel } = await import('../src/components/ConfigPanel');
const { GuardrailsPanel } = await import('../src/components/GuardrailsPanel');
const { ResumePanel } = await import('../src/components/ResumePanel');
const { OnboardingPanel } = await import('../src/components/OnboardingPanel');
const { OrdersPanel } = await import('../src/components/OrdersPanel');
const { JobsPanel } = await import('../src/components/JobsPanel');
const { DocsPanel } = await import('../src/components/DocsPanel');
const { TelephonyPanel } = await import('../src/components/TelephonyPanel');
const { WebhooksPanel } = await import('../src/components/WebhooksPanel');

const createTelephonyManagerStub = (options: {
  defaultNumber?: string | null;
  defaultSource?: 'config' | 'local' | 'env' | null;
  numbers?: Array<{
    id: string;
    number: string;
    friendlyName: string | null;
    twilioSid: string | null;
    status: 'active';
    capabilities: { voice: boolean; sms: boolean; whatsapp: boolean };
    createdAt: string;
    updatedAt: string;
  }>;
} = {}) => {
  let status = {
    enabled: true,
    twilioConfigured: true,
    elevenLabsConfigured: false,
    phoneNumbers: options.numbers?.length ?? 0,
    activeCalls: 0,
    routingRules: 0,
    recentCalls: 0,
    recentMessages: 0,
    defaultPhoneNumber: options.defaultNumber ?? null,
    defaultPhoneNumberSource: options.defaultSource ?? null,
  };

  return {
    getStatus: () => status,
    getCallHistory: () => [],
    getSmsHistory: () => [],
    listPhoneNumbers: () => options.numbers ?? [],
    listRoutingRules: () => [],
    setDefaultPhoneNumber: (number: string) => {
      status = {
        ...status,
        defaultPhoneNumber: number,
        defaultPhoneNumberSource: 'local',
      };
      return { success: true, message: `Default phone number set to ${number}.` };
    },
    sendSms: async () => ({ success: true, message: 'ok' }),
    makeCall: async () => ({ success: true, message: 'ok' }),
  };
};

const createWebhooksManagerStub = (initialWebhooks: any[] = [], initialEvents: any[] = []) => {
  let webhooks = [...initialWebhooks];
  let registrations = new Map(initialWebhooks.map((webhook) => [webhook.id, {
    ...webhook,
    description: webhook.description ?? '',
    secret: webhook.secret ?? 'whsec_test_secret',
    eventsFilter: webhook.eventsFilter ?? [],
    updatedAt: webhook.updatedAt ?? webhook.createdAt,
  }]));
  let createdInput: any = null;

  return {
    get createdInput() {
      return createdInput;
    },
    manager: {
      list: async () => webhooks,
      get: async (id: string) => registrations.get(id) ?? null,
      listEvents: async () => initialEvents,
      create: async (input: any) => {
        createdInput = input;
        const now = '2026-05-28T10:00:00.000Z';
        const registration = {
          id: 'whk_created',
          name: input.name,
          source: input.source,
          description: '',
          secret: 'whsec_created_secret',
          eventsFilter: [],
          status: 'active',
          deliveryCount: 0,
          createdAt: now,
          updatedAt: now,
        };
        registrations.set(registration.id, registration);
        webhooks = [{
          id: registration.id,
          name: registration.name,
          source: registration.source,
          status: registration.status,
          deliveryCount: registration.deliveryCount,
          createdAt: registration.createdAt,
          lastDeliveryAt: registration.lastDeliveryAt,
        }];
        return {
          success: true,
          message: 'created',
          webhookId: registration.id,
          secret: registration.secret,
          url: `/api/v1/webhooks/receive/${registration.id}`,
        };
      },
      update: async () => ({ success: true, message: 'updated' }),
      delete: async () => ({ success: true, message: 'deleted' }),
      sendTestEvent: async () => ({ success: true, message: 'sent' }),
    },
  };
};

const setupIsolatedSecurityLog = () => {
  const logger = getSecurityLogger();
  const tempDir = mkdtempSync(join(tmpdir(), 'assistants-logs-panel-'));
  logger.setLogFile(join(tempDir, 'security.log'));
  logger.clear();
  return () => {
    logger.clear();
    rmSync(tempDir, { recursive: true, force: true });
  };
};
describe('terminal panels', () => {
  test('TasksPanel renders empty state', async () => {
    const harness = await renderInk(
      <TasksPanel
        tasks={[]}
        paused={false}
        onAdd={async () => {}}
        onDelete={async () => {}}
        onRun={async () => {}}
        onClearPending={async () => {}}
        onClearCompleted={async () => {}}
        onTogglePause={async () => {}}
        onChangePriority={async () => {}}
        onClose={() => {}}
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('No tasks yet. Press n to add one.');
      expect(frame).toContain('Tasks');
    } finally {
      await harness.cleanup();
    }
  });

  test('TasksPanel creates a task with Ink TextInput', async () => {
    let created: any = null;
    const harness = await renderInk(
      <TasksPanel
        tasks={[]}
        paused={false}
        onAdd={async (options) => { created = options; }}
        onDelete={async () => {}}
        onRun={async () => {}}
        onClearPending={async () => {}}
        onClearCompleted={async () => {}}
        onTogglePause={async () => {}}
        onChangePriority={async () => {}}
        onClose={() => {}}
      />, { width: 90, height: 24 }
    );
    try {
      await harness.waitForText('No tasks yet. Press n to add one.');
      harness.pressKey('n');
      await harness.waitForText('Add New Task');
      harness.typeText('Migrate TasksPanel');
      await harness.waitForText('Migrate TasksPanel');
      harness.pressEnter();
      await harness.waitForText('Priority:');
      harness.pressTab();
      await harness.waitForText('Blocked by:');
      harness.pressTab();
      await harness.waitForText('Blocks:');
      harness.pressTab();
      await harness.waitForText('Assignee:');
      harness.typeText('Octavia');
      await harness.waitForText('Octavia');
      harness.pressEnter();
      await harness.waitForText('No tasks yet. Press n to add one.');
      expect(created).toEqual({
        description: 'Migrate TasksPanel',
        priority: 'normal',
        blockedBy: undefined,
        blocks: undefined,
        assignee: 'Octavia',
      });
    } finally {
      await harness.cleanup();
    }
  });

  test('SchedulesPanel renders empty state', async () => {
    const harness = await renderInk(
      <SchedulesPanel
        schedules={[]}
        sessionId="s1"
        onPause={async () => {}}
        onResume={async () => {}}
        onDelete={async () => {}}
        onRun={async () => {}}
        onCreate={async () => {}}
        onRefresh={async () => {}}
        onClose={() => {}}
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('No schedules. Press n to create one.');
      expect(frame).toContain('Schedules');
    } finally {
      await harness.cleanup();
    }
  });

  test('SchedulesPanel creates a one-time schedule with Ink TextInput', async () => {
    let created: any = null;
    const runAt = '2026-06-01T09:00:00Z';
    const harness = await renderInk(
      <SchedulesPanel
        schedules={[]}
        sessionId="s1"
        onPause={async () => {}}
        onResume={async () => {}}
        onDelete={async () => {}}
        onRun={async () => {}}
        onCreate={async (schedule) => { created = schedule; }}
        onRefresh={async () => {}}
        onClose={() => {}}
      />, { width: 100, height: 24 }
    );
    try {
      await harness.waitForText('No schedules. Press n to create one.');
      harness.pressKey('n');
      await harness.waitForText('New Schedule');
      harness.pressEnter();
      await harness.waitForText('Enter date/time');
      harness.typeText(runAt);
      await harness.waitForText(runAt);
      harness.pressEnter();
      await harness.waitForText('Enter command to execute');
      harness.typeText('/summarize');
      await harness.waitForText('/summarize');
      harness.pressEnter();
      await harness.waitForText('Description (optional)');
      harness.pressEnter();
      await harness.waitForText('Confirm new schedule');
      harness.pressEnter();
      await harness.waitForText('No schedules. Press n to create one.');
      expect(created).toEqual({
        createdBy: 'user',
        sessionId: 's1',
        command: '/summarize',
        description: undefined,
        status: 'active',
        schedule: { kind: 'once', at: runAt },
      });
    } finally {
      await harness.cleanup();
    }
  });

  test('HooksPanel renders empty state', async () => {
    const harness = await renderInk(
      <HooksPanel
        hooks={{} as any}
        nativeHooks={[]}
        onToggle={() => {}}
        onToggleNative={() => {}}
        onDelete={async () => {}}
        onAdd={async () => {}}
        onCancel={() => {}}
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('No hooks configured.');
      expect(frame).toContain('Hooks');
    } finally {
      await harness.cleanup();
    }
  });

  test('HooksPanel opens the add-hook wizard with Ink input', async () => {
    const harness = await renderInk(
      <HooksPanel
        hooks={{} as any}
        nativeHooks={[]}
        onToggle={() => {}}
        onToggleNative={() => {}}
        onDelete={async () => {}}
        onAdd={async () => {}}
        onCancel={() => {}}
      />, { width: 80, height: 24 }
    );
    try {
      await harness.waitForText('No hooks configured.');
      harness.pressKey('a');
      const frame = await harness.waitForText('Step 1/9: Select Event');
      expect(frame).toContain('Add Hook');
    } finally {
      await harness.cleanup();
    }
  });

  test('HeartbeatPanel renders empty state with Ink', async () => {
    const harness = await renderInk(
      <HeartbeatPanel
        runs={[]}
        heartbeatState={{
          enabled: true,
          state: 'idle',
          lastActivity: new Date().toISOString(),
          uptimeSeconds: 42,
          isStale: false,
        }}
        onRefresh={async () => {}}
        onClose={() => {}}
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('No heartbeat runs recorded yet.');
      expect(frame).toContain('Heartbeat');
      expect(frame).toContain('State: idle');
    } finally {
      await harness.cleanup();
    }
  });

  test('HeartbeatPanel opens run details with Ink Select', async () => {
    const now = new Date().toISOString();
    const harness = await renderInk(
      <HeartbeatPanel
        runs={[{
          sessionId: 'session-heartbeat-1',
          timestamp: now,
          state: 'processing',
          lastActivity: now,
          stats: {
            messagesProcessed: 2,
            toolCallsExecuted: 3,
            errorsEncountered: 1,
            uptimeSeconds: 42,
          },
        }]}
        heartbeatState={{
          enabled: true,
          state: 'processing',
          lastActivity: now,
          uptimeSeconds: 42,
          isStale: false,
        }}
        onRefresh={async () => {}}
        onClose={() => {}}
      />, { width: 90, height: 24 }
    );
    try {
      await harness.waitForText('msgs:2 tools:3 err:1');
      harness.pressEnter();
      const frame = await harness.waitForText('Heartbeat Run Details');
      expect(frame).toContain('session-heartbeat-1');
    } finally {
      await harness.cleanup();
    }
  });

  test('MemoryPanel renders empty state with Ink', async () => {
    const harness = await renderInk(
      <MemoryPanel
        memories={[]}
        stats={null}
        onRefresh={async () => {}}
        onClose={() => {}}
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('No memories yet.');
      expect(frame).toContain('Memory');
    } finally {
      await harness.cleanup();
    }
  });

  test('MemoryPanel opens memory details with Ink input', async () => {
    const now = new Date().toISOString();
    const harness = await renderInk(
      <MemoryPanel
        memories={[{
          id: 'mem-1',
          scope: 'shared',
          category: 'knowledge',
          key: 'ink-migration',
          value: 'Use upstream Ink primitives.',
          summary: 'Use upstream Ink primitives.',
          importance: 8,
          tags: ['ink'],
          source: 'assistant',
          createdAt: now,
          updatedAt: now,
          accessCount: 3,
        }]}
        stats={{
          totalCount: 1,
          byScope: { global: 0, shared: 1, private: 0, session: 0 },
          byCategory: { preference: 0, fact: 0, history: 0, knowledge: 1, context: 0 },
          avgImportance: 8,
        }}
        onRefresh={async () => {}}
        onClose={() => {}}
      />, { width: 90, height: 24 }
    );
    try {
      await harness.waitForText('ink-migration');
      harness.pressEnter();
      const frame = await harness.waitForText('Memory Detail');
      expect(frame).toContain('Use upstream Ink primitives.');
      expect(frame).toContain('Importance: 8/10');
    } finally {
      await harness.cleanup();
    }
  });

  test('ResumePanel renders empty state', async () => {
    const harness = await renderInk(
      <ResumePanel
        sessions={[]}
        activeCwd="/tmp"
        initialFilter="cwd"
        onResume={() => {}}
        onRefresh={async () => {}}
        onClose={() => {}}
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('Resume Sessions');
      expect(frame).toContain('No saved sessions for this folder.');
    } finally {
      await harness.cleanup();
    }
  });

  test('InboxPanel renders empty state', async () => {
    const harness = await renderInk(
      <InboxPanel
        emails={[]}
        onRead={async () => ({}) as any}
        onDelete={async () => {}}
        onFetch={async () => 0}
        onMarkRead={async () => {}}
        onMarkUnread={async () => {}}
        onReply={() => {}}
        onClose={() => {}}
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('No emails in inbox.');
      expect(frame).toContain('Inbox');
    } finally {
      await harness.cleanup();
    }
  });

  test('InboxPanel opens email detail with Ink input', async () => {
    const now = new Date().toISOString();
    const harness = await renderInk(
      <InboxPanel
        emails={[{
          id: 'email-1',
          from: 'Ada',
          subject: 'Ink migration update',
          date: now,
          isRead: false,
          hasAttachments: false,
        } as any]}
        onRead={async () => ({
          id: 'email-1',
          from: { address: 'ada@example.com', name: 'Ada' },
          to: [{ address: 'team@example.com', name: 'Team' }],
          subject: 'Ink migration update',
          date: now,
          body: { text: 'The InboxPanel is now using Ink.' },
          attachments: [],
        }) as any}
        onDelete={async () => {}}
        onFetch={async () => 0}
        onMarkRead={async () => {}}
        onMarkUnread={async () => {}}
        onReply={() => {}}
        onClose={() => {}}
      />, { width: 100, height: 24 }
    );
    try {
      await harness.waitForText('Ink migration update');
      harness.pressEnter();
      const frame = await harness.waitForText('The InboxPanel is now using Ink.');
      expect(frame).toContain('Ada');
      expect(frame).toContain('r reply');
    } finally {
      await harness.cleanup();
    }
  });

  test('WalletPanel renders empty state', async () => {
    const harness = await renderInk(
      <WalletPanel
        cards={[]}
        onGet={async () => ({ id: 'c1', name: 'Test', last4: '0000' })}
        onAdd={async () => {}}
        onRemove={async () => {}}
        onClose={() => {}}
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('No cards stored in wallet.');
      expect(frame).toContain('Wallet');
    } finally {
      await harness.cleanup();
    }
  });

  test('WalletPanel adds a card with Ink TextInput', async () => {
    let added: any = null;
    const harness = await renderInk(
      <WalletPanel
        cards={[]}
        onGet={async () => ({ id: 'c1', name: 'Test', last4: '0000' })}
        onAdd={async (input) => { added = input; }}
        onRemove={async () => {}}
        onClose={() => {}}
      />, { width: 100, height: 24 }
    );
    try {
      await harness.waitForText('No cards stored in wallet.');
      harness.typeText('n');
      await harness.waitForText('(1/6)');

      harness.typeText('Business Visa');
      harness.pressEnter();
      await harness.waitForText('(2/6)');

      harness.typeText('Ada Lovelace');
      harness.pressEnter();
      await harness.waitForText('(3/6)');

      harness.typeText('4111 1111 1111 1111');
      harness.pressEnter();
      await harness.waitForText('(4/6)');

      harness.typeText('7');
      harness.pressEnter();
      await harness.waitForText('(5/6)');

      harness.typeText('26');
      harness.pressEnter();
      await harness.waitForText('(6/6)');

      harness.typeText('123');
      harness.pressEnter();
      await harness.waitForText('Card added.');

      expect(added).toEqual({
        name: 'Business Visa',
        cardholderName: 'Ada Lovelace',
        cardNumber: '4111 1111 1111 1111',
        expiryMonth: '07',
        expiryYear: '2026',
        cvv: '123',
      });
    } finally {
      await harness.cleanup();
    }
  });

  test('WebhooksPanel renders empty state with Ink', async () => {
    const { manager } = createWebhooksManagerStub();
    const harness = await renderInk(
      <WebhooksPanel
        manager={manager as any}
        onClose={() => {}}
      />, { width: 100, height: 24 }
    );
    try {
      const frame = await harness.waitForText('No webhooks registered.');
      expect(frame).toContain('Webhooks');
      expect(frame).toContain('c:create');
    } finally {
      await harness.cleanup();
    }
  });

  test('WebhooksPanel creates a webhook with Ink TextInput', async () => {
    const stub = createWebhooksManagerStub();
    const harness = await renderInk(
      <WebhooksPanel
        manager={stub.manager as any}
        onClose={() => {}}
      />, { width: 110, height: 24 }
    );
    try {
      await harness.waitForText('No webhooks registered.');
      harness.typeText('c');
      await harness.waitForText('Create Webhook');

      harness.typeText('GitHub alerts');
      harness.pressEnter();
      await harness.waitForText('Name: GitHub alerts');

      harness.typeText('github');
      harness.pressEnter();
      await harness.waitForText('Confirm Webhook Creation');

      harness.typeText('y');
      const frame = await harness.waitForText('/api/v1/webhooks/receive/whk_created');
      expect(frame).toContain('whsec_created_secret');
      expect(stub.createdInput).toEqual({
        name: 'GitHub alerts',
        source: 'github',
      });
    } finally {
      await harness.cleanup();
    }
  });

  test('WorkspacePanel renders empty state with Ink', async () => {
    const harness = await renderInk(
      <WorkspacePanel
        workspaces={[]}
        onArchive={async () => {}}
        onDelete={async () => {}}
        onSelect={async () => {}}
        onClose={() => {}}
      />, { width: 90, height: 24 }
    );
    try {
      const frame = await harness.waitForText('No workspaces found.');
      expect(frame).toContain('Workspaces');
      expect(frame).toContain('/workspace create <name>');
    } finally {
      await harness.cleanup();
    }
  });

  test('WorkspacePanel opens workspace detail with Ink input', async () => {
    const now = Date.now();
    const harness = await renderInk(
      <WorkspacePanel
        workspaces={[{
          id: 'ws-design',
          name: 'Design System',
          description: 'Ink migration workspace',
          createdAt: now - 60_000,
          updatedAt: now - 30_000,
          createdBy: 'Octavia',
          participants: ['Octavia', 'Marcus'],
          status: 'active',
        }]}
        activeWorkspaceId="ws-design"
        onArchive={async () => {}}
        onDelete={async () => {}}
        onSelect={async () => {}}
        onClose={() => {}}
      />, { width: 100, height: 24 }
    );
    try {
      await harness.waitForText('Design System');
      harness.pressEnter();
      const frame = await harness.waitForText('Workspace: Design System');
      expect(frame).toContain('Ink migration workspace');
      expect(frame).toContain('Participants (2):');
      expect(frame).toContain('[current]');
    } finally {
      await harness.cleanup();
    }
  });

  test('PlansPanel renders empty state', async () => {
    const harness = await renderInk(
      <PlansPanel
        project={{ id: 'p1', name: 'Demo', plans: [], context: [], description: '', createdAt: 0, updatedAt: 0 } as any}
        onCreatePlan={async () => {}}
        onDeletePlan={async () => {}}
        onAddStep={async () => {}}
        onUpdateStep={async () => {}}
        onRemoveStep={async () => {}}
        onBack={() => {}}
        onClose={() => {}}
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('No plans yet. Press n to create one.');
      expect(frame).toContain('Plans for "Demo"');
    } finally {
      await harness.cleanup();
    }
  });

  test('PlansPanel creates a plan with Ink TextInput', async () => {
    let createdTitle = '';
    const harness = await renderInk(
      <PlansPanel
        project={{ id: 'p1', name: 'Demo', plans: [], context: [], description: '', createdAt: 0, updatedAt: 0 } as any}
        onCreatePlan={async (title) => { createdTitle = title; }}
        onDeletePlan={async () => {}}
        onAddStep={async () => {}}
        onUpdateStep={async () => {}}
        onRemoveStep={async () => {}}
        onBack={() => {}}
        onClose={() => {}}
      />, { width: 80, height: 24 }
    );
    try {
      await harness.waitForText('No plans yet. Press n to create one.');
      harness.pressKey('n');
      await harness.waitForText('Create New Plan');
      harness.typeText('Ship Ink');
      await harness.waitForText('Ship Ink');
      harness.pressEnter();
      await harness.waitForText('No plans yet. Press n to create one.');
      expect(createdTitle).toBe('Ship Ink');
    } finally {
      await harness.cleanup();
    }
  });

  test('ConfigPanel renders overview', async () => {
    const harness = await renderInk(
      <ConfigPanel
        config={{ llm: { model: DEFAULT_MODEL, maxOutputTokens: 8192 } } as any}
        userConfig={null}
        projectConfig={null}
        localConfig={null}
        onSave={async () => {}}
        onCancel={() => {}}
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('Configuration Overview');
      expect(frame).toContain('Configuration');
    } finally {
      await harness.cleanup();
    }
  });

  test('GuardrailsPanel renders overview', async () => {
    const harness = await renderInk(
      <GuardrailsPanel
        config={{ enabled: false, defaultAction: 'allow' } as any}
        policies={[]}
        onToggleEnabled={() => {}}
        onTogglePolicy={() => {}}
        onSetPreset={() => {}}
        onAddPolicy={() => {}}
        onRemovePolicy={() => {}}
        onUpdatePolicy={() => {}}
        onCancel={() => {}}
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('Guardrails');
      expect(frame).toContain('Disabled');
    } finally {
      await harness.cleanup();
    }
  });

  test('SkillsPanel renders empty list state', async () => {
    const harness = await renderInk(
      <SkillsPanel
        skills={[]}
        onExecute={() => {}}
        onCreate={async () => ({ success: true })}
        onDelete={async () => {}}
        onRefresh={async () => []}
        onEnsureContent={async () => null}
        onClose={() => {}}
        cwd="/tmp"
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('No skills loaded. Press n to create one.');
      expect(frame).toContain('Skills');
    } finally {
      await harness.cleanup();
    }
  });

  test('SkillsPanel renders grouped skills', async () => {
    const harness = await renderInk(
      <SkillsPanel
        skills={[
          { name: 'alpha', description: 'Project skill', filePath: '/tmp/.assistants/skills/alpha.md' } as any,
          { name: 'beta', description: 'Global skill', filePath: '/Users/me/.assistants/shared/skills/beta.md' } as any,
        ]}
        onExecute={() => {}}
        onCreate={async () => ({ success: true })}
        onDelete={async () => {}}
        onRefresh={async () => []}
        onEnsureContent={async () => null}
        onClose={() => {}}
        cwd="/tmp"
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('Project Skills');
      expect(frame).toContain('alpha');
      expect(frame).toContain('beta');
    } finally {
      await harness.cleanup();
    }
  });

  test('SkillsPanel creates a manual skill with Ink TextInput', async () => {
    let created: any = null;
    const harness = await renderInk(
      <SkillsPanel
        skills={[]}
        onExecute={() => {}}
        onCreate={async (options) => {
          created = options;
          return { success: true };
        }}
        onDelete={async () => {}}
        onRefresh={async () => [
          {
            name: 'repo-helper',
            description: 'Help with repo work',
            allowedTools: ['bash', 'read'],
            argumentHint: '[topic]',
            filePath: '/tmp/.assistants/skills/repo-helper/SKILL.md',
          } as any,
        ]}
        onEnsureContent={async () => null}
        onClose={() => {}}
        cwd="/tmp"
      />, { width: 100, height: 24 }
    );
    try {
      await harness.waitForText('No skills loaded. Press n to create one.');
      harness.pressKey('n');
      await harness.waitForText('Select scope:');
      harness.pressEnter();

      await harness.waitForText('Enter skill name:');
      harness.typeText('repo-helper');
      await harness.waitForText('repo-helper');
      harness.pressEnter();

      await harness.waitForText('Description (optional):');
      harness.typeText('Help with repo work');
      await harness.waitForText('Help with repo work');
      harness.pressEnter();

      await harness.waitForText('Allowed tools');
      harness.typeText('bash, read');
      await harness.waitForText('bash, read');
      harness.pressEnter();

      await harness.waitForText('Argument hint');
      harness.typeText('[topic]');
      await harness.waitForText('[topic]');
      harness.pressEnter();

      await harness.waitForText('Skill content');
      harness.typeText('Use repository context before answering.');
      await harness.waitForText('Use repository context before answering.');
      harness.pressEnter();

      await harness.waitForText('Confirm new skill:');
      harness.pressEnter();
      await harness.waitForText('repo-helper');

      expect(created).toEqual({
        name: 'repo-helper',
        scope: 'project',
        description: 'Help with repo work',
        allowedTools: ['bash', 'read'],
        argumentHint: '[topic]',
        content: 'Use repository context before answering.',
        cwd: '/tmp',
      });
    } finally {
      await harness.cleanup();
    }
  });

  test('IdentityPanel renders empty state', async () => {
    const harness = await renderInk(
      <IdentityPanel
        identities={[]}
        templates={[]}
        onSwitch={async () => {}}
        onCreate={async () => {}}
        onCreateFromTemplate={async () => {}}
        onUpdate={async () => {}}
        onSetDefault={async () => {}}
        onDelete={async () => {}}
        onClose={() => {}}
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('No identities found.');
      expect(frame).toContain('Identities');
    } finally {
      await harness.cleanup();
    }
  });

  test('IdentityPanel renders identity list', async () => {
    const identity = {
      id: 'id-1',
      name: 'primary',
      isDefault: true,
      profile: {
        displayName: 'Ada Lovelace',
        title: 'Engineer',
        company: 'Analytical Engines',
        timezone: 'UTC',
        locale: 'en-US',
      },
      contacts: {
        emails: [{ value: 'ada@example.com', isPrimary: true }],
        phones: [],
        addresses: [],
        virtualAddresses: [],
      },
      preferences: {
        language: 'en',
        dateFormat: 'YYYY-MM-DD',
        communicationStyle: 'professional',
        responseLength: 'balanced',
        custom: {},
      },
      context: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const harness = await renderInk(
      <IdentityPanel
        identities={[identity as any]}
        activeIdentityId="id-1"
        templates={[]}
        onSwitch={async () => {}}
        onCreate={async () => {}}
        onCreateFromTemplate={async () => {}}
        onUpdate={async () => {}}
        onSetDefault={async () => {}}
        onDelete={async () => {}}
        onClose={() => {}}
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('Ada Lovelace');
      expect(frame).toContain('primary');
    } finally {
      await harness.cleanup();
    }
  });

  test('BudgetPanel renders overview with usage', async () => {
    const harness = await renderInk(
      <BudgetPanel
        config={{
          enabled: true,
          onExceeded: 'warn',
          session: {
            maxTotalTokens: 1000,
            maxLlmCalls: 10,
            maxToolCalls: 5,
            maxDurationMs: 60_000,
          },
        }}
        sessionStatus={{
          scope: 'session',
          limits: {
            maxTotalTokens: 1000,
            maxLlmCalls: 10,
            maxToolCalls: 5,
            maxDurationMs: 60_000,
          },
          usage: {
            inputTokens: 4,
            outputTokens: 6,
            totalTokens: 10,
            llmCalls: 1,
            toolCalls: 2,
            durationMs: 5_000,
          },
          checks: {},
          overallExceeded: false,
          warningsCount: 0,
        }}
        swarmStatus={{
          scope: 'swarm',
          limits: {},
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            llmCalls: 0,
            toolCalls: 0,
            durationMs: 0,
          },
          checks: {},
          overallExceeded: false,
          warningsCount: 0,
        }}
        onToggleEnabled={() => {}}
        onReset={() => {}}
        onSetLimits={() => {}}
        onSetOnExceeded={() => {}}
        onCancel={() => {}}
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('Session Usage', 1200);
      expect(frame).toContain('Budget');
      expect(frame).toContain('Enforcing');
      expect(frame).toContain('Within limits');
    } finally {
      await harness.cleanup();
    }
  });

  test('BudgetsPanel renders profile list', async () => {
    const now = Date.now();
    const harness = await renderInk(
      <BudgetsPanel
        profiles={[
          {
            id: 'default',
            name: 'Default',
            description: 'Default budget profile',
            config: { enabled: true, onExceeded: 'warn', session: { maxTotalTokens: 1000 } },
            createdAt: now,
            updatedAt: now,
          },
        ]}
        activeProfileId="default"
        sessionStatus={{
          scope: 'session',
          limits: { maxTotalTokens: 1000 },
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            llmCalls: 0,
            toolCalls: 0,
            durationMs: 0,
          },
          checks: {},
          overallExceeded: false,
          warningsCount: 0,
        }}
        swarmStatus={{
          scope: 'swarm',
          limits: {},
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            llmCalls: 0,
            toolCalls: 0,
            durationMs: 0,
          },
          checks: {},
          overallExceeded: false,
          warningsCount: 0,
        }}
        onSelectProfile={() => {}}
        onCreateProfile={async () => {}}
        onDeleteProfile={async () => {}}
        onUpdateProfile={async () => {}}
        onReset={() => {}}
        onCancel={() => {}}
      />, { width: 80, height: 24 }
    );

    try {
      const frame = await harness.waitForText('Default', 1200);
      expect(frame).toContain('Budgets');
      expect(frame).toContain('[n]ew');
    } finally {
      await harness.cleanup();
    }
  });

  test('ModelPanel renders current model and list', async () => {
    const harness = await renderInk(
      <ModelPanel
        currentModelId={DEFAULT_MODEL}
        agentName="Default Assistant"
        onOpenAgents={() => {}}
        onCancel={() => {}}
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('Model Info');
      expect(frame).toContain('Default Assistant');
      expect(frame).toContain(DEFAULT_MODEL);
    } finally {
      await harness.cleanup();
    }
  });

  test('OrdersPanel renders table view with tabs', async () => {
    const manager = {
      listOrders: () => ([
        {
          id: 'ord_alpha',
          storeName: 'Amazon',
          orderNumber: 'A-100',
          description: 'Laptop',
          status: 'pending',
          totalAmount: 1299,
          currency: 'USD',
          itemCount: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]),
      listStores: () => ([
        { id: 'str_amazon', name: 'Amazon', category: 'retail', url: 'https://amazon.com', orderCount: 1, lastOrderAt: new Date().toISOString() },
      ]),
      getOrder: () => null,
      getStoreDetails: () => null,
      createOrder: () => ({ success: true, message: 'created', orderId: 'ord_alpha' }),
      addStore: () => ({ success: true, message: 'added', storeId: 'str_amazon' }),
      cancelOrder: () => ({ success: true, message: 'cancelled', orderId: 'ord_alpha' }),
      getTracking: () => null,
    } as any;

    const harness = await renderInk(
      <OrdersPanel
        manager={manager}
        onClose={() => {}}
      />, { width: 80, height: 24 }
    );

    try {
      const frame = await harness.waitForText('Status filter:');
      expect(frame).toContain('1:orders');
      expect(frame).toContain('2:stores');
      expect(frame).toContain('3:overview');
    } finally {
      await harness.cleanup();
    }
  });

  test('OrdersPanel supports up/down row selection', async () => {
    const nowIso = new Date().toISOString();
    const manager = {
      listOrders: () => ([
        {
          id: 'ord_first',
          storeName: 'Store One',
          orderNumber: '001',
          description: 'First order',
          status: 'pending',
          totalAmount: 10,
          currency: 'USD',
          itemCount: 1,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        {
          id: 'ord_second',
          storeName: 'Store Two',
          orderNumber: '002',
          description: 'Second order',
          status: 'processing',
          totalAmount: 20,
          currency: 'USD',
          itemCount: 2,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      ]),
      listStores: () => [],
      getOrder: (id: string) => ({
        order: {
          id,
          storeId: `str_${id}`,
          storeName: id === 'ord_second' ? 'Store Two' : 'Store One',
          orderNumber: id === 'ord_second' ? '002' : '001',
          description: id === 'ord_second' ? 'Second order' : 'First order',
          status: id === 'ord_second' ? 'processing' : 'pending',
          totalAmount: id === 'ord_second' ? 20 : 10,
          currency: 'USD',
          shippingAddress: null,
          paymentMethod: null,
          trackingNumber: null,
          trackingUrl: null,
          notes: null,
          connectorOrderId: null,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        items: [],
      }),
      getStoreDetails: () => null,
      createOrder: () => ({ success: true, message: 'created', orderId: 'ord_first' }),
      addStore: () => ({ success: true, message: 'added', storeId: 'str_store' }),
      cancelOrder: () => ({ success: true, message: 'cancelled', orderId: 'ord_first' }),
      getTracking: () => null,
    } as any;

    const harness = await renderInk(
      <OrdersPanel
        manager={manager}
        onClose={() => {}}
      />, { width: 80, height: 24 }
    );

    try {
      await harness.waitForText('> ord_first');
      harness.pressKey('j');
      await harness.waitForText('> ord_second');
    } finally {
      await harness.cleanup();
    }
  });

  test('OrdersPanel switches tabs with keyboard shortcuts', async () => {
    const nowIso = new Date().toISOString();
    const manager = {
      listOrders: () => ([
        {
          id: 'ord_only',
          storeName: 'Shop One',
          orderNumber: '001',
          description: 'Single order',
          status: 'pending',
          totalAmount: 35,
          currency: 'USD',
          itemCount: 1,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      ]),
      listStores: () => [],
      getOrder: () => null,
      getStoreDetails: () => null,
      createOrder: () => ({ success: true, message: 'created', orderId: 'ord_only' }),
      addStore: () => ({ success: true, message: 'added', storeId: 'str_store' }),
      cancelOrder: () => ({ success: true, message: 'cancelled', orderId: 'ord_only' }),
      getTracking: () => null,
    } as any;

    const harness = await renderInk(
      <OrdersPanel
        manager={manager}
        onClose={() => {}}
      />, { width: 80, height: 24 }
    );

    try {
      await harness.waitForText('1:orders');
      harness.pressKey('2');
      await harness.waitForText('No stores yet. Press a to add one.');
      harness.pressKey('3');
      await harness.waitForText('Summary');
    } finally {
      await harness.cleanup();
    }
  });

  test('OrdersPanel applies status filter via bracket keys', async () => {
    const nowIso = new Date().toISOString();
    const manager = {
      listOrders: () => ([
        {
          id: 'ord_shipped',
          storeName: 'Ship Store',
          orderNumber: 'S-100',
          description: 'Shipped package',
          status: 'shipped',
          totalAmount: 99,
          currency: 'USD',
          itemCount: 1,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      ]),
      listStores: () => [],
      getOrder: () => null,
      getStoreDetails: () => null,
      createOrder: () => ({ success: true, message: 'created', orderId: 'ord_shipped' }),
      addStore: () => ({ success: true, message: 'added', storeId: 'str_store' }),
      cancelOrder: () => ({ success: true, message: 'cancelled', orderId: 'ord_shipped' }),
      getTracking: () => null,
    } as any;

    const harness = await renderInk(
      <OrdersPanel
        manager={manager}
        onClose={() => {}}
      />, { width: 80, height: 24 }
    );

    try {
      await harness.waitForText('Status filter:');
      harness.pressKey(']');
      await harness.waitForText('No orders for this filter. Press n to create an order.');
    } finally {
      await harness.cleanup();
    }
  });

  test('OrdersPanel creates an order with Ink TextInput submitted values', async () => {
    const nowIso = new Date().toISOString();
    let created: { storeName: string; options?: { description?: string } } | null = null;
    let orders: any[] = [];
    const manager = {
      listOrders: () => orders,
      listStores: () => [],
      getOrder: () => null,
      getStoreDetails: () => null,
      createOrder: (storeName: string, options?: { description?: string }) => {
        created = { storeName, options };
        orders = [{
          id: 'ord_created',
          storeName,
          orderNumber: 'C-1',
          description: options?.description ?? null,
          status: 'pending',
          totalAmount: 0,
          currency: 'USD',
          itemCount: 0,
          createdAt: nowIso,
          updatedAt: nowIso,
        }];
        return { success: true, message: 'created', orderId: 'ord_created' };
      },
      addStore: () => ({ success: true, message: 'added', storeId: 'str_store' }),
      cancelOrder: () => ({ success: true, message: 'cancelled', orderId: 'ord_created' }),
      getTracking: () => null,
    } as any;

    const harness = await renderInk(
      <OrdersPanel
        manager={manager}
        onClose={() => {}}
      />, { width: 80, height: 24 }
    );

    try {
      await harness.waitForText('No orders for this filter. Press n to create an order.');
      harness.pressKey('n');
      await harness.waitForText('Store:');
      harness.typeText('Acme Store');
      harness.pressEnter();
      await harness.waitForText('Description:');
      harness.typeText('Desk chair');
      harness.pressEnter();
      await harness.waitForText('created');
      expect(created).toEqual({ storeName: 'Acme Store', options: { description: 'Desk chair' } });
      expect(harness.captureFrame()).toContain('ord_created');
    } finally {
      await harness.cleanup();
    }
  });

  test('JobsPanel renders empty state', async () => {
    const manager = {
      listSessionJobs: async () => [],
      cancelJob: async () => false,
      getJobStatus: async () => null,
    } as any;

    const harness = await renderInk(
      <JobsPanel
        manager={manager}
        onClose={() => {}}
      />, { width: 80, height: 24 }
    );

    try {
      const frame = await harness.waitForText('No jobs in this session.', 1200);
      expect(frame).toContain('Jobs');
      expect(frame).toContain('1:all');
      expect(frame).toContain('2:active');
      expect(frame).toContain('3:done');
    } finally {
      await harness.cleanup();
    }
  });

  test('JobsPanel kills selected running job with x', async () => {
    const jobs = [
      {
        id: 'job_run',
        sessionId: 'session-1',
        connectorName: 'browseruse',
        command: 'crawl https://example.com',
        input: {},
        status: 'running',
        createdAt: Date.now() - 10000,
        startedAt: Date.now() - 9000,
        timeoutMs: 60000,
      },
      {
        id: 'job_done',
        sessionId: 'session-1',
        connectorName: 'slack',
        command: 'send update',
        input: {},
        status: 'completed',
        createdAt: Date.now() - 20000,
        startedAt: Date.now() - 19000,
        completedAt: Date.now() - 18000,
        timeoutMs: 60000,
        result: { content: 'ok', exitCode: 0 },
      },
    ] as any[];
    const cancelled: string[] = [];

    const manager = {
      listSessionJobs: async () => jobs.map((job) => ({ ...job })),
      cancelJob: async (jobId: string) => {
        const job = jobs.find((item) => item.id === jobId);
        if (!job || !['pending', 'running'].includes(job.status)) {
          return false;
        }
        cancelled.push(jobId);
        job.status = 'cancelled';
        job.completedAt = Date.now();
        job.error = { code: 'JOB_CANCELLED', message: 'Job was cancelled by user' };
        return true;
      },
      getJobStatus: async (jobId: string) => jobs.find((job) => job.id === jobId) || null,
    } as any;

    const harness = await renderInk(
      <JobsPanel
        manager={manager}
        onClose={() => {}}
      />, { width: 80, height: 24 }
    );

    try {
      await harness.waitForText('job_run', 1600);
      harness.pressKey('x');
      await harness.waitForText('Killed job_run.', 1600);
      await harness.waitForText('CANCELLED', 1600);
      expect(cancelled).toEqual(['job_run']);
    } finally {
      await harness.cleanup();
    }
  });

  test('JobsPanel kills all active jobs with K', async () => {
    const jobs = [
      {
        id: 'job_run_a',
        sessionId: 'session-1',
        connectorName: 'browseruse',
        command: 'crawl https://a.example.com',
        input: {},
        status: 'running',
        createdAt: Date.now() - 10000,
        startedAt: Date.now() - 9000,
        timeoutMs: 60000,
      },
      {
        id: 'job_run_b',
        sessionId: 'session-1',
        connectorName: 'slack',
        command: 'send status',
        input: {},
        status: 'pending',
        createdAt: Date.now() - 11000,
        timeoutMs: 60000,
      },
      {
        id: 'job_done',
        sessionId: 'session-1',
        connectorName: 'notion',
        command: 'write page',
        input: {},
        status: 'completed',
        createdAt: Date.now() - 22000,
        startedAt: Date.now() - 21000,
        completedAt: Date.now() - 19000,
        timeoutMs: 60000,
        result: { content: 'ok', exitCode: 0 },
      },
    ] as any[];
    const cancelled: string[] = [];

    const manager = {
      listSessionJobs: async () => jobs.map((job) => ({ ...job })),
      cancelJob: async (jobId: string) => {
        const job = jobs.find((item) => item.id === jobId);
        if (!job || !['pending', 'running'].includes(job.status)) {
          return false;
        }
        cancelled.push(jobId);
        job.status = 'cancelled';
        job.completedAt = Date.now();
        return true;
      },
      getJobStatus: async (jobId: string) => jobs.find((job) => job.id === jobId) || null,
    } as any;

    const harness = await renderInk(
      <JobsPanel
        manager={manager}
        onClose={() => {}}
      />, { width: 80, height: 24 }
    );

    try {
      await harness.waitForText('job_run_a', 1800);
      harness.pressKey('K');
      await harness.waitForText('Killed 2 active jobs.', 1800);
      await harness.waitForText('CANCELLED', 1800);
      expect(cancelled.sort()).toEqual(['job_run_a', 'job_run_b']);
    } finally {
      await harness.cleanup();
    }
  });

  test('DocsPanel renders section index with quick-start content', async () => {
    const harness = await renderInk(
      <DocsPanel onClose={() => {}} />, { width: 80, height: 24 }
    );

    try {
      const frame = await harness.waitForText('Documentation', 1400);
      expect(frame).toContain('Quick Start');
      expect(frame).toContain('sections');
      expect(frame).toContain('[Enter] open');
    } finally {
      await harness.cleanup();
    }
  });

  test('DocsPanel opens selected section and returns to index', async () => {
    const harness = await renderInk(
      <DocsPanel onClose={() => {}} />, { width: 80, height: 24 }
    );

    try {
      await harness.waitForText('Quick Start', 1800);
      harness.typeText('j');
      await harness.waitForText('❯ 2. Core Workflow', 1800);
      harness.pressEnter();
      await harness.waitForText('Lines 1-', 1800);
      harness.typeText('b');
      await harness.waitForText('Documentation', 1800);
    } finally {
      await harness.cleanup();
    }
  });

  test('OnboardingPanel renders welcome step and advances on enter', async () => {
    const harness = await renderInk(
      <OnboardingPanel
        onComplete={async () => {}}
        onCancel={() => {}}
        discoveredConnectors={[]}
      />, { width: 80, height: 24 }
    );

    try {
      await harness.waitForText('Press Enter to get started', 3000);
      harness.pressEnter();
      await harness.waitForText('What can assistants do?', 3000);
      harness.pressEnter();
      await harness.waitForText('Choose your provider', 3000);
    } finally {
      await harness.cleanup();
    }
  }, 10000);

  test('OnboardingPanel renders API key step without invalid span nesting', async () => {
    const harness = await renderInk(
      <OnboardingPanel
        onComplete={async () => {}}
        onCancel={() => {}}
        existingApiKeys={{ anthropic: 'existing-test-key' } as Record<LLMProvider, string>}
        discoveredConnectors={[]}
      />, { width: 80, height: 24 }
    );

    try {
      await harness.waitForText('Press Enter to get started', 3000);
      harness.pressEnter();
      await harness.waitForText('What can assistants do?', 3000);
      harness.pressEnter();
      await harness.waitForText('Choose your provider', 3000);
      harness.pressEnter();
      await harness.waitForText('Choose your default model', 3000);
      harness.pressEnter();

      await harness.waitForText("Let's set up your API key", 3000);
      expect(harness.captureFrame()).toContain('Get one at:');
    } finally {
      await harness.cleanup();
    }
  }, 10000);

  test('OnboardingPanel persists the submitted API key value on completion', async () => {
    let completedApiKey: string | undefined;

    function RerenderingOnboardingPanel() {
      return (
        <OnboardingPanel
          onComplete={async (result) => {
            completedApiKey = result.apiKey;
          }}
          onCancel={() => {}}
          existingApiKeys={{} as Record<LLMProvider, string>}
          discoveredConnectors={[]}
        />
      );
    }

    const harness = await renderInk(
      <RerenderingOnboardingPanel />, { width: 80, height: 24 }
    );

    try {
      await harness.waitForText('Press Enter to get started', 3000);
      harness.pressEnter();
      await harness.waitForText('What can assistants do?', 3000);
      harness.pressEnter();
      await harness.waitForText('Choose your provider', 3000);
      harness.pressEnter();
      await harness.waitForText('Choose your default model', 3000);
      harness.pressEnter();
      await harness.waitForText("Let's set up your API key", 3000);

      harness.typeText('sk-ant-test-submitted-value');
      harness.pressEnter();
      await harness.waitForText('Connectors', 3000);
      await harness.rerender(<RerenderingOnboardingPanel />);
      harness.pressEnter();
      await harness.waitForText('Skills', 3000);
      harness.pressEnter();
      await harness.waitForText("You're all set!", 3000);
      harness.pressEnter();

      const started = Date.now();
      while (!completedApiKey && Date.now() - started < 1000) {
        await harness.renderOnce();
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(completedApiKey).toBe('sk-ant-test-submitted-value');
    } finally {
      await harness.cleanup();
    }
  }, 10000);
});
