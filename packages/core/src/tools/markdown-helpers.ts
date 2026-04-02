import { resolve, join, dirname, extname } from 'path';
import { homedir } from 'os';
import { readFile, writeFile, stat } from 'fs/promises';
import type { Tool } from '@hasna/assistants-shared';
import type { ToolExecutor, ToolRegistry } from './registry';
import { ErrorCodes, ToolExecutionError } from '../errors';
import { validatePath } from '../validation/paths';
import { isPathSafe } from '../security/path-validator';
import { getSecurityLogger } from '../security/logger';
import { exceedsFileReadLimit, getLimits } from '../validation/limits';
import { getRuntime } from '../runtime';

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import { visit } from 'unist-util-visit';
import { headingRange } from 'mdast-util-heading-range';
import matter from 'gray-matter';

import type { Root, Heading, Code, Link, Image, Table, Blockquote, ListItem, Text, PhrasingContent } from 'mdast';
import type { Node } from 'unist';

// ============================================
// Shared Helpers
// ============================================

export function resolveInputPath(baseCwd: string, inputPath: string): string {
  const envHome = process.env.HOME || process.env.USERPROFILE;
  const home = envHome && envHome.trim().length > 0 ? envHome : homedir();
  if (inputPath === '~') return home;
  if (inputPath.startsWith('~/')) return resolve(home, inputPath.slice(2));
  return resolve(baseCwd, inputPath);
}

export async function resolveAndValidate(
  rawPath: string,
  baseCwd: string,
  toolName: string,
  input: Record<string, unknown>,
  mode: 'read' | 'write' = 'read',
): Promise<string> {
  if (!rawPath) {
    throw new ToolExecutionError('File path is required', {
      toolName,
      toolInput: input,
      code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
      recoverable: false,
      retryable: false,
      suggestion: 'Provide a valid file path.',
    });
  }

  const path = resolveInputPath(baseCwd, rawPath);

  const safety = await isPathSafe(path, mode, { cwd: baseCwd });
  if (!safety.safe) {
    getSecurityLogger().log({
      eventType: 'path_violation',
      severity: 'high',
      details: { tool: toolName, path, reason: safety.reason || 'Blocked path' },
      sessionId: (input.sessionId as string) || 'unknown',
    });
    throw new ToolExecutionError(safety.reason || 'Blocked path', {
      toolName,
      toolInput: input,
      code: ErrorCodes.TOOL_PERMISSION_DENIED,
      recoverable: false,
      retryable: false,
    });
  }

  const validated = await validatePath(path, { allowSymlinks: true });
  if (!validated.valid) {
    throw new ToolExecutionError(validated.error || 'Invalid path', {
      toolName,
      toolInput: input,
      code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
      recoverable: false,
      retryable: false,
      suggestion: 'Provide a valid file path.',
    });
  }

  return validated.resolved;
}

export async function readMarkdownFile(
  resolvedPath: string,
  toolName: string,
  input: Record<string, unknown>,
): Promise<string> {
  const runtime = getRuntime();
  const file = runtime.file(resolvedPath);
  if (!(await file.exists())) {
    throw new ToolExecutionError(`File not found: ${resolvedPath}`, {
      toolName,
      toolInput: input,
      code: ErrorCodes.TOOL_EXECUTION_FAILED,
      recoverable: false,
      retryable: false,
      suggestion: 'Check the file path and try again.',
    });
  }

  const limits = getLimits();
  if (exceedsFileReadLimit(file.size, limits.maxFileReadSize)) {
    throw new ToolExecutionError(`File exceeds size limit (${limits.maxFileReadSize} bytes)`, {
      toolName,
      toolInput: input,
      code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
      recoverable: false,
      retryable: false,
      suggestion: 'Use a smaller file.',
    });
  }

  return file.text();
}

export function parseMarkdown(content: string): Root {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter, ['yaml', 'toml']);
  return processor.parse(content) as Root;
}

export function stringifyMarkdown(tree: Root): string {
  const processor = unified()
    .use(remarkStringify, {
      bullet: '-',
      emphasis: '*',
      strong: '*',
      listItemIndent: 'one',
    })
    .use(remarkGfm)
    .use(remarkFrontmatter, ['yaml', 'toml']);
  return processor.stringify(tree);
}

export interface HeadingNode {
  depth: number;
  text: string;
  line: number;
  children: HeadingNode[];
}

export function getHeadingText(heading: Heading): string {
  const parts: string[] = [];
  for (const child of heading.children) {
    if ('value' in child) {
      parts.push((child as Text).value);
    } else if ('children' in child) {
      for (const grandChild of (child as { children: PhrasingContent[] }).children) {
        if ('value' in grandChild) {
          parts.push((grandChild as Text).value);
        }
      }
    }
  }
  return parts.join('');
}

export function getHeadingTree(tree: Root): HeadingNode[] {
  const headings: { depth: number; text: string; line: number }[] = [];

  visit(tree, 'heading', (node: Heading) => {
    headings.push({
      depth: node.depth,
      text: getHeadingText(node),
      line: node.position?.start.line ?? 0,
    });
  });

  const result: HeadingNode[] = [];
  const stack: HeadingNode[] = [];

  for (const h of headings) {
    const node: HeadingNode = { depth: h.depth, text: h.text, line: h.line, children: [] };

    while (stack.length > 0 && stack[stack.length - 1].depth >= h.depth) {
      stack.pop();
    }

    if (stack.length === 0) {
      result.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }

  return result;
}

export function extractSection(
  content: string,
  headingText: string,
  includeChildren: boolean,
): string | null {
  const lines = content.split('\n');
  const headingRegex = /^(#{1,6})\s+(.+)$/;

  let startLine = -1;
  let startDepth = 0;
  let endLine = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(headingRegex);
    if (!match) continue;

    const depth = match[1].length;
    const text = match[2].trim();

    if (startLine === -1) {
      if (text === headingText || text.match(new RegExp(headingText, 'i'))) {
        startLine = i;
        startDepth = depth;
        continue;
      }
    } else {
      if (!includeChildren && depth >= startDepth && depth > startDepth) {
        continue;
      }
      if (depth <= startDepth) {
        endLine = i;
        break;
      }
    }
  }

  if (startLine === -1) return null;

  return lines.slice(startLine, endLine).join('\n');
}

export function formatHeadingTree(headings: HeadingNode[], indent: number = 0): string {
  const lines: string[] = [];
  for (const h of headings) {
    const prefix = '  '.repeat(indent);
    lines.push(`${prefix}${'#'.repeat(h.depth)} ${h.text} (line ${h.line})`);
    if (h.children.length > 0) {
      lines.push(formatHeadingTree(h.children, indent + 1));
    }
  }
  return lines.join('\n');
}

export function getNodeText(node: Node): string {
  if ('value' in node) return (node as { value: string }).value;
  if ('children' in node) {
    return ((node as { children: Node[] }).children)
      .map(getNodeText)
      .join('');
  }
  return '';
}

// ============================================
// Tool Definitions and Executors
// ============================================

