import React from 'react';
import { describe, expect, test } from 'bun:test';
import { Text, renderToString } from '../src/ui/ink';
import { AppShell, calculateAppShellLayout, calculateTranscriptRenderWidth } from '../src/components/AppShell';

describe('Ink AppShell', () => {
  test('calculates single-column chat layout without a sidebar', () => {
    expect(calculateAppShellLayout({
      rows: 24,
      columns: 80,
      hasActiveSession: false,
    })).toEqual({
      rows: 24,
      columns: 80,
      statusHeight: 1,
      splitPaneHeight: 23,
      messagesHeight: 20,
      editorHeight: 3,
      showSidebar: false,
      leftWidth: 80,
      rightWidth: 0,
    });
  });

  test('calculates wide chat layout with a sidebar', () => {
    expect(calculateAppShellLayout({
      rows: 40,
      columns: 120,
      hasActiveSession: true,
    })).toMatchObject({
      splitPaneHeight: 39,
      messagesHeight: 36,
      editorHeight: 3,
      showSidebar: true,
      leftWidth: 84,
      rightWidth: 36,
    });
  });

  test('calculates transcript render width inside the chat column padding', () => {
    const layout = calculateAppShellLayout({
      rows: 40,
      columns: 120,
      hasActiveSession: true,
    });

    expect(calculateTranscriptRenderWidth(layout)).toBe(80);
    expect(calculateTranscriptRenderWidth(layout)).toBeLessThan(layout.leftWidth);
  });

  test('clamps tiny terminals to positive dimensions', () => {
    expect(calculateAppShellLayout({
      rows: 0,
      columns: 0,
      hasActiveSession: true,
    })).toMatchObject({
      rows: 24,
      columns: 80,
      showSidebar: false,
      messagesHeight: 20,
      editorHeight: 3,
    });
  });

  test('renders the welcome shell with Ink components', () => {
    const output = renderToString(
      <AppShell
        mode="welcome"
        rows={14}
        columns={50}
        hasActiveSession={false}
        welcomeBanner={<Text>Logo</Text>}
        welcomeInput={<Text>Prompt</Text>}
        welcomeTip="Helpful tip"
        status={<Text>Status</Text>}
        commandPalette={<Text>Palette</Text>}
      />,
    );

    expect(output).toContain('Logo');
    expect(output).toContain('Prompt');
    expect(output).toContain('tab agents  ctrl+p commands');
    expect(output).toContain('Tip  Helpful tip');
    expect(output).toContain('Status');
    expect(output).toContain('Palette');
  });

  test('renders the chat shell and sidebar when wide enough', () => {
    const output = renderToString(
      <AppShell
        mode="chat"
        rows={20}
        columns={120}
        hasActiveSession={true}
        backgroundProcessingCount={2}
        transcript={<Text>Transcript</Text>}
        sidebar={<Text>Sidebar</Text>}
        editor={<Text>Editor</Text>}
        status={<Text>Status</Text>}
        showExitHint={true}
        queueIndicator={<Text>Queue</Text>}
        stopHint="Stopping"
      />,
    );

    expect(output).toContain('2 sessions processing in background');
    expect(output).toContain('Transcript');
    expect(output).toContain('Sidebar');
    expect(output).toContain('Editor');
    expect(output).toContain('Status');
    expect(output).toContain('(Press Ctrl+C again to exit)');
    expect(output).toContain('Queue');
    expect(output).toContain('Stopping');
  });

  test('does not render the sidebar on narrow terminals', () => {
    const output = renderToString(
      <AppShell
        mode="chat"
        rows={20}
        columns={90}
        hasActiveSession={true}
        transcript={<Text>Transcript</Text>}
        sidebar={<Text>Sidebar</Text>}
        editor={<Text>Editor</Text>}
        status={<Text>Status</Text>}
      />,
    );

    expect(output).toContain('Transcript');
    expect(output).not.toContain('Sidebar');
  });
});
