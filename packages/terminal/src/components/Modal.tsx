/** @jsxImportSource react */
import React from 'react';
import { Box, Text, useInput, useWindowSize } from '../ui/ink';
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
 *     <Select options={models} onSelect={...} />
 *   </Modal>
 */
export function Modal({ visible, onClose, title, children, width, height }: ModalProps) {
  const { columns, rows } = useWindowSize();
  const termWidth = columns || 80;
  const termHeight = rows || 24;

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
  const emphasizedColor = themeColor('emphasized'); // textEmphasized

  // Calculate content box dimensions (60% default per spec)
  const boxWidth = Math.min(termWidth, width ?? Math.max(40, Math.floor(termWidth * 0.6)));
  const boxHeight = Math.min(termHeight, height ?? Math.max(10, Math.floor(termHeight * 0.6)));

  return (
    <Box
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      width={termWidth}
      height={termHeight}
    >
      {/* Centered content box with rounded border */}
      <Box
        flexDirection="column"
        width={boxWidth}
        height={boxHeight}
        backgroundColor={bgColor}
        borderStyle="round"
        borderColor={borderColor}
        padding={1}
        paddingX={2}
      >
        {/* Title bar — textEmphasized color, padded */}
        {title && (
          <Box marginBottom={1}>
            <Text fg={emphasizedColor}>{title} (Esc to close)</Text>
          </Box>
        )}

        {/* Content area */}
        <Box flexGrow={1} flexDirection="column">
          {children}
        </Box>
      </Box>
    </Box>
  );
}
