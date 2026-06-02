/** @jsxImportSource react */
import React from 'react';
import { Box, Text } from 'ink';
import { lexer, type Token, type Tokens } from 'marked';
import { useInkTheme } from './theme';

export type MarkdownTableAlign = 'left' | 'center' | 'right' | null;

export type MarkdownProps = {
  content: string;
  maxWidth?: number;
};

export type MarkdownTableProps = {
  header: readonly string[];
  rows: readonly (readonly string[])[];
  align?: readonly MarkdownTableAlign[];
  maxWidth?: number;
};

type MarkdownColors = {
  text: string;
  heading: string;
  link: string;
  code: string;
  codeBlock: string;
  blockQuote: string;
  emph: string;
  strong: string;
  listItem: string;
  rule: string;
  muted: string;
};

type RenderContext = {
  maxWidth?: number;
  colors: MarkdownColors;
};

function clampWidth(width: number | undefined, fallback: number): number {
  if (width === undefined || !Number.isFinite(width)) return fallback;
  return Math.max(1, Math.floor(width));
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function tokenText(token: Token): string {
  if ('text' in token && typeof token.text === 'string') return token.text;
  if ('raw' in token && typeof token.raw === 'string') return token.raw;
  return '';
}

function inlineTokensToPlainText(tokens: readonly Token[] | undefined): string {
  if (!tokens || tokens.length === 0) return '';

  return tokens.map((token) => {
    switch (token.type) {
      case 'br':
        return '\n';
      case 'codespan':
        return (token as Tokens.Codespan).text;
      case 'em':
      case 'strong':
      case 'del':
        return inlineTokensToPlainText((token as Tokens.Em | Tokens.Strong | Tokens.Del).tokens);
      case 'link': {
        const link = token as Tokens.Link;
        const label = inlineTokensToPlainText(link.tokens) || link.text;
        return label && label !== link.href ? `${label} (${link.href})` : link.href;
      }
      case 'image': {
        const image = token as Tokens.Image;
        return image.text ? `${image.text} (${image.href})` : image.href;
      }
      case 'html':
        return tokenText(token).replace(/<[^>]+>/g, '');
      case 'text': {
        const text = token as Tokens.Text;
        return text.tokens ? inlineTokensToPlainText(text.tokens) : text.text;
      }
      default:
        return tokenText(token);
    }
  }).join('');
}

function plainLinesFromTokens(tokens: readonly Token[], maxWidth?: number): string[] {
  const width = maxWidth ? Math.max(1, maxWidth) : undefined;
  const lines: string[] = [];

  const pushBlank = () => {
    if (lines.length > 0 && lines.at(-1) !== '') lines.push('');
  };

  for (const token of tokens) {
    switch (token.type) {
      case 'space':
        pushBlank();
        break;
      case 'heading': {
        const heading = token as Tokens.Heading;
        lines.push(...wrapText(`${'#'.repeat(heading.depth)} ${inlineTokensToPlainText(heading.tokens)}`, width));
        pushBlank();
        break;
      }
      case 'paragraph': {
        const paragraph = token as Tokens.Paragraph;
        lines.push(...wrapText(inlineTokensToPlainText(paragraph.tokens) || paragraph.text, width));
        pushBlank();
        break;
      }
      case 'text': {
        lines.push(...wrapText(tokenText(token), width));
        pushBlank();
        break;
      }
      case 'code': {
        const code = token as Tokens.Code;
        lines.push(...code.text.split('\n'));
        pushBlank();
        break;
      }
      case 'blockquote': {
        const quote = token as Tokens.Blockquote;
        for (const line of plainLinesFromTokens(quote.tokens, width ? Math.max(1, width - 2) : undefined)) {
          lines.push(line ? `> ${line}` : '>');
        }
        pushBlank();
        break;
      }
      case 'hr': {
        lines.push('-'.repeat(clampWidth(width, 40)));
        pushBlank();
        break;
      }
      case 'list': {
        const list = token as Tokens.List;
        const start = typeof list.start === 'number' ? list.start : 1;
        list.items.forEach((item, index) => {
          const marker = list.ordered ? `${start + index}. ` : '- ';
          const checkbox = item.task ? `[${item.checked ? 'x' : ' '}] ` : '';
          const itemText = normalizeText(plainLinesFromTokens(item.tokens, undefined).join(' '));
          const wrapped = wrapText(`${marker}${checkbox}${itemText}`, width);
          const indent = ' '.repeat(marker.length + checkbox.length);
          wrapped.forEach((line, lineIndex) => {
            lines.push(lineIndex === 0 ? line : `${indent}${line}`);
          });
        });
        pushBlank();
        break;
      }
      case 'table': {
        lines.push(...tableTokenToLines(token as Tokens.Table, width));
        pushBlank();
        break;
      }
      case 'html':
        lines.push(...wrapText(tokenText(token).replace(/<[^>]+>/g, ''), width));
        pushBlank();
        break;
      default:
        if ('tokens' in token && Array.isArray(token.tokens)) {
          lines.push(...plainLinesFromTokens(token.tokens, width));
          pushBlank();
        } else {
          lines.push(...wrapText(tokenText(token), width));
          pushBlank();
        }
    }
  }

  while (lines.at(-1) === '') lines.pop();
  return lines;
}

function wrapText(value: string, width?: number): string[] {
  const normalizedWidth = width ? Math.max(1, Math.floor(width)) : undefined;
  const result: string[] = [];

  for (const sourceLine of value.split('\n')) {
    if (!normalizedWidth || sourceLine.length <= normalizedWidth) {
      result.push(sourceLine);
      continue;
    }

    let line = '';
    const words = sourceLine.split(/(\s+)/).filter(Boolean);

    for (const word of words) {
      if (/^\s+$/.test(word)) {
        if (line.length > 0 && !line.endsWith(' ')) line += ' ';
        continue;
      }

      if (word.length > normalizedWidth) {
        if (line.trim()) {
          result.push(line.trimEnd());
          line = '';
        }
        const chunks = splitLongWord(word, normalizedWidth);
        chunks.forEach((chunk, chunkIndex) => {
          if (chunkIndex === chunks.length - 1) line = chunk;
          else result.push(chunk);
        });
        continue;
      }

      const next = line ? `${line}${line.endsWith(' ') ? '' : ' '}${word}` : word;
      if (next.length > normalizedWidth) {
        if (line.trim()) result.push(line.trimEnd());
        line = word;
      } else {
        line = next;
      }
    }

    result.push(line.trimEnd());
  }

  return result.length > 0 ? result : [''];
}

function splitLongWord(word: string, width: number): string[] {
  const chunks: string[] = [];
  const pathSegments = word.split(/(?<=\/)/);

  let current = '';
  for (const segment of pathSegments) {
    if (segment.length > width) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      for (let index = 0; index < segment.length; index += width) {
        chunks.push(segment.slice(index, index + width));
      }
      continue;
    }

    if (current.length + segment.length <= width) {
      current += segment;
      continue;
    }

    if (current) chunks.push(current);
    current = segment;
  }

  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [word.slice(0, width)];
}

