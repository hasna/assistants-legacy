/**
 * Terminal theme setup — patches OpenTUI's default text fg color based on detected theme.
 *
 * OpenTUI defaults all <text> elements to white RGBA(1,1,1,1) which is invisible on
 * light terminal themes. This module creates a themed TextRenderable subclass that
 * uses the terminal's detected theme mode to pick an appropriate default fg color,
 * then registers it as the `text` component via OpenTUI's `extend()` API.
 *
 * This is a ROOT-LEVEL fix: it changes the default for ALL <text> elements without
 * requiring modifications to any individual component file.
 */

import type { CliRenderer, ThemeMode } from '@opentui/core';

/**
 * ============================================================================
 * OpenTUI QoL Features — Unused capabilities we could leverage
 * ============================================================================
 *
 * 1. ASCIIFont (HIGH) — Renders styled ASCII art text using built-in fonts
 *    (tiny, slant, banner, etc.). Could replace our welcome banner "hasna" text
 *    with a proper ASCIIFontRenderable for a polished first impression. Supports
 *    multi-color gradients, selection, and custom fonts.
 *    Usage: <asciifont text="hasna" font="slant" color={['#7c3aed','#2563eb']} />
 *
 * 2. TabSelect (HIGH) — Horizontal tab bar with keyboard nav (left/right/[/]),
 *    description row, underline indicator, scroll arrows, and wrap support.
 *    Perfect for: model variant picker bar, settings category tabs, or the
 *    panel switcher (Chat / Docs / Logs / Sessions).
 *    Usage: <tabselect options={tabs} showDescription showUnderline />
 *
 * 3. TextTable (MEDIUM) — Rich table with borders, column fitting, cell
 *    padding, selection, and word-wrap. Already used inside MarkdownRenderable
 *    for markdown tables, but we could use it standalone for:
 *    - Token usage display (prompt/completion/total)
 *    - Config/settings viewer
 *    - Session list with columns
 *    Usage: <texttable content={rows} borderStyle="single" columnWidthMode="full" />
 *
 * 4. Selection + Clipboard (HIGH) — Built-in text selection (mouse drag) and
 *    OSC 52 clipboard copy. TextBufferRenderable, EditBufferRenderable, and
 *    ASCIIFont all support `selectable` prop. Clipboard class provides
 *    copyToClipboardOSC52(). We already have useCopyToClipboard hook but could
 *    enable selection on all message blocks for copy-paste workflows.
 *
 * 5. Links / detect-links (MEDIUM) — detectLinks() auto-discovers URLs in
 *    TextChunks and attaches clickable link metadata. MarkdownRenderable uses
 *    this internally. We could enable it for code blocks or plain text messages
 *    so URLs are clickable in terminals that support hyperlinks (OSC 8).
 *
 * 6. ScrollBox (MEDIUM) — Full scroll container with scrollbars, sticky scroll,
 *    viewport culling, and scroll acceleration (macOS-style). Could replace our
 *    manual scroll handling in message lists with a proper ScrollBoxRenderable
 *    that handles all edge cases natively.
 *    Usage: <scrollbox stickyScroll stickyStart="bottom" scrollY />
 *
 * 7. Timeline / Animations (LOW) — Animation system with easing functions,
 *    timelines, looping, and property interpolation. Could add subtle entrance
 *    animations for new messages, loading indicators, or panel transitions.
 *    Usage: timeline.add(target, { opacity: 1, duration: 300, ease: 'easeOut' })
 *
 * 8. Slider (LOW) — Draggable slider with min/max/viewport. Limited use cases
 *    in our app — maybe a temperature slider in model config, or volume control
 *    for voice features. Probably not worth integrating unless we build a
 *    settings panel.
 *
 * 9. Console (LOW) — Built-in debug console that captures console.log/warn/error
 *    and renders them in an overlay panel. Toggled via SHOW_CONSOLE env var.
 *    Useful for development/debugging but not for end users.
 *
 * 10. Extmarks (LOW) — Editor marks/highlights with undo history. Positions
 *     tracked by display-width offset. Currently "simulated" (not native Zig yet).
 *     Could highlight search matches, inline errors, or AI-suggested edits in
 *     the input textarea. Wait for native implementation.
 *
 * 11. SyntaxStyle (MEDIUM) — Theme token styles with scope-based resolution.
 *     We already use it for code blocks and markdown. Could create custom
 *     syntax styles for assistant messages (highlight tool calls, code refs,
 *     file paths differently from prose).
 *
 * 12. VRenderable (LOW) — Virtual renderable with custom render function prop.
 *     Useful for one-off custom rendering without creating a new class. Could
 *     use for progress bars, sparklines, or custom status indicators.
 *
 * 13. KeyBinding system (MEDIUM) — Declarative key bindings with aliases, merge
 *     support, and modifier keys. Select and TabSelect use this. We could adopt
 *     it for our own keyboard shortcuts instead of manual key event handling.
 *
 * 14. 3D/WebGPU (SKIP) — Three.js rendering in terminal via WebGPU. Includes
 *     sprite animation, physics (Rapier/Planck), particle effects. Creative
 *     but impractical for an AI assistant. Skip unless building a demo/easter egg.
 *
 * 15. Mouse events (MEDIUM) — All renderables support onMouseEvent with scroll,
 *     click, and drag. TextBufferRenderable handles scroll natively. We could
 *     add click-to-copy on code blocks or click-to-expand on collapsed sections.
 *
 * Priority summary:
 *   HIGH:   ASCIIFont (welcome banner), TabSelect (panel/model tabs),
 *           Selection+Clipboard (copy from messages)
 *   MEDIUM: TextTable (token usage), Links (clickable URLs), ScrollBox (message list),
 *           SyntaxStyle (custom message themes), KeyBinding (shortcut system),
 *           Mouse events (click interactions)
 *   LOW:    Timeline (animations), Slider, Console (debug), Extmarks, VRenderable
 *   SKIP:   3D/WebGPU
 * ============================================================================
 */

