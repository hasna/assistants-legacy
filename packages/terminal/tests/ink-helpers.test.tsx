import React from 'react';
import { describe, expect, test } from 'bun:test';
import {
  BlankLines,
  BorderLine,
  Divider,
  InkThemeProvider,
  RawAnsi,
  renderToString,
} from '../src/ui/ink';

describe('Ink helper primitives', () => {
  test('renders an unlabeled divider at a stable width', () => {
    const output = renderToString(<Divider width={8} char="-" color="white" />);

    expect(output).toBe('--------');
  });

  test('renders a labeled border line without changing width', () => {
    const output = renderToString(
      <InkThemeProvider initialTheme="dark">
        <BorderLine width={12} label="Logs" char="-" color="white" labelColor="white" />
      </InkThemeProvider>,
    );

    expect(output).toBe('--- Logs ---');
  });

  test('preserves raw ANSI sequences through Ink rendering', () => {
    const output = renderToString(<RawAnsi>{'\x1b[31mred\x1b[0m'}</RawAnsi>);

    expect(output).toContain('\x1b[31mred');
  });

  test('renders requested blank lines', () => {
    const output = renderToString(<BlankLines count={2} />);

    expect(output).toBe('\n\n');
  });
});
