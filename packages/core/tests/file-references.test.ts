import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { extractFileReferences, expandFileReferences } from '../src/agent/file-references';

// Create temp directory WITHIN the project so isPathSafe() allows access
const TEST_DIR = join(import.meta.dir, '__file-refs-fixture__');

beforeAll(() => {
  mkdirSync(join(TEST_DIR, 'src', 'components'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'data'), { recursive: true });

  writeFileSync(join(TEST_DIR, 'src', 'index.ts'), 'export const hello = "world";\n');
  writeFileSync(join(TEST_DIR, 'src', 'components', 'Button.tsx'), '<button>Click</button>\n');
  writeFileSync(join(TEST_DIR, 'data', 'config.json'), '{"key": "value"}\n');
  writeFileSync(join(TEST_DIR, 'readme.md'), '# Hello\n\nThis is a readme.\n');
  writeFileSync(join(TEST_DIR, 'script.py'), 'print("hello")\n');
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('extractFileReferences', () => {
  it('extracts @path with slash', () => {
    const refs = extractFileReferences('look at @src/index.ts');
    expect(refs).toEqual([{ path: 'src/index.ts' }]);
  });

  it('extracts @path with extension (no slash)', () => {
    const refs = extractFileReferences('check @readme.md');
    expect(refs).toEqual([{ path: 'readme.md' }]);
  });

  it('extracts multiple references', () => {
    const refs = extractFileReferences('compare @src/index.ts and @data/config.json');
    expect(refs).toHaveLength(2);
    expect(refs[0].path).toBe('src/index.ts');
    expect(refs[1].path).toBe('data/config.json');
  });

  it('extracts @path at start of message', () => {
    const refs = extractFileReferences('@src/index.ts has a bug');
    expect(refs).toEqual([{ path: 'src/index.ts' }]);
  });

  it('ignores email addresses', () => {
    const refs = extractFileReferences('email me at user@example.com');
    // user@example.com — "user" has no / or ., so the captured path would be "example.com"
    // which has a dot, so it would match. Let's verify:
    // Actually the pattern is (?:^|\s)@... and "user@example.com" — the @ is preceded by "user" not whitespace
    // So this should NOT match
    expect(refs).toEqual([]);
  });

  it('ignores bare @ without path', () => {
    const refs = extractFileReferences('hello @ world');
    expect(refs).toEqual([]);
  });

  it('extracts directory references', () => {
    const refs = extractFileReferences('list @src/components/');
    expect(refs).toEqual([{ path: 'src/components/' }]);
  });

  it('returns empty array for no references', () => {
    const refs = extractFileReferences('just a normal message');
    expect(refs).toEqual([]);
  });
});

describe('expandFileReferences', () => {
  it('returns unchanged message when no references', async () => {
    const result = await expandFileReferences('hello world', TEST_DIR);
    expect(result).toBe('hello world');
  });

  it('expands a TypeScript file reference', async () => {
    const result = await expandFileReferences('look at @src/index.ts', TEST_DIR);
    expect(result).toContain('look at @src/index.ts');
    expect(result).toContain('[Content of src/index.ts]');
    expect(result).toContain('```typescript');
    expect(result).toContain('export const hello = "world";');
    expect(result).toContain('```');
  });

  it('expands a JSON file reference', async () => {
    const result = await expandFileReferences('check @data/config.json', TEST_DIR);
    expect(result).toContain('```json');
    expect(result).toContain('"key": "value"');
  });

  it('expands a Python file reference', async () => {
    const result = await expandFileReferences('look at @script.py', TEST_DIR);
    expect(result).toContain('```python');
    expect(result).toContain('print("hello")');
  });

  it('expands a markdown file reference', async () => {
    const result = await expandFileReferences('read @readme.md', TEST_DIR);
    expect(result).toContain('```markdown');
    expect(result).toContain('# Hello');
  });

  it('lists directory contents for directory references', async () => {
    const result = await expandFileReferences('list @src/', TEST_DIR);
    expect(result).toContain('[Contents of src/]');
    expect(result).toContain('components');
    expect(result).toContain('index.ts');
  });

  it('handles non-existent file gracefully', async () => {
    const result = await expandFileReferences('look at @src/missing.ts', TEST_DIR);
    expect(result).toContain('[src/missing.ts]: File not found');
  });

  it('expands multiple file references', async () => {
    const result = await expandFileReferences(
      'compare @src/index.ts and @data/config.json',
      TEST_DIR
    );
    expect(result).toContain('[Content of src/index.ts]');
    expect(result).toContain('[Content of data/config.json]');
    expect(result).toContain('```typescript');
    expect(result).toContain('```json');
  });

  it('preserves original message before appended context', async () => {
    const msg = 'explain what @src/index.ts does';
    const result = await expandFileReferences(msg, TEST_DIR);
    // Original message should still be at the start
    expect(result.startsWith(msg)).toBe(true);
  });

  it('handles nested path references', async () => {
    const result = await expandFileReferences(
      'look at @src/components/Button.tsx',
      TEST_DIR
    );
    expect(result).toContain('[Content of src/components/Button.tsx]');
    expect(result).toContain('```tsx');
    expect(result).toContain('<button>Click</button>');
  });
});
