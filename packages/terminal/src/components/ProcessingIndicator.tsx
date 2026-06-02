import React, { useState, useEffect, useMemo } from 'react';
import { getRandomLoadingWord } from '@hasna/assistants-shared';
import { Box, Text } from '../ui/ink';
import { themeColor } from '../theme/colors';

interface ProcessingIndicatorProps {
  isProcessing: boolean;
  startTime?: number;
  tokenCount?: number;
  isThinking?: boolean;
}

export function ProcessingIndicator({
  isProcessing,
  startTime,
  tokenCount = 0,
  isThinking = false,
}: ProcessingIndicatorProps) {
  const [elapsed, setElapsed] = useState(0);
  // Pick a random loading word when processing starts, keep it stable during the session
  const loadingWord = useMemo(() => getRandomLoadingWord(), [isProcessing]);

  // Update elapsed time every second
  useEffect(() => {
    if (!isProcessing || !startTime) {
      setElapsed(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    // Set initial value
    setElapsed(Math.floor((Date.now() - startTime) / 1000));

    return () => clearInterval(interval);
  }, [isProcessing, startTime]);

  if (!isProcessing) {
    return null;
  }

  // Format elapsed time
  const formatTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  // Format token count
  const formatTokens = (tokens: number): string => {
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}k`;
    }
    return String(tokens);
  };

  const parts: string[] = [];
  parts.push('esc to interrupt');
  if (startTime) {
    parts.push(formatTime(elapsed));
    parts.push(`↓ ${formatTokens(tokenCount)} tokens`);
  }

  const label = loadingWord;

  const muted = themeColor('muted');

  return (
    <Box marginY={1} flexDirection="row">
      <Text fg={muted}>✶ </Text>
      <Text fg={muted}> {label}... </Text>
      <Text fg={muted}>({parts.join(' · ')})</Text>
    </Box>
  );
}
