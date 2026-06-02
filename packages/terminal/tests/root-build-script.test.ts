import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('root build script', () => {
  const retiredPackageScope = ['@open', 'tui'].join('');
  const retiredNativeLibrary = ['libopen', 'tui'].join('');
  const retiredPatchScript = ['patch-open', 'tui'].join('');
  const retiredRendererFactory = ['create', 'CliRenderer'].join('');

  test('does not patch or bundle retired renderer native artifacts', () => {
    const source = readFileSync(new URL('../../../build.ts', import.meta.url), 'utf8');

    expect(source).not.toContain(retiredPatchScript);
    expect(source).not.toContain(retiredPackageScope);
    expect(source).not.toContain(retiredNativeLibrary);
    expect(source).not.toContain('native binary');
    expect(source).not.toContain(retiredRendererFactory);
  });
});
