/**
 * Tests for the design-system primitives (plan 8d98da29 P2.1).
 *
 * Verifies each primitive renders its expected content/glyphs and that colors
 * resolve through the active theme (no hardcoded hex).
 */
import React from 'react';
import { describe, expect, test, afterEach } from 'bun:test';
import { setActiveTheme } from '../src/theme/colors';
import { Text } from '../src/ui/ink';
import {
  StatusIcon,
  STATUS_CONFIG,
  KeyboardShortcutHint,
  Badge,
  Divider,
  ListItem,
  Pane,
  color,
} from '../src/components/design-system';
import { renderInk } from './utils/ink-test-harness';

async function frame(node: React.ReactElement, width = 80, height = 6): Promise<string> {
  const harness = await renderInk(node, { width, height });
  try {
    await harness.renderOnce();
    return harness.captureFrame();
  } finally {
    await harness.cleanup();
  }
}

afterEach(() => setActiveTheme('dark'));

describe('color helper', () => {
  test('resolves a semantic token to the active theme value', () => {
    setActiveTheme('dark');
    expect(color('error')).toBe('#e06c75');
    setActiveTheme('dark-ansi');
    expect(color('error').toLowerCase()).toBe('#cd0000');
  });
  test('passes raw hex through unchanged', () => {
    expect(color('#abcdef')).toBe('#abcdef');
  });
});

describe('StatusIcon', () => {
  test('renders the configured glyph for each status', async () => {
    for (const status of Object.keys(STATUS_CONFIG) as (keyof typeof STATUS_CONFIG)[]) {
      const out = await frame(<Text><StatusIcon status={status} /></Text>);
      expect(out).toContain(STATUS_CONFIG[status].icon);
    }
  });
  test('withSpace appends a trailing space before a label', async () => {
    const out = await frame(<Text><StatusIcon status="success" withSpace />Done</Text>);
    expect(out).toContain('✓ Done');
  });
});

describe('KeyboardShortcutHint', () => {
  test('renders shortcut and action, with optional parens', async () => {
    const plain = await frame(<Text><KeyboardShortcutHint shortcut="ctrl+o" action="expand" /></Text>);
    expect(plain).toContain('ctrl+o');
    expect(plain).toContain('expand');
    const parens = await frame(<Text><KeyboardShortcutHint shortcut="esc" action="cancel" parens /></Text>);
    expect(parens).toContain('(');
    expect(parens).toContain(')');
  });
});

describe('Badge', () => {
  test('wraps the label in brackets by default', async () => {
    expect(await frame(<Text><Badge label="beta" /></Text>)).toContain('[beta]');
  });
  test('omits brackets when disabled', async () => {
    const out = await frame(<Text><Badge label="beta" brackets={false} /></Text>);
    expect(out).toContain('beta');
    expect(out).not.toContain('[beta]');
  });
});

describe('Divider', () => {
  test('draws a rule of the given width', async () => {
    const out = await frame(<Divider width={10} />);
    expect(out).toContain('─'.repeat(10));
  });
  test('embeds a left-aligned title', async () => {
    const out = await frame(<Divider width={40} title="Settings" />);
    expect(out).toContain('Settings');
    expect(out).toContain('─');
  });
});

describe('ListItem', () => {
  test('shows the focus pointer when focused', async () => {
    expect(await frame(<ListItem isFocused label="Overview" />)).toContain('❯');
  });
  test('shows the check when selected and not focused', async () => {
    const out = await frame(<ListItem isFocused={false} isSelected label="Model" />);
    expect(out).toContain('✓');
    expect(out).toContain('Model');
  });
  test('renders an optional description', async () => {
    const out = await frame(<ListItem isFocused={false} label="Voice" description="TTS settings" />);
    expect(out).toContain('Voice');
    expect(out).toContain('TTS settings');
  });
});

describe('Pane', () => {
  test('renders title, count, hints and children', async () => {
    const out = await frame(
      <Pane title="Skills" count={3} hints="[n]ew">
        <Text>body line</Text>
      </Pane>,
      60,
      8,
    );
    expect(out).toContain('Skills');
    expect(out).toContain('(3)');
    expect(out).toContain('[n]ew');
    expect(out).toContain('body line');
  });
});
