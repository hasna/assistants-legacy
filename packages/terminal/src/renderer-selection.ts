/**
 * Renderer selection (plan 8d98da29 P0.2 — flag-gated cutover infrastructure).
 *
 * The terminal currently renders with `@opentui/react`. The parity plan adopts
 * Takumi's forked Ink renderer; per docs/tui-renderer-spike.md that migration must
 * be flag-gated so both renderers can coexist during the (multi-week) cutover,
 * keeping the working opentui path as the default fallback.
 *
 * `TUI_RENDERER=ink` opts into the forked-ink path once it lands. Until then it
 * falls back to opentui with a notice, so the flag is wired and documented without
 * destabilizing the working app.
 */
export type RendererKind = 'opentui' | 'ink';

export const DEFAULT_RENDERER: RendererKind = 'opentui';

/** Renderers that are actually implemented and selectable today. */
export const AVAILABLE_RENDERERS: readonly RendererKind[] = ['opentui'];

export interface RendererSelection {
  /** The renderer that will actually be used. */
  renderer: RendererKind;
  /** The renderer the user requested (may differ if it isn't available yet). */
  requested: RendererKind;
  /** A user-facing notice when the request couldn't be honored, else undefined. */
  notice?: string;
}

/**
 * Resolve which renderer to use from the environment. Unknown values and
 * not-yet-available renderers fall back to the default with a notice.
 */
export function selectRenderer(env: NodeJS.ProcessEnv = process.env): RendererSelection {
  const raw = (env.TUI_RENDERER ?? '').trim().toLowerCase();
  if (raw === '' || raw === DEFAULT_RENDERER) {
    return { renderer: DEFAULT_RENDERER, requested: DEFAULT_RENDERER };
  }
  if (raw === 'ink') {
    return {
      renderer: DEFAULT_RENDERER,
      requested: 'ink',
      notice:
        'TUI_RENDERER=ink: the forked-ink renderer is not available yet (see ' +
        'docs/tui-renderer-spike.md, plan P0.2) — falling back to the opentui renderer.',
    };
  }
  return {
    renderer: DEFAULT_RENDERER,
    requested: DEFAULT_RENDERER,
    notice: `Unknown TUI_RENDERER="${raw}" — using "${DEFAULT_RENDERER}". Valid: opentui, ink.`,
  };
}
