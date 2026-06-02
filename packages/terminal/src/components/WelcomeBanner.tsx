/** @jsxImportSource react */
import React from 'react';
import { Box, Text } from '../ui/ink';
import { themeColor } from '../theme/colors';

/**
 * Welcome banner — renders centered "hasna" text (no ASCII art).
 * Parent layout handles overall positioning (vertical centering, etc.).
 */
export function WelcomeBanner() {
  return (
    <Box flexDirection="column" alignItems="center">
      <Text fg={themeColor('muted')} bold>hasna</Text>
    </Box>
  );
}