function tableTokenToLines(token: Tokens.Table, maxWidth?: number): string[] {
  return renderMarkdownTableLines({
    header: token.header.map((cell) => tableCellToText(cell)),
    rows: token.rows.map((row) => row.map((cell) => tableCellToText(cell))),
    align: token.align,
    maxWidth,
  });
}

function tableCellToText(cell: Tokens.TableCell): string {
  return normalizeText(inlineTokensToPlainText(cell.tokens) || cell.text);
}

function normalizeTableInput(input: MarkdownTableProps): Required<Pick<MarkdownTableProps, 'header' | 'rows'>> & {
  align: MarkdownTableAlign[];
} {
  const columnCount = Math.max(
    input.header.length,
    ...input.rows.map((row) => row.length),
    input.align?.length ?? 0,
    1
  );
  const padRow = (row: readonly string[]) => Array.from({ length: columnCount }, (_, index) => normalizeText(row[index] ?? ''));

  return {
    header: padRow(input.header),
    rows: input.rows.map(padRow),
    align: Array.from({ length: columnCount }, (_, index) => input.align?.[index] ?? 'left'),
  };
}

function tableWidth(widths: readonly number[]): number {
  return 1 + widths.reduce((sum, width) => sum + width + 3, 0);
}

function measureCellWidth(cell: string): number {
  return Math.max(1, ...cell.split('\n').map((line) => line.length));
}

function computeColumnWidths(input: MarkdownTableProps): number[] {
  const table = normalizeTableInput(input);
  const rows = [table.header, ...table.rows];
  const widths = table.header.map((_, columnIndex) => {
    return Math.max(3, ...rows.map((row) => measureCellWidth(row[columnIndex] ?? '')));
  });

  const maxWidth = input.maxWidth ? Math.max(1, Math.floor(input.maxWidth)) : undefined;
  if (!maxWidth) return widths;

  while (tableWidth(widths) > maxWidth && widths.some((width) => width > 3)) {
    let widestIndex = 0;
    for (let index = 1; index < widths.length; index++) {
      if (widths[index] > widths[widestIndex]) widestIndex = index;
    }
    widths[widestIndex] -= 1;
  }

  while (tableWidth(widths) > maxWidth && widths.some((width) => width > 1)) {
    let widestIndex = 0;
    for (let index = 1; index < widths.length; index++) {
      if (widths[index] > widths[widestIndex]) widestIndex = index;
    }
    widths[widestIndex] -= 1;
  }

  return widths;
}

