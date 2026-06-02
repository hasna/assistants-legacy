/** @jsxImportSource react */
import React, { useEffect, useRef, useState } from 'react';
import { readFileSync, existsSync } from 'fs';
import { themeColor } from '../theme/colors';
import { Box, Text } from '../ui/ink';

interface TerminalImageProps {
  src: string;
  width?: number;
  height?: number;
  alt?: string;
}

/**
 * Renders an image in the terminal using the Kitty graphics protocol.
 * Supported by: Ghostty, Kitty, WezTerm, and other modern terminals.
 *
 * Falls back to [Image: alt] text on terminals that don't support it.
 *
 * Protocol spec: https://sw.kovidgoyal.net/kitty/graphics-protocol/
 */
export function TerminalImage({ src, width, height, alt }: TerminalImageProps) {
  const [status, setStatus] = useState<'loading' | 'rendered' | 'fallback'>('loading');
  const renderedRef = useRef(false);

  useEffect(() => {
    if (renderedRef.current) return;
    renderedRef.current = true;

    try {
      // Read the image file
      if (!existsSync(src)) {
        setStatus('fallback');
        return;
      }

      const imageData = readFileSync(src);
      const base64Data = imageData.toString('base64');

      // Detect format from extension
      const ext = src.toLowerCase().split('.').pop();
      const format = ext === 'png' ? 100 : ext === 'jpg' || ext === 'jpeg' ? 0 : ext === 'gif' ? 0 : 100;

      // Send via Kitty graphics protocol using chunked transfer
      // ESC_G with a=T (transmit+display), f=format, m=1 (more chunks coming)
      const ESC = '\x1b';
      const chunkSize = 4096;

      for (let i = 0; i < base64Data.length; i += chunkSize) {
        const chunk = base64Data.slice(i, i + chunkSize);
        const isFirst = i === 0;
        const isLast = i + chunkSize >= base64Data.length;
        const moreChunks = isLast ? 0 : 1;

        let controlData = `m=${moreChunks}`;
        if (isFirst) {
          controlData = `a=T,f=${format}`;
          if (width) controlData += `,c=${width}`;
          if (height) controlData += `,r=${height}`;
          controlData += `,m=${moreChunks}`;
        }

        process.stdout.write(`${ESC}_G${controlData};${chunk}${ESC}\\`);
      }

      // Add a newline after the image so text doesn't overlap
      process.stdout.write('\n');
      setStatus('rendered');
    } catch {
      setStatus('fallback');
    }
  }, [src, width, height]);

  if (status === 'rendered') {
    // Image was written directly to stdout — show alt text below
    return alt ? (
      <Box marginY={1}>
        <Text fg={themeColor('muted')}>{alt}</Text>
      </Box>
    ) : null;
  }

  if (status === 'fallback') {
    return (
      <Box marginY={1}>
        <Text fg={themeColor('muted')}>[Image: {alt || src}]</Text>
      </Box>
    );
  }

  // Loading
  return (
    <Box marginY={1}>
      <Text fg={themeColor('muted')}>Loading image...</Text>
    </Box>
  );
}
