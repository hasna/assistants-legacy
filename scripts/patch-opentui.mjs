#!/usr/bin/env node
/**
 * Patch @opentui/core for compatibility:
 * - TextNodeRenderable.add() — accept numbers/bigints by coercing to string
 * - TextNodeRenderable.remove() — don't throw if child not found
 * - TextNodeRenderable.insertBefore() — don't throw on non-text anchors/children
 *
 * Works in both local dev (pnpm/bun/npm) and global installs (bun add -g).
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageDir = dirname(__dirname);

/** Find index-*.js files inside a directory (non-recursive) */
function findIndexFiles(dir) {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter(f => f.startsWith('index-') && f.endsWith('.js'))
      .map(f => join(dir, f));
  } catch { return []; }
}

/** Recursively find index-*.js under @opentui/core in a .pnpm store */
function findInPnpm(nodeModulesDir) {
  const pnpmDir = join(nodeModulesDir, '.pnpm');
  if (!existsSync(pnpmDir)) return [];
  try {
    // Walk .pnpm looking for @opentui/core directories
    const results = [];
    const walk = (dir, depth) => {
      if (depth > 5) return; // Don't go too deep
      try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) {
            if (full.includes('@opentui/core/') || full.includes('@opentui+core')) {
              results.push(...findIndexFiles(full));
            }
            if (entry.name !== 'node_modules' || depth < 3) {
              walk(full, depth + 1);
            }
          }
        }
      } catch {}
    };
    walk(pnpmDir, 0);
    return results;
  } catch { return []; }
}

// Find the @opentui/core JS file(s) to patch
let coreFiles = [];

// Strategy 1: pnpm virtual store (local dev)
if (coreFiles.length === 0) {
  coreFiles = findInPnpm(join(packageDir, 'node_modules'));
}

// Strategy 2: flat node_modules (local dev with bun/npm/yarn)
if (coreFiles.length === 0) {
  coreFiles = findIndexFiles(join(packageDir, 'node_modules', '@opentui', 'core'));
}

// Strategy 3: sibling in parent node_modules (global install)
// e.g., ~/.bun/install/global/node_modules/@hasna/assistants → ../../@opentui/core
if (coreFiles.length === 0) {
  const parentNM = dirname(dirname(packageDir)); // up from @hasna/assistants to node_modules
  coreFiles = findIndexFiles(join(parentNM, '@opentui', 'core'));
}

// Strategy 4: CWD-based fallback
if (coreFiles.length === 0) {
  coreFiles = findIndexFiles(join(process.cwd(), 'node_modules', '@opentui', 'core'));
}

if (coreFiles.length === 0) {
  console.log('No @opentui/core JS file found — skipping patch');
  process.exit(0);
}

// Define replacements
const replacements = [
  {
    name: 'add() — accept numbers/bigints',
    old: 'throw new Error("TextNodeRenderable only accepts strings, TextNodeRenderable instances, or StyledText instances")',
    new: 'if(typeof obj==="number"||typeof obj==="bigint"){obj=String(obj);if(index!==undefined){this._children.splice(index,0,obj);this.requestRender();return index}const ii=this._children.length;this._children.push(obj);this.requestRender();return ii}return-1',
  },
  {
    name: 'remove() — ignore missing child',
    old: 'throw new Error("Child not found in children")',
    new: 'return this',
  },
  {
    name: 'insertBefore() — ignore non-text anchor',
    old: 'throw new Error("Anchor must be a TextNodeRenderable")',
    new: 'return this',
  },
  {
    name: 'insertBefore() — ignore non-text child',
    old: 'throw new Error("Child must be a string, TextNodeRenderable, or StyledText instance")',
    new: 'return this',
  },
  {
    name: 'insertBefore() — ignore missing anchor',
    old: 'throw new Error("Anchor node not found in children")',
    new: 'return this',
  },
];

let totalPatched = 0;

for (const file of coreFiles) {
  let content = readFileSync(file, 'utf-8');
  let changed = false;

  for (const r of replacements) {
    if (content.includes(r.old)) {
      content = content.replace(r.old, r.new);
      changed = true;
    }
  }

  if (changed) {
    writeFileSync(file, content, 'utf-8');
    console.log(`Patched: ${file}`);
    totalPatched++;
  }
}

if (totalPatched > 0) {
  console.log(`Patched @opentui/core: silenced text node errors for compatibility (${totalPatched} file(s))`);
} else {
  console.log('@opentui/core already patched or no matching patterns found');
}