function alignCell(value: string, width: number, align: MarkdownTableAlign): string {
  if (value.length >= width) return value;
  const remaining = width - value.length;

  if (align === 'right') return `${' '.repeat(remaining)}${value}`;
  if (align === 'center') {
    const left = Math.floor(remaining / 2);
    return `${' '.repeat(left)}${value}${' '.repeat(remaining - left)}`;
  }

  return `${value}${' '.repeat(remaining)}`;
}

function formatTableRow(cells: readonly string[], widths: readonly number[], align: readonly MarkdownTableAlign[]): string[] {
  const wrappedCells = cells.map((cell, index) => wrapText(cell, widths[index]));
  const rowHeight = Math.max(...wrappedCells.map((cellLines) => cellLines.length), 1);
  const lines: string[] = [];

  for (let rowLine = 0; rowLine < rowHeight; rowLine++) {
    const values = widths.map((width, columnIndex) => {
      const value = wrappedCells[columnIndex]?.[rowLine] ?? '';
      return alignCell(value, width, align[columnIndex] ?? 'left');
    });
    lines.push(`| ${values.join(' | ')} |`);
  }

  return lines;
}

export function renderMarkdownTableLines(input: MarkdownTableProps): string[] {
  const table = normalizeTableInput(input);
  const widths = computeColumnWidths(input);
  const separator = `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`;

  return [
    ...formatTableRow(table.header, widths, table.align),
    separator,
    ...table.rows.flatMap((row) => formatTableRow(row, widths, table.align)),
  ];
}

