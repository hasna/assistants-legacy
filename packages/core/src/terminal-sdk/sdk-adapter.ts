/**
 * Terminal SDK adapter — lazy loader for @hasna/terminal modules
 *
 * @hasna/terminal is primarily a CLI app, but exposes utility modules
 * that can be imported individually for token counting, output processing,
 * session context, and smart display features.
 */

async function loadModule(name: string): Promise<any> {
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;
    return await dynamicImport(`@hasna/terminal/dist/${name}.js`);
  } catch {
    return null;
  }
}

/**
 * Execute a command through the terminal's lazy executor.
 */
export async function execCommand(command: string): Promise<any> {
  const mod = await loadModule('lazy-executor');
  if (!mod) return null;
  try {
    return { shouldBeLazy: mod.shouldBeLazy?.(command, command) };
  } catch { return null; }
}

/**
 * Count tokens in text using the terminal's token counter.
 */
export async function countTokens(text: string): Promise<number | null> {
  const mod = await loadModule('tokens');
  if (!mod?.countTokens) return null;
  try { return mod.countTokens(text); } catch { return null; }
}

/**
 * Get output processing/filtering for terminal output.
 */
export async function processOutput(output: string, command?: string): Promise<string | null> {
  const mod = await loadModule('output-processor');
  if (!mod?.processOutput) return null;
  try { return mod.processOutput(output, command); } catch { return null; }
}

/**
 * Get session context hints for the current working directory.
 */
export async function getContextHints(cwd: string): Promise<any> {
  const mod = await loadModule('context-hints');
  if (!mod?.getContextHints) return null;
  try { return mod.getContextHints(cwd); } catch { return null; }
}

/**
 * Search files using the terminal's search index.
 */
export async function searchFiles(query: string, cwd?: string): Promise<any[]> {
  const mod = await loadModule('search/index');
  if (!mod?.search) return [];
  try { return mod.search(query, cwd); } catch { return []; }
}

/**
 * Get file tree structure for a directory.
 */
export async function getTree(cwd: string, depth?: number): Promise<any> {
  const mod = await loadModule('tree');
  if (!mod?.getTree) return null;
  try { return mod.getTree(cwd, depth); } catch { return null; }
}
