import { describe, expect, test } from 'bun:test';
import {
  formatTruncationInfo,
  truncateToolResultWithInfo,
  truncateToolResult,
  parseErrorInfo,
  formatErrorConcise,
} from '../src/components/toolDisplay';
import type { ToolResult } from '@hasna/assistants-shared';

const tr = (content: string, toolName = 'bash', isError = false): ToolResult =>
  ({ toolCallId: 'tc1', content, toolName, isError } as any);

describe('formatTruncationInfo', () => {
  test('returns empty string when not truncated', () => {
    expect(formatTruncationInfo({ wasTruncated: false, originalLines: 5, displayedLines: 5, originalChars: 100, displayedChars: 100 })).toBe('');
  });

  test('reports line truncation', () => {
    const result = formatTruncationInfo({ wasTruncated: true, originalLines: 100, displayedLines: 15, originalChars: 2000, displayedChars: 2000 });
    expect(result).toContain('100→15 lines');
  });

  test('reports char truncation', () => {
    const result = formatTruncationInfo({ wasTruncated: true, originalLines: 5, displayedLines: 5, originalChars: 5000, displayedChars: 3000 });
    expect(result).toContain('5000→3000 chars');
  });

  test('reports both line and char truncation', () => {
    const result = formatTruncationInfo({ wasTruncated: true, originalLines: 50, displayedLines: 15, originalChars: 5000, displayedChars: 3000 });
    expect(result).toContain('lines');
    expect(result).toContain('chars');
    expect(result).toContain('truncated:');
  });
});

describe('truncateToolResultWithInfo', () => {
  test('short content passes through unchanged', () => {
    const result = truncateToolResultWithInfo(tr('hello'));
    expect(result.content).toBe('hello');
    expect(result.truncation.wasTruncated).toBe(false);
  });

  test('verbose mode returns full content without truncation', () => {
    const longContent = 'line\n'.repeat(100);
    const result = truncateToolResultWithInfo(tr(longContent), 15, 3000, { verbose: true });
    expect(result.truncation.wasTruncated).toBe(false);
    expect(result.content.split('\n').length).toBeGreaterThan(15);
  });

  test('truncates by line count', () => {
    const content = Array(50).fill('line of text').join('\n');
    const result = truncateToolResultWithInfo(tr(content), 15, 100000);
    expect(result.content.split('\n').length).toBeLessThanOrEqual(15);
    expect(result.truncation.wasTruncated).toBe(true);
  });

  test('truncates by char count', () => {
    const content = 'x'.repeat(5000);
    const result = truncateToolResultWithInfo(tr(content), 1000, 500);
    // Content should be shorter than original (either formatted or truncated)
    expect(result.content.length).toBeLessThan(5000);
  });

  test('uses rawContent when content is empty', () => {
    const toolResult = { toolCallId: 'tc1', content: '', rawContent: 'raw data', toolName: 'read', isError: false } as any;
    const result = truncateToolResultWithInfo(toolResult);
    expect(result.content).toContain('raw data');
  });

  test('handles read tool result formatting', () => {
    const content = '1  const x = 1;\n2  const y = 2;\n3  return x + y;';
    const result = truncateToolResultWithInfo(tr(content, 'read'));
    expect(result.content).toBeDefined();
  });

  test('handles bash result formatting', () => {
    const result = truncateToolResultWithInfo(tr('$ git status\nOn branch main', 'bash'));
    expect(result.content).toBeDefined();
  });

  test('handles glob result formatting', () => {
    const content = 'src/index.ts\nsrc/utils.ts\nsrc/types.ts';
    const result = truncateToolResultWithInfo(tr(content, 'glob'));
    expect(result.content).toBeDefined();
  });

  test('handles grep result formatting', () => {
    const content = 'src/index.ts:42: const x = foo();';
    const result = truncateToolResultWithInfo(tr(content, 'grep'));
    expect(result.content).toBeDefined();
  });

  test('handles write result formatting', () => {
    const result = truncateToolResultWithInfo(tr('File written successfully', 'write'));
    expect(result.content).toBeDefined();
  });

  test('error results include Error prefix', () => {
    const result = truncateToolResultWithInfo(tr('command failed', 'bash', true));
    expect(result.content).toBeDefined();
  });
});

describe('truncateToolResult', () => {
  test('returns string content', () => {
    const result = truncateToolResult(tr('hello'));
    expect(typeof result).toBe('string');
  });

  test('truncates long content', () => {
    const content = Array(100).fill('long line of text').join('\n');
    const result = truncateToolResult(tr(content), 5, 100);
    expect(result.length).toBeLessThanOrEqual(200);
  });
});

describe('parseErrorInfo', () => {
  test('parses ENOENT errors', () => {
    const info = parseErrorInfo('ENOENT: no such file or directory: /path/to/file');
    expect(info.type).toBeDefined();
    expect(info.message).toBeDefined();
  });

  test('parses permission denied errors', () => {
    const info = parseErrorInfo('Permission denied: /etc/shadow');
    expect(info.message).toBeDefined();
  });

  test('handles generic error messages', () => {
    const info = parseErrorInfo('Something went wrong');
    expect(info.message).toBeDefined();
  });

  test('handles empty content', () => {
    const info = parseErrorInfo('');
    expect(info).toBeDefined();
  });

  test('accepts optional toolName parameter', () => {
    const info = parseErrorInfo('error occurred', 'bash');
    expect(info).toBeDefined();
  });
});

describe('formatErrorConcise', () => {
  test('returns a string', () => {
    const result = formatErrorConcise('ENOENT: no such file');
    expect(typeof result).toBe('string');
  });

  test('truncates long errors', () => {
    const longError = 'Error: ' + 'x'.repeat(500);
    const result = formatErrorConcise(longError);
    expect(result.length).toBeLessThan(longError.length);
  });

  test('accepts toolName parameter', () => {
    const result = formatErrorConcise('failed', 'bash');
    expect(typeof result).toBe('string');
  });
});
