import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ExtensionLoader } from '../src/extensions/loader';
import type { Extension, ExtensionContext } from '../src/extensions/loader';

// Minimal stubs
function makeToolRegistry() {
  const tools: string[] = [];
  return { registerTool: (t: { name: string }) => tools.push(t.name), tools };
}
function makeCommandLoader() {
  const cmds: string[] = [];
  return { registerCommand: (name: string) => cmds.push(name), cmds };
}
const defaultConfig = {} as any;

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'ext-loader-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── ExtensionLoader — no extensions ─────────────────────────────────────────

describe('ExtensionLoader — empty state', () => {
  test('returns empty arrays when no extensions dir exists', async () => {
    const loader = new ExtensionLoader();
    const registry = makeToolRegistry();
    const cmdLoader = makeCommandLoader();

    const results = await loader.loadAll(tempDir, registry as any, cmdLoader as any, defaultConfig);
    expect(results).toHaveLength(0);
    expect(loader.getExtensions()).toHaveLength(0);
    expect(loader.getLoadResults()).toHaveLength(0);
  });

  test('getExtension returns undefined for missing extension', async () => {
    const loader = new ExtensionLoader();
    const registry = makeToolRegistry();
    const cmdLoader = makeCommandLoader();
    await loader.loadAll(tempDir, registry as any, cmdLoader as any, defaultConfig);
    expect(loader.getExtension('does-not-exist')).toBeUndefined();
  });
});

// ─── ExtensionLoader — valid extension ───────────────────────────────────────

describe('ExtensionLoader — valid extension', () => {
  test('loads a valid extension from project dir', async () => {
    const extDir = join(tempDir, '.assistants', 'extensions', 'my-ext');
    mkdirSync(extDir, { recursive: true });

    const extCode = `
export default {
  name: 'my-ext',
  version: '1.0.0',
  description: 'A test extension',
  async setup(ctx) {
    // no-op
  },
};
`;
    writeFileSync(join(extDir, 'index.ts'), extCode);

    const loader = new ExtensionLoader();
    const registry = makeToolRegistry();
    const cmdLoader = makeCommandLoader();
    const results = await loader.loadAll(tempDir, registry as any, cmdLoader as any, defaultConfig);

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('my-ext');
    expect(results[0].success).toBe(true);
    expect(loader.getExtension('my-ext')).toBeDefined();
    expect(loader.getExtensions()).toHaveLength(1);
  });

  test('extension setup receives context with tool registry', async () => {
    const extDir = join(tempDir, '.assistants', 'extensions', 'ctx-ext');
    mkdirSync(extDir, { recursive: true });

    let receivedContext: any = null;
    const extCode = `
export default {
  name: 'ctx-ext',
  version: '0.1.0',
  async setup(ctx) {
    // Store context reference for testing (via globalThis)
    globalThis.__testExtCtx = ctx;
  },
};
`;
    writeFileSync(join(extDir, 'index.ts'), extCode);

    const loader = new ExtensionLoader();
    const registry = makeToolRegistry();
    const cmdLoader = makeCommandLoader();
    await loader.loadAll(tempDir, registry as any, cmdLoader as any, defaultConfig);

    // Context was provided
    expect((globalThis as any).__testExtCtx).toBeDefined();
    expect((globalThis as any).__testExtCtx.config).toBeDefined();
    delete (globalThis as any).__testExtCtx;
  });
});

// ─── ExtensionLoader — invalid extensions ────────────────────────────────────

