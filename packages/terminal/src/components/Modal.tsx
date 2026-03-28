import React, { useEffect } from 'react';
import { useTerminalDimensions } from '@opentui/react';
import { useSafeInput as useInput } from '../hooks/useSafeInput';

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Width of the content box (default: 50% of terminal width, min 40) */
  width?: number;
  /** Height of the content box (default: auto based on content) */
  height?: number;
}

/**
 * Full-screen modal overlay for terminal UI.
 *
 * Renders a semi-transparent dark background with a centered content box.
 * Captures Escape key to dismiss. Uses zIndex=100 for overlay rendering
 * and position="absolute" for overlay positioning.
 *
 * Usage:
 *   <Modal visible={show} onClose={() => setShow(false)} title="Select Model">
 *     <select options={models} onSelect={...} />
 *   </Modal>
 */
export function Modal({ visible, onClose, title, children, width, height }: ModalProps) {
  const dims = useTerminalDimensions();
  const termWidth = dims.width || 80;
  const termHeight = dims.height || 24;

  // Escape key dismisses the modal
  useInput((_input, key) => {
    if (key.escape) {
      onClose();
    }
  }, { isActive: visible });

  if (!visible) return null;

  // Calculate content box dimensions
  const boxWidth = width ?? Math.max(40, Math.floor(termWidth * 0.5));
  const boxHeight = height ?? Math.max(10, Math.floor(termHeight * 0.6));

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width={termWidth}
      height={termHeight}
      zIndex={100}
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
    >
      {/* Semi-transparent dark background overlay */}
      <box
        position="absolute"
        top={0}
        left={0}
        width={termWidth}
        height={termHeight}
        backgroundColor="#000000"
        opacity={0.7}
        zIndex={100}
      />

      {/* Centered content box */}
      <box
        flexDirection="column"
        width={boxWidth}
        height={boxHeight}
        zIndex={101}
        backgroundColor="#1a1a2e"
        borderStyle="rounded"
        borderColor="#555577"
        padding={1}
        paddingX={2}
      >
        {/* Title bar */}
        {title && (
          <box marginBottom={1}>
            <text fg="#7777ff"><b>{title}</b></text>
            <text fg="#555555">{' '}(Esc to close)</text>
          </box>
        )}

        {/* Content area */}
        <box flexGrow={1} flexDirection="column">
          {children}
        </box>
      </box>
    </box>
  );
}