function renderInlineTokens(tokens: readonly Token[] | undefined, colors: MarkdownColors, keyPrefix: string): React.ReactNode[] {
  if (!tokens || tokens.length === 0) return [];

  return tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`;

    switch (token.type) {
      case 'br':
        return '\n';
      case 'codespan':
        return <Text key={key} color={colors.code}>{(token as Tokens.Codespan).text}</Text>;
      case 'em':
        return <Text key={key} color={colors.emph} italic>{renderInlineTokens((token as Tokens.Em).tokens, colors, key)}</Text>;
      case 'strong':
        return <Text key={key} color={colors.strong} bold>{renderInlineTokens((token as Tokens.Strong).tokens, colors, key)}</Text>;
      case 'del':
        return <Text key={key} strikethrough>{renderInlineTokens((token as Tokens.Del).tokens, colors, key)}</Text>;
      case 'link': {
        const link = token as Tokens.Link;
        return (
          <Text key={key} color={colors.link}>
            <Text underline>{renderInlineTokens(link.tokens, colors, key)}</Text>
            {link.text && link.text !== link.href ? <Text color={colors.muted}> ({link.href})</Text> : null}
          </Text>
        );
      }
      case 'image': {
        const image = token as Tokens.Image;
        return <Text key={key} color={colors.link}>{image.text ? `${image.text} (${image.href})` : image.href}</Text>;
      }
      case 'text': {
        const text = token as Tokens.Text;
        if (text.tokens?.length) return renderInlineTokens(text.tokens, colors, key);
        return text.text;
      }
      case 'html':
        return tokenText(token).replace(/<[^>]+>/g, '');
      default:
        if ('tokens' in token && Array.isArray(token.tokens)) {
          return renderInlineTokens(token.tokens, colors, key);
        }
        return tokenText(token);
    }
  }).flat();
}

function renderListItemLines(list: Tokens.List, maxWidth?: number): string[] {
  const lines: string[] = [];
  const start = typeof list.start === 'number' ? list.start : 1;

  list.items.forEach((item, index) => {
    const marker = list.ordered ? `${start + index}. ` : '- ';
    const checkbox = item.task ? `[${item.checked ? 'x' : ' '}] ` : '';
    const text = normalizeText(plainLinesFromTokens(item.tokens, undefined).join(' '));
    const wrapped = wrapText(`${marker}${checkbox}${text}`, maxWidth);
    const indent = ' '.repeat(marker.length + checkbox.length);

    wrapped.forEach((line, lineIndex) => {
      lines.push(lineIndex === 0 ? line : `${indent}${line}`);
    });
  });

  return lines;
}

function renderBlock(token: Token, index: number, context: RenderContext): React.ReactNode {
  const key = `md-block-${index}`;
  const width = context.maxWidth;
  const colors = context.colors;

  switch (token.type) {
    case 'space':
      return null;
    case 'heading': {
      const heading = token as Tokens.Heading;
      return (
        <Text key={key} color={colors.heading} bold wrap="wrap">
          {'#'.repeat(heading.depth)} {renderInlineTokens(heading.tokens, colors, key)}
        </Text>
      );
    }
    case 'paragraph': {
      const paragraph = token as Tokens.Paragraph;
      return (
        <Text key={key} color={colors.text} wrap="wrap">
          {renderInlineTokens(paragraph.tokens, colors, key)}
        </Text>
      );
    }
    case 'text':
      return <Text key={key} color={colors.text} wrap="wrap">{tokenText(token)}</Text>;
    case 'code': {
      const code = token as Tokens.Code;
      const codeLines = code.text.split('\n');
      return (
        <Box key={key} flexDirection="column">
          {code.lang ? <Text color={colors.muted}>{code.lang}</Text> : null}
          {codeLines.map((line, lineIndex) => (
            <Text key={`${key}-line-${lineIndex}`} color={colors.codeBlock} wrap="truncate">
              {'  '}{line}
            </Text>
          ))}
        </Box>
      );
    }
    case 'blockquote': {
      const quote = token as Tokens.Blockquote;
      const lines = plainLinesFromTokens(quote.tokens, width ? Math.max(1, width - 2) : undefined);
      return (
        <Box key={key} flexDirection="column">
          {lines.map((line, lineIndex) => (
            <Text key={`${key}-quote-${lineIndex}`} color={colors.blockQuote} wrap="wrap">
              {'> '}{line}
            </Text>
          ))}
        </Box>
      );
    }
    case 'hr':
      return <Text key={key} color={colors.rule}>{'-'.repeat(clampWidth(width, 40))}</Text>;
    case 'list': {
      const lines = renderListItemLines(token as Tokens.List, width);
      return (
        <Box key={key} flexDirection="column">
          {lines.map((line, lineIndex) => (
            <Text key={`${key}-item-${lineIndex}`} color={colors.listItem} wrap="wrap">{line}</Text>
          ))}
        </Box>
      );
    }
    case 'table': {
      const table = token as Tokens.Table;
      return (
        <MarkdownTable
          key={key}
          header={table.header.map(tableCellToText)}
          rows={table.rows.map((row) => row.map(tableCellToText))}
          align={table.align}
          maxWidth={width}
        />
      );
    }
    case 'html':
      return <Text key={key} color={colors.muted} wrap="wrap">{tokenText(token).replace(/<[^>]+>/g, '')}</Text>;
    default:
      if ('tokens' in token && Array.isArray(token.tokens)) {
        return (
          <Box key={key} flexDirection="column">
            {token.tokens.map((child, childIndex) => renderBlock(child, childIndex, context))}
          </Box>
        );
      }
      return <Text key={key} color={colors.text} wrap="wrap">{tokenText(token)}</Text>;
  }
}

function useMarkdownColors(): MarkdownColors {
  const theme = useInkTheme();
  return {
    text: theme.color('markdownText'),
    heading: theme.color('markdownHeading'),
    link: theme.color('markdownLink'),
    code: theme.color('markdownCode'),
    codeBlock: theme.color('markdownCode'),
    blockQuote: theme.color('markdownBlockQuote'),
    emph: theme.color('markdownEmph'),
    strong: theme.color('markdownStrong'),
    listItem: theme.color('markdownListItem'),
    rule: theme.color('markdownHorizontalRule'),
    muted: theme.color('muted'),
  };
}

export function MarkdownTable({ header, rows, align, maxWidth }: MarkdownTableProps): React.JSX.Element {
  const colors = useMarkdownColors();
  const lines = renderMarkdownTableLines({ header, rows, align, maxWidth });

  return (
    <Box flexDirection="column">
      {lines.map((line, index) => (
        <Text key={`table-${index}`} color={index === 0 ? colors.heading : colors.text} wrap="truncate">
          {line}
        </Text>
      ))}
    </Box>
  );
}

export function Markdown({ content, maxWidth }: MarkdownProps): React.JSX.Element | null {
  if (!content.trim()) return null;

  const colors = useMarkdownColors();
  const tokens = lexer(content, { gfm: true, breaks: false });
  const context: RenderContext = { maxWidth, colors };

  return (
    <Box flexDirection="column" width={maxWidth}>
      {tokens.map((token, index) => renderBlock(token, index, context))}
    </Box>
  );
}

export function renderMarkdown(text: string, options: { maxWidth?: number } = {}): string {
  if (!text.trim()) return '';
  const tokens = lexer(text, { gfm: true, breaks: false });
  return plainLinesFromTokens(tokens, options.maxWidth).join('\n').trimEnd();
}
