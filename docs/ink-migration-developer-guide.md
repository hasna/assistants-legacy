# Ink Terminal Developer Guide

Date: 2026-05-28
Plan: `708c113d-0e7d-4956-a305-8c62ec624265`

The terminal UI is Ink-only. New work should use the local wrappers in
`packages/terminal/src/ui/ink` and the app-level primitives in
`packages/terminal/src/components/design-system`.

## Rules

- Use imported React components such as `Box`, `Text`, `Inline`, `Textarea`,
  `TextInput`, `Select`, `ScrollBox`, and `Markdown`.
- Keep renderer startup centralized in `packages/terminal/src/index.tsx`.
- Keep local primitives thin and behavior-focused; shared layout or keyboard logic
  belongs in hooks or helpers with direct tests.
- Test terminal components with the Ink harness and behavior-level assertions.
- Do not reintroduce a second renderer, runtime selection flag, native renderer
  binary, postinstall renderer patch, or lowercase JSX terminal intrinsics.
- Do not preserve historical repaint workarounds. Ink components should render
  cleanly from React state.

## Imports

Use relative paths appropriate to the file location:

```tsx
import {
  Box,
  Inline,
  Markdown,
  ScrollBox,
  Select,
  Text,
  Textarea,
  TextInput,
  useInput,
  useWindowSize,
} from '../ui/ink';
```

## Component Expectations

- Preserve existing theme tokens with `themeColor(...)`.
- Give fixed-format areas stable width/height or min/max constraints so prompt,
  panel, and transcript content does not shift during updates.
- Keep keyboard handling local to the focused component or app keybinding router.
- Keep command execution, panel opening, and model turns separated; slash commands
  that are handled locally must not send a model request.
- Keep screenshots and tmux captures free of overlap, stale text, and blank startup
  frames.

## Verification

For terminal UI changes, run the focused test for the changed module first, then:

```bash
bun run --cwd packages/terminal typecheck
bun run --cwd packages/terminal test
bun run build
```

Before release, also run the root typecheck/test suite, packaged CLI smoke tests,
tmux interactive QA, and the 48-message long-session QA.
