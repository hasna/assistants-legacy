import React from 'react';
import { describe, expect, test } from 'bun:test';
import { Text } from '../src/ui/ink';
import { ToolCallBox, useToolCallExpansion } from '../src/components/ToolCallBox';
import { renderInk } from './utils/ink-test-harness';

function ExpansionProbe({ forceExpand }: { forceExpand?: boolean }) {
  const { isExpanded, setIsExpanded } = useToolCallExpansion();
  React.useEffect(() => {
    if (forceExpand) {
      setIsExpanded(true);
    }
  }, [forceExpand, setIsExpanded]);
  return <Text>{isExpanded ? 'expanded' : 'collapsed'}</Text>;
}

describe('ToolCallBox', () => {
  test('renders tool call summaries and hidden count', async () => {
    const harness = await renderInk(
      <ToolCallBox
        entries={[
          { toolCall: { id: 't1', name: 'bash', input: { command: 'ls -la' }, type: 'tool' } as any },
          { toolCall: { id: 't2', name: 'schedule', input: { action: 'list' }, type: 'tool' } as any },
          { toolCall: { id: 't3', name: 'connect_slack', input: { action: 'post' }, type: 'tool' } as any },
        ]}
        maxVisible={2}
      />, { width: 80, height: 24 }
    );
    try {
      const frame = await harness.waitForText('Listing scheduled tasks');
      expect(frame).toContain('Tools');
      expect(frame).toContain('Listing scheduled tasks');
      expect(frame).toContain('more above');
    } finally {
      await harness.cleanup();
    }
  });

  test('useToolCallExpansion defaults to collapsed', async () => {
    const harness = await renderInk(<ExpansionProbe />, { width: 80, height: 24 });
    try {
      const frame = await harness.waitForText('collapsed');
      expect(frame).toContain('collapsed');
    } finally {
      await harness.cleanup();
    }
  });

  test('useToolCallExpansion toggles on ctrl+o', async () => {
    const harness = await renderInk(<ExpansionProbe />, { width: 80, height: 24 });
    try {
      await harness.waitForText('collapsed');
      harness.pressKey('o', { ctrl: true });
      const frame = await harness.waitForText('expanded');
      expect(frame).toContain('expanded');
    } finally {
      await harness.cleanup();
    }
  });
});
