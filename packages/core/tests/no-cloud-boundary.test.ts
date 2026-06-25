import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const repoRoot = join(import.meta.dir, '..', '..', '..');
const forbidden = ['@hasna/' + 'cloud', 'open-' + 'cloud', 'hasna/' + 'cloud'];
const ignoredDirs = new Set(['.git', 'node_modules', 'dist', '.next', 'coverage']);
const ignoredFiles = new Set(['bun.lock', 'pnpm-lock.yaml']);
const allowedExtensions = new Set(['.json', '.md', '.ts', '.tsx']);

function extension(path: string): string {
  const index = path.lastIndexOf('.');
  return index >= 0 ? path.slice(index) : '';
}

function filesToScan(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    if (ignoredDirs.has(entry)) continue;
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      files.push(...filesToScan(path));
      continue;
    }
    if (ignoredFiles.has(entry)) continue;
    if (allowedExtensions.has(extension(entry))) files.push(path);
  }
  return files;
}

describe('cloud boundary', () => {
  test('source and package metadata do not depend on the shared cloud package', () => {
    const hits = filesToScan(repoRoot)
      .filter((path) => !path.endsWith('no-cloud-boundary.test.ts'))
      .flatMap((path) => {
        const text = readFileSync(path, 'utf8');
        return forbidden
          .filter((needle) => text.includes(needle))
          .map((needle) => `${path.replace(`${repoRoot}/`, '')}: ${needle}`);
      });

    expect(hits).toEqual([]);
  });
});
