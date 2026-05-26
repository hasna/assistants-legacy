import React from 'react';
import { themeColor } from '../../theme/colors';
import type { VimMode } from './vimTextareaAdapter';

/**
 * A small mode badge for the prompt when vim mode is enabled — `NORMAL` in the
 * primary color, `INSERT` in success. Renders an inline `<span>` (place inside a
 * `<text>`).
 */
export function VimStatusIndicator({ mode }: { mode: VimMode }) {
  const tone = mode === 'INSERT' ? themeColor('success') : themeColor('primary');
  return <span fg={tone}><b>{` ${mode} `}</b></span>;
}
