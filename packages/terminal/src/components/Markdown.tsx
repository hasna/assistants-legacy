import React from 'react';

interface MarkdownProps {
  content: string;
  /** @deprecated No longer needed — OpenTUI handles all markdown rendering natively. */
  preRendered?: boolean;
  /** @deprecated No longer used — OpenTUI handles width internally. */
  indent?: number;
}

/**
 * Renders markdown content using OpenTUI's native `<markdown>` intrinsic.
 *
 * This delegates all formatting (headers, bold, italic, code blocks, tables,
 * lists, links) to OpenTUI's MarkdownRenderable which handles it natively
 * in the terminal — no chalk or marked dependencies needed.
 */
export function Markdown({ content }: MarkdownProps) {
  if (!content) return null;
  return <markdown content={content} conceal />;
}

/**
 * Pre-render markdown to plain text for line-counting and sizing.
 *
 * With OpenTUI handling rendering natively, this just returns the raw text.
 * Consumers use this for estimating display height, not for actual rendering.
 */
export function renderMarkdown(text: string, _options?: { maxWidth?: number }): string {
  return text.trimEnd();
}
