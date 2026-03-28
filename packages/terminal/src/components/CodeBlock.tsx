import React, { useMemo } from 'react';
import { SyntaxStyle, RGBA } from '@opentui/core';
import type { ToolCall } from '@hasna/assistants-shared';
import { themeColor } from '../theme/colors';

/**
 * Map file extensions to Tree-Sitter filetype identifiers
 */
const EXT_TO_FILETYPE: Record<string, string> = {
  // JavaScript / TypeScript
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  // Web
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'css',
  less: 'css',
  // Data
  json: 'json',
  jsonc: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  // Systems
  rs: 'rust',
  go: 'go',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  // Scripting
  py: 'python',
  rb: 'ruby',
  lua: 'lua',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',
  // JVM
  java: 'java',
  kt: 'kotlin',
  scala: 'scala',
  // Other
  md: 'markdown',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  dockerfile: 'dockerfile',
  swift: 'swift',
  zig: 'zig',
  elixir: 'elixir',
  ex: 'elixir',
  exs: 'elixir',
  php: 'php',
};

/**
 * Create a default syntax style for code highlighting.
 * Cached as a module-level singleton since it doesn't change.
 */
let _cachedSyntaxStyle: SyntaxStyle | null = null;
let _syntaxStyleFailed = false;

function getDefaultSyntaxStyle(): SyntaxStyle | null {
  if (_syntaxStyleFailed) return null;
  if (_cachedSyntaxStyle) return _cachedSyntaxStyle;
  try {
    _cachedSyntaxStyle = SyntaxStyle.fromStyles({
      keyword: { fg: RGBA.fromHex('#c792ea'), bold: true },
      string: { fg: RGBA.fromHex('#c3e88d') },
      comment: { fg: RGBA.fromHex('#636d83'), italic: true },
      number: { fg: RGBA.fromHex('#f78c6c') },
      type: { fg: RGBA.fromHex('#ffcb6b') },
      function: { fg: RGBA.fromHex('#82aaff') },
      variable: { fg: RGBA.fromHex('#a6accd') },
      operator: { fg: RGBA.fromHex('#89ddff') },
      punctuation: { fg: RGBA.fromHex('#89ddff') },
      property: { fg: RGBA.fromHex('#f07178') },
      constant: { fg: RGBA.fromHex('#ff5370') },
      tag: { fg: RGBA.fromHex('#f07178') },
      attribute: { fg: RGBA.fromHex('#ffcb6b') },
      default: { fg: RGBA.fromHex('#a6accd') },
    });
    return _cachedSyntaxStyle;
  } catch {
    // SyntaxStyle requires native Zig bindings — fall back gracefully in test environments
    _syntaxStyleFailed = true;
    return null;
  }
}

/**
 * Extract filetype from a file path based on its extension
 */
export function getFiletypeFromPath(filePath: string): string | undefined {
  // Handle special filenames
  const base = filePath.split('/').pop() || '';
  const lower = base.toLowerCase();

  if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) return 'dockerfile';
  if (lower === 'makefile' || lower === 'gnumakefile') return 'bash';
  if (lower === '.gitignore' || lower === '.dockerignore') return 'bash';
  if (lower === '.env' || lower.startsWith('.env.')) return 'bash';

  const dotIndex = base.lastIndexOf('.');
  if (dotIndex === -1) return undefined;

  const ext = base.slice(dotIndex + 1).toLowerCase();
  return EXT_TO_FILETYPE[ext];
}

/**
 * Determine the filetype for a tool call's result content
 */
export function getFiletypeForToolResult(toolCall: ToolCall): string | undefined {
  const { name, input } = toolCall;

  switch (name) {
    case 'read': {
      const path = String(input.file_path || input.path || '');
      return getFiletypeFromPath(path);
    }
    case 'write': {
      const path = String(input.file_path || input.path || input.filename || '');
      return getFiletypeFromPath(path);
    }
    case 'bash':
      return 'bash';
    case 'grep':
      // Grep output isn't really a language, but bash highlighting works okay
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Determine whether a tool result should be rendered with syntax highlighting.
 * Returns false for short/simple outputs, errors, and non-code content.
 */
export function shouldHighlightToolResult(
  toolName: string | undefined,
  content: string,
  isError?: boolean,
): boolean {
  // Never highlight errors
  if (isError) return false;

  // Never highlight empty or very short content
  if (!content || content.length < 40) return false;

  // Only highlight specific tools
  const highlightableTools = new Set(['read', 'bash', 'write']);
  if (!toolName || !highlightableTools.has(toolName)) return false;

  // For bash, only highlight if output has multiple lines (looks like real output)
  if (toolName === 'bash') {
    const lines = content.split('\n');
    return lines.length >= 3;
  }

  // For read, always highlight if content is long enough (it's file content)
  if (toolName === 'read') {
    return content.split('\n').length >= 2;
  }

  return false;
}

interface CodeBlockProps {
  content: string;
  filetype?: string;
  maxHeight?: number;
}

/**
 * Renders syntax-highlighted code using OpenTUI's native <code> component.
 * Falls back to plain <text> if SyntaxStyle is unavailable (e.g. in tests).
 */
export function CodeBlock({ content, filetype, maxHeight }: CodeBlockProps) {
  const syntaxStyle = useMemo(() => getDefaultSyntaxStyle(), []);

  // Fall back to dim plain text when native syntax highlighting is unavailable
  if (!syntaxStyle) {
    return <text fg={themeColor('muted')}>{content}</text>;
  }

  return (
    <code
      content={content}
      filetype={filetype || 'text'}
      syntaxStyle={syntaxStyle}
      drawUnstyledText={true}
      width="100%"
      {...(maxHeight ? { maxHeight } : {})}
    />
  );
}
