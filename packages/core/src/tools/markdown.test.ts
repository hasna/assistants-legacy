import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { MarkdownTools, __test__ } from './markdown';

const { parseMarkdown, stringifyMarkdown, getHeadingTree, extractSection, getHeadingText } = __test__;

// Create temp directory WITHIN the project so isPathSafe() allows access
const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..');
let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(PROJECT_ROOT, '.test-md-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function writeTestFile(name: string, content: string): Promise<string> {
  const filePath = join(tempDir, name);
  const dir = join(filePath, '..');
  await mkdir(dir, { recursive: true });
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

// All tool calls pass cwd so the security validator resolves correctly
function withCwd(input: Record<string, unknown>): Record<string, unknown> {
  return { ...input, cwd: tempDir };
}

// ============================================
// Helper unit tests
// ============================================

describe('parseMarkdown / stringifyMarkdown', () => {
  test('round-trips basic markdown', () => {
    const input = '# Hello\n\nWorld\n';
    const tree = parseMarkdown(input);
    expect(tree.type).toBe('root');
    const output = stringifyMarkdown(tree);
    expect(output).toContain('# Hello');
    expect(output).toContain('World');
  });

  test('handles GFM tables', () => {
    const input = '| a | b |\n| --- | --- |\n| 1 | 2 |\n';
    const tree = parseMarkdown(input);
    expect(tree.children.some((c: { type: string }) => c.type === 'table')).toBe(true);
  });

  test('handles frontmatter', () => {
    const input = '---\ntitle: Test\n---\n\n# Hello\n';
    const tree = parseMarkdown(input);
    expect(tree.children.some((c: { type: string }) => c.type === 'yaml')).toBe(true);
  });
});

describe('getHeadingTree', () => {
  test('builds nested heading tree', () => {
    const tree = parseMarkdown('# One\n\n## Two\n\n## Three\n');
    const headings = getHeadingTree(tree);
    expect(headings.length).toBe(1);
    expect(headings[0].text).toBe('One');
    expect(headings[0].children.length).toBe(2);
    expect(headings[0].children[0].text).toBe('Two');
    expect(headings[0].children[1].text).toBe('Three');
  });

  test('handles multiple top-level headings', () => {
    const tree = parseMarkdown('# A\n\n# B\n\n# C\n');
    const headings = getHeadingTree(tree);
    expect(headings.length).toBe(3);
  });
});

describe('extractSection', () => {
  const md = '# Title\n\nIntro text\n\n## Section A\n\nContent A\n\n## Section B\n\nContent B\n\n### Sub B\n\nSub content\n';

  test('extracts section with children', () => {
    const result = extractSection(md, 'Section B', true);
    expect(result).toContain('## Section B');
    expect(result).toContain('Content B');
    expect(result).toContain('### Sub B');
    expect(result).toContain('Sub content');
  });

  test('extracts section without children still includes sub-section content', () => {
    const result = extractSection(md, 'Section B', false);
    expect(result).toContain('## Section B');
    expect(result).toContain('Content B');
  });

  test('returns null for missing section', () => {
    const result = extractSection(md, 'NonExistent', true);
    expect(result).toBeNull();
  });
});

// ============================================
// md_read tool tests
// ============================================

describe('md_read', () => {
  test('reads a markdown file with outline and content', async () => {
    const filePath = await writeTestFile('readme.md', '# My Project\n\nDescription\n\n## Install\n\n```bash\nnpm install\n```\n\n## Usage\n\nUse it.\n');

    const result = await MarkdownTools.mdReadExecutor(withCwd({ path: filePath }));
    const parsed = JSON.parse(result);

    expect(parsed.outline).toContain('My Project');
    expect(parsed.outline).toContain('Install');
    expect(parsed.outline).toContain('Usage');
    expect(parsed.content).toContain('# My Project');
    expect(parsed.lines).toBeGreaterThan(0);
  });

  test('reads frontmatter', async () => {
    const filePath = await writeTestFile('post.md', '---\ntitle: Hello\ntags:\n  - test\n---\n\n# Content\n\nBody\n');

    const result = await MarkdownTools.mdReadExecutor(withCwd({ path: filePath }));
    const parsed = JSON.parse(result);

    expect(parsed.frontmatter).toBeDefined();
    expect(parsed.frontmatter.title).toBe('Hello');
    expect(parsed.frontmatter.tags).toEqual(['test']);
  });

  test('extracts a specific section', async () => {
    const filePath = await writeTestFile('doc.md', '# Title\n\nIntro\n\n## Install\n\nRun npm install\n\n## Usage\n\nUse it\n');

    const result = await MarkdownTools.mdReadExecutor(withCwd({ path: filePath, section: 'Install' }));
    const parsed = JSON.parse(result);

    expect(parsed.content).toContain('## Install');
    expect(parsed.content).toContain('Run npm install');
    expect(parsed.content).not.toContain('## Usage');
  });

  test('throws for missing section', async () => {
    const filePath = await writeTestFile('doc.md', '# Title\n\n## Existing\n\nContent\n');

    await expect(
      MarkdownTools.mdReadExecutor(withCwd({ path: filePath, section: 'NonExistent' })),
    ).rejects.toThrow(/not found/);
  });

  test('throws for missing file', async () => {
    await expect(
      MarkdownTools.mdReadExecutor(withCwd({ path: join(tempDir, 'missing.md') })),
    ).rejects.toThrow(/not found/i);
  });
});

// ============================================
// md_extract tool tests
// ============================================

describe('md_extract', () => {
  test('extracts code blocks', async () => {
    const filePath = await writeTestFile('code.md', '# Code\n\n```typescript\nconst x = 1;\n```\n\n```python\nprint("hi")\n```\n');

    const result = await MarkdownTools.mdExtractExecutor(withCwd({ path: filePath, selector: 'code' }));
    const parsed = JSON.parse(result);

    expect(parsed.count).toBe(2);
    expect(parsed.items[0].language).toBe('typescript');
    expect(parsed.items[0].value).toContain('const x = 1');
    expect(parsed.items[1].language).toBe('python');
  });

  test('filters code blocks by language', async () => {
    const filePath = await writeTestFile('code.md', '```ts\nlet a = 1;\n```\n\n```python\nx = 2\n```\n');

    const result = await MarkdownTools.mdExtractExecutor(withCwd({ path: filePath, selector: 'code', language: 'ts' }));
    const parsed = JSON.parse(result);

    expect(parsed.count).toBe(1);
    expect(parsed.items[0].language).toBe('ts');
  });

  test('extracts links', async () => {
    const filePath = await writeTestFile('links.md', '# Links\n\n[Google](https://google.com)\n\n[GitHub](https://github.com "GH")\n');

    const result = await MarkdownTools.mdExtractExecutor(withCwd({ path: filePath, selector: 'links' }));
    const parsed = JSON.parse(result);

    expect(parsed.count).toBe(2);
    expect(parsed.items[0].url).toBe('https://google.com');
    expect(parsed.items[0].text).toBe('Google');
    expect(parsed.items[1].title).toBe('GH');
  });

  test('extracts images', async () => {
    const filePath = await writeTestFile('images.md', '# Images\n\n![Alt text](./img.png "Title")\n');

    const result = await MarkdownTools.mdExtractExecutor(withCwd({ path: filePath, selector: 'images' }));
    const parsed = JSON.parse(result);

    expect(parsed.count).toBe(1);
    expect(parsed.items[0].alt).toBe('Alt text');
    expect(parsed.items[0].url).toBe('./img.png');
  });

  test('extracts TODO items', async () => {
    const filePath = await writeTestFile('todos.md', '# Tasks\n\n- [x] Done task\n- [ ] Pending task\n- Regular item\n');

    const result = await MarkdownTools.mdExtractExecutor(withCwd({ path: filePath, selector: 'todos' }));
    const parsed = JSON.parse(result);

    expect(parsed.count).toBe(2);
    expect(parsed.items[0].checked).toBe(true);
    expect(parsed.items[1].checked).toBe(false);
  });

  test('extracts tables', async () => {
    const filePath = await writeTestFile('table.md', '# Data\n\n| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |\n');

    const result = await MarkdownTools.mdExtractExecutor(withCwd({ path: filePath, selector: 'tables' }));
    const parsed = JSON.parse(result);

    expect(parsed.count).toBe(1);
    expect(parsed.items[0].rows.length).toBe(3); // header + 2 rows
    expect(parsed.items[0].rows[0]).toEqual(['Name', 'Age']);
  });

  test('extracts headings', async () => {
    const filePath = await writeTestFile('headings.md', '# H1\n\n## H2\n\n### H3\n');

    const result = await MarkdownTools.mdExtractExecutor(withCwd({ path: filePath, selector: 'headings' }));
    const parsed = JSON.parse(result);

    expect(parsed.count).toBe(3);
    expect(parsed.items[0].depth).toBe(1);
    expect(parsed.items[0].text).toBe('H1');
    expect(parsed.items[2].depth).toBe(3);
  });

  test('extracts blockquotes', async () => {
    const filePath = await writeTestFile('quotes.md', '# Quotes\n\n> This is a quote\n\n> Another one\n');

    const result = await MarkdownTools.mdExtractExecutor(withCwd({ path: filePath, selector: 'blockquotes' }));
    const parsed = JSON.parse(result);

    expect(parsed.count).toBe(2);
    expect(parsed.items[0].text).toContain('This is a quote');
  });

  test('scopes extraction to a heading', async () => {
    const filePath = await writeTestFile('scoped.md', '# A\n\n```js\nfoo()\n```\n\n# B\n\n```js\nbar()\n```\n');

    const result = await MarkdownTools.mdExtractExecutor(withCwd({ path: filePath, selector: 'code', heading: 'B' }));
    const parsed = JSON.parse(result);

    expect(parsed.count).toBe(1);
    expect(parsed.items[0].value).toContain('bar()');
  });
});

// ============================================
// md_replace_section tool tests
// ============================================

describe('md_replace_section', () => {
  test('replaces section content', async () => {
    const filePath = await writeTestFile('replace.md', '# Title\n\n## Install\n\nOld content\n\n## Usage\n\nUsage text\n');

    const result = await MarkdownTools.mdReplaceSectionExecutor(withCwd({
      path: filePath,
      heading: 'Install',
      content: 'New installation instructions',
    }));
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);

    const updated = await readFile(filePath, 'utf-8');
    expect(updated).toContain('## Install');
    expect(updated).toContain('New installation instructions');
    expect(updated).not.toContain('Old content');
    expect(updated).toContain('## Usage');
    expect(updated).toContain('Usage text');
  });

  test('creates section if missing with create_if_missing', async () => {
    const filePath = await writeTestFile('create.md', '# Title\n\nContent\n');

    const result = await MarkdownTools.mdReplaceSectionExecutor(withCwd({
      path: filePath,
      heading: 'New Section',
      content: 'New content here',
      create_if_missing: true,
    }));
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);

    const updated = await readFile(filePath, 'utf-8');
    expect(updated).toContain('## New Section');
    expect(updated).toContain('New content here');
  });

  test('throws when heading not found and create_if_missing is false', async () => {
    const filePath = await writeTestFile('nope.md', '# Title\n\n## Existing\n\nContent\n');

    await expect(
      MarkdownTools.mdReplaceSectionExecutor(withCwd({
        path: filePath,
        heading: 'Missing',
        content: 'New',
      })),
    ).rejects.toThrow(/not found/);
  });

  test('replaces section at end of file', async () => {
    const filePath = await writeTestFile('end.md', '# Title\n\n## Last\n\nOld last content\n');

    await MarkdownTools.mdReplaceSectionExecutor(withCwd({
      path: filePath,
      heading: 'Last',
      content: 'New last content',
    }));

    const updated = await readFile(filePath, 'utf-8');
    expect(updated).toContain('New last content');
    expect(updated).not.toContain('Old last content');
  });
});

