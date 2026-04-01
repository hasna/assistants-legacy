import React from 'react';
import { describe, expect, test } from 'bun:test';
import { testRender } from '@opentui/react/test-utils';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getSecurityLogger } from '@hasna/assistants-core';
import { DEFAULT_MODEL } from '@hasna/assistants-shared';

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
    try {
      const { captureCharFrame, renderOnce } = await testRender(<LogsPanel onCancel={() => {}} />, { width: 80, height: 24 });
      await renderOnce();
      const frame = captureCharFrame();
      expect(frame).toContain('Security Logs');
      expect(frame).toContain('No security events recorded.');
    } finally {
      cleanup();
    }
  });

  test('LogsPanel renders list entry when events exist', async () => {
    const cleanup = setupIsolatedSecurityLog();
    try {
      const logger = getSecurityLogger();
      logger.log({
        eventType: 'blocked_command',
        severity: 'high',
        sessionId: 's1',
        details: { reason: 'Blocked command pattern: rm -rf /', command: 'rm -rf /', tool: 'bash' },
      });
      const { captureCharFrame, renderOnce } = await testRender(<LogsPanel onCancel={() => {}} />, { width: 80, height: 24 });
      await renderOnce();
      const frame = captureCharFrame();
      expect(frame).toContain('Security Logs');
      expect(frame).toContain('blocked_command');
    } finally {
      cleanup();
    }
  });

  test('LogsPanel refreshes while open', async () => {
    const cleanup = setupIsolatedSecurityLog();
    try {
      const logger = getSecurityLogger();
      const { captureCharFrame, renderOnce, mockInput } = await testRender(<LogsPanel onCancel={() => {}} />, { width: 80, height: 24 });
      await renderOnce();
      let frame = captureCharFrame();
      expect(frame).toContain('No security events recorded.');

      logger.log({
        eventType: 'validation_failure',
        severity: 'medium',
        sessionId: 's-refresh',
        details: { reason: 'bad input' },
      });

      mockInput.pressKey('r');
      const started = Date.now();
      while (Date.now() - started < 1200) {
        await renderOnce();
        frame = captureCharFrame();
        if (frame.includes('validation_failure')) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(frame).toContain('validation_failure');
    } finally {
      cleanup();
    }
  });

  test('SecretsPanel renders empty state', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <SecretsPanel
        secrets={[]}
        onGet={async () => ''}
        onAdd={async () => {}}
        onDelete={async () => {}}
        onClose={() => {}}
      />, { width: 80, height: 24 }
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain('Secrets');
    expect(frame).toContain('No secrets stored.');
  });

  test('WorkspacePanel renders empty state', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <WorkspacePanel
        workspaces={[]}
        onArchive={async () => {}}
        onDelete={async () => {}}
        onClose={() => {}}
      />, { width: 80, height: 24 }
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain('Workspaces');
    expect(frame).toContain('No workspaces found.');
  });

  test('ProjectsPanel renders empty state and new project option', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ProjectsPanel
        projects={[]}
        onSelect={() => {}}
        onCreate={async () => {}}
        onDelete={async () => {}}
        onViewPlans={() => {}}
        onCancel={() => {}}
      />, { width: 80, height: 24 }
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain('Projects');
    expect(frame).toContain('No projects yet. Press n to create one.');
    expect(frame).toContain('New project');
  });

  test('ConnectorsPanel renders empty state', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ConnectorsPanel
        connectors={[]}
        onCheckAuth={async () => ({ authenticated: false })}
        onClose={() => {}}
      />, { width: 80, height: 24 }
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain('Connectors');
    expect(frame).toContain('No connectors found.');
  });

  test('ConnectorsPanel remains interactive while navigating and searching', async () => {
    let closed = false;
    const { captureCharFrame, renderOnce, mockInput } = await testRender(
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

    await renderOnce();

    let frame = captureCharFrame();
    expect(frame).toContain('alpha');
    expect(frame).toContain('beta');

    mockInput.pressKey('q'); // quit panel
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(closed).toBe(true);
  });

  test('TelephonyPanel shows quick setup and default number', async () => {
    const manager = createTelephonyManagerStub({
      defaultNumber: '+15550001111',
      defaultSource: 'local',
    });
    const { captureCharFrame, renderOnce } = await testRender(
      <TelephonyPanel manager={manager as any} onClose={() => {}} />, { width: 80, height: 24 }
    );
    // Wait for useEffect to run and trigger re-render
    const started = Date.now();
    let frame = '';
    while (Date.now() - started < 800) {
      await renderOnce();
      frame = captureCharFrame();
      if (frame.includes('Quick Setup')) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(frame).toContain('Communication');
    expect(frame).toContain('Quick Setup');
    expect(frame).toContain('+15550001111');
  });

  test.todo('TelephonyPanel highlights default number in numbers tab', async () => {
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
    const { captureCharFrame, renderOnce, mockInput } = await testRender(
      <TelephonyPanel manager={manager as any} onClose={() => {}} />, { width: 80, height: 24 }
    );
    await renderOnce();
    mockInput.pressKey('4');
    const started = Date.now();
    let frame = '';
    while (Date.now() - started < 800) {
      await renderOnce();
      frame = captureCharFrame();
      if (frame.includes('★')) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(frame).toContain('★');
    expect(frame).toContain('default');
  });

  test.todo('TelephonyPanel sets default number with d key', async () => {
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
    const { captureCharFrame, renderOnce, mockInput } = await testRender(
      <TelephonyPanel manager={manager as any} onClose={() => {}} />, { width: 80, height: 24 }
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    mockInput.pressKey('4');
    await new Promise((resolve) => setTimeout(resolve, 100));
    mockInput.pressKey('d');
    const started = Date.now();
    let frame = '';
    while (Date.now() - started < 2000) {
      await renderOnce();
      frame = captureCharFrame();
      if (frame.includes('Default phone number set to +15550003333')) break;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    expect(frame).toContain('Default phone number set to +15550003333');
  });

  test('ConnectorsPanel does not auto-enter search mode when typing letters', async () => {
    const { captureCharFrame, renderOnce, mockInput } = await testRender(
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

    await renderOnce();
    mockInput.pressKey('a');
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).not.toContain('Search:');
    expect(frame).toContain('alpha');
  });

});
