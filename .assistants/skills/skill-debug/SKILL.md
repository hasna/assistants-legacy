---
name: debug
description: Structured debugging session. Accepts an error message, stack trace, or description of unexpected behaviour. Works through reproduce → isolate → hypothesize → verify → fix.
argument-hint: [error message or description]
allowed-tools: Bash, Read, Grep
---

## Debug Session

**Problem:** $ARGUMENTS

### Step 1 — Understand the error

- Parse the error message and stack trace
- Identify the failing file, line, and function
- Note what was expected vs. what actually happened

### Step 2 — Reproduce

- Find the minimal steps or input that trigger the issue
- Run the failing command / test to confirm the error is present
- Note exact error output

### Step 3 — Isolate

- Narrow down to the smallest code path involved
- Check recent changes (`git log --oneline -10`, `git diff HEAD~1`) — did something recently break this?
- Search for related error messages or similar patterns in the codebase

### Step 4 — Hypothesize

- List 2–3 plausible root causes, ranked by likelihood
- For each hypothesis, state what evidence would confirm or rule it out

### Step 5 — Verify

- Test each hypothesis by reading relevant code, adding debug output, or running targeted commands
- Eliminate hypotheses one by one until the root cause is confirmed

### Step 6 — Fix

- Implement the minimal correct fix
- Verify the fix resolves the original error
- Check for related issues the fix might cause
- Add a regression note if useful

### Output format

Work through each step out loud. Show commands run and their output. End with:
```
## Root cause
<one sentence>

## Fix applied
<what was changed>

## Verified by
<how you confirmed it works>
```
