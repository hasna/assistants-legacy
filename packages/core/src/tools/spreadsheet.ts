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

function resolveInputPath(baseCwd: string, inputPath: string): string {
  const envHome = process.env.HOME || process.env.USERPROFILE;
  const home = envHome && envHome.trim().length > 0 ? envHome : homedir();
  if (inputPath === '~') return home;
  if (inputPath.startsWith('~/')) return resolve(home, inputPath.slice(2));
  return resolve(baseCwd, inputPath);
}

// ============================================
// CSV/TSV Parser (handles quoted fields, newlines in quotes)
// ============================================

function parseCSV(text: string, delimiter: string = ','): string[][] {
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

async function parseXLSX(buffer: ArrayBuffer, sheetName?: string): Promise<{ sheets: string[]; data: string[][] }> {
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

function decodeXML(text: string): string {
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

type ColumnType = 'number' | 'date' | 'boolean' | 'string';

function detectColumnType(values: string[]): ColumnType {
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

function parseRange(range: string): { startRow: number; endRow: number; startCol: number; endCol: number } | null {
  // Accept formats like A1:D10, 1:10, A:D
  const match = range.match(/^([A-Z]*)(\d*):([A-Z]*)(\d*)$/i);
  if (!match) return null;

  const startCol = match[1] ? colLetterToIndex(match[1].toUpperCase()) : 0;
  const startRow = match[2] ? parseInt(match[2], 10) - 1 : 0;
  const endCol = match[3] ? colLetterToIndex(match[3].toUpperCase()) : Infinity;
  const endRow = match[4] ? parseInt(match[4], 10) - 1 : Infinity;

  return { startRow, endRow, startCol, endCol };
}

function colLetterToIndex(letters: string): number {
  let index = 0;
  for (let i = 0; i < letters.length; i++) {
    index = index * 26 + (letters.charCodeAt(i) - 64);
  }
  return index - 1; // 0-based
}

// ============================================
// Statistics Helpers
// ============================================

function computeStats(values: number[]): { min: number; max: number; mean: number; median: number; sum: number; count: number } {
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

export class SpreadsheetTools {
  // ============================================
  // read_spreadsheet
  // ============================================

  static readonly readSpreadsheetTool: Tool = {
    name: 'read_spreadsheet',
    description:
      'Parse and read a spreadsheet file (CSV, TSV, XLSX). ' +
      'Returns structured data with column names, types, and rows. ' +
      'Supports large files with row limits and sampling.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the spreadsheet file (CSV, TSV, or XLSX)',
        },
        sheet: {
          type: 'string',
          description: 'Sheet name for XLSX files (defaults to first sheet)',
        },
        range: {
          type: 'string',
          description: 'Cell range to read, e.g. "A1:D10" or "1:100"',
        },
        maxRows: {
          type: 'number',
          description: 'Maximum rows to return (default 1000, max 10000)',
        },
        headers: {
          type: 'boolean',
          description: 'Whether first row contains headers (default true)',
        },
        sample: {
          type: 'number',
          description: 'Sample every Nth row for large files (e.g. 10 = every 10th row)',
        },
        cwd: {
          type: 'string',
          description: 'Base working directory for relative paths',
        },
      },
      required: ['path'],
    },
  };

  static readonly readSpreadsheetExecutor: ToolExecutor = async (input) => {
    const baseCwd = (input.cwd as string) || process.cwd();
    const rawPath = String(input.path || '').trim();
    const sheetName = input.sheet as string | undefined;
    const range = input.range as string | undefined;
    const maxRows = Math.min(Math.max(1, (input.maxRows as number) || 1000), 10000);
    const hasHeaders = input.headers !== false;
    const sample = input.sample as number | undefined;

    if (!rawPath) {
      throw new ToolExecutionError('Spreadsheet file path is required', {
        toolName: 'read_spreadsheet',
        toolInput: input,
        code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
        recoverable: false,
        retryable: false,
        suggestion: 'Provide a valid file path to a CSV, TSV, or XLSX file.',
      });
    }

    const filePath = resolveInputPath(baseCwd, rawPath);

    // Validate path safety
    const safety = await isPathSafe(filePath, 'read', { cwd: baseCwd });
    if (!safety.safe) {
      throw new ToolExecutionError(safety.reason || 'Blocked path', {
        toolName: 'read_spreadsheet',
        toolInput: input,
        code: ErrorCodes.TOOL_PERMISSION_DENIED,
        recoverable: false,
        retryable: false,
      });
    }

    const validated = await validatePath(filePath, { allowSymlinks: true });
    if (!validated.valid) {
      throw new ToolExecutionError(validated.error || 'Invalid path', {
        toolName: 'read_spreadsheet',
        toolInput: input,
        code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
        recoverable: false,
        retryable: false,
        suggestion: 'Provide a valid spreadsheet file path.',
      });
    }

    const runtime = getRuntime();
    const file = runtime.file(validated.resolved);
    if (!(await file.exists())) {
      throw new ToolExecutionError(`File not found: ${filePath}`, {
        toolName: 'read_spreadsheet',
        toolInput: input,
        code: ErrorCodes.TOOL_EXECUTION_FAILED,
        recoverable: false,
        retryable: false,
      });
    }

    // Check extension
    const ext = ('.' + filePath.split('.').pop()?.toLowerCase()) as string;
    if (!SPREADSHEET_EXTENSIONS.has(ext)) {
      throw new ToolExecutionError(
        `Unsupported format: ${ext}. Supported: ${[...SPREADSHEET_EXTENSIONS].join(', ')}`,
        {
          toolName: 'read_spreadsheet',
          toolInput: input,
          code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
          recoverable: false,
          retryable: false,
        }
      );
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      throw new ToolExecutionError(
        `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
        {
          toolName: 'read_spreadsheet',
          toolInput: input,
          code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
          recoverable: false,
          retryable: false,
        }
      );
    }

    try {
      let rawData: string[][];
      let sheets: string[] | undefined;

      if (ext === '.xlsx') {
        const buffer = await file.arrayBuffer();
        const result = await parseXLSX(buffer, sheetName);
        rawData = result.data;
        sheets = result.sheets;
      } else {
        const text = await file.text();
        const delimiter = ext === '.tsv' ? '\t' : ',';
        rawData = parseCSV(text, delimiter);
      }

      if (rawData.length === 0) {
        return JSON.stringify({ file: filePath, rows: 0, columns: [], data: [], truncated: false });
      }

      // Apply range filter
      if (range) {
        const parsed = parseRange(range);
        if (parsed) {
          rawData = rawData
            .slice(parsed.startRow, parsed.endRow + 1)
            .map(row => row.slice(parsed.startCol, parsed.endCol + 1));
        }
      }

      // Extract headers
      let columns: string[];
      let dataRows: string[][];

      if (hasHeaders && rawData.length > 0) {
        columns = rawData[0].map((h, i) => h || `Column_${i + 1}`);
        dataRows = rawData.slice(1);
      } else {
        const maxCols = Math.max(...rawData.map(r => r.length));
        columns = Array.from({ length: maxCols }, (_, i) => `Column_${i + 1}`);
        dataRows = rawData;
      }

      // Apply sampling
      if (sample && sample > 1) {
        dataRows = dataRows.filter((_, i) => i % sample === 0);
      }

      // Detect column types
      const columnTypes: Record<string, ColumnType> = {};
      for (let c = 0; c < columns.length; c++) {
        const colValues = dataRows.map(row => row[c] || '');
        columnTypes[columns[c]] = detectColumnType(colValues);
      }

      // Limit rows
      const totalRows = dataRows.length;
      const truncated = dataRows.length > maxRows;
      if (truncated) {
        dataRows = dataRows.slice(0, maxRows);
      }

      return JSON.stringify({
        file: filePath,
        sheets,
        rows: totalRows,
        columns,
        columnTypes,
        data: dataRows,
        truncated,
        ...(truncated ? { note: `Showing ${maxRows} of ${totalRows} rows. Use maxRows or sample to see more.` } : {}),
      });
    } catch (error) {
      if (error instanceof ToolExecutionError) throw error;
      throw new ToolExecutionError(
        `Failed to parse spreadsheet: ${error instanceof Error ? error.message : String(error)}`,
        {
          toolName: 'read_spreadsheet',
          toolInput: input,
          code: ErrorCodes.TOOL_EXECUTION_FAILED,
          recoverable: true,
          retryable: false,
        }
      );
    }
  };

  // ============================================
  // analyze_spreadsheet
  // ============================================

  static readonly analyzeSpreadsheetTool: Tool = {
    name: 'analyze_spreadsheet',
    description:
      'Analyze a spreadsheet: compute column statistics (min/max/mean/median), ' +
      'filter rows by conditions, or aggregate data by groups.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the spreadsheet file',
        },
        sheet: {
          type: 'string',
          description: 'Sheet name for XLSX files',
        },
        operation: {
          type: 'string',
          description: 'Operation to perform: "summary" (column stats), "filter" (filter rows), or "aggregate" (group by)',
          enum: ['summary', 'filter', 'aggregate'],
        },
        columns: {
          type: 'array',
          items: { type: 'string', description: 'Column name' },
          description: 'Specific columns to analyze (all if omitted)',
        },
        filter: {
          type: 'object',
          properties: {
            column: { type: 'string', description: 'Column name to filter on' },
            op: { type: 'string', description: 'Operator: eq, ne, gt, lt, gte, lte, contains, starts_with, ends_with' },
            value: { type: 'string', description: 'Value to compare against' },
          },
          description: 'Filter condition (for filter operation)',
        },
        groupBy: {
          type: 'string',
          description: 'Column to group by (for aggregate operation)',
        },
        cwd: {
          type: 'string',
          description: 'Base working directory for relative paths',
        },
      },
      required: ['path', 'operation'],
    },
  };

  static readonly analyzeSpreadsheetExecutor: ToolExecutor = async (input) => {
    const baseCwd = (input.cwd as string) || process.cwd();
    const rawPath = String(input.path || '').trim();
    const operation = input.operation as string;
    const targetColumns = input.columns as string[] | undefined;
    const filter = input.filter as { column: string; op: string; value: string } | undefined;
    const groupBy = input.groupBy as string | undefined;

    if (!rawPath) {
      throw new ToolExecutionError('Spreadsheet file path is required', {
        toolName: 'analyze_spreadsheet',
        toolInput: input,
        code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
        recoverable: false,
        retryable: false,
      });
    }

    // Read the spreadsheet first using the read executor
    const readResult = await SpreadsheetTools.readSpreadsheetExecutor({
      path: rawPath,
      sheet: input.sheet,
      maxRows: 10000,
      cwd: baseCwd,
    });

    const parsed = JSON.parse(readResult) as {
      columns: string[];
      columnTypes: Record<string, ColumnType>;
      data: string[][];
      rows: number;
    };

    const { columns, columnTypes, data } = parsed;
    const cols = targetColumns || columns;

    try {
      if (operation === 'summary') {
        const stats: Record<string, unknown> = {};

        for (const col of cols) {
          const colIdx = columns.indexOf(col);
          if (colIdx < 0) continue;

          const values = data.map(row => row[colIdx] || '');
          const type = columnTypes[col] || 'string';

          if (type === 'number') {
            const nums = values.map(Number).filter(n => !isNaN(n));
            stats[col] = { type: 'number', ...computeStats(nums) };
          } else {
            const uniqueValues = new Set(values);
            const valueCounts: Record<string, number> = {};
            for (const v of values) {
              valueCounts[v] = (valueCounts[v] || 0) + 1;
            }
            const topValues = Object.entries(valueCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10);

            stats[col] = {
              type,
              uniqueCount: uniqueValues.size,
              totalCount: values.length,
              emptyCount: values.filter(v => v.length === 0).length,
              topValues: Object.fromEntries(topValues),
            };
          }
        }

        return JSON.stringify({ operation: 'summary', totalRows: data.length, columns: cols, stats });
      }

      if (operation === 'filter') {
        if (!filter) {
          throw new ToolExecutionError('Filter condition is required for filter operation', {
            toolName: 'analyze_spreadsheet',
            toolInput: input,
            code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
            recoverable: true,
            retryable: false,
            suggestion: 'Provide a filter object with column, op, and value.',
          });
        }

        const colIdx = columns.indexOf(filter.column);
        if (colIdx < 0) {
          throw new ToolExecutionError(
            `Column "${filter.column}" not found. Available: ${columns.join(', ')}`,
            {
              toolName: 'analyze_spreadsheet',
              toolInput: input,
              code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
              recoverable: true,
              retryable: false,
            }
          );
        }

        const filtered = data.filter(row => {
          const cellValue = row[colIdx] || '';
          const numValue = Number(cellValue);
          const filterNum = Number(filter.value);

          switch (filter.op) {
            case 'eq': return cellValue === filter.value;
            case 'ne': return cellValue !== filter.value;
            case 'gt': return !isNaN(numValue) && !isNaN(filterNum) && numValue > filterNum;
            case 'lt': return !isNaN(numValue) && !isNaN(filterNum) && numValue < filterNum;
            case 'gte': return !isNaN(numValue) && !isNaN(filterNum) && numValue >= filterNum;
            case 'lte': return !isNaN(numValue) && !isNaN(filterNum) && numValue <= filterNum;
            case 'contains': return cellValue.toLowerCase().includes(filter.value.toLowerCase());
            case 'starts_with': return cellValue.toLowerCase().startsWith(filter.value.toLowerCase());
            case 'ends_with': return cellValue.toLowerCase().endsWith(filter.value.toLowerCase());
            default: return cellValue === filter.value;
          }
        });

        return JSON.stringify({
          operation: 'filter',
          condition: filter,
          matchedRows: filtered.length,
          totalRows: data.length,
          columns,
          data: filtered.slice(0, 1000),
          truncated: filtered.length > 1000,
        });
      }

      if (operation === 'aggregate') {
        if (!groupBy) {
          throw new ToolExecutionError('groupBy column is required for aggregate operation', {
            toolName: 'analyze_spreadsheet',
            toolInput: input,
            code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
            recoverable: true,
            retryable: false,
          });
        }

        const groupIdx = columns.indexOf(groupBy);
        if (groupIdx < 0) {
          throw new ToolExecutionError(
            `Column "${groupBy}" not found. Available: ${columns.join(', ')}`,
            {
              toolName: 'analyze_spreadsheet',
              toolInput: input,
              code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
              recoverable: true,
              retryable: false,
            }
          );
        }

        // Group rows
        const groups: Record<string, string[][]> = {};
        for (const row of data) {
          const key = row[groupIdx] || '(empty)';
          if (!groups[key]) groups[key] = [];
          groups[key].push(row);
        }

        // Compute per-group stats for numeric columns
        const numericCols = columns.filter(c => columnTypes[c] === 'number' && c !== groupBy);
        const result: Record<string, unknown> = {};

        for (const [key, rows] of Object.entries(groups)) {
          const groupStats: Record<string, unknown> = { count: rows.length };
          for (const col of numericCols) {
            const colIdx = columns.indexOf(col);
            const nums = rows.map(r => Number(r[colIdx])).filter(n => !isNaN(n));
            if (nums.length > 0) {
              groupStats[col] = computeStats(nums);
            }
          }
          result[key] = groupStats;
        }

        return JSON.stringify({
          operation: 'aggregate',
          groupBy,
          groupCount: Object.keys(groups).length,
          groups: result,
        });
      }

      throw new ToolExecutionError(
        `Unknown operation: ${operation}. Use "summary", "filter", or "aggregate".`,
        {
          toolName: 'analyze_spreadsheet',
          toolInput: input,
          code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
          recoverable: true,
          retryable: false,
        }
      );
    } catch (error) {
      if (error instanceof ToolExecutionError) throw error;
      throw new ToolExecutionError(
        error instanceof Error ? error.message : String(error),
        {
          toolName: 'analyze_spreadsheet',
          toolInput: input,
          code: ErrorCodes.TOOL_EXECUTION_FAILED,
          recoverable: true,
          retryable: false,
        }
      );
    }
  };

  // ============================================
  // query_spreadsheet
  // ============================================

  static readonly querySpreadsheetTool: Tool = {
    name: 'query_spreadsheet',
    description:
      'Run a SQL-like query on a spreadsheet. ' +
      'Supports SELECT, WHERE, ORDER BY, LIMIT clauses. ' +
      'Example: "SELECT name, age WHERE age > 25 ORDER BY age DESC LIMIT 10"',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the spreadsheet file',
        },
        query: {
          type: 'string',
          description: 'SQL-like query (SELECT columns WHERE condition ORDER BY column LIMIT n)',
        },
        sheet: {
          type: 'string',
          description: 'Sheet name for XLSX files',
        },
        cwd: {
          type: 'string',
          description: 'Base working directory for relative paths',
        },
      },
      required: ['path', 'query'],
    },
  };

  static readonly querySpreadsheetExecutor: ToolExecutor = async (input) => {
    const baseCwd = (input.cwd as string) || process.cwd();
    const rawPath = String(input.path || '').trim();
    const queryStr = String(input.query || '').trim();

    if (!rawPath) {
      throw new ToolExecutionError('Spreadsheet file path is required', {
        toolName: 'query_spreadsheet',
        toolInput: input,
        code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
        recoverable: false,
        retryable: false,
      });
    }

    if (!queryStr) {
      throw new ToolExecutionError('Query is required', {
        toolName: 'query_spreadsheet',
        toolInput: input,
        code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
        recoverable: false,
        retryable: false,
        suggestion: 'Example: SELECT name, age WHERE age > 25 ORDER BY age LIMIT 10',
      });
    }

    // Read the spreadsheet
    const readResult = await SpreadsheetTools.readSpreadsheetExecutor({
      path: rawPath,
      sheet: input.sheet,
      maxRows: 10000,
      cwd: baseCwd,
    });

    const parsed = JSON.parse(readResult) as {
      columns: string[];
      data: string[][];
    };

    const { columns, data } = parsed;

    try {
      // Parse the simple query
      const query = queryStr.replace(/^SELECT\s+/i, '');

      // Extract LIMIT
      let limit = Infinity;
      const limitMatch = query.match(/\s+LIMIT\s+(\d+)\s*$/i);
      let remaining = limitMatch ? query.slice(0, limitMatch.index) : query;
      if (limitMatch) limit = parseInt(limitMatch[1], 10);

      // Extract ORDER BY
      let orderBy: { column: string; dir: 'asc' | 'desc' } | undefined;
      const orderMatch = remaining.match(/\s+ORDER\s+BY\s+(\S+)(?:\s+(ASC|DESC))?\s*$/i);
      if (orderMatch) {
        remaining = remaining.slice(0, orderMatch.index);
        orderBy = { column: orderMatch[1], dir: (orderMatch[2]?.toLowerCase() || 'asc') as 'asc' | 'desc' };
      }

      // Extract WHERE
      let whereConditions: Array<{ column: string; op: string; value: string }> = [];
      const whereMatch = remaining.match(/\s+WHERE\s+(.*)/i);
      if (whereMatch) {
        remaining = remaining.slice(0, whereMatch.index);
        const condStr = whereMatch[1].trim();

        // Parse simple conditions: col op value [AND col op value]
        const condParts = condStr.split(/\s+AND\s+/i);
        for (const part of condParts) {
          const condMatch = part.trim().match(/^(\S+)\s*(>=|<=|!=|<>|=|>|<|LIKE|NOT\s+LIKE)\s*['"]?([^'"]*?)['"]?\s*$/i);
          if (condMatch) {
            let op = condMatch[2].toUpperCase();
            if (op === '=') op = 'eq';
            else if (op === '!=' || op === '<>') op = 'ne';
            else if (op === '>') op = 'gt';
            else if (op === '<') op = 'lt';
            else if (op === '>=') op = 'gte';
            else if (op === '<=') op = 'lte';
            else if (op === 'LIKE') op = 'like';
            else if (op.includes('NOT')) op = 'not_like';

            whereConditions.push({ column: condMatch[1], op, value: condMatch[3] });
          }
        }
      }

      // Parse SELECT columns
      const selectStr = remaining.trim();
      let selectColumns: string[];
      if (selectStr === '*' || selectStr === '') {
        selectColumns = columns;
      } else {
        selectColumns = selectStr.split(/\s*,\s*/).map(c => c.trim());
        // Validate columns exist
        for (const col of selectColumns) {
          if (!columns.includes(col)) {
            throw new ToolExecutionError(
              `Column "${col}" not found. Available: ${columns.join(', ')}`,
              {
                toolName: 'query_spreadsheet',
                toolInput: input,
                code: ErrorCodes.VALIDATION_OUT_OF_RANGE,
                recoverable: true,
                retryable: false,
              }
            );
          }
        }
      }

      // Apply WHERE filters
      let filteredData = data;
      for (const cond of whereConditions) {
        const colIdx = columns.indexOf(cond.column);
        if (colIdx < 0) continue;

        filteredData = filteredData.filter(row => {
          const val = row[colIdx] || '';
          const numVal = Number(val);
          const condNum = Number(cond.value);

          switch (cond.op) {
            case 'eq': return val === cond.value;
            case 'ne': return val !== cond.value;
            case 'gt': return !isNaN(numVal) && !isNaN(condNum) && numVal > condNum;
            case 'lt': return !isNaN(numVal) && !isNaN(condNum) && numVal < condNum;
            case 'gte': return !isNaN(numVal) && !isNaN(condNum) && numVal >= condNum;
            case 'lte': return !isNaN(numVal) && !isNaN(condNum) && numVal <= condNum;
            case 'like': {
              const pattern = cond.value.replace(/%/g, '.*').replace(/_/g, '.');
              return new RegExp(`^${pattern}$`, 'i').test(val);
            }
            case 'not_like': {
              const pattern = cond.value.replace(/%/g, '.*').replace(/_/g, '.');
              return !new RegExp(`^${pattern}$`, 'i').test(val);
            }
            default: return val === cond.value;
          }
        });
      }

      // Apply ORDER BY
      if (orderBy) {
        const orderIdx = columns.indexOf(orderBy.column);
        if (orderIdx >= 0) {
          const dir = orderBy.dir === 'desc' ? -1 : 1;
          filteredData = [...filteredData].sort((a, b) => {
            const aVal = a[orderIdx] || '';
            const bVal = b[orderIdx] || '';
            const aNum = Number(aVal);
            const bNum = Number(bVal);

            if (!isNaN(aNum) && !isNaN(bNum)) {
              return (aNum - bNum) * dir;
            }
            return aVal.localeCompare(bVal) * dir;
          });
        }
      }

      // Apply LIMIT
      const totalMatched = filteredData.length;
      if (limit < Infinity) {
        filteredData = filteredData.slice(0, limit);
      }

      // Project selected columns
      const selectedIndices = selectColumns.map(c => columns.indexOf(c));
      const projectedData = filteredData.map(row =>
        selectedIndices.map(i => (i >= 0 ? row[i] || '' : ''))
      );

      return JSON.stringify({
        query: queryStr,
        columns: selectColumns,
        matchedRows: totalMatched,
        returnedRows: projectedData.length,
        data: projectedData,
      });
    } catch (error) {
      if (error instanceof ToolExecutionError) throw error;
      throw new ToolExecutionError(
        `Query failed: ${error instanceof Error ? error.message : String(error)}`,
        {
          toolName: 'query_spreadsheet',
          toolInput: input,
          code: ErrorCodes.TOOL_EXECUTION_FAILED,
          recoverable: true,
          retryable: false,
          suggestion: 'Check your query syntax. Example: SELECT name, age WHERE age > 25 ORDER BY age LIMIT 10',
        }
      );
    }
  };

  /**
   * Register all spreadsheet tools
   */
  static registerAll(registry: ToolRegistry): void {
    registry.register(SpreadsheetTools.readSpreadsheetTool, SpreadsheetTools.readSpreadsheetExecutor);
    registry.register(SpreadsheetTools.analyzeSpreadsheetTool, SpreadsheetTools.analyzeSpreadsheetExecutor);
    registry.register(SpreadsheetTools.querySpreadsheetTool, SpreadsheetTools.querySpreadsheetExecutor);
  }
}
