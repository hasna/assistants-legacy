import React, { useState, useEffect } from 'react';
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
    <box>
      <text fg={muted}>{DOTS[frame]}</text>
      {label && <text fg={muted}> {label}</text>}
    </box>
  );
}
