import React from 'react';
import { describe, expect, test } from 'bun:test';
import {
  Bold,
  Box,
  Inline,
  Text,
  renderToString,
  useApp,
  useInput,
  useWindowSize,
} from '../src/ui/ink';

describe('src/ui/ink public module', () => {
  test('renders with upstream Ink components through the migration facade', () => {
    const output = renderToString(
      <Box border={['top', 'bottom']} borderStyle="single" width={12}>
        <Text fg="red" attributes={1}>
          Hello <Inline fg="blue">Ink</Inline>
          <Bold>!</Bold>
        </Text>
      </Box>,
    );

    expect(output).toContain('Hello Ink!');
    expect(output.split('\n')).toHaveLength(3);
  });

  test('maps local text aliases to Ink props without retired renderer imports', () => {
    const output = renderToString(
      <Text fg="#ff0000" bg="#000000" wrapMode="word">
        aliased text
      </Text>,
    );

    expect(output).toContain('aliased text');
  });

  test('re-exports upstream Ink hooks used by migrated components', () => {
    expect(typeof useApp).toBe('function');
    expect(typeof useInput).toBe('function');
    expect(typeof useWindowSize).toBe('function');
  });
});
