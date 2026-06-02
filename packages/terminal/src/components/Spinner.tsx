import React, { useState, useEffect } from 'react';
import { Box, Text } from '../ui/ink';
import { themeColor } from '../theme/colors';

const DOTS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

interface SpinnerProps {
  label?: string;
}

export function Spinner({ label }: SpinnerProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % DOTS.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  const muted = themeColor('muted');

  return (
    <Box>
      <Text fg={muted}>{DOTS[frame]}</Text>
      {label ? <Text fg={muted}> {label}</Text> : null}
    </Box>
  );
}
