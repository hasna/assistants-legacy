/**
 * PromptInput suite (plan 8d98da29 P5.1).
 *
 * Focused pieces extracted from the former 810-line Input.tsx: pure paste/text
 * helpers, the vim→textarea adapter (live bridge to P5.2's engine), and the vim
 * mode indicator. Input.tsx composes these.
 */
export {
  normalizeLineEndings,
  countWords,
  countLines,
  formatPastePlaceholder,
  isLargePaste,
  DEFAULT_PASTE_THRESHOLDS,
  type PasteThresholds,
} from './helpers';
export {
  applyVimTextareaInkInput,
  applyVimTextareaKey,
  createVimTextareaAdapterState,
  vimKeyFromInkInput,
  type VimTextareaAdapterState,
  type VimTextareaApplyResult,
  type VimTextareaModel,
  type VimMode,
  type VimPending,
} from './vimTextareaAdapter';
export { VimStatusIndicator } from './VimStatusIndicator';
export { VimTextarea, type VimTextareaProps } from './VimTextarea';