describe('ExtensionLoader — invalid extensions', () => {
  test('does not crash when extension dir has no index file', async () => {
    const extDir = join(tempDir, '.assistants', 'extensions', 'empty-ext');
    mkdirSync(extDir, { recursive: true });
    // No index.ts/js — loader should skip it gracefully

    const loader = new ExtensionLoader();
    const registry = makeToolRegistry();
    const cmdLoader = makeCommandLoader();
    const results = await loader.loadAll(tempDir, registry as any, cmdLoader as any, defaultConfig);

    expect(results).toHaveLength(0);
    expect(loader.getExtensions()).toHaveLength(0);
  });

  test('records failure when setup throws', async () => {
    const extDir = join(tempDir, '.assistants', 'extensions', 'throws-ext');
    mkdirSync(extDir, { recursive: true });

    writeFileSync(join(extDir, 'index.ts'), `
export default {
  name: 'throws-ext',
  version: '1.0.0',
  async setup() {
    throw new Error('setup failed!');
  },
};
`);

    const loader = new ExtensionLoader();
    const registry = makeToolRegistry();
    const cmdLoader = makeCommandLoader();
    const results = await loader.loadAll(tempDir, registry as any, cmdLoader as any, defaultConfig);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('setup failed!');
  });

  test('skips hidden directories', async () => {
    const extDir = join(tempDir, '.assistants', 'extensions', '.hidden-ext');
    mkdirSync(extDir, { recursive: true });
    writeFileSync(join(extDir, 'index.ts'), `export default { name: 'hidden', version: '1.0.0', async setup() {} };`);

    const loader = new ExtensionLoader();
    const registry = makeToolRegistry();
    const cmdLoader = makeCommandLoader();
    const results = await loader.loadAll(tempDir, registry as any, cmdLoader as any, defaultConfig);

    expect(results).toHaveLength(0);
  });

  test('skips node_modules directory', async () => {
    const extDir = join(tempDir, '.assistants', 'extensions', 'node_modules');
    mkdirSync(extDir, { recursive: true });
    writeFileSync(join(extDir, 'index.ts'), `export default { name: 'nm', version: '1.0.0', async setup() {} };`);

    const loader = new ExtensionLoader();
    const registry = makeToolRegistry();
    const cmdLoader = makeCommandLoader();
    const results = await loader.loadAll(tempDir, registry as any, cmdLoader as any, defaultConfig);

    expect(results).toHaveLength(0);
  });
});

// ─── ExtensionLoader — multiple extensions ───────────────────────────────────

describe('ExtensionLoader — multiple extensions', () => {
  test('loads multiple valid extensions', async () => {
    const extsBase = join(tempDir, '.assistants', 'extensions');
    for (const name of ['ext-a', 'ext-b', 'ext-c']) {
      const d = join(extsBase, name);
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, 'index.ts'), `export default { name: '${name}', version: '1.0.0', async setup() {} };`);
    }

    const loader = new ExtensionLoader();
    const registry = makeToolRegistry();
    const cmdLoader = makeCommandLoader();
    const results = await loader.loadAll(tempDir, registry as any, cmdLoader as any, defaultConfig);

    expect(results).toHaveLength(3);
    expect(results.every(r => r.success)).toBe(true);
    expect(loader.getExtensions()).toHaveLength(3);
  });

  test('project extension overrides global by name', async () => {
    const homeDir = join(tempDir, 'home');
    const origHome = process.env.HOME;
    process.env.HOME = homeDir;

    try {
      const globalExtDir = join(homeDir, '.assistants', 'extensions', 'shared-ext');
      const projectExtDir = join(tempDir, '.assistants', 'extensions', 'shared-ext');
      mkdirSync(globalExtDir, { recursive: true });
      mkdirSync(projectExtDir, { recursive: true });

      writeFileSync(join(globalExtDir, 'index.ts'), `export default { name: 'shared-ext', version: '1.0.0', description: 'global', async setup() {} };`);
      writeFileSync(join(projectExtDir, 'index.ts'), `export default { name: 'shared-ext', version: '2.0.0', description: 'project', async setup() {} };`);

      const loader = new ExtensionLoader();
      const registry = makeToolRegistry();
      const cmdLoader = makeCommandLoader();
      await loader.loadAll(tempDir, registry as any, cmdLoader as any, defaultConfig);

      const ext = loader.getExtension('shared-ext');
      expect(ext).toBeDefined();
      expect(ext?.version).toBe('2.0.0'); // project wins
      expect(loader.getExtensions()).toHaveLength(1); // deduplicated
    } finally {
      process.env.HOME = origHome;
    }
  });
});
