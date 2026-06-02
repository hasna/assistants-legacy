import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const root = join(import.meta.dir, '..');
const intrinsicPattern = /<(box|text|span|b|i|u)(\s|>|\/)|<\/(box|text|span|b|i|u)>/;

function collectTsxFiles(dir: string, result: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTsxFiles(fullPath, result);
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      result.push(fullPath);
    }
  }
  return result;
}

describe('Ink JSX type surface', () => {
  const retiredJsxImportSource = ['@open', 'tui/react'].join('');

  test('terminal tsconfigs use the React JSX runtime', () => {
    for (const name of ['tsconfig.json', 'tsconfig.ink.json']) {
      const config = JSON.parse(readFileSync(join(root, name), 'utf8'));

      expect(config.compilerOptions.jsx).toBe('react-jsx');
      expect(config.compilerOptions.jsxImportSource).toBe('react');
      expect(JSON.stringify(config)).not.toContain(retiredJsxImportSource);
    }
  });

  test('source TSX files do not rely on lowercase terminal intrinsic tags', () => {
    const offenders = collectTsxFiles(join(root, 'src')).filter((file) => {
      const source = readFileSync(file, 'utf8');
      return intrinsicPattern.test(source);
    });

    expect(offenders).toEqual([]);
  });
});
