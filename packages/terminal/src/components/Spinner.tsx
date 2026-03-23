import React, { useState, useEffect } from 'react';

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

  return (
    <box>
      <text fg="gray">{DOTS[frame]}</text>
      {label && <text fg="gray"> {label}</text>}
    </box>
  );
}
