# P0.1 Spike — Adopting Takumi's Forked Ink Renderer

**Status:** complete · **Plan:** `8d98da29` (TUI Full Parity with Takumi) · **Author:** hortensia

This spike evaluates replacing the current terminal renderer (`@opentui/react`) with
Takumi's forked Ink layer (`iapp-takumi/src/ink/`), the foundation the rest of the
parity plan (P0.2–P6) builds on.

## 1. Current renderer: `@opentui/react`

The terminal package renders with `@opentui/react` (pinned `^0.1.90`; `0.1.107`
resolves in `packages/terminal/node_modules`, root resolves `0.1.91` — a version split).
During this effort the following **concrete limitations** were hit and worked around:

| # | Limitation | Evidence | Workaround applied |
|---|------------|----------|--------------------|
| 1 | Prop drift across patch versions silently drops unknown props | `bg`→`backgroundColor`, `useAlternateScreen`→`screenMode`, `maxVisible` removed, `<markdown>` now requires `syntaxStyle` (70 typecheck errors, dropped backgrounds) | renamed props; `getDefaultSyntaxStyle()` |
| 2 | Nested `<text>` inside `<text>` **drops inner content** (block-level TextRenderable) | "Install with: " rendered with the command gone; render test confirms | converted 31 sites to `<span>` |
| 3 | Stale cells not cleared on in-component layout swaps → bleed-through | connector list→detail showed "ManagetCLItconfiguration" | `useClearOnChange()` across 21 panels |
| 4 | Native binary loading is bundle-fragile | `Cannot find module '@opentui/core-linux-arm64/index.ts'`; `build.ts` didn't search bun's `.bun` store | added `.bun` strategy + robust `patch-opentui.sh` |
| 5 | Throws on numeric/mixed text children (Ink accepted them) | `TextNodeRenderable only accepts strings` | `patch-opentui.sh` coercion patch |
| 6 | No theme/background auto-detection that works on PTYs | invisible text on dark terminals via ttyd | `HASNA_THEME` override + `applyThemeSetting` |
| 7 | No built-in scrollback/virtual-scroll; transcript trims by line count (history lost) | `messageLines.ts` trims | — (this is plan P4) |

Net: the current renderer works after these fixes, but each limitation is a recurring
papercut requiring per-call-site or patch-level workarounds.

## 2. Takumi's forked Ink (`iapp-takumi/src/ink/`)

A full Ink reimplementation: own `reconciler`, `renderer`, `termio`, `screen`,
`optimizer`, `selection`, `bidi`, hyperlink support, `wrap-text`, `ScrollBox`,
`render-to-screen` double-buffering. It ships with a design system, a keybinding
engine, virtual scrolling (`useVirtualScroll`, `VirtualMessageList`), and ~2,124 tests.

Adopting it would inherently resolve limitations **#2, #3, #5, #7** (proper inline
text, full-screen diffing/clearing, Ink-compatible children, virtual scroll) and
provide the substrate for P2 (design system), P3 (keybindings), P4 (virtual scroll).

## 3. Cost / risk

- **Large surface:** vendoring the reconciler + termio + optimizer + selection/bidi,
  porting the stdin/keypress bridge, and re-wiring `build.ts` bundling.
- **React version:** Takumi runs its ink under react-compiler; open-assistants is on
  React 19 — the reconciler version (`react-reconciler@0.32`) must match.
- **Every component re-tested:** `<box>/<text>/<select>/<textarea>/<markdown>` props
  differ between opentui and takumi-ink; all 60+ components need a compatibility pass.
- **Intermediate breakage:** a partial swap leaves the app non-rendering. Must be done
  behind a flag with a clean cutover, not incrementally in place.

Realistic effort: **weeks**, not a single session — consistent with Takumi's own size.

## 4. Recommendation

**Two-track approach:**

1. **Now (done in this effort):** keep `@opentui/react` and harden it — the app is
   fully functional (chat + tools verified), all known rendering bugs fixed
   systemically (`<span>`, `useClearOnChange`, prop fixes, theme override). This
   delivers "100% working" today without destabilizing.
2. **Next (P0.2, dedicated effort):** vendor Takumi's ink fork **behind a
   `TUI_RENDERER=ink` flag** so both renderers coexist during migration. Cut over
   per-screen, keeping the opentui path as the fallback until parity is verified.
   Build P2/P3/P4 (design system, keybindings, virtual scroll) on the ink layer once
   the flag-gated renderer is stable.

Do **not** rip out opentui in place — the flag-gated coexistence is the only path that
preserves the working app through the migration.

## 5. Concrete P0.2 starting checklist

