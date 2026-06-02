import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('Ink runtime entry', () => {
  const retiredCorePackage = ['@open', 'tui/core'].join('');
  const retiredReactPackage = ['@open', 'tui/react'].join('');
  const retiredRendererFactory = ['create', 'CliRenderer'].join('');
  const retiredRendererSelection = ['renderer', '-selection'].join('');

  test('mounts through Ink without retired renderer imports', () => {
    const source = readFileSync(new URL('../src/index.tsx', import.meta.url), 'utf8');

    expect(source).toContain("await import('./ui/ink')");
    expect(source).toContain('render(appElement');
    expect(source).not.toContain(retiredCorePackage);
    expect(source).not.toContain(retiredReactPackage);
    expect(source).not.toContain(retiredRendererFactory);
    expect(source).not.toContain('createRoot');
    expect(source).not.toContain(retiredRendererSelection);
  });
});
