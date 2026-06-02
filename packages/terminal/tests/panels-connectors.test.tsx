import React from 'react';
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getSecurityLogger } from '@hasna/assistants-core';
import { DEFAULT_MODEL } from '@hasna/assistants-shared';
import { renderInk } from './utils/ink-test-harness';

const { LogsPanel } = await import('../src/components/LogsPanel');
const { SecretsPanel } = await import('../src/components/SecretsPanel');
const { WorkspacePanel } = await import('../src/components/WorkspacePanel');
const { SkillsPanel } = await import('../src/components/SkillsPanel');
const { IdentityPanel } = await import('../src/components/IdentityPanel');
const { BudgetPanel } = await import('../src/components/BudgetPanel');
const { BudgetsPanel } = await import('../src/components/BudgetsPanel');
const { ModelPanel } = await import('../src/components/ModelPanel');
const { ProjectsPanel } = await import('../src/components/ProjectsPanel');
const { ConnectorsPanel } = await import('../src/components/ConnectorsPanel');
const { TasksPanel } = await import('../src/components/TasksPanel');
const { SchedulesPanel } = await import('../src/components/SchedulesPanel');
const { HooksPanel } = await import('../src/components/HooksPanel');
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
  test('LogsPanel renders empty state', async () => {
    const cleanup = setupIsolatedSecurityLog();
    let harness: Awaited<ReturnType<typeof renderInk>> | null = null;
    try {
      harness = await renderInk(<LogsPanel onCancel={() => {}} />, { width: 80, height: 24 });
      const frame = await harness.waitForText('No security events recorded.');
      expect(frame).toContain('Security Logs');
    } finally {
      await harness?.cleanup();
      cleanup();
    }
  });

  test('LogsPanel renders list entry when events exist', async () => {
    const cleanup = setupIsolatedSecurityLog();
    let harness: Awaited<ReturnType<typeof renderInk>> | null = null;
    try {
      const logger = getSecurityLogger();
      logger.log({
        eventType: 'blocked_command',
        severity: 'high',
        sessionId: 's1',
        details: { reason: 'Blocked command pattern: rm -rf /', command: 'rm -rf /', tool: 'bash' },
      });
      harness = await renderInk(<LogsPanel onCancel={() => {}} />, { width: 80, height: 24 });
      const frame = await harness.waitForText('blocked_command');
      expect(frame).toContain('Security Logs');
    } finally {
      await harness?.cleanup();
      cleanup();
    }
  });

  test('LogsPanel refreshes while open', async () => {
    const cleanup = setupIsolatedSecurityLog();
    let harness: Awaited<ReturnType<typeof renderInk>> | null = null;
    try {
      const logger = getSecurityLogger();
      harness = await renderInk(<LogsPanel onCancel={() => {}} />, { width: 80, height: 24 });
      await harness.waitForText('No security events recorded.');

      logger.log({
        eventType: 'validation_failure',
        severity: 'medium',
        sessionId: 's-refresh',
        details: { reason: 'bad input' },
      });

      harness.typeText('r');
      const frame = await harness.waitForText('validation_failure', 1200);
      expect(frame).toContain('validation_failure');
    } finally {
      await harness?.cleanup();
      cleanup();
    }
  });

  test('SecretsPanel renders empty state', async () => {
    const harness = await renderInk(
      <SecretsPanel
        secrets={[]}
        onGet={async () => ''}
        onAdd={async () => {}}
        onDelete={async () => {}}
        onClose={() => {}}
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('No secrets stored.');
      expect(frame).toContain('Secrets');
    } finally {
      await harness.cleanup();
    }
  });

  test('SecretsPanel adds a secret with Ink TextInput', async () => {
    let added: any = null;
    const harness = await renderInk(
      <SecretsPanel
        secrets={[]}
        onGet={async () => ''}
        onAdd={async (input) => { added = input; }}
        onDelete={async () => {}}
        onClose={() => {}}
      />, { width: 90, height: 24 }
    );
    try {
      await harness.waitForText('No secrets stored.');
      harness.typeText('n');
      await harness.waitForText('Add Secret');

      harness.typeText('GITHUB_TOKEN');
      await harness.waitForText('GITHUB_TOKEN');
      harness.pressEnter();

      await harness.waitForText('Value:');
      harness.typeText('s3cr3t');
      await harness.waitForText('s3cr3t');
      harness.pressEnter();

      await harness.waitForText('Scope:');
      harness.pressEnter();

      await harness.waitForText('Description:');
      harness.typeText('GitHub API token');
      await harness.waitForText('GitHub API token');
      harness.pressEnter();

      await harness.waitForText('Secret saved.');
      expect(added).toEqual({
        name: 'GITHUB_TOKEN',
        value: 's3cr3t',
        scope: 'assistant',
        description: 'GitHub API token',
      });
    } finally {
      await harness.cleanup();
    }
  });

  test('WorkspacePanel renders empty state', async () => {
    const harness = await renderInk(
      <WorkspacePanel
        workspaces={[]}
        onArchive={async () => {}}
        onDelete={async () => {}}
        onSelect={async () => {}}
        onClose={() => {}}
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('No workspaces found.');
      expect(frame).toContain('Workspaces');
    } finally {
      await harness.cleanup();
    }
  });

  test('ProjectsPanel renders empty state and new project option', async () => {
    const harness = await renderInk(
      <ProjectsPanel
        projects={[]}
        onSelect={() => {}}
        onCreate={async () => {}}
        onDelete={async () => {}}
        onViewPlans={() => {}}
        onCancel={() => {}}
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('No projects yet. Press n to create one.');
      expect(frame).toContain('Projects');
      expect(frame).toContain('New project');
    } finally {
      await harness.cleanup();
    }
  });

  test('ProjectsPanel creates a project with Ink TextInput', async () => {
    let created: { name: string; description?: string } | null = null;
    const harness = await renderInk(
      <ProjectsPanel
        projects={[]}
        onSelect={() => {}}
        onCreate={async (name, description) => { created = { name, description }; }}
        onDelete={async () => {}}
        onViewPlans={() => {}}
        onCancel={() => {}}
      />, { width: 90, height: 24 }
    );
    try {
      await harness.waitForText('No projects yet. Press n to create one.');
      harness.typeText('n');
      await harness.waitForText('Create New Project');

      harness.typeText('Ink Migration');
      await harness.waitForText('Ink Migration');
      harness.pressEnter();

      await harness.waitForText('Description:');
      harness.typeText('Move terminal UI to upstream Ink');
      await harness.waitForText('Move terminal UI to upstream Ink');
      harness.pressEnter();

      await harness.waitForText('No projects yet. Press n to create one.');
      expect(created).toEqual({
        name: 'Ink Migration',
        description: 'Move terminal UI to upstream Ink',
      });
    } finally {
      await harness.cleanup();
    }
  });

  test('ConnectorsPanel renders empty state', async () => {
    const harness = await renderInk(
      <ConnectorsPanel
        connectors={[]}
        onCheckAuth={async () => ({ authenticated: false })}
        onClose={() => {}}
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('No connectors found.');
      expect(frame).toContain('Connectors');
    } finally {
      await harness.cleanup();
    }
  });

  test('ConnectorsPanel remains interactive while navigating and searching', async () => {
    let closed = false;
    const harness = await renderInk(
      <ConnectorsPanel
        connectors={[
          {
            name: 'alpha',
            cli: 'connect-alpha',
            description: 'Alpha connector',
            commands: [
              { name: 'help', description: 'Show help', args: [], options: [] },
              { name: 'sync', description: 'Sync data', args: [], options: [] },
            ],
          } as any,
          {
            name: 'beta',
            cli: 'connect-beta',
            description: 'Beta connector',
            commands: [
              { name: 'help', description: 'Show help', args: [], options: [] },
            ],
          } as any,
        ]}
        onCheckAuth={async () => ({ authenticated: true })}
        onClose={() => {
          closed = true;
        }}
      />, { width: 80, height: 24 }
    );

    try {
      let frame = await harness.waitForText('alpha');
      expect(frame).toContain('beta');

      harness.pressKey('/');
      await harness.waitForText('Search:');
      harness.typeText('beta');
      frame = await harness.waitForText('matching "beta"');
      expect(frame).toContain('beta');
      expect(frame).not.toContain('alpha        ');

      harness.pressEnter();
      await harness.waitForText('Commands:');

      harness.pressKey('q');
      await harness.renderOnce();
      expect(closed).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });

  test('TelephonyPanel shows quick setup and default number', async () => {
    const manager = createTelephonyManagerStub({
      defaultNumber: '+15550001111',
      defaultSource: 'local',
    });
    const harness = await renderInk(
      <TelephonyPanel manager={manager as any} onClose={() => {}} />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('Quick Setup', 800);
      expect(frame).toContain('Communication');
      expect(frame).toContain('+15550001111');
    } finally {
      await harness.cleanup();
    }
  });

  test('TelephonyPanel highlights default number in numbers tab', async () => {
    const manager = createTelephonyManagerStub({
      defaultNumber: '+15550002222',
      defaultSource: 'local',
      numbers: [
        {
          id: 'ph-1',
          number: '+15550002222',
          friendlyName: 'Main',
          twilioSid: 'sid',
          status: 'active',
          capabilities: { voice: true, sms: true, whatsapp: false },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    const harness = await renderInk(
      <TelephonyPanel manager={manager as any} onClose={() => {}} />, { width: 80, height: 24 }
    );
    try {
      await harness.waitForText('Quick Setup');
      harness.pressKey('4');
      const frame = await harness.waitForText('★', 800);
      expect(frame).toContain('default');
    } finally {
      await harness.cleanup();
    }
  });

  test('TelephonyPanel sets default number with d key', async () => {
    const manager = createTelephonyManagerStub({
      numbers: [
        {
          id: 'ph-1',
          number: '+15550003333',
          friendlyName: null,
          twilioSid: 'sid',
          status: 'active',
          capabilities: { voice: true, sms: true, whatsapp: false },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    const harness = await renderInk(
      <TelephonyPanel manager={manager as any} onClose={() => {}} />, { width: 80, height: 24 }
    );
    try {
      await harness.waitForText('Quick Setup');
      harness.pressKey('4');
      await harness.waitForText('+15550003333');
      harness.pressKey('d');
      const frame = await harness.waitForText('Default phone number set to +15550003333', 2000);
      expect(frame).toContain('Default phone number set to +15550003333');
    } finally {
      await harness.cleanup();
    }
  });

  test('TelephonyPanel sends SMS with Ink TextInput', async () => {
    const manager = createTelephonyManagerStub() as any;
    let sent: { to: string; body: string } | null = null;
    manager.sendSms = async (to: string, body: string) => {
      sent = { to, body };
      return { success: true, message: 'SMS sent.' };
    };

    const harness = await renderInk(
      <TelephonyPanel manager={manager} onClose={() => {}} />, { width: 90, height: 24 }
    );
    try {
      await harness.waitForText('Quick Setup');
      harness.typeText('s');
      await harness.waitForText('Send SMS');
      harness.typeText('+15550004444');
      harness.pressEnter();
      await harness.waitForText('Body:');
      harness.typeText('Ink SMS check');
      harness.pressEnter();
      await harness.waitForText('SMS sent.');
      expect(sent).toEqual({
        to: '+15550004444',
        body: 'Ink SMS check',
      });
    } finally {
      await harness.cleanup();
    }
  });

  test('ConnectorsPanel does not auto-enter search mode when typing letters', async () => {
    const harness = await renderInk(
      <ConnectorsPanel
        connectors={[
          {
            name: 'alpha',
            cli: 'connect-alpha',
            description: 'Alpha connector',
            commands: [{ name: 'help', description: 'Show help', args: [], options: [] }],
          } as any,
        ]}
        onCheckAuth={async () => ({ authenticated: true })}
        onClose={() => {}}
      />, { width: 80, height: 24 }
    );

    try {
      await harness.waitForText('alpha');
      harness.pressKey('a');
      await harness.renderOnce();
      const frame = harness.captureFrame();
      expect(frame).not.toContain('Search:');
      expect(frame).toContain('alpha');
    } finally {
      await harness.cleanup();
    }
  });

});
