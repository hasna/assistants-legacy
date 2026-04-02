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
  describe('analyze_spreadsheet', () => {
    test('computes summary statistics for all columns', async () => {
      const result = await SpreadsheetTools.analyzeSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        operation: 'summary',
      });
      const parsed = JSON.parse(result);
      expect(parsed.operation).toBe('summary');
      expect(parsed.totalRows).toBe(5);

      // Numeric column stats
      const ageStats = parsed.stats.age;
      expect(ageStats.type).toBe('number');
      expect(ageStats.min).toBe(25);
      expect(ageStats.max).toBe(35);
      expect(ageStats.count).toBe(5);

      // String column stats
      const nameStats = parsed.stats.name;
      expect(nameStats.type).toBe('string');
      expect(nameStats.uniqueCount).toBe(5);
      expect(nameStats.totalCount).toBe(5);
    });

    test('summary with specific columns', async () => {
      const result = await SpreadsheetTools.analyzeSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        operation: 'summary',
        columns: ['age', 'score'],
      });
      const parsed = JSON.parse(result);
      expect(parsed.columns).toEqual(['age', 'score']);
      expect(parsed.stats.age).toBeDefined();
      expect(parsed.stats.score).toBeDefined();
      // name and city should not be present
      expect(parsed.stats.name).toBeUndefined();
      expect(parsed.stats.city).toBeUndefined();
    });

    test('summary with nonexistent column is skipped', async () => {
      const result = await SpreadsheetTools.analyzeSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        operation: 'summary',
        columns: ['age', 'nonexistent'],
      });
      const parsed = JSON.parse(result);
      expect(parsed.stats.age).toBeDefined();
      // nonexistent column is silently skipped (colIdx < 0 -> continue)
      expect(parsed.stats.nonexistent).toBeUndefined();
    });

    test('filters rows with gt operator', async () => {
      const result = await SpreadsheetTools.analyzeSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        operation: 'filter',
        filter: { column: 'age', op: 'gt', value: '30' },
      });
      const parsed = JSON.parse(result);
      expect(parsed.operation).toBe('filter');
      expect(parsed.matchedRows).toBe(2); // Charlie(35) and Eve(32)
    });

    test('filters with string contains', async () => {
      const result = await SpreadsheetTools.analyzeSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        operation: 'filter',
        filter: { column: 'city', op: 'contains', value: 'new' },
      });
      const parsed = JSON.parse(result);
      expect(parsed.matchedRows).toBe(1); // New York
    });

    test('filters with starts_with operator', async () => {
      const result = await SpreadsheetTools.analyzeSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        operation: 'filter',
        filter: { column: 'city', op: 'starts_with', value: 'san' },
      });
      const parsed = JSON.parse(result);
      expect(parsed.matchedRows).toBe(1); // San Francisco
    });

    test('filters with ends_with operator', async () => {
      const result = await SpreadsheetTools.analyzeSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        operation: 'filter',
        filter: { column: 'city', op: 'ends_with', value: 'ton' },
      });
      const parsed = JSON.parse(result);
      expect(parsed.matchedRows).toBe(1); // Boston
    });

    test('filter with unknown op defaults to equality check', async () => {
      const result = await SpreadsheetTools.analyzeSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        operation: 'filter',
        filter: { column: 'name', op: 'unknown_op', value: 'Alice' },
      });
      const parsed = JSON.parse(result);
      // Default case: cellValue === filter.value
      expect(parsed.matchedRows).toBe(1);
    });

    test('filter results > 1000 are truncated', async () => {
      const result = await SpreadsheetTools.analyzeSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'big-filter.csv'),
        operation: 'filter',
        filter: { column: 'category', op: 'eq', value: 'match' },
      });
      const parsed = JSON.parse(result);
      expect(parsed.matchedRows).toBe(1500);
      expect(parsed.data.length).toBe(1000);
      expect(parsed.truncated).toBe(true);
    });

    test('aggregates by group', async () => {
      const result = await SpreadsheetTools.analyzeSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        operation: 'aggregate',
        groupBy: 'city',
      });
      const parsed = JSON.parse(result);
      expect(parsed.operation).toBe('aggregate');
      expect(parsed.groupCount).toBe(5); // 5 unique cities
      expect(parsed.groups['New York'].count).toBe(1);
    });

    test('aggregate with empty groups produces per-group stats', async () => {
      // Create a CSV with duplicate group values
      writeFileSync(
        resolve(TEST_DIR, 'agg-groups.csv'),
        `team,score
A,10
A,20
B,30
B,40
B,50`
      );
      const result = await SpreadsheetTools.analyzeSpreadsheetExecutor({
        path: resolve(TEST_DIR, 'agg-groups.csv'),
        operation: 'aggregate',
        groupBy: 'team',
      });
      const parsed = JSON.parse(result);
      expect(parsed.groupCount).toBe(2);
      expect(parsed.groups['A'].count).toBe(2);
      expect(parsed.groups['A'].score.sum).toBe(30);
      expect(parsed.groups['B'].count).toBe(3);
      expect(parsed.groups['B'].score.sum).toBe(120);
    });

    test('throws on unknown operation', async () => {
      try {
        await SpreadsheetTools.analyzeSpreadsheetExecutor({
          path: resolve(TEST_DIR, 'test.csv'),
          operation: 'invalid_op',
        });
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toContain('Unknown operation');
      }
    });

    test('throws on missing filter for filter operation', async () => {
      try {
        await SpreadsheetTools.analyzeSpreadsheetExecutor({
          path: resolve(TEST_DIR, 'test.csv'),
          operation: 'filter',
        });
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toContain('Filter condition');
      }
    });

    test('throws on missing groupBy for aggregate', async () => {
      try {
        await SpreadsheetTools.analyzeSpreadsheetExecutor({
          path: resolve(TEST_DIR, 'test.csv'),
          operation: 'aggregate',
        });
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toContain('groupBy');
      }
    });

    test('throws on empty path', async () => {
      try {
        await SpreadsheetTools.analyzeSpreadsheetExecutor({
          path: '',
          operation: 'summary',
        });
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toContain('required');
      }
    });
  });

  // =============================================
  // query_spreadsheet
  // =============================================
  describe('query_spreadsheet', () => {
    test('selects specific columns', async () => {
      const result = await SpreadsheetTools.querySpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        query: 'SELECT name, age',
      });
      const parsed = JSON.parse(result);
      expect(parsed.columns).toEqual(['name', 'age']);
      expect(parsed.matchedRows).toBe(5);
      expect(parsed.data[0].length).toBe(2);
    });

    test('SELECT * returns all columns', async () => {
      const result = await SpreadsheetTools.querySpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        query: 'SELECT *',
      });
      const parsed = JSON.parse(result);
      expect(parsed.columns).toEqual(['name', 'age', 'city', 'score']);
      expect(parsed.matchedRows).toBe(5);
      expect(parsed.data[0].length).toBe(4);
    });

    test('filters with WHERE clause', async () => {
      const result = await SpreadsheetTools.querySpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        query: 'SELECT name, score WHERE score > 90',
      });
      const parsed = JSON.parse(result);
      expect(parsed.matchedRows).toBe(2); // Bob(92), Diana(95)
    });

    test('orders results ASC', async () => {
      const result = await SpreadsheetTools.querySpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        query: 'SELECT name, age ORDER BY age ASC',
      });
      const parsed = JSON.parse(result);
      expect(parsed.data[0][0]).toBe('Bob'); // youngest (25)
      expect(parsed.data[parsed.data.length - 1][0]).toBe('Charlie'); // oldest (35)
    });

    test('ORDER BY without ASC/DESC defaults to ASC', async () => {
      const result = await SpreadsheetTools.querySpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        query: 'SELECT name, age ORDER BY age',
      });
      const parsed = JSON.parse(result);
      // Default is ASC
      expect(parsed.data[0][0]).toBe('Bob'); // youngest (25)
      expect(parsed.data[parsed.data.length - 1][0]).toBe('Charlie'); // oldest (35)
    });

    test('ORDER BY DESC', async () => {
      const result = await SpreadsheetTools.querySpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        query: 'SELECT name, score ORDER BY score DESC',
      });
      const parsed = JSON.parse(result);
      expect(parsed.data[0][0]).toBe('Diana'); // highest (95)
      expect(parsed.data[parsed.data.length - 1][0]).toBe('Charlie'); // lowest (78)
    });

    test('limits results', async () => {
      const result = await SpreadsheetTools.querySpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        query: 'SELECT * LIMIT 2',
      });
      const parsed = JSON.parse(result);
      expect(parsed.returnedRows).toBe(2);
    });

    test('combines WHERE, ORDER BY, and LIMIT', async () => {
      const result = await SpreadsheetTools.querySpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        query: 'SELECT name, score WHERE score >= 85 ORDER BY score DESC LIMIT 3',
      });
      const parsed = JSON.parse(result);
      expect(parsed.returnedRows).toBeLessThanOrEqual(3);
      // First result should be highest score
      if (parsed.data.length > 1) {
        const firstScore = Number(parsed.data[0][1]);
        const secondScore = Number(parsed.data[1][1]);
        expect(firstScore).toBeGreaterThanOrEqual(secondScore);
      }
    });

    test('multiple WHERE AND conditions', async () => {
      const result = await SpreadsheetTools.querySpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        query: 'SELECT name, age, score WHERE age > 25 AND score > 85',
      });
      const parsed = JSON.parse(result);
      // Alice(30,85): age>25 but score NOT > 85; Bob(25,92): age NOT >25;
      // Charlie(35,78): score NOT >85; Diana(28,95): both; Eve(32,88): both
      expect(parsed.matchedRows).toBe(2); // Diana and Eve
    });

    test('!= operator in WHERE', async () => {
      const result = await SpreadsheetTools.querySpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        query: "SELECT name WHERE name != Alice",
      });
      const parsed = JSON.parse(result);
      expect(parsed.matchedRows).toBe(4);
      const names = parsed.data.map((r: string[]) => r[0]);
      expect(names).not.toContain('Alice');
    });

    test('<> operator in WHERE (same as !=)', async () => {
      const result = await SpreadsheetTools.querySpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        query: "SELECT name WHERE name <> Bob",
      });
      const parsed = JSON.parse(result);
      expect(parsed.matchedRows).toBe(4);
      const names = parsed.data.map((r: string[]) => r[0]);
      expect(names).not.toContain('Bob');
    });

    test('LIKE with % wildcards', async () => {
      const result = await SpreadsheetTools.querySpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        query: "SELECT name, city WHERE city LIKE '%York%'",
      });
      const parsed = JSON.parse(result);
      expect(parsed.matchedRows).toBe(1);
      expect(parsed.data[0][1]).toBe('New York');
    });

    test('LIKE with leading %', async () => {
      const result = await SpreadsheetTools.querySpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        query: "SELECT name, city WHERE city LIKE '%ton'",
      });
      const parsed = JSON.parse(result);
      expect(parsed.matchedRows).toBe(1);
      expect(parsed.data[0][1]).toBe('Boston');
    });

    test('NOT LIKE excludes matching rows', async () => {
      const result = await SpreadsheetTools.querySpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        query: "SELECT name, city WHERE city NOT LIKE '%York%'",
      });
      const parsed = JSON.parse(result);
      expect(parsed.matchedRows).toBe(4);
      const cities = parsed.data.map((r: string[]) => r[1]);
      expect(cities).not.toContain('New York');
    });

    test('ORDER BY nonexistent column is ignored', async () => {
      const result = await SpreadsheetTools.querySpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        query: 'SELECT name ORDER BY nonexistent_col',
      });
      const parsed = JSON.parse(result);
      // Should still return results, just unsorted
      expect(parsed.matchedRows).toBe(5);
      expect(parsed.returnedRows).toBe(5);
    });

    test('empty result set returns zero rows', async () => {
      const result = await SpreadsheetTools.querySpreadsheetExecutor({
        path: resolve(TEST_DIR, 'test.csv'),
        query: 'SELECT name WHERE age > 1000',
      });
      const parsed = JSON.parse(result);
      expect(parsed.matchedRows).toBe(0);
      expect(parsed.returnedRows).toBe(0);
      expect(parsed.data).toEqual([]);
    });

    test('numeric vs string sorting', async () => {
      // sort-test.csv: Alice(10), Bob(2), Charlie(100), Diana(20), Eve(3)
      const numResult = await SpreadsheetTools.querySpreadsheetExecutor({
        path: resolve(TEST_DIR, 'sort-test.csv'),
        query: 'SELECT name, num ORDER BY num ASC',
      });
      const numParsed = JSON.parse(numResult);
      // Numeric sort: 2, 3, 10, 20, 100
      expect(numParsed.data[0][1]).toBe('2');
      expect(numParsed.data[1][1]).toBe('3');
      expect(numParsed.data[2][1]).toBe('10');

      const strResult = await SpreadsheetTools.querySpreadsheetExecutor({
        path: resolve(TEST_DIR, 'sort-test.csv'),
        query: 'SELECT name, label ORDER BY label ASC',
      });
      const strParsed = JSON.parse(strResult);
      // String sort: A, B, C, D, E
      expect(strParsed.data[0][1]).toBe('A');
      expect(strParsed.data[1][1]).toBe('B');
    });

    test('throws on empty query', async () => {
      try {
        await SpreadsheetTools.querySpreadsheetExecutor({
          path: resolve(TEST_DIR, 'test.csv'),
          query: '',
        });
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toContain('required');
      }
    });

    test('throws on invalid column in SELECT', async () => {
      try {
        await SpreadsheetTools.querySpreadsheetExecutor({
          path: resolve(TEST_DIR, 'test.csv'),
          query: 'SELECT nonexistent_column',
        });
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toContain('not found');
      }
    });

    test('throws on empty path', async () => {
      try {
        await SpreadsheetTools.querySpreadsheetExecutor({
          path: '',
          query: 'SELECT *',
        });
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toContain('required');
      }
    });

    test('throws on missing file', async () => {
      try {
        await SpreadsheetTools.querySpreadsheetExecutor({
          path: resolve(TEST_DIR, 'nonexistent.csv'),
          query: 'SELECT *',
        });
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toBeDefined();
      }
    });
  });

  // =============================================
  // Error paths
  // =============================================
  describe('error paths', () => {
    test('read_spreadsheet: missing file throws', async () => {
      try {
        await SpreadsheetTools.readSpreadsheetExecutor({
          path: resolve(TEST_DIR, 'does-not-exist.csv'),
        });
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toContain('not found');
      }
    });

    test('read_spreadsheet: unsupported format throws', async () => {
      writeFileSync(resolve(TEST_DIR, 'data.xml'), '<root/>');
      try {
        await SpreadsheetTools.readSpreadsheetExecutor({
          path: resolve(TEST_DIR, 'data.xml'),
        });
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toContain('Unsupported');
      }
    });

    test('read_spreadsheet: empty path throws', async () => {
      try {
        await SpreadsheetTools.readSpreadsheetExecutor({ path: '' });
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toContain('required');
      }
    });

    test('analyze_spreadsheet: empty path throws', async () => {
      try {
        await SpreadsheetTools.analyzeSpreadsheetExecutor({
          path: '',
          operation: 'summary',
        });
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toContain('required');
      }
    });

    test('query_spreadsheet: empty path throws', async () => {
      try {
        await SpreadsheetTools.querySpreadsheetExecutor({
          path: '',
          query: 'SELECT *',
        });
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toContain('required');
      }
    });

    test('query_spreadsheet: empty query throws', async () => {
      try {
        await SpreadsheetTools.querySpreadsheetExecutor({
          path: resolve(TEST_DIR, 'test.csv'),
          query: '',
        });
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toContain('required');
      }
    });

    test('analyze_spreadsheet: filter on nonexistent column throws', async () => {
      try {
        await SpreadsheetTools.analyzeSpreadsheetExecutor({
          path: resolve(TEST_DIR, 'test.csv'),
          operation: 'filter',
          filter: { column: 'nonexistent', op: 'eq', value: 'x' },
        });
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toContain('not found');
      }
    });

    test('analyze_spreadsheet: aggregate on nonexistent column throws', async () => {
      try {
        await SpreadsheetTools.analyzeSpreadsheetExecutor({
          path: resolve(TEST_DIR, 'test.csv'),
          operation: 'aggregate',
          groupBy: 'nonexistent',
        });
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toContain('not found');
      }
    });
  });
});