// ============================================
// md_insert tool tests
// ============================================

describe('md_insert', () => {
  test('inserts at end of file', async () => {
    const filePath = await writeTestFile('insert.md', '# Title\n\nContent\n');

    const result = await MarkdownTools.mdInsertExecutor(withCwd({
      path: filePath,
      content: '## New Section\n\nNew content',
      position: 'end_of_file',
    }));
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);

    const updated = await readFile(filePath, 'utf-8');
    expect(updated).toContain('## New Section');
    expect(updated).toContain('New content');
  });

  test('inserts at start of file', async () => {
    const filePath = await writeTestFile('insert-start.md', '# Title\n\nContent\n');

    await MarkdownTools.mdInsertExecutor(withCwd({
      path: filePath,
      content: '> Important notice',
      position: 'start_of_file',
    }));

    const updated = await readFile(filePath, 'utf-8');
    expect(updated.startsWith('> Important notice')).toBe(true);
  });

  test('inserts before a heading', async () => {
    const filePath = await writeTestFile('insert-before.md', '# Title\n\n## A\n\nContent A\n\n## B\n\nContent B\n');

    await MarkdownTools.mdInsertExecutor(withCwd({
      path: filePath,
      content: '<!-- divider -->',
      position: 'before_heading',
      heading: 'B',
    }));

    const updated = await readFile(filePath, 'utf-8');
    const lines = updated.split('\n');
    const dividerIndex = lines.findIndex((l: string) => l.includes('<!-- divider -->'));
    const bIndex = lines.findIndex((l: string) => l.trim() === '## B');
    expect(dividerIndex).toBeLessThan(bIndex);
  });

  test('inserts after a heading', async () => {
    const filePath = await writeTestFile('insert-after.md', '# Title\n\n## Section\n\nOld content\n');

    await MarkdownTools.mdInsertExecutor(withCwd({
      path: filePath,
      content: '> Alert: new info',
      position: 'after_heading',
      heading: 'Section',
    }));

    const updated = await readFile(filePath, 'utf-8');
    const lines = updated.split('\n');
    const headingIndex = lines.findIndex((l: string) => l.trim() === '## Section');
    const alertIndex = lines.findIndex((l: string) => l.includes('Alert: new info'));
    expect(alertIndex).toBe(headingIndex + 1);
  });

  test('inserts at end of section', async () => {
    const filePath = await writeTestFile('insert-end-section.md', '# Title\n\n## A\n\nContent A\n\n## B\n\nContent B\n');

    await MarkdownTools.mdInsertExecutor(withCwd({
      path: filePath,
      content: 'Appended to A',
      position: 'end_of_section',
      heading: 'A',
    }));

    const updated = await readFile(filePath, 'utf-8');
    const lines = updated.split('\n');
    const appendedIndex = lines.findIndex((l: string) => l.includes('Appended to A'));
    const bIndex = lines.findIndex((l: string) => l.trim() === '## B');
    expect(appendedIndex).toBeLessThan(bIndex);
  });

  test('inserts at a specific line number', async () => {
    const filePath = await writeTestFile('insert-line.md', 'Line 1\nLine 2\nLine 3\n');

    await MarkdownTools.mdInsertExecutor(withCwd({
      path: filePath,
      content: 'Inserted',
      line: 2,
    }));

    const updated = await readFile(filePath, 'utf-8');
    const lines = updated.split('\n');
    expect(lines[1]).toBe('Inserted');
    expect(lines[2]).toBe('Line 2');
  });

  test('throws when heading required but not provided', async () => {
    const filePath = await writeTestFile('insert-err.md', '# Title\n');

    await expect(
      MarkdownTools.mdInsertExecutor(withCwd({
        path: filePath,
        content: 'Text',
        position: 'before_heading',
      })),
    ).rejects.toThrow(/heading.*required/i);
  });

  test('skips frontmatter when inserting at start_of_file', async () => {
    const filePath = await writeTestFile('insert-fm.md', '---\ntitle: Test\n---\n\n# Title\n');

    await MarkdownTools.mdInsertExecutor(withCwd({
      path: filePath,
      content: '> Notice',
      position: 'start_of_file',
    }));

    const updated = await readFile(filePath, 'utf-8');
    expect(updated.startsWith('---')).toBe(true);
    expect(updated).toContain('> Notice');
    // The notice should come after frontmatter
    const noticeIndex = updated.indexOf('> Notice');
    const fmEnd = updated.indexOf('---', 3);
    expect(noticeIndex).toBeGreaterThan(fmEnd);
  });
});

