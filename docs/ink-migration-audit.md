# Ink Terminal Final Audit

Date: 2026-05-28
Plan: `708c113d-0e7d-4956-a305-8c62ec624265`
Task: `4133309d-75f3-491f-93f1-fe3b6491fcc0`

The terminal package is now Ink-only. This audit is intentionally short and
current-state focused; historical renderer notes were removed so the repository
does not carry stale compatibility guidance.

## Final State

- Terminal startup uses Ink.
- Renderer choice is not configurable at runtime.
- The package manifests and lockfiles contain no removed renderer packages.
- Build output does not copy native renderer binaries.
- Terminal tests use Ink-oriented tests and behavior-level assertions.
- App primitives live under `packages/terminal/src/ui/ink` and
  `packages/terminal/src/components/design-system`.
- Session lookup is assistant-aware for both headless resume and session inspect.

## Verification Gates

The final plan cannot close until these pass:

```bash
bun run --cwd packages/terminal typecheck
bun run --cwd packages/terminal test
bun run typecheck
bun run test
bun run build
./dist/index.js --version
./dist/index.js --help
./dist/index.js sessions <48-message-session-id>
```

The manual gate must also cover tmux startup, normal typing, slash command
suggestions/execution, clean exit, resize behavior, and a 48-message persisted
session.
