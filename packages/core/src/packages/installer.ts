import { join } from 'path';
import { homedir } from 'os';
import { mkdir, readFile, writeFile, readdir, rm, stat } from 'fs/promises';

export type PackageSource = 'npm' | 'git';
export type PackageScope = 'local' | 'global';

export interface PackageInfo {
  name: string;
  source: PackageSource;
  version: string;
  path: string;
}

export interface InstallPackageOptions {
  /** Install locally in .assistants/packages/ instead of global */
  local?: boolean;
}

/**
 * Parse a package source string into source type and identifier.
 *
 * Supported formats:
 *   npm:@foo/tools      -> { source: 'npm', identifier: '@foo/tools' }
 *   npm:some-package    -> { source: 'npm', identifier: 'some-package' }
 *   git:github.com/u/r  -> { source: 'git', identifier: 'https://github.com/u/r' }
 *   git:https://...     -> { source: 'git', identifier: 'https://...' }
 */
export function parseSource(source: string): { source: PackageSource; identifier: string } {
  if (source.startsWith('npm:')) {
    return { source: 'npm', identifier: source.slice(4) };
  }
  if (source.startsWith('git:')) {
    let url = source.slice(4);
    // Normalize: if it doesn't start with http/git protocol, prepend https://
    if (!url.startsWith('http') && !url.startsWith('git@')) {
      url = `https://${url}`;
    }
    return { source: 'git', identifier: url };
  }
  // Default: treat as npm package name
  return { source: 'npm', identifier: source };
}

/**
 * Resolve the packages directory for the given scope.
 */
export function resolvePackagesDir(scope: PackageScope, cwd?: string): string {
  if (scope === 'global') {
    return join(homedir(), '.assistants', 'packages');
  }
  return join(cwd || process.cwd(), '.assistants', 'packages');
}

/**
 * Ensure the packages directory exists with a minimal package.json for npm installs.
 */
async function ensurePackagesDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });

  const pkgPath = join(dir, 'package.json');
  try {
    await stat(pkgPath);
  } catch {
    await writeFile(
      pkgPath,
      JSON.stringify(
        { name: 'assistants-packages', private: true, dependencies: {} },
        null,
        2,
      ) + '\n',
    );
  }

  const gitignorePath = join(dir, '.gitignore');
  try {
    await stat(gitignorePath);
  } catch {
    await writeFile(gitignorePath, 'node_modules/\n');
  }
}

/**
 * Derive a short name from a package identifier.
 * npm: @foo/tools -> @foo/tools
 * git: https://github.com/user/repo -> repo
 */
function deriveName(source: PackageSource, identifier: string): string {
  if (source === 'npm') {
    return identifier;
  }
  // For git, use the repo name (last path segment, strip .git)
  const parts = identifier.replace(/\.git$/, '').split('/');
  return parts[parts.length - 1] || identifier;
}

/**
 * Install a package from npm or git.
 */
