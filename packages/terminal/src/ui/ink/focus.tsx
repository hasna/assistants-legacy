/** @jsxImportSource react */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { useInput } from 'ink';
import { KeybindingMatcher, defaultKeymap, type Key, type Keymap } from '../../keybindings';
import type { VimMode } from '../../vim';

export type InkFocusScope =
  | 'root'
  | 'transcript'
  | 'prompt'
  | 'panel'
  | 'modal'
  | 'command-menu';

export const INK_KEYBOARD_PRIORITIES = {
  root: 0,
  transcript: 10,
  prompt: 20,
  panel: 40,
  modal: 80,
  commandMenu: 100,
} as const;

export type InkFocusState = {
  id: string;
  scope: InkFocusScope;
  isFocused: boolean;
  activeId: string | null;
  activeScope: InkFocusScope | null;
  vimMode: VimMode | null;
};

export type InkKeyEvent = {
  input: string;
  key: Key;
  action: string | null;
  scope: InkFocusScope | null;
  focusId: string | null;
  vimMode: VimMode | null;
};

export type InkKeyHandler = (event: InkKeyEvent) => boolean | void;

export type InkKeyboardDispatchResult = {
  handled: boolean;
  pending: boolean;
  action: string | null;
  scope: InkFocusScope | null;
  focusId: string | null;
  vimMode: VimMode | null;
};

type ScopeFilter = InkFocusScope | 'global';

type FocusEntry = {
  id: string;
  scope: InkFocusScope;
  priority: number;
  isActive: boolean;
  vimMode: VimMode | null;
  order: number;
};

type HandlerEntry = {
  id: string;
  scope?: ScopeFilter;
  priority: number;
  isActive: boolean;
  handler: InkKeyHandler;
  order: number;
};

type ActionHandlerEntry = HandlerEntry & {
  action: string;
};

export type InkFocusOptions = {
  id?: string;
  scope?: InkFocusScope;
  priority?: number;
  isActive?: boolean;
  vimMode?: VimMode | null;
};

export type InkHandlerOptions = {
  id?: string;
  scope?: ScopeFilter;
  priority?: number;
  isActive?: boolean;
};

function defaultPriority(scope: InkFocusScope | undefined): number {
  switch (scope) {
    case 'command-menu':
      return INK_KEYBOARD_PRIORITIES.commandMenu;
    case 'modal':
      return INK_KEYBOARD_PRIORITIES.modal;
    case 'panel':
      return INK_KEYBOARD_PRIORITIES.panel;
    case 'prompt':
      return INK_KEYBOARD_PRIORITIES.prompt;
    case 'transcript':
      return INK_KEYBOARD_PRIORITIES.transcript;
    default:
      return INK_KEYBOARD_PRIORITIES.root;
  }
}

function byPriorityThenOrder<T extends { priority: number; order: number }>(a: T, b: T): number {
  return b.priority - a.priority || b.order - a.order;
}

function callsHandle(handler: InkKeyHandler, event: InkKeyEvent): boolean {
  return handler(event) !== false;
}

function scopeMatches(handlerScope: ScopeFilter | undefined, activeScope: InkFocusScope | null): boolean {
  return !handlerScope || handlerScope === 'global' || handlerScope === activeScope;
}

export class InkKeyboardRouter {
  private focusEntries = new Map<string, FocusEntry>();
  private keyHandlers = new Map<string, HandlerEntry>();
  private escapeHandlers = new Map<string, HandlerEntry>();
  private actionHandlers = new Map<string, ActionHandlerEntry>();
  private listeners = new Set<() => void>();
  private matcher: KeybindingMatcher;
  private order = 0;

  constructor(keymap: Keymap = defaultKeymap()) {
    this.matcher = new KeybindingMatcher(keymap);
  }

