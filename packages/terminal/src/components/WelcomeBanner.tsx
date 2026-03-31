import React from 'react';
import { themeColor } from '../theme/colors';

interface WelcomeBannerProps {
  /** unused — kept for backward compat */
  version?: string;
  model?: string;
  directory?: string;
}

/**
 * Welcome banner — renders centered "hasna" text (no ASCII art).
 * Parent layout handles overall positioning (vertical centering, etc.).
 */
export function WelcomeBanner(_props: WelcomeBannerProps) {
  return (
    <box flexDirection="column" alignItems="center">
      <text fg={themeColor('muted')} attributes={1}>hasna</text>
    </box>
  );
}