export async function installPackage(
  source: string,
  options?: InstallPackageOptions,
): Promise<PackageInfo> {
  const { source: srcType, identifier } = parseSource(source);
  const scope: PackageScope = options?.local ? 'local' : 'global';
  const dir = resolvePackagesDir(scope);

  if (srcType === 'npm') {
    await ensurePackagesDir(dir);

    const result = Bun.spawnSync(['bun', 'add', identifier], {
      cwd: dir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    if (result.exitCode !== 0) {
      const stderr = result.stderr.toString().trim();
      throw new Error(`Failed to install ${identifier}: ${stderr || 'unknown error'}`);
    }

    // Resolve installed version
    let version = 'unknown';
    try {
      // For scoped packages like @foo/bar, the path is node_modules/@foo/bar
      const pkgJsonPath = join(dir, 'node_modules', identifier, 'package.json');
      const pkgJson = JSON.parse(await readFile(pkgJsonPath, 'utf-8'));
      version = pkgJson.version || 'unknown';
    } catch {
      // Version read failed, keep 'unknown'
    }

    return {
      name: identifier,
      source: 'npm',
      version,
      path: join(dir, 'node_modules', identifier),
    };
  }

  // Git source
  const repoName = deriveName('git', identifier);
  const targetDir = join(dir, repoName);

  await mkdir(dir, { recursive: true });

  // Check if already cloned
  try {
    const stats = await stat(targetDir);
    if (stats.isDirectory()) {
      throw new Error(`Package "${repoName}" already exists at ${targetDir}. Remove it first or use update.`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('already exists')) {
      throw err;
    }
    // Directory doesn't exist, proceed with clone
  }

  const result = Bun.spawnSync(['git', 'clone', identifier, repoName], {
    cwd: dir,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString().trim();
    throw new Error(`Failed to clone ${identifier}: ${stderr || 'unknown error'}`);
  }

  // Try to read version from package.json if it exists
  let version = 'unknown';
  try {
    const pkgJson = JSON.parse(await readFile(join(targetDir, 'package.json'), 'utf-8'));
    version = pkgJson.version || 'unknown';
  } catch {
    // No package.json or invalid, that's fine for git repos
  }

  return {
    name: repoName,
    source: 'git',
    version,
    path: targetDir,
  };
}

/**
 * Remove an installed package.
 */
export async function removePackage(
  name: string,
  options?: InstallPackageOptions,
): Promise<void> {
  const scope: PackageScope = options?.local ? 'local' : 'global';
  const dir = resolvePackagesDir(scope);

  // Check if it's an npm package (listed in package.json dependencies)
  const pkgPath = join(dir, 'package.json');
  let isNpm = false;
  try {
    const pkgJson = JSON.parse(await readFile(pkgPath, 'utf-8'));
    const deps = pkgJson.dependencies || {};
    if (deps[name]) {
      isNpm = true;
    }
  } catch {
    // No package.json
  }

  if (isNpm) {
    const result = Bun.spawnSync(['bun', 'remove', name], {
      cwd: dir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (result.exitCode !== 0) {
      const stderr = result.stderr.toString().trim();
      throw new Error(`Failed to remove ${name}: ${stderr || 'unknown error'}`);
    }
    return;
  }

  // Otherwise try to remove as a git-cloned directory
  const targetDir = join(dir, name);
  try {
    const stats = await stat(targetDir);
    if (stats.isDirectory()) {
      await rm(targetDir, { recursive: true, force: true });
      return;
    }
  } catch {
    // Directory doesn't exist
  }

  throw new Error(`Package "${name}" not found in ${scope} scope.`);
}

/**
 * List all installed packages (both npm and git).
 */
export async function listPackages(
  options?: InstallPackageOptions,
): Promise<PackageInfo[]> {
  const scope: PackageScope = options?.local ? 'local' : 'global';
  const dir = resolvePackagesDir(scope);
  const results: PackageInfo[] = [];

  // List npm packages from package.json
  const pkgPath = join(dir, 'package.json');
  try {
    const pkgJson = JSON.parse(await readFile(pkgPath, 'utf-8'));
    const deps = pkgJson.dependencies || {};
    for (const [depName, depVersion] of Object.entries(deps)) {
      results.push({
        name: depName,
        source: 'npm',
        version: String(depVersion),
        path: join(dir, 'node_modules', depName),
      });
    }
  } catch {
    // No package.json
  }

  // List git-cloned directories (top-level dirs that aren't node_modules or dotfiles)
  try {
    const entries = await readdir(dir);
    for (const entry of entries) {
      if (entry === 'node_modules' || entry.startsWith('.') || entry === 'package.json' || entry === 'bun.lockb' || entry === 'bun.lock') {
        continue;
      }
      const entryPath = join(dir, entry);
      try {
        const stats = await stat(entryPath);
        if (!stats.isDirectory()) continue;
      } catch {
        continue;
      }

      // Check if it's a git repo
      try {
        await stat(join(entryPath, '.git'));
      } catch {
        continue; // Not a git repo, skip
      }

      let version = 'unknown';
      try {
        const pkgJson = JSON.parse(await readFile(join(entryPath, 'package.json'), 'utf-8'));
        version = pkgJson.version || 'unknown';
      } catch {
        // No version info
      }

      results.push({
        name: entry,
        source: 'git',
        version,
        path: entryPath,
      });
    }
  } catch {
    // Directory doesn't exist
  }

  return results;
}

/**
 * Update all installed packages.
 * For npm: runs `bun update` in the packages dir.
 * For git: runs `git pull` in each cloned repo.
 */
export async function updatePackages(
  options?: InstallPackageOptions,
): Promise<{ updated: string[]; errors: string[] }> {
  const scope: PackageScope = options?.local ? 'local' : 'global';
  const dir = resolvePackagesDir(scope);
  const updated: string[] = [];
  const errors: string[] = [];

  // Update npm packages
  const pkgPath = join(dir, 'package.json');
  try {
    const pkgJson = JSON.parse(await readFile(pkgPath, 'utf-8'));
    const deps = pkgJson.dependencies || {};
    if (Object.keys(deps).length > 0) {
      const result = Bun.spawnSync(['bun', 'update'], {
        cwd: dir,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      if (result.exitCode === 0) {
        for (const name of Object.keys(deps)) {
          updated.push(name);
        }
      } else {
        const stderr = result.stderr.toString().trim();
        errors.push(`npm update failed: ${stderr || 'unknown error'}`);
      }
    }
  } catch {
    // No package.json, skip npm
  }

  // Update git repos
  try {
    const entries = await readdir(dir);
    for (const entry of entries) {
      if (entry === 'node_modules' || entry.startsWith('.') || entry === 'package.json' || entry === 'bun.lockb' || entry === 'bun.lock') {
        continue;
      }
      const entryPath = join(dir, entry);
      try {
        await stat(join(entryPath, '.git'));
      } catch {
        continue; // Not a git repo
      }

      const result = Bun.spawnSync(['git', 'pull'], {
        cwd: entryPath,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      if (result.exitCode === 0) {
        updated.push(entry);
      } else {
        const stderr = result.stderr.toString().trim();
        errors.push(`${entry}: git pull failed: ${stderr || 'unknown error'}`);
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return { updated, errors };
}

/**
 * PackageInstaller namespace — groups all package installer functions.
 */
export const PackageInstaller = {
  parseSource,
  resolvePackagesDir,
  installPackage,
  removePackage,
  listPackages,
  updatePackages,
};
