import { describe, test, expect } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createWorktree, isWorktreeClean, removeWorktree } from '../src/git/worktree';
import { execSync } from 'child_process';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTempGitRepo(): string {
  const dir = join(tmpdir(), `test-repo-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
  writeFileSync(join(dir, 'README.md'), '# Test');
  execSync('git add .', { cwd: dir, stdio: 'pipe' });
  execSync('git commit -m "init"', { cwd: dir, stdio: 'pipe' });
  return dir;
}

// ─── createWorktree ───────────────────────────────────────────────────────────

describe('createWorktree', () => {
  test('throws for non-git directory', () => {
    const nonGit = join(tmpdir(), `non-git-${Date.now()}`);
    mkdirSync(nonGit, { recursive: true });
    expect(() => createWorktree(nonGit)).toThrow(/Not a git repository/);
  });

  test('creates a worktree from a git repo', () => {
    const repo = makeTempGitRepo();
    const info = createWorktree(repo, `wt-test-${Date.now()}`);

    try {
      expect(info.path).toBeDefined();
      expect(info.name).toBeDefined();
      expect(info.repoPath).toBeDefined();
      expect(existsSync(info.path)).toBe(true);
    } finally {
      removeWorktree(info.path);
    }
  });

  test('worktree contains repo files', () => {
    const repo = makeTempGitRepo();
    const info = createWorktree(repo, `wt-files-${Date.now()}`);

    try {
      expect(existsSync(join(info.path, 'README.md'))).toBe(true);
    } finally {
      removeWorktree(info.path);
    }
  });

  test('uses auto-generated name when none provided', () => {
    const repo = makeTempGitRepo();
    const info = createWorktree(repo);

    try {
      expect(info.name).toMatch(/^worktree-\d+$/);
    } finally {
      removeWorktree(info.path);
    }
  });

  test('uses custom name when provided', () => {
    const repo = makeTempGitRepo();
    const info = createWorktree(repo, 'my-worktree');

    try {
      expect(info.name).toBe('my-worktree');
    } finally {
      removeWorktree(info.path);
    }
  });
});

// ─── isWorktreeClean ──────────────────────────────────────────────────────────

describe('isWorktreeClean', () => {
  test('returns true for clean worktree', () => {
    const repo = makeTempGitRepo();
    const info = createWorktree(repo, `wt-clean-${Date.now()}`);

    try {
      expect(isWorktreeClean(info.path)).toBe(true);
    } finally {
      removeWorktree(info.path);
    }
  });

  test('returns false for dirty worktree', () => {
    const repo = makeTempGitRepo();
    const info = createWorktree(repo, `wt-dirty-${Date.now()}`);

    try {
      writeFileSync(join(info.path, 'new-file.txt'), 'uncommitted change');
      expect(isWorktreeClean(info.path)).toBe(false);
    } finally {
      // Force remove dirty worktree
      execSync(`git worktree remove "${info.path}" --force`, {
        cwd: info.repoPath,
        stdio: 'pipe',
      });
    }
  });

  test('returns false for non-existent path', () => {
    expect(isWorktreeClean('/no/such/path')).toBe(false);
  });
});

// ─── removeWorktree ───────────────────────────────────────────────────────────

describe('removeWorktree', () => {
  test('returns false for non-existent path', () => {
    expect(removeWorktree('/no/such/path')).toBe(false);
  });

  test('removes clean worktree and returns true', () => {
    const repo = makeTempGitRepo();
    const info = createWorktree(repo, `wt-remove-${Date.now()}`);
    expect(existsSync(info.path)).toBe(true);

    const removed = removeWorktree(info.path);
    expect(removed).toBe(true);
    expect(existsSync(info.path)).toBe(false);
  });

  test('returns false for dirty worktree (preserves it)', () => {
    const repo = makeTempGitRepo();
    const info = createWorktree(repo, `wt-dirty-keep-${Date.now()}`);

    try {
      writeFileSync(join(info.path, 'dirty.txt'), 'changes');
      const removed = removeWorktree(info.path);
      expect(removed).toBe(false);
      expect(existsSync(info.path)).toBe(true);
    } finally {
      execSync(`git worktree remove "${info.path}" --force`, {
        cwd: info.repoPath,
        stdio: 'pipe',
      });
    }
  });
});
