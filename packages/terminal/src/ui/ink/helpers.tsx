/** @jsxImportSource react */
import React from 'react';
import type { ReactNode } from 'react';
import { Text, Inline, type TextProps } from './index';
import { useInkThemeColor } from './theme';

function clampWidth(width: number): number {
  return Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
}

export type DividerProps = {
  width?: number;
  label?: string;
  char?: string;
  color?: string;
  labelColor?: string;
};

export function Divider({
  width = 80,
  label,
  char = '─',
  color,
  labelColor,
}: DividerProps): React.JSX.Element {
  const lineColor = color ?? useInkThemeColor('borderDim');
  const resolvedLabelColor = labelColor ?? useInkThemeColor('text');
  const targetWidth = clampWidth(width);
  const lineChar = char || '─';

  if (!label) {
    return <Text fg={lineColor}>{lineChar.repeat(targetWidth)}</Text>;
  }

  const paddedLabel = ` ${label} `;
  const remaining = clampWidth(targetWidth - paddedLabel.length);
  const left = Math.floor(remaining / 2);
  const right = remaining - left;

  return (
    <Text>
      <Inline fg={lineColor}>{lineChar.repeat(left)}</Inline>
      <Inline fg={resolvedLabelColor} attributes={1}>{paddedLabel}</Inline>
      <Inline fg={lineColor}>{lineChar.repeat(right)}</Inline>
    </Text>
  );
}

export type RawAnsiProps = {
  children?: ReactNode;
  wrap?: TextProps['wrap'];
};

export function RawAnsi({ children, wrap }: RawAnsiProps): React.JSX.Element | null {
  return <Text wrap={wrap}>{children}</Text>;
}

export type BlankLinesProps = {
  count?: number;
};

export function BlankLines({ count = 1 }: BlankLinesProps): React.JSX.Element {
  return <Text>{'\n'.repeat(clampWidth(count))}</Text>;
}

export const BorderLine = Divider;
