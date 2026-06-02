/**
 * Keybinding React integration (plan 8d98da29 P3.1).
 *
 * A KeybindingProvider runs a single root input listener, resolves each event to
 * an action via the engine, and dispatches to handlers registered with
 * useKeybinding. This is the integration layer P3.2 will migrate call sites onto;
 * the resolution logic itself is the pure engine (resolver.ts).
 */
import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { useAppInput, type Key } from '../hooks/useAppInput';
import { KeybindingMatcher } from './resolver';
import { defaultKeymap } from './defaults';
import type { Keymap } from './types';

interface KeybindingContextValue {
  keymap: Keymap;
  register: (action: string, handler: () => void) => () => void;
}

const KeybindingCtx = createContext<KeybindingContextValue | null>(null);

interface ProviderProps {
  keymap?: Keymap;
  isActive?: boolean;
  children?: React.ReactNode;
}

export function KeybindingProvider({ keymap, isActive = true, children }: ProviderProps) {
  const activeKeymap = keymap ?? defaultKeymap();
  // One matcher instance holds chord-pending state across events.
  const matcher = useMemo(() => new KeybindingMatcher(activeKeymap), [activeKeymap]);
  const handlers = useRef(new Map<string, Set<() => void>>());

  const register = useMemo(
    () => (action: string, handler: () => void) => {
      const set = handlers.current.get(action) ?? new Set();
      set.add(handler);
      handlers.current.set(action, set);
      return () => {
        set.delete(handler);
        if (set.size === 0) handlers.current.delete(action);
      };
    },
    [],
  );

  useAppInput(
    (input: string, key: Key) => {
      const result = matcher.resolve(input, key);
      if (result.type === 'match') {
        const set = handlers.current.get(result.action);
        if (set) for (const h of [...set]) h();
      }
    },
    { isActive },
  );

  const value = useMemo<KeybindingContextValue>(() => ({ keymap: activeKeymap, register }), [activeKeymap, register]);
  return <KeybindingCtx.Provider value={value}>{children}</KeybindingCtx.Provider>;
}

/** The active keymap (defaults if no provider is mounted). */
export function useKeymap(): Keymap {
  return useContext(KeybindingCtx)?.keymap ?? defaultKeymap();
}

/**
 * Bind a handler to an action. The handler stays in the component (React way);
 * the keystroke comes from config. No-op when no provider is mounted.
 */
export function useKeybinding(action: string, handler: () => void, isActive = true): void {
  const ctx = useContext(KeybindingCtx);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    if (!ctx || !isActive) return;
    return ctx.register(action, () => handlerRef.current());
  }, [ctx, action, isActive]);
}
