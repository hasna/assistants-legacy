# Terminal test discipline (plan 8d98da29 P6.1)

This codebase pairs every unit of testable logic with a test. The Bun convention
here keeps tests in `packages/<pkg>/tests/` (not literally beside the source —
the build bundles `src/` and would otherwise sweep test files in), mirroring the
source module name 1:1.

## The rule

- **Every pure module gets a `tests/<name>.test.ts`.** Pure logic (parsers,
  reducers, formatters, state machines, helpers) must have a direct unit test
  importing it by name. New pure modules are not "done" without one.
- **Hooks and components get a `tests/<name>.test.tsx`** that renders through the
  real opentui test renderer (`@opentui/react/test-utils` → `testRender`) and
  asserts on `captureCharFrame()` output or exposed hook state via a probe.
- **Bug fixes ship with a regression test first** — reproduce, then fix (see the
  linewise-paste fix in `vim.test.ts`, the cell-bleed and adjacency fixes, etc.).
- **Never weaken a test to make it pass.** Async renders (e.g. markdown
  tree-sitter wasm) are handled by polling frames, not by loosening assertions.

## What is in scope

The active terminal app under `src/` — components, hooks, `theme/`,
`keybindings/`, `vim/`, `state/`, `commands/`, and the pure helpers. The vendored
`src/ink/` fork is **excluded from the build** (`tsconfig.json`) and tracked
separately under P0.2; it carries its own upstream tests and is not part of this
parity backfill.

## Current coverage (parity backfill)

Pure/logic modules in the active app with direct tests include:

| Module | Test |
| --- | --- |
| `theme/colors` (six themes) | `theme-variants.test.ts` |
| `theme/setup` (override) | `theme-override.test.tsx` |
| `state/usePanelVisibility` | `panel-visibility.test.tsx` |
| `keybindings/*` (engine) | `keybindings.test.ts`, `keybinding-context.test.tsx` |
| `vim/*` (engine) | `vim.test.ts` |
| `components/design-system/*` | `design-system.test.tsx` |
| `components/message-parts/*` | `messages-components.test.tsx` |
| `components/appHelpers` | `app-helpers.test.ts` |
| `hooks/useListNavigation` | `use-list-navigation.test.tsx` |
| `exit-summary` | `exit-summary.test.ts` |
| `commands/qolCommands` (pure cmds) | `qol-commands.test.ts` |
| `renderer-selection`, `PanelHeader`, inline-span, onboarding-layout | respective `*.test.*` |

When adding a module, add its test in the same change. When you touch a module
that lacks one, backfill it.