// [cassius] Theme-aware default fg colors — must match spec section 11.4
const DARK_FG = '#e0e0e0';  // OpenCode dark Text color
const LIGHT_FG = '#2a2a2a'; // OpenCode light Text color

/** Shared mutable state — the current default fg for text elements. */
let currentDefaultFg: string = DARK_FG;

/**
 * Detect the initial theme mode from env vars before the renderer is ready.
 * Returns 'light' or 'dark'.
 */
/**
 * An explicit, authoritative theme choice from the environment. Wins over all
 * heuristic detection (and over OpenTUI's own terminal probe, which can guess
 * wrong on terminals that don't answer the OSC 11 background query — e.g. ttyd,
 * some CI PTYs). Returns null when the user has not forced a theme.
 *
 * Accepted via HASNA_THEME or HASNA_ASSISTANTS_THEME = 'dark' | 'light'
 * ('auto' or any other value means "no override, detect normally").
 */
export function explicitThemeOverride(): ThemeMode | null {
  const raw = (process.env.HASNA_THEME ?? process.env.HASNA_ASSISTANTS_THEME ?? '').trim().toLowerCase();
  if (raw === 'dark' || raw === 'light') return raw;
  return null;
}

function detectThemeFromEnv(): ThemeMode {
  // An explicit override always wins.
  const forced = explicitThemeOverride();
  if (forced) return forced;
  // COLORFGBG is set by many terminals (xterm, iTerm2, etc.)
  const colorFgBg = process.env.COLORFGBG;
  if (colorFgBg) {
    const parts = colorFgBg.split(';');
    const bg = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(bg) && bg > 8) return 'light';
  }
  // Explicit env var override
  if (process.env.TERMINAL_THEME === 'light') return 'light';
  if (process.env.TERMINAL_THEME === 'dark') return 'dark';
  // macOS: check for light appearance
  if (process.env.TERM_PROGRAM === 'Apple_Terminal') {
    // Apple Terminal defaults to light; check if dark scheme is set
    if (!process.env.COLORFGBG) return 'light';
  }
  return 'dark';
}

/**
 * Initialize theme-aware text rendering.
 *
 * Call this BEFORE `root.render()` so the themed TextRenderable is
 * registered before any React elements are created.
 *
 * @param renderer - The CliRenderer instance (used to detect theme and listen for changes)
 */
/** A persisted theme preference: a concrete mode, or 'auto' to detect. */
export type ThemeSetting = 'auto' | ThemeMode;

/**
 * Resolve a theme setting to a concrete mode and apply it as the default fg.
 * Precedence: explicit HASNA_THEME env override > the given setting (unless
 * 'auto') > terminal/env detection. Returns the resolved concrete mode.
 *
 * Use at startup (via setupThemeDefaults) and at runtime (the /theme command).
 */
