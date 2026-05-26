/**
 * Design-system primitives (plan 8d98da29 P2.1).
 *
 * opentui-native, theme-token-driven building blocks shared across panels. All
 * colors resolve through the active theme (theme/colors.ts) — no hardcoded hex.
 *
 * Inline primitives (render `<span>`, must live inside a `<text>`):
 *   StatusIcon, KeyboardShortcutHint, Badge
 * Block primitives (render `<box>`/`<text>`):
 *   Divider, ListItem, Pane
 */
export { color, type ColorValue, type SemanticColor } from './color';
export { StatusIcon, STATUS_CONFIG, type Status } from './StatusIcon';
export { KeyboardShortcutHint } from './KeyboardShortcutHint';
export { Badge } from './Badge';
export { Divider } from './Divider';
export { ListItem } from './ListItem';
export { Pane } from './Pane';
