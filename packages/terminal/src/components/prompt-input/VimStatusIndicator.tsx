import React from 'react';
import { Text } from '../../ui/ink';
import { themeColor } from '../../theme/colors';
import type { VimMode } from './vimTextareaAdapter';

/**
 * A small mode badge for the prompt when vim mode is enabled.
 */
export function VimStatusIndicator({ mode }: { mode: VimMode }) {
  const tone = mode === 'INSERT' ? themeColor('success') : themeColor('primary');
  return <Text fg={tone} bold>{` ${mode} `}</Text>;
}
