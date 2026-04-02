import { resolve } from 'path';
import { homedir } from 'os';
import type { Tool } from '@hasna/assistants-shared';
import type { ToolExecutor, ToolRegistry } from './registry';
import { ErrorCodes, ToolExecutionError } from '../errors';
import { validatePath } from '../validation/paths';
import { isPathSafe } from '../security/path-validator';
import { getRuntime } from '../runtime';

// Supported spreadsheet extensions
const SPREADSHEET_EXTENSIONS = new Set(['.csv', '.tsv', '.xlsx']);

// Max file size (50MB)
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export function resolveInputPath(baseCwd: string, inputPath: string): string {
  const envHome = process.env.HOME || process.env.USERPROFILE;
  const home = envHome && envHome.trim().length > 0 ? envHome : homedir();
  if (inputPath === '~') return home;
  if (inputPath.startsWith('~/')) return resolve(home, inputPath.slice(2));
  return resolve(baseCwd, inputPath);
}

// ============================================
// CSV/TSV Parser (handles quoted fields, newlines in quotes)
// ============================================

export function parseCSV(text: string, delimiter: string = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === delimiter) {
        row.push(field.trim());
        field = '';
        i++;
      } else if (ch === '\r') {
        if (i + 1 < text.length && text[i + 1] === '\n') {
          i++;
        }
        row.push(field.trim());
        field = '';
        if (row.some(f => f.length > 0)) rows.push(row);
        row = [];
        i++;
      } else if (ch === '\n') {
        row.push(field.trim());
        field = '';
        if (row.some(f => f.length > 0)) rows.push(row);
        row = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Last field
  row.push(field.trim());
  if (row.some(f => f.length > 0)) rows.push(row);

  return rows;
}

// ============================================
// XLSX Parser (minimal, using fflate for unzip)
// ============================================

export async function parseXLSX(buffer: ArrayBuffer, sheetName?: string): Promise<{ sheets: string[]; data: string[][] }> {
  // Dynamically import fflate for decompression
  let fflate: { unzipSync: (data: Uint8Array) => Record<string, Uint8Array> };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    fflate = require('fflate') as typeof fflate;
  } catch {
    throw new ToolExecutionError(
      'XLSX parsing requires the fflate package. Install it with: bun add fflate',
      {
        toolName: 'read_spreadsheet',
        toolInput: {},
        code: ErrorCodes.TOOL_EXECUTION_FAILED,
        recoverable: false,
        retryable: false,
        suggestion: 'Install fflate: bun add fflate',
      }
    );
  }

  const uint8 = new Uint8Array(buffer);
  const files = fflate.unzipSync(uint8);

  // Parse shared strings
  const sharedStrings: string[] = [];
  const ssFile = files['xl/sharedStrings.xml'];
  if (ssFile) {
    const ssText = new TextDecoder().decode(ssFile);
    const siRegex = /<si>([\s\S]*?)<\/si>/g;
    let match: RegExpExecArray | null;
    while ((match = siRegex.exec(ssText)) !== null) {
      const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;
      let tMatch: RegExpExecArray | null;
      let value = '';
      while ((tMatch = tRegex.exec(match[1])) !== null) {
        value += tMatch[1];
      }
      sharedStrings.push(decodeXML(value));
    }
  }

  // Parse workbook to get sheet names
  const sheets: string[] = [];
  const wbFile = files['xl/workbook.xml'];
  if (wbFile) {
    const wbText = new TextDecoder().decode(wbFile);
    const sheetRegex = /<sheet\s+name="([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = sheetRegex.exec(wbText)) !== null) {
      sheets.push(decodeXML(match[1]));
    }
  }

  // Determine which sheet to read
  let sheetIndex = 0;
  if (sheetName) {
    const idx = sheets.findIndex(s => s.toLowerCase() === sheetName.toLowerCase());
    if (idx >= 0) {
      sheetIndex = idx;
    } else {
      throw new ToolExecutionError(
        `Sheet "${sheetName}" not found. Available sheets: ${sheets.join(', ')}`,
        {
          toolName: 'read_spreadsheet',
          toolInput: { sheet: sheetName },
          code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
          recoverable: true,
          retryable: false,
          suggestion: `Use one of: ${sheets.join(', ')}`,
        }
      );
    }
  }

  // Parse sheet XML
  const sheetPath = `xl/worksheets/sheet${sheetIndex + 1}.xml`;
  const sheetFile = files[sheetPath];
  if (!sheetFile) {
    throw new ToolExecutionError('Could not find sheet data in XLSX file', {
      toolName: 'read_spreadsheet',
      toolInput: {},
      code: ErrorCodes.TOOL_EXECUTION_FAILED,
      recoverable: false,
      retryable: false,
    });
  }

  const sheetText = new TextDecoder().decode(sheetFile);
  const data: string[][] = [];

  // Parse rows
  const rowRegex = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(sheetText)) !== null) {
    const row: string[] = [];
    const cellRegex = /<c\s+r="([A-Z]+)(\d+)"(?:\s+t="([^"]*)")?(?:\s+s="[^"]*")?[^>]*>(?:<v>([\s\S]*?)<\/v>)?/g;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
      const colLetters = cellMatch[1];
      const cellType = cellMatch[3];
      const rawValue = cellMatch[4] || '';

      // Convert column letters to index
      let colIndex = 0;
      for (let i = 0; i < colLetters.length; i++) {
        colIndex = colIndex * 26 + (colLetters.charCodeAt(i) - 64);
      }
      colIndex--; // 0-based

      // Pad row to reach column
      while (row.length <= colIndex) {
        row.push('');
      }

      if (cellType === 's') {
        // Shared string reference
        const idx = parseInt(rawValue, 10);
        row[colIndex] = sharedStrings[idx] || '';
      } else if (cellType === 'inlineStr') {
        // Inline string
        const tMatch = /<t[^>]*>([\s\S]*?)<\/t>/.exec(rawValue);
        row[colIndex] = tMatch ? decodeXML(tMatch[1]) : rawValue;
      } else {
        row[colIndex] = decodeXML(rawValue);
      }
    }

    if (row.length > 0) {
      data.push(row);
    }
  }

  return { sheets, data };
}

