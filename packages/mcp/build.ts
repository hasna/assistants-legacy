#!/usr/bin/env bun
/**
 * Build script for assistants-mcp
 *
 * Bundles workspace packages (core, shared, runtime-bun) inline so the
 * published package is self-contained.  Optional SDK adapters that core
 * lazy-imports (and that may not be resolvable from this package context)
 * are marked external — they resolve at runtime only if installed.
 */

const outdir = './dist';

// Packages that cannot be resolved from the MCP package context at
// build time.  These are either:
//   (a) optional @hasna/* SDKs that core lazy-imports via dynamic
//       `await import(...)` inside try/catch blocks, or
//   (b) optional peer deps of bundled packages (playwright → chromium-bidi,
//       electron).
//
// Note: some of these (@hasna/conversations, @hasna/todos, @hasna/mementos)
// have STATIC imports in core and will also end up external.  That's fine
// because they are installed globally alongside the MCP when the user runs
// `bun install -g @hasna/assistants-mcp`.
//
// The key workspace packages (assistants-core, assistants-shared, runtime-bun)
// are NOT in this list — they get bundled inline.

const external = [
  // Optional @hasna/* SDK adapters (lazy-loaded in core with try/catch)
  '@hasna/attachments',
  '@hasna/browser',
  '@hasna/configs',
  '@hasna/connectors',
  '@hasna/contacts',
  // '@hasna/conversations' — has static imports in core, must be bundled
  '@hasna/crawl',
  '@hasna/deployment',
  '@hasna/economy',
  '@hasna/emails',
  '@hasna/hooks',
  '@hasna/implementations',
  '@hasna/logs',
  '@hasna/mcps',
  // '@hasna/mementos' — has static imports in core, must be bundled
  '@hasna/microservices',
  '@hasna/prompts',
  '@hasna/recordings',
  '@hasna/researcher',
  '@hasna/sandboxes',
  '@hasna/secrets',
  '@hasna/sessions',
  '@hasna/skills',
  '@hasna/terminal',
  '@hasna/testers',
  '@hasna/telephony',
  // '@hasna/todos' — has static imports in core, must be bundled
  '@hasna/wallets',

  // Playwright optional peer deps (not installed)
  'chromium-bidi',
  'electron',
];

console.log('Building assistants-mcp...');

const result = await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir,
  target: 'bun',
  format: 'esm',
  external,
});

if (!result.success) {
  console.error('Build failed:');
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Post-process: fix Bun bundler __promiseAll bug (same as root build.ts)
const outputFile = `${outdir}/index.js`;
let content = await Bun.file(outputFile).text();

if (content.includes('__promiseAll') && !content.includes('var __promiseAll')) {
  const polyfill = `var __promiseAll = (arr) => Promise.all(arr);\n`;
  if (content.startsWith('#!')) {
    const newlineIndex = content.indexOf('\n');
    content = content.slice(0, newlineIndex + 1) + polyfill + content.slice(newlineIndex + 1);
  } else {
    content = polyfill + content;
  }
  console.log('  Fixed __promiseAll bundler bug');
}

// Add shebang if missing
if (!content.startsWith('#!/usr/bin/env bun')) {
  content = `#!/usr/bin/env bun\n${content}`;
}

await Bun.write(outputFile, content);
await Bun.$`chmod +x ${outputFile}`;

const stat = Bun.file(outputFile);
console.log(`Build complete! ${outputFile} (${(stat.size / 1024).toFixed(0)} KB)`);
