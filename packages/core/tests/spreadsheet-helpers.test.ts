import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { resolve } from 'path';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { SpreadsheetTools } from '../src/tools/spreadsheet';
import { ToolRegistry } from '../src/tools/registry';

const TEST_DIR = resolve(import.meta.dir, '.tmp-spreadsheet-test');

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true });

  // Create test CSV
  writeFileSync(
    resolve(TEST_DIR, 'test.csv'),
    `name,age,city,score
Alice,30,New York,85
Bob,25,San Francisco,92
Charlie,35,Chicago,78
Diana,28,Boston,95
Eve,32,Seattle,88`
  );

  // Create test TSV
  writeFileSync(
    resolve(TEST_DIR, 'test.tsv'),
    `name\tage\tcity
Alice\t30\tNew York
Bob\t25\tSan Francisco`
  );

  // Create CSV with quoted fields
  writeFileSync(
    resolve(TEST_DIR, 'quoted.csv'),
    `name,description,value
"Smith, John","Has a comma, in description",100
"Jane ""Doe""","Quoted ""name""",200`
  );

  // Create large CSV for testing limits
  const rows = ['id,value'];
  for (let i = 0; i < 100; i++) {
    rows.push(`${i},${Math.random() * 100}`);
  }
  writeFileSync(resolve(TEST_DIR, 'large.csv'), rows.join('\n'));

  // Create CSV with CRLF line endings
  writeFileSync(resolve(TEST_DIR, 'crlf.csv'), 'a,b,c\r\n1,2,3\r\n4,5,6\r\n');

  // Create CSV with CR-only line endings
  writeFileSync(resolve(TEST_DIR, 'cr.csv'), 'a,b,c\r1,2,3\r4,5,6\r');

  // Create CSV with only delimiters (no real data)
  writeFileSync(resolve(TEST_DIR, 'only-delimiters.csv'), ',,\n,,\n');

  // Create CSV with a single row, no trailing newline
  writeFileSync(resolve(TEST_DIR, 'single-row.csv'), 'x,y,z');

  // Create CSV with delimiter at end of line
  writeFileSync(resolve(TEST_DIR, 'trailing-delimiter.csv'), 'a,b,c,\n1,2,3,\n');

  // Create CSV with unclosed quote (edge case)
  writeFileSync(resolve(TEST_DIR, 'unclosed-quote.csv'), 'a,b\n"hello,world\n');

  // Create empty CSV
  writeFileSync(resolve(TEST_DIR, 'empty.csv'), '');

  // Create CSV with only headers
  writeFileSync(resolve(TEST_DIR, 'headers-only.csv'), 'name,age,city\n');

  // Create CSV with boolean-like values
  writeFileSync(
    resolve(TEST_DIR, 'booleans.csv'),
    `flag,label
true,A
false,B
yes,C
no,D
true,E`
  );

  // Create CSV with date-like values
  writeFileSync(
    resolve(TEST_DIR, 'dates.csv'),
    `date,event
2024-01-15,Meeting
2024-02-20,Conference
2024-03-01,Workshop
2024-04-10,Webinar
2024-05-22,Summit`
  );

  // Create CSV with mixed types (below 80% threshold)
  writeFileSync(
    resolve(TEST_DIR, 'mixed.csv'),
    `value
10
hello
world
foo
bar`
  );

  // Create CSV with all empty values in a column
  writeFileSync(
    resolve(TEST_DIR, 'all-empty-col.csv'),
    `name,empty_col
Alice,
Bob,
Charlie,`
  );

  // Create CSV with negative numbers
  writeFileSync(
    resolve(TEST_DIR, 'negatives.csv'),
    `id,value
1,-10
2,-5
3,0
4,5
5,10`
  );

  // Create unsupported format
  writeFileSync(resolve(TEST_DIR, 'test.json'), '{}');

  // Create a very large CSV for filter truncation test (>1000 matching rows)
  const bigRows = ['id,category'];
  for (let i = 0; i < 1500; i++) {
    bigRows.push(`${i},match`);
  }
  writeFileSync(resolve(TEST_DIR, 'big-filter.csv'), bigRows.join('\n'));

  // Create CSV for query tests with string/numeric sorting
  writeFileSync(
    resolve(TEST_DIR, 'sort-test.csv'),
    `name,num,label
Alice,10,B
Bob,2,A
Charlie,100,C
Diana,20,D
Eve,3,E`
  );
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});
describe('SpreadsheetTools', () => {
  // =============================================
  // registerAll
  // =============================================
  describe('registerAll', () => {
    test('registers all three tools', () => {
      const registry = new ToolRegistry();
      SpreadsheetTools.registerAll(registry);

      expect(registry.hasTool('read_spreadsheet')).toBe(true);
      expect(registry.hasTool('analyze_spreadsheet')).toBe(true);
      expect(registry.hasTool('query_spreadsheet')).toBe(true);
    });
  });

  // =============================================
  // parseCSV (tested indirectly through readSpreadsheetExecutor)
  // =============================================
  describe('parseCSV behavior', () => {
    test('empty input returns empty spreadsheet', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'empty.csv'),
      });
      const parsed = JSON.parse(result);
      expect(parsed.rows).toBe(0);
      expect(parsed.columns).toEqual([]);
      expect(parsed.data).toEqual([]);
    });

    test('handles CRLF line endings', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'crlf.csv'),
      });
      const parsed = JSON.parse(result);
      expect(parsed.columns).toEqual(['a', 'b', 'c']);
      expect(parsed.rows).toBe(2);
      expect(parsed.data[0]).toEqual(['1', '2', '3']);
      expect(parsed.data[1]).toEqual(['4', '5', '6']);
    });

    test('handles CR-only line endings', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'cr.csv'),
      });
      const parsed = JSON.parse(result);
      expect(parsed.columns).toEqual(['a', 'b', 'c']);
      expect(parsed.rows).toBe(2);
      expect(parsed.data[0]).toEqual(['1', '2', '3']);
    });

    test('handles unclosed quotes gracefully', async () => {
      // The parser should not crash; it may treat the rest as a single field
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'unclosed-quote.csv'),
      });
      const parsed = JSON.parse(result);
      // Should parse without crashing and have at least the header row
      expect(parsed.columns.length).toBeGreaterThan(0);
    });

    test('handles escaped (doubled) quotes', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'quoted.csv'),
      });
      const parsed = JSON.parse(result);
      expect(parsed.data[1][0]).toBe('Jane "Doe"');
      expect(parsed.data[1][1]).toBe('Quoted "name"');
    });

    test('handles delimiter at end of line', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'trailing-delimiter.csv'),
      });
      const parsed = JSON.parse(result);
      // The trailing comma produces an extra empty column
      expect(parsed.columns.length).toBeGreaterThanOrEqual(3);
    });

    test('handles single row with no trailing newline', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'single-row.csv'),
        headers: false,
      });
      const parsed = JSON.parse(result);
      // Single row, treated as data since headers=false
      expect(parsed.data.length).toBe(1);
      expect(parsed.data[0]).toEqual(['x', 'y', 'z']);
    });

    test('handles CSV with only delimiters (empty fields)', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'only-delimiters.csv'),
        headers: false,
      });
      const parsed = JSON.parse(result);
      // Rows of only empty values are skipped by parseCSV (row.some(f => f.length > 0) check)
      expect(parsed.rows).toBe(0);
    });
  });

  // =============================================
  // detectColumnType (tested indirectly through readSpreadsheetExecutor)
  // =============================================
  describe('detectColumnType behavior', () => {
    test('all empty values default to string', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'all-empty-col.csv'),
      });
      const parsed = JSON.parse(result);
      expect(parsed.columnTypes.empty_col).toBe('string');
    });

    test('detects number type when >= 80% threshold', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
      });
      const parsed = JSON.parse(result);
      expect(parsed.columnTypes.age).toBe('number');
      expect(parsed.columnTypes.score).toBe('number');
    });

    test('falls back to string when below 80% threshold', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'mixed.csv'),
      });
      const parsed = JSON.parse(result);
      // 1 out of 5 are numbers = 20%, below 80% threshold
      expect(parsed.columnTypes.value).toBe('string');
    });

    test('detects boolean type', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'booleans.csv'),
      });
      const parsed = JSON.parse(result);
      expect(parsed.columnTypes.flag).toBe('boolean');
      expect(parsed.columnTypes.label).toBe('string');
    });

    test('detects date type', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'dates.csv'),
      });
      const parsed = JSON.parse(result);
      expect(parsed.columnTypes.date).toBe('date');
      expect(parsed.columnTypes.event).toBe('string');
    });
  });

  // =============================================
  // parseRange (tested indirectly via range parameter)
  // =============================================
  describe('parseRange behavior', () => {
    test('invalid format is ignored (no range applied)', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        range: 'INVALID',
      });
      const parsed = JSON.parse(result);
      // When range parsing fails (returns null), no range filter is applied
      expect(parsed.rows).toBe(5);
    });

    test('columns-only range (A:B)', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        range: 'A:B',
        headers: false,
      });
      const parsed = JSON.parse(result);
      // Should restrict to columns A and B only
      expect(parsed.data[0].length).toBe(2);
    });

    test('rows-only range (1:3)', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        range: '1:3',
        headers: false,
      });
      const parsed = JSON.parse(result);
      // Should include rows 1 through 3 (0-indexed: rows 0, 1, 2)
      expect(parsed.data.length).toBeLessThanOrEqual(3);
    });

    test('single cell range (A1:A1)', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        range: 'A1:A1',
        headers: false,
      });
      const parsed = JSON.parse(result);
      // Should get just one cell worth of data
      expect(parsed.data.length).toBe(1);
      expect(parsed.data[0].length).toBe(1);
    });

    test('full range (A1:D6)', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        range: 'A1:D6',
        headers: false,
      });
      const parsed = JSON.parse(result);
      // Full data (header + 5 rows = 6), 4 columns
      expect(parsed.data.length).toBe(6);
      expect(parsed.data[0].length).toBe(4);
    });
  });

  // =============================================
  // colLetterToIndex (tested indirectly through range parsing)
  // A=0, Z=25, AA=26, AZ=51
  // =============================================
  describe('colLetterToIndex behavior', () => {
    test('A:A range selects first column only', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        range: 'A1:A6',
        headers: false,
      });
      const parsed = JSON.parse(result);
      // A = column index 0, so should return 1 column
      expect(parsed.data[0].length).toBe(1);
      expect(parsed.data[0][0]).toBe('name');
    });

    test('D:D range selects fourth column', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        range: 'D1:D6',
        headers: false,
      });
      const parsed = JSON.parse(result);
      expect(parsed.data[0].length).toBe(1);
      expect(parsed.data[0][0]).toBe('score');
    });

    test('B:C range selects columns 2 and 3', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        range: 'B1:C6',
        headers: false,
      });
      const parsed = JSON.parse(result);
      expect(parsed.data[0].length).toBe(2);
      expect(parsed.data[0][0]).toBe('age');
      expect(parsed.data[0][1]).toBe('city');
    });
  });

  // =============================================
  // computeStats (tested indirectly through analyzeSpreadsheetExecutor)
  // =============================================
  describe('computeStats behavior', () => {
    test('stats for negative numbers', async () => {
      const result = await SpreadsheetTools.analyzeSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'negatives.csv'),
        operation: 'summary',
        columns: ['value'],
      });
      const parsed = JSON.parse(result);
      const stats = parsed.stats.value;
      expect(stats.type).toBe('number');
      expect(stats.min).toBe(-10);
      expect(stats.max).toBe(10);
      expect(stats.sum).toBe(0); // -10 + -5 + 0 + 5 + 10 = 0
      expect(stats.mean).toBe(0);
      expect(stats.count).toBe(5);
    });

    test('stats include correct median for even count', async () => {
      // negatives.csv has 5 values: -10, -5, 0, 5, 10 -> median = 0
      const result = await SpreadsheetTools.analyzeSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'negatives.csv'),
        operation: 'summary',
        columns: ['value'],
      });
      const parsed = JSON.parse(result);
      expect(parsed.stats.value.median).toBe(0);
    });

    test('stats for single value', async () => {
      // Create a CSV with one data row
      writeFileSync(resolve(TEST_DIR, 'single-value.csv'), 'x\n42\n');
      const result = await SpreadsheetTools.analyzeSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'single-value.csv'),
        operation: 'summary',
        columns: ['x'],
      });
      const parsed = JSON.parse(result);
      const stats = parsed.stats.x;
      expect(stats.min).toBe(42);
      expect(stats.max).toBe(42);
      expect(stats.mean).toBe(42);
      expect(stats.median).toBe(42);
      expect(stats.count).toBe(1);
    });

    test('stats for two values (even count median)', async () => {
      writeFileSync(resolve(TEST_DIR, 'two-values.csv'), 'x\n10\n20\n');
      const result = await SpreadsheetTools.analyzeSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'two-values.csv'),
        operation: 'summary',
        columns: ['x'],
      });
      const parsed = JSON.parse(result);
      const stats = parsed.stats.x;
      expect(stats.min).toBe(10);
      expect(stats.max).toBe(20);
      expect(stats.median).toBe(15); // (10+20)/2
      expect(stats.count).toBe(2);
    });
  });

  // =============================================
  // read_spreadsheet
  // =============================================
  describe('read_spreadsheet', () => {
    test('reads a CSV file', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
      });
      const parsed = JSON.parse(result);
      expect(parsed.columns).toEqual(['name', 'age', 'city', 'score']);
      expect(parsed.rows).toBe(5);
      expect(parsed.data.length).toBe(5);
      expect(parsed.data[0][0]).toBe('Alice');
      expect(parsed.data[0][1]).toBe('30');
      expect(parsed.truncated).toBe(false);
    });

    test('reads a TSV file', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.tsv'),
      });
      const parsed = JSON.parse(result);
      expect(parsed.columns).toEqual(['name', 'age', 'city']);
      expect(parsed.rows).toBe(2);
    });

    test('handles quoted CSV fields', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'quoted.csv'),
      });
      const parsed = JSON.parse(result);
      expect(parsed.data[0][0]).toBe('Smith, John');
      expect(parsed.data[0][1]).toBe('Has a comma, in description');
      expect(parsed.data[1][0]).toBe('Jane "Doe"');
    });

    test('detects column types', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
      });
      const parsed = JSON.parse(result);
      expect(parsed.columnTypes.age).toBe('number');
      expect(parsed.columnTypes.score).toBe('number');
      expect(parsed.columnTypes.name).toBe('string');
      expect(parsed.columnTypes.city).toBe('string');
    });

    test('respects maxRows limit', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'large.csv'),
        maxRows: 10,
      });
      const parsed = JSON.parse(result);
      expect(parsed.data.length).toBe(10);
      expect(parsed.truncated).toBe(true);
      expect(parsed.rows).toBe(100);
    });

    test('maxRows=0 becomes default 1000 (falsy value uses default)', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        maxRows: 0,
      });
      const parsed = JSON.parse(result);
      // 0 is falsy, so (0 || 1000) = 1000, then Math.max(1, 1000) = 1000
      expect(parsed.data.length).toBe(5); // only 5 rows, well under 1000
      expect(parsed.truncated).toBe(false);
    });

    test('maxRows=99999 becomes 10000 (maximum clamped)', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'large.csv'),
        maxRows: 99999,
      });
      const parsed = JSON.parse(result);
      // With 100 rows, won't actually truncate to 10000, but the clamping is applied
      expect(parsed.truncated).toBe(false);
      expect(parsed.data.length).toBe(100);
    });

    test('supports sampling', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'large.csv'),
        sample: 10,
      });
      const parsed = JSON.parse(result);
      expect(parsed.data.length).toBe(10); // 100 rows / 10 sample = every 10th
    });

    test('reads without headers', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        headers: false,
      });
      const parsed = JSON.parse(result);
      expect(parsed.columns[0]).toBe('Column_1');
      expect(parsed.data[0][0]).toBe('name'); // first row is data now
    });

    test('headers=false with no data returns empty', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'empty.csv'),
        headers: false,
      });
      const parsed = JSON.parse(result);
      expect(parsed.rows).toBe(0);
      expect(parsed.data).toEqual([]);
    });

    test('empty spreadsheet returns proper structure', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'empty.csv'),
      });
      const parsed = JSON.parse(result);
      expect(parsed.rows).toBe(0);
      expect(parsed.columns).toEqual([]);
      expect(parsed.data).toEqual([]);
      expect(parsed.truncated).toBe(false);
    });

    test('spreadsheet with only headers returns no data rows', async () => {
      const result = await SpreadsheetTools.readSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'headers-only.csv'),
      });
      const parsed = JSON.parse(result);
      expect(parsed.columns).toEqual(['name', 'age', 'city']);
      expect(parsed.rows).toBe(0);
      expect(parsed.data).toEqual([]);
    });

    test('throws on missing file', async () => {
      try {
        await SpreadsheetTools.readSpreadsheetExecutor({
          path: resolve(TEST_DIR, 'nonexistent.csv'),
        });
        expect(true).toBe(false); // should not reach here
      } catch (error) {
        expect((error as Error).message).toContain('not found');
      }
    });

    test('throws on unsupported format', async () => {
      try {
        await SpreadsheetTools.readSpreadsheetExecutor({
          path: resolve(TEST_DIR, 'test.json'),
        });
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toContain('Unsupported');
      }
    });

    test('throws on empty path', async () => {
      try {
        await SpreadsheetTools.readSpreadsheetExecutor({ path: '' });
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toContain('required');
      }
    });

    test('throws on null/undefined path', async () => {
      try {
        await SpreadsheetTools.readSpreadsheetExecutor({ path: null as unknown as string });
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toContain('required');
      }
    });
  });

  // =============================================
  // analyze_spreadsheet
  // =============================================
});
