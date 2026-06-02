# Ink Migration Tmux QA Checklist

Date: 2026-05-28
Plan: `708c113d-0e7d-4956-a305-8c62ec624265`
Task: `7705b4e9-0083-470c-93bd-13e6798488f3`

This runbook is the manual tmux gate for the Ink-only terminal migration. It must be run after the automated test/type/build gates and before the migration is considered complete.

## Required Evidence

Create an artifact directory for every QA run:

```bash
mkdir -p artifacts/ink-tmux-qa
```

Save these files:

- `artifacts/ink-tmux-qa/startup.txt` - first visible render.
- `artifacts/ink-tmux-qa/prompt.txt` - prompt typing, editing, submit, paste, queue, and interrupt evidence.
- `artifacts/ink-tmux-qa/slash.txt` - slash menu and command execution evidence.
- `artifacts/ink-tmux-qa/panels.txt` - representative panel evidence.
- `artifacts/ink-tmux-qa/resize-theme.txt` - resize and theme evidence.
- `artifacts/ink-tmux-qa/tools.txt` - safe tool-call evidence.
- `artifacts/ink-tmux-qa/long-session.txt` - 48-message run evidence.
- `artifacts/ink-tmux-qa/final-summary.md` - commands run, pass/fail notes, and any bugs filed.

Capture a pane with:

```bash
tmux capture-pane -pt assistants-ink-qa:0.0 -S -3000 > artifacts/ink-tmux-qa/startup.txt
```

## Preflight

Run from the repository root.

```bash
git status --short
bun run --cwd packages/terminal typecheck
bun run --cwd packages/terminal test
bun run build
```

Root `bun run typecheck` and `bun test` are still required for final completion once the root package-manager setup is repaired. If they cannot run, record the exact blocker in `final-summary.md` and keep the final verification task open.

## Start Packaged CLI In Tmux

Use a clean profile name so the QA run does not depend on prior local session state.

```bash
tmux kill-session -t assistants-ink-qa 2>/dev/null || true
tmux new-session -d -s assistants-ink-qa -x 120 -y 40 -c "$PWD" \
  'env ASSISTANTS_PROFILE=ink-migration-qa HASNA_THEME=dark bun dist/index.js'
tmux capture-pane -pt assistants-ink-qa:0.0 -S -200 > artifacts/ink-tmux-qa/startup.txt
```

Pass criteria:

- First render is nonblank within one second.
- No runtime exception is visible.
- The prompt is visible and focused.
- Welcome/status content fits without incoherent overlap at `120x40`.

## Prompt Input

Exercise normal input, editing, paste, queue, and interrupt.

1. Type a normal prompt and submit it.
2. Type text, move left/right, backspace one character, and submit.
3. Paste multiline text and confirm line breaks survive.
4. While a response is processing, type a follow-up and confirm it queues or submits inline according to the current UI labels.
5. While a response is processing, use Shift+Enter or the configured interrupt path and confirm the app stops or interrupts cleanly.

Suggested tmux inputs:

```bash
tmux send-keys -t assistants-ink-qa:0.0 'Say "prompt QA ok" in one short sentence.' Enter
tmux send-keys -t assistants-ink-qa:0.0 'Edit me typo' Left Left Left BSpace 'fixed' Enter
printf 'line one\nline two\nline three\n' > /tmp/assistants-ink-paste.txt
tmux load-buffer -b ink-paste /tmp/assistants-ink-paste.txt
tmux paste-buffer -b ink-paste -t assistants-ink-qa:0.0
tmux send-keys -t assistants-ink-qa:0.0 Enter
tmux capture-pane -pt assistants-ink-qa:0.0 -S -500 > artifacts/ink-tmux-qa/prompt.txt
```

Pass criteria:

- Typed characters appear immediately.
- Submit clears the prompt.
- Empty submit does not create an empty user message.
- Multiline paste does not corrupt cursor placement.
- Queue/inline/interrupt labels match behavior.
- Prompt remains usable after each action.

## Slash Commands

Exercise discovery, filtering, completion, execution, escape, and unknown command handling.

1. Type `/` and confirm suggestions appear above the prompt.
2. Type `/mod` and confirm the list filters to `/model`.
3. Press Escape and confirm prompt text/focus behavior remains correct.
4. Type `/model` and submit; confirm the model panel opens.
5. Type `/tasks`, `/config`, `/connectors`, `/logs`, `/docs`, and `/messages`; confirm each panel opens or produces the expected local loading/error state.
6. Type `/not-a-real-command`; confirm the local unknown-command message appears without sending a model turn.

Capture:

```bash
tmux capture-pane -pt assistants-ink-qa:0.0 -S -800 > artifacts/ink-tmux-qa/slash.txt
```

Pass criteria:

