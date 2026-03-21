---
name: codereview
description: Review code for bugs, security issues, performance problems, and style. Accepts a file path, diff, or inline code snippet.
argument-hint: [file-path-or-diff]
allowed-tools: Read, Bash
---

## Code Review

Review the following for: $ARGUMENTS

### What to look for

1. **Bugs & correctness** — logic errors, off-by-one, null/undefined handling, edge cases, incorrect assumptions
2. **Security** — injection risks (SQL, shell, XSS), hardcoded secrets, insecure defaults, improper input validation, path traversal
3. **Performance** — N+1 queries, unnecessary re-renders, blocking operations, missing indexes, large allocations
4. **Readability** — unclear naming, overly complex logic that could be simplified, missing or misleading comments
5. **Error handling** — swallowed errors, missing error boundaries, unclear error messages
6. **Type safety** — `any` types, unsafe casts, missing nullability checks

### Process

1. If `$ARGUMENTS` is a file path, read the file first with the Read tool
2. If it's a glob or directory, read the relevant files
3. If it's inline code, review it directly
4. For each issue found, state: **location** → **severity** (critical/high/medium/low) → **problem** → **fix**

### Output format

```
## Code Review: <file or description>

### Critical
- [line X] <issue> → <fix>

### High
- [line X] <issue> → <fix>

### Medium / Low
- <issue> → <fix>

### Summary
<1-2 sentence overall assessment>
```

If no issues are found, say so explicitly — don't pad with non-issues.