// ============================================
// md_search tool tests
// ============================================

describe('md_search', () => {
  test('searches for text in a file', async () => {
    const filePath = await writeTestFile('search.md', '# Guide\n\n## Install\n\nRun `npm install`\n\n## Usage\n\nImport and use\n');

    const result = await MarkdownTools.mdSearchExecutor(withCwd({ path: filePath, pattern: 'install' }));
    const parsed = JSON.parse(result);

    expect(parsed.count).toBeGreaterThan(0);
    expect(parsed.matches.some((m: { heading: string }) => m.heading === 'Install')).toBe(true);
  });

  test('searches within a specific section', async () => {
    const filePath = await writeTestFile('search-section.md', '# A\n\nfoo bar\n\n# B\n\nfoo baz\n');

    const result = await MarkdownTools.mdSearchExecutor(withCwd({
      path: filePath,
      pattern: 'foo',
      section: 'B',
    }));
    const parsed = JSON.parse(result);

    expect(parsed.count).toBe(1);
    expect(parsed.matches[0].match).toContain('foo baz');
  });

  test('searches by node type', async () => {
    const filePath = await writeTestFile('search-node.md', '# Code\n\n```js\nconst TODO = true;\n```\n\nSome TODO text\n');

    const result = await MarkdownTools.mdSearchExecutor(withCwd({
      path: filePath,
      pattern: 'TODO',
      node_type: 'code',
    }));
    const parsed = JSON.parse(result);

    expect(parsed.count).toBe(1);
    expect(parsed.matches[0].type).toBe('code');
  });

  test('searches across a directory', async () => {
    await writeTestFile('a.md', '# File A\n\nkeyword here\n');
    await writeTestFile('b.md', '# File B\n\nno match\n');
    await writeTestFile('c.md', '# File C\n\nkeyword again\n');

    const result = await MarkdownTools.mdSearchExecutor(withCwd({
      path: tempDir,
      pattern: 'keyword',
    }));
    const parsed = JSON.parse(result);

    expect(parsed.count).toBe(2);
  });

  test('uses regex pattern', async () => {
    const filePath = await writeTestFile('regex.md', '# Test\n\nversion 1.2.3\nversion 4.5.6\n');

    const result = await MarkdownTools.mdSearchExecutor(withCwd({
      path: filePath,
      pattern: 'version \\d+\\.\\d+\\.\\d+',
    }));
    const parsed = JSON.parse(result);

    expect(parsed.count).toBe(2);
  });
});

