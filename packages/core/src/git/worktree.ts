/**
 * Git worktree management for parallel isolated sessions.
 *
 * Creates temporary git worktrees so multiple assistant sessions can
 * operate on the same repo without interfering with each other.
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

export interface WorktreeInfo {
  /** Absolute path to the created worktree directory */
  path: string;
  /** Name used for the worktree (for display/logging) */
  name: string;
  /** Absolute path to the original repo */
  repoPath: string;
}

/**
 * Check if a directory is inside a git repository.
 */
function isGitRepo(dir: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: dir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the root of the git repository containing the given directory.
 */
function getRepoRoot(dir: string): string {
  return execSync('git rev-parse --show-toplevel', {
    cwd: dir,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

/**
 * Create a git worktree for an isolated session.
 *
 * @param repoPath - Path to the git repository (or any subdirectory)
 * @param name - Optional name for the worktree. Auto-generated if omitted.
 * @returns Info about the created worktree
 * @throws If the directory is not a git repo or worktree creation fails
 */
export function createWorktree(repoPath: string, name?: string): WorktreeInfo {
  const absPath = resolve(repoPath);

  if (!isGitRepo(absPath)) {
    throw new Error(`Not a git repository: ${absPath}`);
  }

  const root = getRepoRoot(absPath);
  const worktreeName = name || `worktree-${Date.now()}`;
  const worktreePath = join(tmpdir(), `assistants-worktree-${worktreeName}`);

  if (existsSync(worktreePath)) {
    // If a stale worktree exists at this path, try to remove it first
    try {
      execSync(`git worktree remove "${worktreePath}" --force`, {
        cwd: root,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      // If removal fails, the path may not be a worktree — let git worktree add handle it
    }
  }

  execSync(`git worktree add "${worktreePath}" HEAD --detach`, {
    cwd: root,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return {
    path: worktreePath,
    name: worktreeName,
    repoPath: root,
  };
}

/**
 * Check if a worktree has no uncommitted changes.
 */
export function isWorktreeClean(worktreePath: string): boolean {
  try {
    const status = execSync('git status --porcelain', {
      cwd: worktreePath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return status.length === 0;
  } catch {
    return false;
  }
}

/**
 * Remove a git worktree if it exists and is clean.
 *
 * @param worktreePath - Absolute path to the worktree directory
 * @returns true if removed, false if skipped (dirty or not found)
 */
export function removeWorktree(worktreePath: string): boolean {
  if (!existsSync(worktreePath)) {
    return false;
  }

  if (!isWorktreeClean(worktreePath)) {
    return false;
  }

  try {
    // Find the main repo from the worktree's git config
    const root = getRepoRoot(worktreePath);
    execSync(`git worktree remove "${worktreePath}"`, {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}
