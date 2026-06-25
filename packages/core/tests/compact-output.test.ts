import { describe, expect, test } from 'bun:test';
import { createAssistantToolExecutors } from '../src/tools/assistant';
import { pageItems, parseDisclosureOptions, truncateText } from '../src/commands/helpers';

describe('compact output helpers', () => {
  test('parses common disclosure flags and keeps non-output args', () => {
    const options = parseDisclosureOptions(['--limit', '5', '--cursor', '10', '--verbose', 'pending']);

    expect(options.limit).toBe(5);
    expect(options.cursor).toBe(10);
    expect(options.verbose).toBe(true);
    expect(options.args).toEqual(['pending']);
  });

  test('pages rows and reports next cursor', () => {
    const page = pageItems(Array.from({ length: 12 }, (_, index) => index), { limit: 5, cursor: 5 });

    expect(page.items).toEqual([5, 6, 7, 8, 9]);
    expect(page.total).toBe(12);
    expect(page.shown).toBe(5);
    expect(page.nextCursor).toBe(10);
  });

  test('truncates long text onto one line', () => {
    expect(truncateText('hello\nworld with a long tail', 14)).toBe('hello world...');
  });
});

describe('assistant_list tool compact output', () => {
  const assistants = Array.from({ length: 25 }, (_, index) => ({
    id: `assistant-${index}`,
    name: `Assistant ${index}`,
    description: `Long assistant description ${index} `.repeat(12),
    settings: {
      model: 'anthropic:claude-sonnet-4-5',
      backend: 'ai-sdk',
    },
    isSystem: false,
    createdAt: index,
    updatedAt: index,
  }));

  const executors = createAssistantToolExecutors({
    getAssistantManager: () => ({
      listAssistants: () => assistants,
      getActiveId: () => 'assistant-0',
    }) as any,
  });

  test('returns a compact first page by default', async () => {
    const result = JSON.parse(await executors.assistant_list({}));

    expect(result.total).toBe(25);
    expect(result.shown).toBe(20);
    expect(result.nextCursor).toBe(20);
    expect(result.assistants).toHaveLength(20);
    expect(result.assistants[0].description.length).toBeLessThanOrEqual(80);
    expect(result.hint).toContain('cursor=20');
  });

  test('supports explicit full disclosure', async () => {
    const result = JSON.parse(await executors.assistant_list({ full: true }));

    expect(result.total).toBe(25);
    expect(result.shown).toBe(25);
    expect(result.nextCursor).toBeNull();
  });
});