// ============================================
// md_frontmatter tool tests
// ============================================

describe('md_frontmatter', () => {
  test('reads frontmatter', async () => {
    const filePath = await writeTestFile('fm-read.md', '---\ntitle: Hello\ndate: 2024-01-01\n---\n\n# Content\n');

    const result = await MarkdownTools.mdFrontmatterExecutor(withCwd({ path: filePath, action: 'read' }));
    const parsed = JSON.parse(result);

    expect(parsed.frontmatter.title).toBe('Hello');
    expect(parsed.frontmatter.date).toBeDefined();
  });

  test('reads empty frontmatter', async () => {
    const filePath = await writeTestFile('fm-none.md', '# No frontmatter\n');

    const result = await MarkdownTools.mdFrontmatterExecutor(withCwd({ path: filePath, action: 'read' }));
    const parsed = JSON.parse(result);

    expect(parsed.frontmatter).toEqual({});
  });

  test('sets frontmatter', async () => {
    const filePath = await writeTestFile('fm-set.md', '# Content\n\nBody text\n');

    await MarkdownTools.mdFrontmatterExecutor(withCwd({
      path: filePath,
      action: 'set',
      data: { title: 'New Title', draft: true },
    }));

    const updated = await readFile(filePath, 'utf-8');
    expect(updated).toContain('title: New Title');
    expect(updated).toContain('draft: true');
    expect(updated).toContain('# Content');
  });

  test('merges frontmatter', async () => {
    const filePath = await writeTestFile('fm-merge.md', '---\ntitle: Old\nauthor: Alice\n---\n\n# Content\n');

    await MarkdownTools.mdFrontmatterExecutor(withCwd({
      path: filePath,
      action: 'merge',
      data: { title: 'Updated', tags: ['a', 'b'] },
    }));

    const result = await MarkdownTools.mdFrontmatterExecutor(withCwd({ path: filePath, action: 'read' }));
    const parsed = JSON.parse(result);

    expect(parsed.frontmatter.title).toBe('Updated');
    expect(parsed.frontmatter.author).toBe('Alice');
    expect(parsed.frontmatter.tags).toEqual(['a', 'b']);
  });

  test('deletes frontmatter keys', async () => {
    const filePath = await writeTestFile('fm-delete.md', '---\ntitle: Hello\ndraft: true\nauthor: Bob\n---\n\n# Content\n');

    await MarkdownTools.mdFrontmatterExecutor(withCwd({
      path: filePath,
      action: 'delete',
      keys: ['draft', 'author'],
    }));

    const result = await MarkdownTools.mdFrontmatterExecutor(withCwd({ path: filePath, action: 'read' }));
    const parsed = JSON.parse(result);

    expect(parsed.frontmatter.title).toBe('Hello');
    expect(parsed.frontmatter.draft).toBeUndefined();
    expect(parsed.frontmatter.author).toBeUndefined();
  });

  test('throws for set without data', async () => {
    const filePath = await writeTestFile('fm-err.md', '# Content\n');

    await expect(
      MarkdownTools.mdFrontmatterExecutor(withCwd({ path: filePath, action: 'set' })),
    ).rejects.toThrow(/data.*required/i);
  });

  test('throws for delete without keys', async () => {
    const filePath = await writeTestFile('fm-err2.md', '---\ntitle: X\n---\n\n# Content\n');

    await expect(
      MarkdownTools.mdFrontmatterExecutor(withCwd({ path: filePath, action: 'delete' })),
    ).rejects.toThrow(/keys.*required/i);
  });
});

