---
name: commitmsg
description: Generate a conventional commit message from staged changes or a diff. Follows Conventional Commits spec (feat/fix/chore/refactor/docs/test/perf/ci).
argument-hint: [optional: file paths or description]
allowed-tools: Bash
---

## Generate Commit Message

$ARGUMENTS

### Process

1. Run `git diff --staged` to see staged changes (or `git diff HEAD` if nothing staged)
2. If `$ARGUMENTS` mentions specific files, focus on those
3. Analyse what changed — what was added, removed, modified, and why
4. Generate a commit message following Conventional Commits

### Conventional Commits format

```
<type>(<scope>): <short summary>

<optional body: what changed and why, wrapped at 72 chars>

<optional footer: BREAKING CHANGE: ..., Closes #123>
```

**Types:** `feat` (new feature), `fix` (bug fix), `perf` (performance), `refactor` (no behaviour change), `docs` (documentation only), `test` (tests only), `chore` (tooling/deps), `ci` (CI/CD), `style` (formatting)

**Rules:**
- Subject line ≤ 72 characters, imperative mood ("add X" not "added X")
- Scope is optional but useful (e.g. `feat(auth):`, `fix(cli):`)
- Body explains *why*, not *what* (the diff shows what)
- Mark breaking changes with `BREAKING CHANGE:` in footer
- Reference issues with `Closes #N` or `Fixes #N`

### Output

Print the ready-to-use commit message in a code block so it can be copied directly.
If the changes span multiple unrelated concerns, suggest splitting into separate commits.