- [ ] Vendor `src/ink/{reconciler,renderer,termio,screen,optimizer,output,render-to-screen,render-border}` + support modules (`selection,bidi,wrap-text,stringWidth,colorize,parse-keypress,supports-hyperlinks`).
- [ ] Pin `react-reconciler` to the version takumi-ink targets.
- [ ] Add `createRoot`/render entry behind `TUI_RENDERER=ink`; keep opentui default.
- [ ] Port `build.ts` native handling for the ink layer (or drop the native dep if ink uses a different backend).
- [ ] Build a `<box>/<text>/<span>` compatibility shim so existing components render unchanged on either renderer.
- [ ] Verify the welcome/chat screen on the ink path; expand screen-by-screen.

## Addendum — concrete renderer bug found during QA (strengthens P0.2)

While QA-sweeping commands, a clear opentui **renderer diffing bug** surfaced: when a
selectable list re-renders on selection change (e.g. the `/config` Model picker, any
list-navigation), the **selected row repaints cleanly (it has a `bg` that overwrites
the whole row) but non-selected rows garble** — spaces in re-rendered text-only rows
do not clear the cells underneath, so characters from the previous frame bleed through
(e.g. "Balanced performance and speed" → "Balancedaperformancecandospeed").

This is not fixable cleanly at the app layer: forcing a `bg` on every row changes the
visual design, and clearing on every keystroke flickers. It's a renderer-level cell-diff
issue. Takumi's forked ink (`render-to-screen` double-buffering + `optimizer`) computes
a correct cell delta and repaints changed cells, which resolves this class of bug — a
direct, concrete justification for the P0.2 swap. The `useClearOnChange(mode)` mitigation
applied to all panels covers full view-mode transitions but not intra-list navigation.

## Addendum 2 — P0.2 vendoring dependency-footprint (concrete)

Examined takumi `src/ink/` module-by-module to scope the vendoring. Even the leaf
modules are not standalone:
- `colorize.ts` → `chalk` (external) + `./styles.js`
- `styles.ts` → `./layout/node.js` + `./render-border.js`
- `stringWidth.ts` → `../utils/intl.js`; `wrap-text.ts` → `../utils/sliceAnsi.js`
- `bidi.ts` → `bidi-js` (external dep, not installed here)
- higher modules (`renderer`, `reconciler`, `ThemeProvider`) use `bun:bundle` `feature()`
  and `react-compiler-runtime`, and `.js` ESM import specifiers throughout.

