/**
 * Vim -> Ink Textarea adapter.
 *
 * The previous adapter used imperative textarea methods. The Ink prompt
 * textarea is controlled by value + cursorOffset, so Vim commands now reduce
 * against that plain model and return the next model for Textarea.
 */
import {
  initialVimState,
  vimKey,
  type Pending,
  type Register,
  type VimMode,
  type VimState,
} from '../../vim';
import type { Key } from '../../keybindings';

export interface VimTextareaModel {
  value: string;
  cursorOffset: number;
}

export interface VimTextareaAdapterState {
  mode: VimMode;
  pending: Pending;
  register: Register;
  visualAnchor: number;
  gPrefix: boolean;
}

export interface VimTextareaApplyResult {
  model: VimTextareaModel;
  state: VimTextareaAdapterState;
  handled: boolean;
}

export function createVimTextareaAdapterState(mode: VimMode = 'INSERT'): VimTextareaAdapterState {
  const state = initialVimState();
  return {
    mode,
    pending: state.pending,
    register: state.register,
    visualAnchor: state.visualAnchor,
    gPrefix: false,
  };
}

function toEngineState(model: VimTextareaModel, state: VimTextareaAdapterState): VimState {
  return {
    mode: state.mode,
    buffer: {
      text: model.value,
      cursor: model.cursorOffset,
    },
    pending: state.pending,
    register: state.register,
    visualAnchor: state.visualAnchor,
  };
}

function fromEngineState(state: VimState): VimTextareaApplyResult {
  return {
    model: {
      value: state.buffer.text,
      cursorOffset: state.buffer.cursor,
    },
    state: {
      mode: state.mode,
      pending: state.pending,
      register: state.register,
      visualAnchor: state.visualAnchor,
      gPrefix: false,
    },
    handled: true,
  };
}

export function vimKeyFromInkInput(input: string, key: Key): string | null {
  if (key.eventType === 'release') return null;
  if (key.escape || input === '\x1b') return 'Escape';
  if (key.return || input === '\r' || input === '\n' || input === '\r\n') return 'Enter';
  if (key.backspace) return 'Backspace';
  if (key.leftArrow) return 'h';
  if (key.downArrow) return 'j';
  if (key.upArrow) return 'k';
  if (key.rightArrow) return 'l';
  if (input.length === 1) return input;
  return null;
}

export function applyVimTextareaKey(
  model: VimTextareaModel,
  state: VimTextareaAdapterState,
  key: string,
): VimTextareaApplyResult {
  if (state.gPrefix) {
    const nextState = { ...state, gPrefix: false };
    if (key === 'g') {
      return fromEngineState(vimKey(toEngineState(model, nextState), 'gg'));
    }

    return { model, state: nextState, handled: true };
  }

  if (state.mode === 'INSERT' && key !== 'Escape') {
    return { model, state, handled: false };
  }

  if (state.mode === 'NORMAL' && key === 'g') {
    return { model, state: { ...state, gPrefix: true }, handled: true };
  }

  return fromEngineState(vimKey(toEngineState(model, state), key));
}

export function applyVimTextareaInkInput(
  model: VimTextareaModel,
  state: VimTextareaAdapterState,
  input: string,
  key: Key,
): VimTextareaApplyResult {
  const vimKeyName = vimKeyFromInkInput(input, key);
  if (!vimKeyName) {
    return { model, state, handled: false };
  }

  return applyVimTextareaKey(model, state, vimKeyName);
}

export type { VimMode, Pending as VimPending };