export function decodeXML(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// ============================================
// Column Type Detection
// ============================================

export type ColumnType = 'number' | 'date' | 'boolean' | 'string';

export function detectColumnType(values: string[]): ColumnType {
  const nonEmpty = values.filter(v => v.length > 0);
  if (nonEmpty.length === 0) return 'string';

  let numberCount = 0;
  let dateCount = 0;
  let boolCount = 0;

  for (const v of nonEmpty) {
    if (!isNaN(Number(v)) && v.length > 0) numberCount++;
    else if (/^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(v)) dateCount++;
    else if (/^(true|false|yes|no)$/i.test(v)) boolCount++;
  }

  const threshold = nonEmpty.length * 0.8;
  if (numberCount >= threshold) return 'number';
  if (dateCount >= threshold) return 'date';
  if (boolCount >= threshold) return 'boolean';
  return 'string';
}

// ============================================
// Range Parsing
// ============================================

export function parseRange(range: string): { startRow: number; endRow: number; startCol: number; endCol: number } | null {
  // Accept formats like A1:D10, 1:10, A:D
  const match = range.match(/^([A-Z]*)(\d*):([A-Z]*)(\d*)$/i);
  if (!match) return null;

  const startCol = match[1] ? colLetterToIndex(match[1].toUpperCase()) : 0;
  const startRow = match[2] ? parseInt(match[2], 10) - 1 : 0;
  const endCol = match[3] ? colLetterToIndex(match[3].toUpperCase()) : Infinity;
  const endRow = match[4] ? parseInt(match[4], 10) - 1 : Infinity;

  return { startRow, endRow, startCol, endCol };
}

export function colLetterToIndex(letters: string): number {
  let index = 0;
  for (let i = 0; i < letters.length; i++) {
    index = index * 26 + (letters.charCodeAt(i) - 64);
  }
  return index - 1; // 0-based
}

// ============================================
// Statistics Helpers
// ============================================

export function computeStats(values: number[]): { min: number; max: number; mean: number; median: number; sum: number; count: number } {
  if (values.length === 0) return { min: 0, max: 0, mean: 0, median: 0, sum: 0, count: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return { min: sorted[0], max: sorted[sorted.length - 1], mean, median, sum, count: values.length };
}

// ============================================
// Spreadsheet Tools
// ============================================