So vendoring requires: pulling the full `ink/` + `ink/layout/` + `ink/utils/` trees,
adding external deps (`chalk`, `bidi-js`, `bidi-js`'s data), stripping `bun:bundle`
`feature()` gates, removing react-compiler artifacts, and rewriting `.js` specifiers —
then a per-component compatibility pass. This is multi-day even to first compile, and
must be flag-gated (TUI_RENDERER=ink, infra already in place) so the working opentui
path is never broken mid-migration. Recommended as a dedicated effort, not a
single-session task.

## Addendum 3 — P0.2 vendoring STARTED: compile baseline + native-layout finding

Vendored takumi `src/ink/` → `packages/terminal/src/ink/` (102 files), excluded from the
production tsconfig (`exclude: ["src/ink"]`) and unimported, so the working opentui app
stays green (verified: typecheck 6/6, build OK). Added `tsconfig.ink.json` to compile the
vendored tree in isolation.

**Compile baseline: 102 errors** (`npx tsc -p tsconfig.ink.json`):
- 68× TS2307 "cannot find module" — external deps (`react-compiler-runtime`, `type-fest`,
  `@alcalzone/ansi-tokenize`, `strip-ansi`, `lodash-es`, `wrap-ansi`, `chalk`, `bidi-js`)
  AND takumi-internal modules (`utils/{debug,sliceAnsi,intl,log,semver}`, `bootstrap/state`,
  `react-reconciler/constants`, and **`native-ts/yoga-layout`**).
- 29× TS7006 implicit-any (react-compiler `_c()` artifacts / loose params).

**Key finding:** takumi's ink renderer depends on a **native Yoga layout backend**
(`native-ts/yoga-layout`) — it is NOT pure JS. Adopting it means vendoring/building
native layout bindings (platform-specific), analogous to opentui's `libopentui.so`. This
materially raises the P0.2 cost and confirms it as a dedicated, multi-week, platform-aware
effort — not an in-session task.

**Next steps for the dedicated P0.2 effort** (foundation now in place):
1. Add the 8 external deps (pinned, 7-day-safe).
2. Vendor `utils/*`, `bootstrap/state`, and the `native-ts/yoga-layout` native backend (+ build step).
3. Strip `bun:bundle` `feature()` gates and react-compiler artifacts.
4. Rewrite `.js` ESM specifiers; resolve the 102 baseline errors module-by-module.
5. Wire the ink `createRoot` behind `TUI_RENDERER=ink` (flag infra already wired); verify welcome→chat on ink, then expand.

---

## Addendum 4 — Yoga blocker SOLVED; the real remaining work is the JSX bridge (P0.2)

The P0.1 spike concluded the renderer cutover was gated on a **native Yoga layout
backend** (`src/native-ts/yoga-layout`), estimated as multi-week native-build work.
**That conclusion was wrong** — investigated and disproven:

- The fork's only native dependency is `src/native-ts/yoga-layout` importing the
  standard Yoga API (`default Yoga` + `Align/Direction/Edge/FlexDirection/Gutter/
  Justify/MeasureMode/Overflow/PositionType/Wrap` + `Node`).
- The official **`yoga-layout@3.2.1`** npm package exports that exact surface and
  ships Yoga as **base64-inlined WASM** (pure JS, bundles via Bun, no `.wasm` asset,
  no native toolchain). It was already in the lockfile.
- **Fix:** `src/native-ts/yoga-layout/index.ts` re-exports the official package; a
  `src/*` path alias in `tsconfig.ink.json` resolves the fork's bare specifier.
- **Proven:** `tests/yoga-shim.test.ts` loads the WASM and computes a flexbox layout
  (50/50 row split, computed-left offsets). Green. Main build unaffected.

With Yoga resolved, the fork's remaining compile errors (99) are ordinary:
- **~17 npm deps** to install (all old/stable): `react-reconciler`,
  `react-compiler-runtime`, `type-fest`, `strip-ansi`, `wrap-ansi`, `lodash-es`,
  `@alcalzone/ansi-tokenize`, `auto-bind`, `bidi-js`, `cli-boxes`, `emoji-regex`,
  `get-east-asian-width`, `indent-string`, `semver`, `signal-exit`,
  `supports-hyperlinks`, `usehooks-ts`.
- **~10 takumi utils + `bootstrap/state`** to vendor (`utils/{debug,intl,log,
  sliceAnsi,env,envUtils,execFileNoThrow,fullscreen,earlyInput,semver}`) — these
  carry their own transitive deps, a cascading vendor.
- **27 implicit-any** type errors to annotate.

### The actual remaining blocker (not Yoga): the JSX-model bridge

The app's components render via **opentui intrinsics** (`<box>`, `<text>`, `<span>`)
through `@opentui/react`'s reconciler. The takumi fork renders **React components**
(`<Box>`, `<Text>`) through **its own `react-reconciler`**. Booting the app on the
fork therefore requires either rewriting every component's JSX to the fork's
component model, or building an intrinsic-compatibility layer over the fork. That
migration — not Yoga — is the genuine multi-week core of P0.2, and it touches the
entire 3,372-line component tree, so it cannot be done safely/verifiably in a single
session without risking the working app. The Yoga capability + path alias + the
precise dep/util/JSX map are now in place as the foundation for that dedicated effort.

---

## Addendum 5 — The boot blocker, proven: missing renderables (P0.2)

After resolving Yoga + the layout/render-output deps (addendum 4 + the util shims),
the remaining blocker for "boot app on the forked renderer" is now demonstrated
concretely, not estimated:

**The app renders against opentui renderables the fork does not provide.** Counts of
opentui-native intrinsics in `src/`:

| intrinsic | uses | fork equivalent |
| --- | --- | --- |
| `<input>` | 75 | **none** |
| `<select>` | 12 | **none** |
| `<scrollbox>` | 6 | `ScrollBox.tsx` (different API) |
| `<textarea>` | 3 | **none** |
| `<markdown>` | 2 | **none** |

The fork's `components/` are `Box, Text, ScrollBox, Link, Button, Newline, Spacer,
RawAnsi, AlternateScreen` + contexts — it has **no input field, multi-line textarea,
select dropdown, or markdown renderer**. These are exactly the interactive surfaces
the app leans on (the prompt is a `<textarea>`; every panel form uses `<input>`/
`<select>`; the transcript renders `<markdown>`). Booting the app on the fork
therefore requires **reimplementing those renderables on the fork's reconciler** —
a multi-week build, plus the intrinsic/prop translation, plus exhaustive per-component
QA. That is the genuine, irreducible core of P0.2 and cannot be done safely or
verifiably in a single session. The layout + render-output foundation is proven and
in place; the renderable reimplementation is the remaining dedicated migration.