// ============================================
// md_outline tool tests
// ============================================

describe('md_outline', () => {
  test('outlines a single file', async () => {
    const filePath = await writeTestFile('outline.md',
      '---\ntitle: Doc\n---\n\n# Title\n\n## Section A\n\nText\n\n## Section B\n\n```js\ncode()\n```\n\n[link](url)\n\n![img](img.png)\n\n- [x] todo\n',
    );

    const result = await MarkdownTools.mdOutlineExecutor(withCwd({ path: filePath }));
    const parsed = JSON.parse(result);

    expect(parsed.file_count).toBe(1);
    const file = parsed.files[0];
    expect(file.has_frontmatter).toBe(true);
    expect(file.outline).toContain('Title');
    expect(file.outline).toContain('Section A');
    expect(file.stats.headings).toBeGreaterThanOrEqual(3);
    expect(file.stats.code_blocks).toBe(1);
    expect(file.stats.links).toBe(1);
    expect(file.stats.images).toBe(1);
    expect(file.stats.todos).toBe(1);
  });

  test('outlines a directory', async () => {
    await writeTestFile('a.md', '# A\n\n## A1\n');
    await writeTestFile('b.md', '# B\n\n## B1\n\n## B2\n');

    const result = await MarkdownTools.mdOutlineExecutor(withCwd({ path: tempDir }));
    const parsed = JSON.parse(result);

    expect(parsed.file_count).toBe(2);
  });

  test('respects depth filter', async () => {
    const filePath = await writeTestFile('deep.md', '# H1\n\n## H2\n\n### H3\n\n#### H4\n');

    const result = await MarkdownTools.mdOutlineExecutor(withCwd({ path: filePath, depth: 2 }));
    const parsed = JSON.parse(result);

    const outline = parsed.files[0].outline;
    expect(outline).toContain('H1');
    expect(outline).toContain('H2');
    expect(outline).not.toContain('H3');
    expect(outline).not.toContain('H4');
  });
});

// ============================================
// registerAll test
// ============================================

describe('MarkdownTools.registerAll', () => {
  test('registers all 7 tools', () => {
    const registered: string[] = [];
    const mockRegistry = {
      register(tool: { name: string }) {
        registered.push(tool.name);
      },
    };

    MarkdownTools.registerAll(mockRegistry as any);

    expect(registered).toContain('md_read');
    expect(registered).toContain('md_extract');
    expect(registered).toContain('md_replace_section');
    expect(registered).toContain('md_insert');
    expect(registered).toContain('md_search');
    expect(registered).toContain('md_frontmatter');
    expect(registered).toContain('md_outline');
    expect(registered.length).toBe(7);
  });
});
