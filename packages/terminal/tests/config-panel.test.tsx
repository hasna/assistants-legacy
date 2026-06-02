import React from 'react';
import { describe, expect, test } from 'bun:test';
import type { AssistantsConfig } from '@hasna/assistants-shared';
import { DEFAULT_MODEL } from '@hasna/assistants-shared';
import { ConfigPanel } from '../src/components/ConfigPanel';
import { renderInk } from './utils/ink-test-harness';

function createConfig(): AssistantsConfig {
  return {
    llm: {
      model: DEFAULT_MODEL,
      maxOutputTokens: 8192,
    },
    context: {
      maxContextTokens: 180000,
      keepRecentMessages: 10,
      summaryStrategy: 'hybrid',
      summaryMaxTokens: 2000,
    },
    memory: {
      enabled: true,
    },
    voice: {
      enabled: false,
    },
  } as AssistantsConfig;
}

describe('ConfigPanel', () => {
  test('renders the overview through the Ink harness', async () => {
    const harness = await renderInk(
      <ConfigPanel
        config={createConfig()}
        userConfig={null}
        projectConfig={null}
        localConfig={null}
        onSave={async () => {}}
        onCancel={() => {}}
      />,
      { width: 90, height: 30 }
    );

    try {
      const frame = await harness.waitForText('Configuration Overview');
      expect(frame).toContain('Max Output Tokens');
      expect(frame).toContain('Memory: enabled');
    } finally {
      await harness.cleanup();
    }
  });

  test('saves a numeric context field from submitted Ink TextInput value', async () => {
    const saves: Array<[string, Partial<AssistantsConfig>]> = [];
    const harness = await renderInk(
      <ConfigPanel
        config={createConfig()}
        userConfig={null}
        projectConfig={null}
        localConfig={null}
        onSave={async (location, updates) => {
          saves.push([location, updates]);
        }}
        onCancel={() => {}}
      />,
      { width: 100, height: 30 }
    );

    try {
      await harness.waitForText('Configuration Overview');
      harness.pressDown();
      await harness.waitForText('> Model');
      harness.pressDown();
      await harness.waitForText('> Context');
      harness.pressEnter();
      await harness.waitForText('Context Settings');

      harness.pressKey('1');
      await harness.waitForText('Max Context Tokens:');
      for (let i = 0; i < 6; i += 1) {
        harness.pressKey('backspace');
      }
      harness.typeText('200000');
      await harness.waitForText('200000');
      harness.pressEnter();

      await harness.waitForText('Saved to project config');
      expect(saves).toEqual([
        [
          'project',
          {
            context: {
              maxContextTokens: 200000,
            },
          },
        ],
      ]);
    } finally {
      await harness.cleanup();
    }
  });
});