  setKeymap(keymap: Keymap): void {
    this.matcher = new KeybindingMatcher(keymap);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  registerFocus(options: Required<Pick<InkFocusOptions, 'id' | 'scope' | 'priority' | 'isActive'>> & {
    vimMode?: VimMode | null;
  }): () => void {
    const entry: FocusEntry = {
      ...options,
      vimMode: options.vimMode ?? null,
      order: ++this.order,
    };
    this.focusEntries.set(entry.id, entry);
    this.notify();

    return () => {
      this.focusEntries.delete(entry.id);
      this.notify();
    };
  }

  registerKeyHandler(options: Required<Pick<InkHandlerOptions, 'id' | 'priority' | 'isActive'>> & {
    scope?: ScopeFilter;
    handler: InkKeyHandler;
  }): () => void {
    const entry: HandlerEntry = { ...options, order: ++this.order };
    this.keyHandlers.set(entry.id, entry);
    return () => {
      this.keyHandlers.delete(entry.id);
    };
  }

  registerEscapeHandler(options: Required<Pick<InkHandlerOptions, 'id' | 'priority' | 'isActive'>> & {
    scope?: ScopeFilter;
    handler: InkKeyHandler;
  }): () => void {
    const entry: HandlerEntry = { ...options, order: ++this.order };
    this.escapeHandlers.set(entry.id, entry);
    return () => {
      this.escapeHandlers.delete(entry.id);
    };
  }

  registerKeybinding(action: string, options: Required<Pick<InkHandlerOptions, 'id' | 'priority' | 'isActive'>> & {
    scope?: ScopeFilter;
    handler: InkKeyHandler;
  }): () => void {
    const entry: ActionHandlerEntry = { ...options, action, order: ++this.order };
    this.actionHandlers.set(entry.id, entry);
    return () => {
      this.actionHandlers.delete(entry.id);
    };
  }

  getActiveFocus(): FocusEntry | null {
    const active = [...this.focusEntries.values()]
      .filter((entry) => entry.isActive)
      .sort(byPriorityThenOrder);

    return active[0] ?? null;
  }

  getFocusState(id: string, scope: InkFocusScope): InkFocusState {
    const active = this.getActiveFocus();

    return {
      id,
      scope,
      isFocused: active?.id === id,
      activeId: active?.id ?? null,
      activeScope: active?.scope ?? null,
      vimMode: active?.vimMode ?? null,
    };
  }

  dispatch(input: string, key: Key): InkKeyboardDispatchResult {
    const activeFocus = this.getActiveFocus();
    const scope = activeFocus?.scope ?? null;
    const focusId = activeFocus?.id ?? null;
    const vimMode = activeFocus?.vimMode ?? null;

    if (key.eventType === 'release') {
      return { handled: false, pending: false, action: null, scope, focusId, vimMode };
    }

    const eventBase = { input, key, scope, focusId, vimMode };

    if (key.escape && this.dispatchHandlers(this.escapeHandlers, { ...eventBase, action: 'app:cancel' })) {
      this.matcher.reset();
      return { handled: true, pending: false, action: 'app:cancel', scope, focusId, vimMode };
    }

    const resolved = this.matcher.resolve(input, key);
    if (resolved.type === 'pending') {
      return { handled: true, pending: true, action: null, scope, focusId, vimMode };
    }

    const action = resolved.type === 'match' ? resolved.action : null;
    if (action && this.dispatchActionHandlers(action, { ...eventBase, action })) {
      return { handled: true, pending: false, action, scope, focusId, vimMode };
    }

    if (this.dispatchHandlers(this.keyHandlers, { ...eventBase, action })) {
      return { handled: true, pending: false, action, scope, focusId, vimMode };
    }

    return { handled: false, pending: false, action, scope, focusId, vimMode };
  }

  private dispatchHandlers(entries: Map<string, HandlerEntry>, event: InkKeyEvent): boolean {
    const active = [...entries.values()]
      .filter((entry) => entry.isActive && scopeMatches(entry.scope, event.scope))
      .sort(byPriorityThenOrder);

    for (const entry of active) {
      if (callsHandle(entry.handler, event)) {
        return true;
      }
    }

    return false;
  }

  private dispatchActionHandlers(action: string, event: InkKeyEvent): boolean {
    const active = [...this.actionHandlers.values()]
      .filter((entry) => entry.action === action && entry.isActive && scopeMatches(entry.scope, event.scope))
      .sort(byPriorityThenOrder);

    for (const entry of active) {
      if (callsHandle(entry.handler, event)) {
        return true;
      }
    }

    return false;
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}

export function createInkKeyboardRouter(keymap?: Keymap): InkKeyboardRouter {
  return new InkKeyboardRouter(keymap);
}

type InkKeyboardContextValue = {
  router: InkKeyboardRouter;
};

const InkKeyboardContext = createContext<InkKeyboardContextValue | null>(null);

export type InkKeyboardProviderProps = {
  keymap?: Keymap;
  isActive?: boolean;
  children?: React.ReactNode;
};

export function InkKeyboardProvider({
  keymap,
  isActive = true,
  children,
}: InkKeyboardProviderProps): React.JSX.Element {
  const routerRef = useRef<InkKeyboardRouter | null>(null);
  if (!routerRef.current) {
    routerRef.current = createInkKeyboardRouter(keymap ?? defaultKeymap());
  }

  const router = routerRef.current;

  useEffect(() => {
    router.setKeymap(keymap ?? defaultKeymap());
  }, [keymap, router]);

  useInput((input, key) => {
    router.dispatch(input, key);
  }, { isActive });

  const value = useMemo<InkKeyboardContextValue>(() => ({ router }), [router]);

  return (
    <InkKeyboardContext.Provider value={value}>
      {children}
    </InkKeyboardContext.Provider>
  );
}

export function useInkKeyboardRouter(): InkKeyboardRouter {
  const context = useContext(InkKeyboardContext);
  if (!context) {
    throw new Error('useInkKeyboardRouter must be used within InkKeyboardProvider');
  }

  return context.router;
}

function useStableId(prefix: string, provided?: string): string {
  const reactId = useId();
  return provided ?? `${prefix}-${reactId}`;
}

export function useInkFocusState(options: InkFocusOptions = {}): InkFocusState {
  const router = useInkKeyboardRouter();
  const id = useStableId(options.scope ?? 'focus', options.id);
  const scope = options.scope ?? 'root';
  const priority = options.priority ?? defaultPriority(scope);
  const isActive = options.isActive ?? true;
  const vimMode = options.vimMode ?? null;
  const [, forceUpdate] = useReducer((value: number) => value + 1, 0);

  useEffect(() => router.subscribe(forceUpdate), [router]);

  useEffect(() => router.registerFocus({
    id,
    scope,
    priority,
    isActive,
    vimMode,
  }), [id, isActive, priority, router, scope, vimMode]);

  return router.getFocusState(id, scope);
}

export function useInkKeyHandler(handler: InkKeyHandler, options: InkHandlerOptions = {}): void {
  const router = useInkKeyboardRouter();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const id = useStableId('key-handler', options.id);
  const priority = options.priority ?? defaultPriority(options.scope === 'global' ? undefined : options.scope);
  const isActive = options.isActive ?? true;

  useEffect(() => router.registerKeyHandler({
    id,
    scope: options.scope,
    priority,
    isActive,
    handler: (event) => handlerRef.current(event),
  }), [id, isActive, options.scope, priority, router]);
}

export function useInkKeybinding(
  action: string,
  handler: InkKeyHandler,
  options: InkHandlerOptions = {},
): void {
  const router = useInkKeyboardRouter();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const id = useStableId(`keybinding-${action}`, options.id);
  const priority = options.priority ?? defaultPriority(options.scope === 'global' ? undefined : options.scope);
  const isActive = options.isActive ?? true;

  useEffect(() => router.registerKeybinding(action, {
    id,
    scope: options.scope,
    priority,
    isActive,
    handler: (event) => handlerRef.current(event),
  }), [action, id, isActive, options.scope, priority, router]);
}

export function useInkEscape(handler: InkKeyHandler, options: InkHandlerOptions = {}): void {
  const router = useInkKeyboardRouter();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const id = useStableId('escape-handler', options.id);
  const priority = options.priority ?? defaultPriority(options.scope === 'global' ? undefined : options.scope);
  const isActive = options.isActive ?? true;

  useEffect(() => router.registerEscapeHandler({
    id,
    scope: options.scope,
    priority,
    isActive,
    handler: (event) => handlerRef.current(event),
  }), [id, isActive, options.scope, priority, router]);
}

export function useInkVimMode(
  vimMode: VimMode,
  options: Omit<InkFocusOptions, 'scope' | 'vimMode'> = {},
): InkFocusState {
  return useInkFocusState({
    ...options,
    scope: 'prompt',
    priority: options.priority ?? INK_KEYBOARD_PRIORITIES.prompt,
    vimMode,
  });
}

export function useInkModalPriority(
  isOpen: boolean,
  options: Omit<InkFocusOptions, 'scope' | 'isActive'> = {},
): InkFocusState {
  return useInkFocusState({
    ...options,
    scope: 'modal',
    priority: options.priority ?? INK_KEYBOARD_PRIORITIES.modal,
    isActive: isOpen,
  });
}

export function useInkCommandMenuPriority(
  isOpen: boolean,
  options: Omit<InkFocusOptions, 'scope' | 'isActive'> = {},
): InkFocusState {
  return useInkFocusState({
    ...options,
    scope: 'command-menu',
    priority: options.priority ?? INK_KEYBOARD_PRIORITIES.commandMenu,
    isActive: isOpen,
  });
}
