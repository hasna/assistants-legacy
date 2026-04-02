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

// Shared helper functions
import {
  resolveInputPath, parseMarkdown, stringifyMarkdown, getHeadingText,
  getHeadingTree, extractSection, formatHeadingTree, getNodeText,
  resolveAndValidate, readMarkdownFile, type HeadingNode,
} from './markdown-helpers';

export class MarkdownTools {
  // ============================================
  // 1. md_read
  // ============================================

  static readonly mdReadTool: Tool = {
    name: 'md_read',
    description:
      'Read a markdown file with structural awareness. Returns frontmatter, heading outline, and content. ' +
      'Optionally extract a specific section by heading text.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the markdown file (absolute or relative to cwd)',
        },
        cwd: {
          type: 'string',
          description: 'Base working directory for relative paths (optional)',
        },
        section: {
          type: 'string',
          description: 'Heading text to extract a specific section (optional)',
        },
        include_children: {
          type: 'boolean',
          description: 'Include sub-headings when extracting a section (default: true)',
        },
      },
      required: ['path'],
    },
  };

  static readonly mdReadExecutor: ToolExecutor = async (input) => {
    const baseCwd = (input.cwd as string) || process.cwd();
    const rawPath = String(input.path || '').trim();
    const section = input.section as string | undefined;
    const includeChildren = input.include_children !== false;

    try {
      const resolvedPath = await resolveAndValidate(rawPath, baseCwd, 'md_read', input);
      const content = await readMarkdownFile(resolvedPath, 'md_read', input);
      const tree = parseMarkdown(content);
      const headings = getHeadingTree(tree);

      const { data: frontmatter } = matter(content);
      const hasFrontmatter = Object.keys(frontmatter).length > 0;

      const result: Record<string, unknown> = {};

      if (hasFrontmatter) {
        result.frontmatter = frontmatter;
      }

      result.outline = formatHeadingTree(headings);

      if (section) {
        const sectionContent = extractSection(content, section, includeChildren);
        if (sectionContent === null) {
          const available = headings.map((h) => h.text);
          throw new ToolExecutionError(
            `Section "${section}" not found. Available headings: ${available.join(', ')}`,
            {
              toolName: 'md_read',
              toolInput: input,
              code: ErrorCodes.TOOL_EXECUTION_FAILED,
              recoverable: false,
              retryable: false,
              suggestion: `Use one of: ${available.join(', ')}`,
            },
          );
        }
        result.content = sectionContent;
      } else {
        result.content = content;
      }

      result.lines = content.split('\n').length;

      return JSON.stringify(result, null, 2);
    } catch (error) {
      if (error instanceof ToolExecutionError) throw error;
      throw new ToolExecutionError(error instanceof Error ? error.message : String(error), {
        toolName: 'md_read',
        toolInput: input,
        code: ErrorCodes.TOOL_EXECUTION_FAILED,
        recoverable: true,
        retryable: false,
      });
    }
  };

  // ============================================
  // 2. md_extract
  // ============================================

  static readonly mdExtractTool: Tool = {
    name: 'md_extract',
    description:
      'Extract specific elements from a markdown file: code blocks, links, images, TODOs (task list items), tables, headings, or blockquotes.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the markdown file',
        },
        cwd: {
          type: 'string',
          description: 'Base working directory for relative paths (optional)',
        },
        selector: {
          type: 'string',
          description: 'Type of element to extract',
          enum: ['code', 'links', 'images', 'todos', 'tables', 'headings', 'blockquotes'],
        },
        language: {
          type: 'string',
          description: 'Filter code blocks by language (only for selector=code)',
        },
        heading: {
          type: 'string',
          description: 'Scope extraction to content under this heading (optional)',
        },
      },
      required: ['path', 'selector'],
    },
  };

  static readonly mdExtractExecutor: ToolExecutor = async (input) => {
    const baseCwd = (input.cwd as string) || process.cwd();
    const rawPath = String(input.path || '').trim();
    const selector = input.selector as string;
    const language = input.language as string | undefined;
    const heading = input.heading as string | undefined;

    try {
      const resolvedPath = await resolveAndValidate(rawPath, baseCwd, 'md_extract', input);
      let content = await readMarkdownFile(resolvedPath, 'md_extract', input);

      // Scope to section if heading specified
      if (heading) {
        const sectionContent = extractSection(content, heading, true);
        if (sectionContent === null) {
          throw new ToolExecutionError(`Section "${heading}" not found`, {
            toolName: 'md_extract',
            toolInput: input,
            code: ErrorCodes.TOOL_EXECUTION_FAILED,
            recoverable: false,
            retryable: false,
          });
        }
        content = sectionContent;
      }

      const tree = parseMarkdown(content);
      const items: Record<string, unknown>[] = [];

      switch (selector) {
        case 'code':
          visit(tree, 'code', (node: Code) => {
            if (language && node.lang !== language) return;
            items.push({
              language: node.lang || null,
              meta: node.meta || null,
              value: node.value,
              line: node.position?.start.line ?? 0,
            });
          });
          break;

        case 'links':
          visit(tree, 'link', (node: Link) => {
            items.push({
              url: node.url,
              title: node.title || null,
              text: getNodeText(node),
              line: node.position?.start.line ?? 0,
            });
          });
          break;

        case 'images':
          visit(tree, 'image', (node: Image) => {
            items.push({
              url: node.url,
              alt: node.alt || null,
              title: node.title || null,
              line: node.position?.start.line ?? 0,
            });
          });
          break;

        case 'todos':
          visit(tree, 'listItem', (node: ListItem) => {
            if (node.checked === null || node.checked === undefined) return;
            items.push({
              checked: node.checked,
              text: getNodeText(node).trim(),
              line: node.position?.start.line ?? 0,
            });
          });
          break;

        case 'tables':
          visit(tree, 'table', (node: Table) => {
            const rows: string[][] = [];
            for (const row of node.children) {
              const cells: string[] = [];
              for (const cell of row.children) {
                cells.push(getNodeText(cell).trim());
              }
              rows.push(cells);
            }
            items.push({
              rows,
              line: node.position?.start.line ?? 0,
            });
          });
          break;

        case 'headings':
          visit(tree, 'heading', (node: Heading) => {
            items.push({
              depth: node.depth,
              text: getHeadingText(node),
              line: node.position?.start.line ?? 0,
            });
          });
          break;

        case 'blockquotes':
          visit(tree, 'blockquote', (node: Blockquote) => {
            items.push({
              text: getNodeText(node).trim(),
              line: node.position?.start.line ?? 0,
            });
          });
          break;

        default:
          throw new ToolExecutionError(
            `Invalid selector: ${selector}. Use one of: code, links, images, todos, tables, headings, blockquotes`,
            {
              toolName: 'md_extract',
              toolInput: input,
              code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
              recoverable: false,
              retryable: false,
            },
          );
      }

      return JSON.stringify({ selector, count: items.length, items }, null, 2);
    } catch (error) {
      if (error instanceof ToolExecutionError) throw error;
      throw new ToolExecutionError(error instanceof Error ? error.message : String(error), {
        toolName: 'md_extract',
        toolInput: input,
        code: ErrorCodes.TOOL_EXECUTION_FAILED,
        recoverable: true,
        retryable: false,
      });
    }
  };

  // ============================================
  // 3. md_replace_section
  // ============================================

  static readonly mdReplaceSectionTool: Tool = {
    name: 'md_replace_section',
    description:
      'Replace the content under a heading in a markdown file. Finds the heading by exact text or regex, ' +
      'replaces everything between it and the next same-level heading.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the markdown file',
        },
        cwd: {
          type: 'string',
          description: 'Base working directory for relative paths (optional)',
        },
        heading: {
          type: 'string',
          description: 'Heading text to find (exact match or regex pattern)',
        },
        content: {
          type: 'string',
          description: 'New markdown content to place under the heading',
        },
        create_if_missing: {
          type: 'boolean',
          description: 'Append the heading and content if not found (default: false)',
        },
      },
      required: ['path', 'heading', 'content'],
    },
  };

  static readonly mdReplaceSectionExecutor: ToolExecutor = async (input) => {
    const baseCwd = (input.cwd as string) || process.cwd();
    const rawPath = String(input.path || '').trim();
    const headingText = input.heading as string;
    const newContent = input.content as string;
    const createIfMissing = (input.create_if_missing as boolean) || false;

    try {
      const resolvedPath = await resolveAndValidate(rawPath, baseCwd, 'md_replace_section', input, 'write');
      const originalContent = await readMarkdownFile(resolvedPath, 'md_replace_section', input);
      const originalLines = originalContent.split('\n').length;

      const lines = originalContent.split('\n');
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
          try {
            if (text === headingText || new RegExp(headingText, 'i').test(text)) {
              startLine = i;
              startDepth = depth;
              continue;
            }
          } catch {
            // If regex is invalid, try exact match only
            if (text === headingText) {
              startLine = i;
              startDepth = depth;
              continue;
            }
          }
        } else {
          if (depth <= startDepth) {
            endLine = i;
            break;
          }
        }
      }

      let resultContent: string;

      if (startLine === -1) {
        if (createIfMissing) {
          const appendContent = `\n${'#'.repeat(2)} ${headingText}\n\n${newContent}\n`;
          resultContent = originalContent.trimEnd() + '\n' + appendContent;
        } else {
          const tree = parseMarkdown(originalContent);
          const available = getHeadingTree(tree).map((h) => h.text);
          throw new ToolExecutionError(
            `Heading "${headingText}" not found. Available: ${available.join(', ')}`,
            {
              toolName: 'md_replace_section',
              toolInput: input,
              code: ErrorCodes.TOOL_EXECUTION_FAILED,
              recoverable: false,
              retryable: false,
              suggestion: `Use one of: ${available.join(', ')}`,
            },
          );
        }
      } else {
        const before = lines.slice(0, startLine + 1);
        const after = lines.slice(endLine);
        resultContent = [...before, '', newContent, '', ...after].join('\n');
      }

      await writeFile(resolvedPath, resultContent, 'utf-8');

      const newLines = resultContent.split('\n').length;
      return JSON.stringify({
        success: true,
        heading: headingText,
        before_lines: originalLines,
        after_lines: newLines,
        path: resolvedPath,
      });
    } catch (error) {
      if (error instanceof ToolExecutionError) throw error;
      throw new ToolExecutionError(error instanceof Error ? error.message : String(error), {
        toolName: 'md_replace_section',
        toolInput: input,
        code: ErrorCodes.TOOL_EXECUTION_FAILED,
        recoverable: true,
        retryable: false,
      });
    }
  };

  // ============================================
  // 4. md_insert
  // ============================================

  static readonly mdInsertTool: Tool = {
    name: 'md_insert',
    description:
      'Insert markdown content at a specific position: before/after a heading, ' +
      'start/end of a section, start/end of file, or at a line number.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the markdown file',
        },
        cwd: {
          type: 'string',
          description: 'Base working directory for relative paths (optional)',
        },
        content: {
          type: 'string',
          description: 'Markdown content to insert',
        },
        position: {
          type: 'string',
          description: 'Where to insert the content',
          enum: [
            'before_heading',
            'after_heading',
            'start_of_section',
            'end_of_section',
            'start_of_file',
            'end_of_file',
          ],
        },
        heading: {
          type: 'string',
          description: 'Target heading for position-based insertion (required for heading/section positions)',
        },
        line: {
          type: 'number',
          description: 'Line number for absolute positioning (1-indexed, overrides position)',
        },
      },
      required: ['path', 'content'],
    },
  };

  static readonly mdInsertExecutor: ToolExecutor = async (input) => {
    const baseCwd = (input.cwd as string) || process.cwd();
    const rawPath = String(input.path || '').trim();
    const insertContent = input.content as string;
    const position = (input.position as string) || 'end_of_file';
    const headingText = input.heading as string | undefined;
    const lineNum = input.line as number | undefined;

    try {
      const resolvedPath = await resolveAndValidate(rawPath, baseCwd, 'md_insert', input, 'write');
      const originalContent = await readMarkdownFile(resolvedPath, 'md_insert', input);
      const lines = originalContent.split('\n');

      let insertIndex: number;

      if (lineNum !== undefined) {
        insertIndex = Math.max(0, Math.min(lineNum - 1, lines.length));
      } else {
        switch (position) {
          case 'start_of_file':
            insertIndex = 0;
            // Skip frontmatter if present
            if (lines[0]?.trim() === '---') {
              for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim() === '---') {
                  insertIndex = i + 1;
                  break;
                }
              }
            }
            break;

          case 'end_of_file':
            insertIndex = lines.length;
            break;

          case 'before_heading':
          case 'after_heading':
          case 'start_of_section':
          case 'end_of_section': {
            if (!headingText) {
              throw new ToolExecutionError(
                `'heading' parameter is required for position '${position}'`,
                {
                  toolName: 'md_insert',
                  toolInput: input,
                  code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
                  recoverable: false,
                  retryable: false,
                },
              );
            }

            const headingRegex = /^(#{1,6})\s+(.+)$/;
            let headingLine = -1;
            let headingDepth = 0;

            for (let i = 0; i < lines.length; i++) {
              const match = lines[i].match(headingRegex);
              if (!match) continue;
              const text = match[2].trim();
              try {
                if (text === headingText || new RegExp(headingText, 'i').test(text)) {
                  headingLine = i;
                  headingDepth = match[1].length;
                  break;
                }
              } catch {
                if (text === headingText) {
                  headingLine = i;
                  headingDepth = match[1].length;
                  break;
                }
              }
            }

            if (headingLine === -1) {
              throw new ToolExecutionError(`Heading "${headingText}" not found`, {
                toolName: 'md_insert',
                toolInput: input,
                code: ErrorCodes.TOOL_EXECUTION_FAILED,
                recoverable: false,
                retryable: false,
              });
            }

            if (position === 'before_heading') {
              insertIndex = headingLine;
            } else if (position === 'after_heading') {
              insertIndex = headingLine + 1;
            } else if (position === 'start_of_section') {
              // After the heading line (+ any blank lines)
              insertIndex = headingLine + 1;
              while (insertIndex < lines.length && lines[insertIndex].trim() === '') {
                insertIndex++;
              }
            } else {
              // end_of_section - find the next same-level heading
              insertIndex = lines.length;
              for (let i = headingLine + 1; i < lines.length; i++) {
                const match = lines[i].match(headingRegex);
                if (match && match[1].length <= headingDepth) {
                  insertIndex = i;
                  break;
                }
              }
            }
            break;
          }

          default:
            throw new ToolExecutionError(`Invalid position: ${position}`, {
              toolName: 'md_insert',
              toolInput: input,
              code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
              recoverable: false,
              retryable: false,
            });
        }
      }

      const before = lines.slice(0, insertIndex);
      const after = lines.slice(insertIndex);
      const resultContent = [...before, insertContent, ...after].join('\n');

      await writeFile(resolvedPath, resultContent, 'utf-8');

      return JSON.stringify({
        success: true,
        position: lineNum ? `line ${lineNum}` : position,
        inserted_lines: insertContent.split('\n').length,
        total_lines: resultContent.split('\n').length,
        path: resolvedPath,
      });
    } catch (error) {
      if (error instanceof ToolExecutionError) throw error;
      throw new ToolExecutionError(error instanceof Error ? error.message : String(error), {
        toolName: 'md_insert',
        toolInput: input,
        code: ErrorCodes.TOOL_EXECUTION_FAILED,
        recoverable: true,
        retryable: false,
      });
    }
  };

  // ============================================
  // 5. md_search
  // ============================================

  static readonly mdSearchTool: Tool = {
    name: 'md_search',
    description:
      'Search markdown files with structural awareness. Search within specific sections, ' +
      'by node type, or with context of the containing heading.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File or directory to search in',
        },
        cwd: {
          type: 'string',
          description: 'Base working directory for relative paths (optional)',
        },
        pattern: {
          type: 'string',
          description: 'Text or regex pattern to search for',
        },
        glob: {
          type: 'string',
          description: 'Glob pattern for files (default: **/*.md)',
        },
        section: {
          type: 'string',
          description: 'Limit search to content under this heading (optional)',
        },
        node_type: {
          type: 'string',
          description: 'Limit search to specific node types',
          enum: ['code', 'text', 'links', 'headings'],
        },
      },
      required: ['path', 'pattern'],
    },
  };

  static readonly mdSearchExecutor: ToolExecutor = async (input) => {
    const baseCwd = (input.cwd as string) || process.cwd();
    const rawPath = String(input.path || '').trim();
    const pattern = input.pattern as string;
    const globPattern = (input.glob as string) || '**/*.md';
    const section = input.section as string | undefined;
    const nodeType = input.node_type as string | undefined;

    try {
      const resolvedPath = await resolveAndValidate(rawPath, baseCwd, 'md_search', input);
      const runtime = getRuntime();

      let regex: RegExp;
      try {
        regex = new RegExp(pattern, 'gi');
      } catch {
        regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      }

      const matches: Record<string, unknown>[] = [];

      // Check if path is a file or directory
      const fileStat = await stat(resolvedPath);
      const files: string[] = [];

      if (fileStat.isDirectory()) {
        for await (const file of runtime.glob(globPattern, { cwd: resolvedPath })) {
          files.push(join(resolvedPath, file));
          if (files.length >= 100) break;
        }
      } else {
        files.push(resolvedPath);
      }

      for (const filePath of files) {
        try {
          const content = await runtime.file(filePath).text();
          let searchContent = content;

          // Scope to section if specified
          if (section) {
            const sectionContent = extractSection(content, section, true);
            if (!sectionContent) continue;
            searchContent = sectionContent;
          }

          const tree = parseMarkdown(searchContent);
          const contentLines = searchContent.split('\n');

          // Build heading context map: for each line, what heading is it under?
          const headingRegexLine = /^(#{1,6})\s+(.+)$/;
          const headingContext: string[] = [];
          let currentHeading = '';
          for (const line of contentLines) {
            const m = line.match(headingRegexLine);
            if (m) currentHeading = m[2].trim();
            headingContext.push(currentHeading);
          }

          if (nodeType) {
            const nodeTypeMap: Record<string, string> = {
              code: 'code',
              text: 'text',
              links: 'link',
              headings: 'heading',
            };
            const astType = nodeTypeMap[nodeType];
            if (astType) {
              visit(tree, astType, (node: Node) => {
                const nodeText = getNodeText(node);
                regex.lastIndex = 0;
                if (regex.test(nodeText)) {
                  const line = node.position?.start.line ?? 0;
                  matches.push({
                    file: filePath,
                    line,
                    heading: line > 0 ? headingContext[line - 1] || '' : '',
                    match: nodeText.length > 200 ? nodeText.slice(0, 200) + '...' : nodeText,
                    type: nodeType,
                  });
                }
              });
            }
          } else {
            for (let i = 0; i < contentLines.length; i++) {
              regex.lastIndex = 0;
              if (regex.test(contentLines[i])) {
                matches.push({
                  file: filePath,
                  line: i + 1,
                  heading: headingContext[i] || '',
                  match: contentLines[i].trim(),
                });
              }
            }
          }
        } catch {
          // Skip files that can't be read
        }

        if (matches.length >= 500) break;
      }

      return JSON.stringify({ pattern, count: matches.length, matches }, null, 2);
    } catch (error) {
      if (error instanceof ToolExecutionError) throw error;
      throw new ToolExecutionError(error instanceof Error ? error.message : String(error), {
        toolName: 'md_search',
        toolInput: input,
        code: ErrorCodes.TOOL_EXECUTION_FAILED,
        recoverable: true,
        retryable: false,
      });
    }
  };

  // ============================================
  // 6. md_frontmatter
  // ============================================

  static readonly mdFrontmatterTool: Tool = {
    name: 'md_frontmatter',
    description:
      'Read, set, merge, or delete YAML frontmatter metadata on a markdown file.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the markdown file',
        },
        cwd: {
          type: 'string',
          description: 'Base working directory for relative paths (optional)',
        },
        action: {
          type: 'string',
          description: 'Action to perform on frontmatter',
          enum: ['read', 'set', 'merge', 'delete'],
        },
        data: {
          type: 'object',
          description: 'Data object for set/merge actions',
        },
        keys: {
          type: 'array',
          items: { type: 'string', description: 'Frontmatter key name' },
          description: 'Keys to delete (for delete action)',
        },
      },
      required: ['path', 'action'],
    },
  };

  static readonly mdFrontmatterExecutor: ToolExecutor = async (input) => {
    const baseCwd = (input.cwd as string) || process.cwd();
    const rawPath = String(input.path || '').trim();
    const action = input.action as string;
    const data = input.data as Record<string, unknown> | undefined;
    const keys = input.keys as string[] | undefined;

    try {
      const isWrite = action !== 'read';
      const resolvedPath = await resolveAndValidate(
        rawPath,
        baseCwd,
        'md_frontmatter',
        input,
        isWrite ? 'write' : 'read',
      );
      const content = await readMarkdownFile(resolvedPath, 'md_frontmatter', input);
      const parsed = matter(content);

      switch (action) {
        case 'read':
          return JSON.stringify({ frontmatter: parsed.data, path: resolvedPath }, null, 2);

        case 'set': {
          if (!data) {
            throw new ToolExecutionError("'data' parameter is required for 'set' action", {
              toolName: 'md_frontmatter',
              toolInput: input,
              code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
              recoverable: false,
              retryable: false,
            });
          }
          const newContent = matter.stringify(parsed.content, data);
          await writeFile(resolvedPath, newContent, 'utf-8');
          return JSON.stringify({ frontmatter: data, action: 'set', path: resolvedPath }, null, 2);
        }

        case 'merge': {
          if (!data) {
            throw new ToolExecutionError("'data' parameter is required for 'merge' action", {
              toolName: 'md_frontmatter',
              toolInput: input,
              code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
              recoverable: false,
              retryable: false,
            });
          }
          const merged = { ...parsed.data, ...data };
          const mergedContent = matter.stringify(parsed.content, merged);
          await writeFile(resolvedPath, mergedContent, 'utf-8');
          return JSON.stringify({ frontmatter: merged, action: 'merge', path: resolvedPath }, null, 2);
        }

        case 'delete': {
          if (!keys || keys.length === 0) {
            throw new ToolExecutionError("'keys' parameter is required for 'delete' action", {
              toolName: 'md_frontmatter',
              toolInput: input,
              code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
              recoverable: false,
              retryable: false,
            });
          }
          const updated = { ...parsed.data };
          for (const key of keys) {
            delete updated[key];
          }
          const deletedContent = matter.stringify(parsed.content, updated);
          await writeFile(resolvedPath, deletedContent, 'utf-8');
          return JSON.stringify(
            { frontmatter: updated, action: 'delete', deleted_keys: keys, path: resolvedPath },
            null,
            2,
          );
        }

        default:
          throw new ToolExecutionError(
            `Invalid action: ${action}. Use one of: read, set, merge, delete`,
            {
              toolName: 'md_frontmatter',
              toolInput: input,
              code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
              recoverable: false,
              retryable: false,
            },
          );
      }
    } catch (error) {
      if (error instanceof ToolExecutionError) throw error;
      throw new ToolExecutionError(error instanceof Error ? error.message : String(error), {
        toolName: 'md_frontmatter',
        toolInput: input,
        code: ErrorCodes.TOOL_EXECUTION_FAILED,
        recoverable: true,
        retryable: false,
      });
    }
  };

  // ============================================
  // 7. md_outline
  // ============================================

  static readonly mdOutlineTool: Tool = {
    name: 'md_outline',
    description:
      'Get a structural outline of one or more markdown files — headings hierarchy, section sizes, and element counts.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File or directory path',
        },
        cwd: {
          type: 'string',
          description: 'Base working directory for relative paths (optional)',
        },
        glob: {
          type: 'string',
          description: 'Glob pattern for files (default: **/*.md)',
        },
        depth: {
          type: 'number',
          description: 'Max heading depth to include (1-6, default: 6)',
        },
      },
      required: ['path'],
    },
  };

  static readonly mdOutlineExecutor: ToolExecutor = async (input) => {
    const baseCwd = (input.cwd as string) || process.cwd();
    const rawPath = String(input.path || '').trim();
    const globPattern = (input.glob as string) || '**/*.md';
    const maxDepth = Math.min(6, Math.max(1, (input.depth as number) || 6));

    try {
      const resolvedPath = await resolveAndValidate(rawPath, baseCwd, 'md_outline', input);
      const runtime = getRuntime();

      const fileStat = await stat(resolvedPath);
      const files: string[] = [];

      if (fileStat.isDirectory()) {
        for await (const file of runtime.glob(globPattern, { cwd: resolvedPath })) {
          files.push(join(resolvedPath, file));
          if (files.length >= 100) break;
        }
      } else {
        files.push(resolvedPath);
      }

      const outlines: Record<string, unknown>[] = [];

      for (const filePath of files) {
        try {
          const content = await runtime.file(filePath).text();
          const tree = parseMarkdown(content);
          const { data: frontmatter } = matter(content);
          const hasFrontmatter = Object.keys(frontmatter).length > 0;

          // Count elements
          let headingCount = 0;
          let codeBlocks = 0;
          let links = 0;
          let images = 0;
          let todos = 0;
          let tables = 0;

          visit(tree, 'heading', () => { headingCount++; });
          visit(tree, 'code', () => { codeBlocks++; });
          visit(tree, 'link', () => { links++; });
          visit(tree, 'image', () => { images++; });
          visit(tree, 'listItem', (node: ListItem) => {
            if (node.checked !== null && node.checked !== undefined) todos++;
          });
          visit(tree, 'table', () => { tables++; });

          // Get headings filtered by depth
          const allHeadings = getHeadingTree(tree);
          const filterByDepth = (nodes: HeadingNode[]): HeadingNode[] => {
            return nodes
              .filter((h) => h.depth <= maxDepth)
              .map((h) => ({
                ...h,
                children: filterByDepth(h.children),
              }));
          };
          const filteredHeadings = filterByDepth(allHeadings);

          outlines.push({
            file: filePath,
            lines: content.split('\n').length,
            has_frontmatter: hasFrontmatter,
            outline: formatHeadingTree(filteredHeadings),
            stats: {
              headings: headingCount,
              code_blocks: codeBlocks,
              links,
              images,
              todos,
              tables,
            },
          });
        } catch {
          // Skip files that can't be read
        }
      }

      return JSON.stringify({ file_count: outlines.length, files: outlines }, null, 2);
    } catch (error) {
      if (error instanceof ToolExecutionError) throw error;
      throw new ToolExecutionError(error instanceof Error ? error.message : String(error), {
        toolName: 'md_outline',
        toolInput: input,
        code: ErrorCodes.TOOL_EXECUTION_FAILED,
        recoverable: true,
        retryable: false,
      });
    }
  };

  // ============================================
  // Register All
  // ============================================

  static registerAll(registry: ToolRegistry): void {
    registry.register(MarkdownTools.mdReadTool, MarkdownTools.mdReadExecutor);
    registry.register(MarkdownTools.mdExtractTool, MarkdownTools.mdExtractExecutor);
    registry.register(MarkdownTools.mdReplaceSectionTool, MarkdownTools.mdReplaceSectionExecutor);
    registry.register(MarkdownTools.mdInsertTool, MarkdownTools.mdInsertExecutor);
    registry.register(MarkdownTools.mdSearchTool, MarkdownTools.mdSearchExecutor);
    registry.register(MarkdownTools.mdFrontmatterTool, MarkdownTools.mdFrontmatterExecutor);
    registry.register(MarkdownTools.mdOutlineTool, MarkdownTools.mdOutlineExecutor);
  }
}

// Export helpers for testing
export const __test__ = {
  parseMarkdown,
  stringifyMarkdown,
  getHeadingTree,
  extractSection,
  getHeadingText,
  resolveInputPath: resolveInputPath,
};
