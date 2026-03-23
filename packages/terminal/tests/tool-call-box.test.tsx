import React from 'react';
import { describe, expect, test } from 'bun:test';
import { testRender } from '@opentui/react/test-utils';
import { ToolCallBox, useToolCallExpansion } from '../src/components/ToolCallBox';

function ExpansionProbe({ forceExpand }: { forceExpand?: boolean }) {
  const { isExpanded, setIsExpanded } = useToolCallExpansion();
  React.useEffect(() => {
    if (forceExpand) {
      setIsExpanded(true);
    }
  }, [forceExpand, setIsExpanded]);
  return <text>{isExpanded ? 'expanded' : 'collapsed'}</text>;
}

describe('ToolCallBox', () => {
  test('renders tool call summaries and hidden count', async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ToolCallBox
        entries={[
          { toolCall: { id: 't1', name: 'bash', input: { command: 'ls -la' }, type: 'tool' } as any },
          { toolCall: { id: 't2', name: 'schedule', input: { action: 'list' }, type: 'tool' } as any },
          { toolCall: { id: 't3', name: 'connect_slack', input: { action: 'post' }, type: 'tool' } as any },
        ]}
        maxVisible={2}
      />, { width: 80, height: 24 }
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain('Tools');
    expect(frame).toContain('Listing scheduled tasks');
    expect(frame).toContain('more above');
  });

  test('useToolCallExpansion defaults to collapsed', async () => {
    const { captureCharFrame, renderOnce } = await testRender(<ExpansionProbe />, { width: 80, height: 24 });
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain('collapsed');
  });
});