export function applyThemeSetting(setting: ThemeSetting | null | undefined): ThemeMode {
  const forced = explicitThemeOverride();
  let mode: ThemeMode;
  if (forced) {
    mode = forced;
  } else if (setting && setting !== 'auto') {
    mode = setting;
  } else {
    mode = detectThemeFromEnv();
  }
  currentDefaultFg = mode === 'light' ? LIGHT_FG : DARK_FG;
  return mode;
}

export async function setupThemeDefaults(renderer: CliRenderer, persistedSetting?: ThemeSetting): Promise<void> {
  const [
    core,
    { extend },
  ] = await Promise.all([
    import('@opentui/core'),
    import('@opentui/react'),
  ]);
  const {
    TextRenderable,
    TextNodeRenderable,
    CodeRenderable,
    MarkdownRenderable,
    RGBA,
  } = core;

  /**
   * A TextRenderable subclass that uses a theme-aware default fg color.
   *
   * Instead of hardcoding white, it reads the current theme fg from the
   * shared `currentDefaultFg` variable at construction time. When the
   * JSX `<text>` element provides an explicit `fg` prop, that takes
   * precedence (handled by the parent constructor).
   */
  class ThemedTextRenderable extends TextRenderable {
    constructor(ctx: any, options: any) {
      // If no explicit fg was provided, inject the themed default
      if (options.fg === undefined || options.fg === null) {
        super(ctx, { ...options, fg: currentDefaultFg });
      } else {
        super(ctx, options);
      }
    }

    // OpenTUI's TextNodeRenderable only accepts strings.
    // Ink accepted numbers, booleans, etc. as children of <Text>.
    // This override converts non-string children to strings automatically,
    // preventing "TextNodeRenderable only accepts strings" crashes.
    add(obj: any, index?: number): number {
      if (typeof obj === 'number' || typeof obj === 'bigint') {
        return super.add(String(obj), index);
      }
      if (typeof obj === 'boolean' || obj === null || obj === undefined) {
        return super.add('', index);
      }
      return super.add(obj, index);
    }
  }

  /**
   * Themed CodeRenderable — injects theme-aware fg when no explicit fg is provided.
   */
  class ThemedCodeRenderable extends CodeRenderable {
    constructor(ctx: any, options: any) {
      if (options.fg === undefined || options.fg === null) {
        super(ctx, { ...options, fg: currentDefaultFg });
      } else {
        super(ctx, options);
      }
    }
  }

  /**
   * Themed MarkdownRenderable — injects theme-aware fg when no explicit fg is provided.
   */
  class ThemedMarkdownRenderable extends MarkdownRenderable {
    constructor(ctx: any, options: any) {
      if (options.fg === undefined || options.fg === null) {
        super(ctx, { ...options, fg: currentDefaultFg });
      } else {
        super(ctx, options);
      }
    }
  }

  // 1. Detect initial theme and set renderer background for proper contrast.
  // An explicit user override (HASNA_THEME) beats the persisted setting and
  // OpenTUI's terminal probe, which can misreport on terminals that ignore the
  // OSC 11 background query.
  const forced = explicitThemeOverride();
  const rendererTheme = renderer.themeMode;
  // Persisted setting (if concrete) wins over the renderer probe; 'auto'/absent
  // falls through to the probe and then env detection.
  const initialMode = forced
    ?? (persistedSetting && persistedSetting !== 'auto' ? persistedSetting : undefined)
    ?? rendererTheme
    ?? detectThemeFromEnv();
  currentDefaultFg = initialMode === 'light' ? LIGHT_FG : DARK_FG;

  // Note: Do NOT call renderer.setBackgroundColor() — it paints over the
  // terminal's native background, forcing a specific theme appearance.
  // Instead we rely on explicit fg props on each component.

  // 2. Patch OpenTUI runtime to accept numeric children in text nodes.
  // OpenTUI throws "TextNodeRenderable only accepts strings" but React/Ink allowed numbers.
  // We patch both our bundled imports AND dynamically resolve the runtime module.
  // This runs synchronously at startup — no need for the postinstall script to have run.
  function patchAdd(Proto: any) {
    if (!Proto?.add) return;
    const orig = Proto.add;
    if ((orig as any).__patched) return; // avoid double-patching
    Proto.add = function(obj: any, index?: number): number {
      if (typeof obj === 'number' || typeof obj === 'bigint') return orig.call(this, String(obj), index);
      if (obj === null || obj === undefined || typeof obj === 'boolean') return orig.call(this, '', index);
      return orig.call(this, obj, index);
    };
    (Proto.add as any).__patched = true;
  }
  // Patch our imported copies synchronously (these are the bundled copies)
  patchAdd(TextRenderable.prototype);
  patchAdd(TextNodeRenderable.prototype);

  // 2b. Patch RGBA.fromValues to intercept the hardcoded white default.
  // OpenTUI's _defaultOptions are class field initializers that create
  // RGBA.fromValues(1,1,1,1) per-instance, so we can't patch the prototype.
  // Instead, we monkey-patch the concrete class constructors to inject
  // the theme-aware fg color when no explicit fg is provided.
  //
  // For TextBufferRenderable subclasses: options.fg ?? _defaultOptions.fg
  // For EditBufferRenderable subclasses: options.textColor ?? _defaultOptions.textColor
  function patchConstructorFg(Klass: any, fgField: string = 'fg') {
    if (!Klass?.prototype) return;
    if ((Klass as any).__fgPatched) return;
    // Class field initializers (e.g. `_defaultOptions = { fg: RGBA.fromValues(1,1,1,1) }`)
    // use [[Set]] semantics, which means they trigger setter traps defined on the prototype.
    // We exploit this: define a set/get pair on the prototype for `_defaultOptions` so that
    // when any instance initializes the field, our setter intercepts the white default and
    // replaces it with a getter returning the current theme fg color.
    const existingDescriptor = Object.getOwnPropertyDescriptor(Klass.prototype, '_defaultOptions');
    if (existingDescriptor && !existingDescriptor.get) {
      // Already a data property on the prototype — bail to avoid breaking it
      return;
    }
    const storageKey = Symbol('_defaultOptions');
    Object.defineProperty(Klass.prototype, '_defaultOptions', {
      get() { return (this as any)[storageKey]; },
      set(value: any) {
        if (value && typeof value === 'object' && value[fgField]) {
          const fgVal = value[fgField];
          if (fgVal && typeof fgVal === 'object' && fgVal.r === 1 && fgVal.g === 1 && fgVal.b === 1 && fgVal.a === 1) {
            // Replace hardcoded white with a getter that returns theme-aware color
            const patchedValue = { ...value };
            Object.defineProperty(patchedValue, fgField, {
              get() { return RGBA.fromHex(currentDefaultFg); },
              configurable: true,
              enumerable: true,
            });
            (this as any)[storageKey] = patchedValue;
            return;
          }
        }
        (this as any)[storageKey] = value;
      },
      configurable: true,
      enumerable: false,
    });
    (Klass as any).__fgPatched = true;
  }

  // Patch bundled TextBufferRenderable (parent of TextRenderable, CodeRenderable)
  // TextRenderable.prototype chain includes TextBufferRenderable
  try {
    const tbProto = Object.getPrototypeOf(TextRenderable.prototype);
    if (tbProto && tbProto.constructor) {
      patchConstructorFg(tbProto.constructor, 'fg');
    }
  } catch (_) {}

  // Also patch EditBufferRenderable here.
  try {
    const TR = (core as any).TextareaRenderable;
    if (TR) {
      const ebProto = Object.getPrototypeOf(TR.prototype);
      if (ebProto?.constructor) patchConstructorFg(ebProto.constructor, 'textColor');
    }
  } catch (_) {}

  // 3. Register our themed text renderable, replacing the default
  extend({
    text: ThemedTextRenderable as any,
    code: ThemedCodeRenderable as any,
    markdown: ThemedMarkdownRenderable as any,
  });

  // 3. Listen for runtime theme changes (e.g., user switches OS dark/light mode)
  renderer.on('theme_mode', (mode: ThemeMode) => {
    // A forced theme is authoritative — ignore late terminal probe results.
    if (explicitThemeOverride()) return;
    currentDefaultFg = mode === 'light' ? LIGHT_FG : DARK_FG;
    // Note: existing TextRenderable instances keep their construction-time fg.
    // New instances created after this point will use the updated default.
    // For a full live-switch, a re-render of the component tree is needed.
    // OpenTUI's React reconciler will create new instances on re-render.
  });
}

/**
 * Get the current theme-appropriate fg color (for use outside React components).
 */
export function getThemeFg(): string {
  return currentDefaultFg;
}

/**
 * Get the current theme mode.
 */
export function getThemeMode(): ThemeMode {
  return currentDefaultFg === LIGHT_FG ? 'light' : 'dark';
}
