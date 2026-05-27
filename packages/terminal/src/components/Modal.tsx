import React, { useEffect } from 'react';
import { useTerminalDimensions } from '@opentui/react';
import { useSafeInput as useInput } from '../hooks/useSafeInput';
import { themeColor } from '../theme/colors';

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Width of the content box (default: 60% of terminal width, min 40) */
  width?: number;
  /** Height of the content box (default: 60% of terminal height, min 10) */
  height?: number;
}

/**
 * Full-screen modal overlay for terminal UI.
 *
 * Per OpenCode spec (section 2.3 + 8):
 * - Overlay positioned using PlaceOverlay: centered on screen
 * - Shadow: "░" characters in borderDim color, offset 2 cells right and 1 row down
 * - Content box: borderNormal border, rounded style, background color
 * - Title in textEmphasized, padded
 * - Inner padding: 1 vertical, 2 horizontal
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

  // Theme colors
  const bgColor = themeColor('bg');
  const borderColor = themeColor('border');       // borderNormal
  const borderDimColor = themeColor('borderDim');
  const emphasizedColor = themeColor('emphasized'); // textEmphasized

  // Calculate content box dimensions (60% default per spec)
  const boxWidth = width ?? Math.max(40, Math.floor(termWidth * 0.6));
  const boxHeight = height ?? Math.max(10, Math.floor(termHeight * 0.6));

  // PlaceOverlay centering formula: row = H/2 - h/2, col = W/2 - w/2
  const overlayTop = Math.max(0, Math.floor(termHeight / 2 - boxHeight / 2));
  const overlayLeft = Math.max(0, Math.floor(termWidth / 2 - boxWidth / 2));

  // Shadow dimensions: 2 cells right, 1 row bottom
  const shadowOffsetX = 2;
  const shadowOffsetY = 1;

  // Build the shadow string: "░" characters filling box dimensions, offset
  const shadowChar = '░';
  const shadowRows: string[] = [];
  // First row of shadow is invisible (background-colored spaces)
  shadowRows.push(' '.repeat(boxWidth));
  // Remaining rows: shadow characters
  for (let r = 0; r < boxHeight; r++) {
    shadowRows.push(shadowChar.repeat(boxWidth));
  }

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width={termWidth}
      height={termHeight}
      zIndex={100}
    >
      {/* Shadow layer — offset right and down from content box */}
      <box
        position="absolute"
        top={overlayTop + shadowOffsetY}
        left={overlayLeft + shadowOffsetX}
        width={boxWidth}
        height={boxHeight + 1}
        zIndex={100}
      >
        <text fg={borderDimColor} bg={bgColor}>{shadowRows.join('\n')}</text>
      </box>

      {/* Centered content box with rounded border */}
      <box
        position="absolute"
        top={overlayTop}
        left={overlayLeft}
        flexDirection="column"
        width={boxWidth}
        height={boxHeight}
        zIndex={101}
        backgroundColor={bgColor}
        borderStyle="rounded"
        borderColor={borderColor}
        padding={1}
        paddingX={2}
      >
        {/* Title bar — textEmphasized color, padded */}
        {title && (
          <box marginBottom={1}>
            <text fg={emphasizedColor}>{title} (Esc to close)</text>
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
