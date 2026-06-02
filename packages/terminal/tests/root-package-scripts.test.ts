import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

describe('root package install scripts', () => {
  const root = join(import.meta.dir, '../../..');
  const retiredPatchScriptBase = ['patch-open', 'tui'].join('');
  const retiredPackageScope = ['@open', 'tui'].join('');
  const retiredPackageKeyword = ['open', 'tui'].join('');

  test('does not publish or run retired renderer patch scripts', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const postinstall = String(pkg.scripts?.postinstall ?? '');
    const files = Array.isArray(pkg.files) ? pkg.files : [];

    expect(postinstall).not.toContain(retiredPatchScriptBase);
    expect(postinstall).not.toContain(retiredPackageScope);
    expect(postinstall).not.toContain(retiredPackageKeyword);
    expect(files).not.toContain('scripts');
    expect(existsSync(join(root, 'scripts', `${retiredPatchScriptBase}.mjs`))).toBe(false);
    expect(existsSync(join(root, 'scripts', `${retiredPatchScriptBase}.sh`))).toBe(false);
  });
});