- Slash suggestions are visible and filtered.
- Enter executes the selected or exact command.
- Escape does not leave stale overlay cells.
- Panel commands are handled locally.
- Unknown bare slash command is rejected locally.

## Panels And Forms

Open representative panels and exercise navigation.

Required panels:

- `/config`
- `/model`
- `/tasks`
- `/connectors`
- `/logs`
- `/docs`
- `/messages`

For each panel:

1. Confirm it opens without an exception.
2. Press Up/Down where lists exist and confirm selection changes.
3. Press Escape or the documented close key and confirm focus returns to the prompt.
4. If the panel has text input, type text, submit/cancel, and confirm no overlap or stale content remains.

Capture:

```bash
tmux capture-pane -pt assistants-ink-qa:0.0 -S -1000 > artifacts/ink-tmux-qa/panels.txt
```

Pass criteria:

- No panel crashes.
- List navigation is visible.
- Modal/panel focus does not leak to the prompt.
- Closing a panel returns prompt focus.

## Resize And Theme

Resize the pane and run both dark and light theme modes.

```bash
tmux resize-pane -t assistants-ink-qa:0.0 -x 80 -y 24
tmux capture-pane -pt assistants-ink-qa:0.0 -S -300 > artifacts/ink-tmux-qa/resize-theme.txt
tmux resize-pane -t assistants-ink-qa:0.0 -x 60 -y 20
tmux capture-pane -pt assistants-ink-qa:0.0 -S -300 >> artifacts/ink-tmux-qa/resize-theme.txt
tmux resize-pane -t assistants-ink-qa:0.0 -x 140 -y 45
tmux capture-pane -pt assistants-ink-qa:0.0 -S -300 >> artifacts/ink-tmux-qa/resize-theme.txt
```

Repeat startup once with `HASNA_THEME=light`:

```bash
tmux kill-session -t assistants-ink-qa-light 2>/dev/null || true
tmux new-session -d -s assistants-ink-qa-light -x 120 -y 40 -c "$PWD" \
  'env ASSISTANTS_PROFILE=ink-migration-qa-light HASNA_THEME=light bun dist/index.js'
tmux capture-pane -pt assistants-ink-qa-light:0.0 -S -200 >> artifacts/ink-tmux-qa/resize-theme.txt
tmux kill-session -t assistants-ink-qa-light
```

Pass criteria:

- No overlap at `80x24`, `60x20`, or `140x45`.
- Prompt and panels remain visible after resize.
- Dark and light text remain readable.

## Safe Tool Call

Ask for one safe read-only operation that should use the existing tool path, such as reading the current directory or listing top-level files.

Suggested prompt:

```text
Use a safe read-only tool call to list the top-level files in this repository, then summarize in one sentence.
```

Capture:

```bash
tmux capture-pane -pt assistants-ink-qa:0.0 -S -1000 > artifacts/ink-tmux-qa/tools.txt
```

Pass criteria:

- Tool call running/completed state is visible.
- Tool result content is readable.
- The prompt remains usable after the tool call finishes.

## 48-Message Long Session

Complete at least 48 user/assistant turns in the same tmux session. Do not count startup messages or local slash-panel opens as assistant turns.

Use short prompts to limit spend and keep the run deterministic:

```text
QA turn 01: reply with exactly "turn 01 ok".
QA turn 02: reply with exactly "turn 02 ok".
...
QA turn 48: reply with exactly "turn 48 ok".
```

During the 48 turns:

- Open slash discovery at least twice.
- Resize the pane at least once.
- Scroll back and verify an earlier turn remains visible.
- Submit one queued follow-up while a response is processing.
- Capture errors immediately if the UI becomes blank, stops accepting input, or overlays stale text.

Capture:

```bash
tmux capture-pane -pt assistants-ink-qa:0.0 -S -5000 > artifacts/ink-tmux-qa/long-session.txt
```

Pass criteria:

- All 48 user prompts receive assistant responses.
- Prompt still accepts input after turn 48.
- Slash commands still open after turn 48.
- Scrollback still contains earlier turns.
- No renderer exception, blank screen, or persistent stale overlay appears.

## Failure Handling

If any step fails:

1. Capture the pane immediately.
2. Save the exact input sequence that triggered the failure.
3. File a `todos` bug task under the migration plan or the relevant package project.
4. Do not mark the final tmux QA task complete.

## Final Summary Template

Write `artifacts/ink-tmux-qa/final-summary.md` with:

```markdown
# Ink Tmux QA Final Summary

Date:
Commit:
Build command:
Packaged CLI command:
Automated gates:
Tmux session:
Turns completed:
Panels checked:
Resize sizes:
Theme modes:
Safe tool call:
Failures:
Artifacts:
Verdict:
```
