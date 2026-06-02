# Ink Terminal Acceptance Criteria

Date: 2026-05-28
Plan: `708c113d-0e7d-4956-a305-8c62ec624265`
Task: `e111cabc-fc95-490a-a22c-6a94eeb5283d`

This document freezes the user-visible behavior required for the Ink-only terminal
app. Passing TypeScript is not enough; the packaged CLI must work in a real PTY.

## Global Rules

1. Ink is the only terminal renderer.
2. Local primitives are React components built on Ink APIs.
3. No compatibility renderer, runtime renderer switch, native renderer bundle,
   renderer patch script, or lowercase JSX terminal intrinsic is allowed.
4. Takumi-derived behavior must be ported into local Ink components and hooks.
5. Verification must include terminal package tests, root tests, production build,
   packaged CLI smoke, tmux QA, and 48-message long-session QA.

## Startup

- Starting `assistants` renders a nonblank terminal UI within one second.
- The app initializes theme, terminal dimensions, keyboard routing, and providers
  before the first user interaction.
- The welcome region fits within 80x24 and wider terminals without overlap.
- The documented quit paths restore terminal state and exit the process.

## Prompt Input

- Printable characters appear immediately.
- Backspace, delete, arrow keys, home/end, and cursor movement work.
- Enter submits a single-line prompt.
- Multiline paste is preserved without corrupting cursor placement.
- Empty submit does not create a user message.
- Follow-up input during processing follows the visible queue/interrupt behavior.
- Vim prompt mode works when enabled.

## Slash Commands

- `/` opens suggestions above the prompt.
- Filtering, Escape, exact command submit, selected command submit, and unknown
  command handling all work locally.
- Local commands must not send a model turn unless the command explicitly asks for
  one.

## Layout

- Transcript, prompt, sidebars, and panels must not overlap at 60x20, 80x24,
  120x40, or 140x45.
- Markdown/code/diff rendering must wrap within the visible chat column.
- Streaming responses must not leave stale characters behind.
- Light and dark themes must remain legible.

## Panels

Representative panels must open, navigate, and close without focus leaks:

- `/config`
- `/model`
- `/tasks`
- `/connectors`
- `/logs`
- `/docs`
- `/messages`

## Required Commands

```bash
bun run --cwd packages/terminal typecheck
bun run --cwd packages/terminal test
bun run typecheck
bun run test
bun run build
./dist/index.js --version
./dist/index.js --help
```

Manual QA must include tmux startup, prompt typing, slash menu execution, panel
navigation, resize/theme checks, clean exit, and a 48-message persisted session.
