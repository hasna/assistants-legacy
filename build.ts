#!/usr/bin/env bun
/**
 * Build script for assistants CLI
 * Bundles the terminal app into a single distributable file
 */

import { $ } from 'bun';
import { existsSync } from 'fs';

const outdir = './dist';

// Read version from package.json
const packageJson = await Bun.file('./package.json').json();
const version = packageJson.version || 'unknown';

console.log('Building assistants...');

// Clean dist
await $`rm -rf ${outdir}`;
await $`mkdir -p ${outdir}`;

// Bundle with Bun
const result = await Bun.build({
  entrypoints: ['./packages/terminal/src/index.tsx'],
  outdir,
  target: 'bun',
  format: 'esm',
  minify: {
    whitespace: true,
    syntax: true,
    identifiers: false, // Keep identifiers readable for error stack traces
  },
  sourcemap: 'external',
  // Embed version at build time
  define: {
    'process.env.ASSISTANTS_VERSION': JSON.stringify(version),
  },
  // Stub out packages that can't be resolved at build time
  plugins: [
    {
      name: 'stub-unresolvable',
      setup(build) {
        // Stub react-devtools-core to avoid window reference errors
        build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
          path: 'react-devtools-core',
          namespace: 'stub',
        }));
        // Stub optional @hasna/* SDK packages that lack dist (lazy-loaded at runtime)
        build.onResolve({ filter: /^@hasna\/(researcher|economy|terminal|wallets|logs)$/ }, (args) => ({
          path: args.path,
          namespace: 'stub',
        }));
        // Stub electron (only used by playwright-core internally)
        build.onResolve({ filter: /^electron$/ }, () => ({
          path: 'electron',
          namespace: 'stub',
        }));
        // Stub chromium-bidi (only used by playwright-core internally)
        build.onResolve({ filter: /^chromium-bidi/ }, (args) => ({
          path: args.path,
          namespace: 'stub',
        }));
        build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents: 'export default {}; export const connectToDevTools = () => {};',
          loader: 'js',
        }));
      },
    },
  ],
});

if (!result.success) {
  console.error('Build failed:');
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Post-process: fix Bun bundler __promiseAll bug
// Bun 1.3.x generates __promiseAll calls without defining the helper
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

// Add shebang to the output if not present
if (!content.startsWith('#!/usr/bin/env bun')) {
  content = `#!/usr/bin/env bun\n${content}`;
}

await Bun.write(outputFile, content);

// Make executable
await $`chmod +x ${outputFile}`;

// Copy commands, skills, workflows, and config to dist
await $`mkdir -p ${outdir}/.assistants`;
const assetsToCopy = [
  { src: '.assistants/commands', dest: `${outdir}/.assistants/commands` },
  { src: '.assistants/skills', dest: `${outdir}/.assistants/skills` },
  { src: '.assistants/workflows', dest: `${outdir}/.assistants/workflows` },
  { src: '.assistants/ASSISTANTS.md', dest: `${outdir}/.assistants/ASSISTANTS.md` },
  { src: 'config', dest: `${outdir}/config` },
];

for (const { src, dest } of assetsToCopy) {
  if (existsSync(src)) {
    await $`cp -r ${src} ${dest}`;
  }
}

console.log('Build complete! Output in ./dist');
console.log('Files:');
await $`ls -la ${outdir}`;
