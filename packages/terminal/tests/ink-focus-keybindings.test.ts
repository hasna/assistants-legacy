import { describe, expect, test } from 'bun:test';
import {
  INK_KEYBOARD_PRIORITIES,
  createInkKeyboardRouter,
  type InkKeyEvent,
  type Key,
} from '../src/ui/ink';

function key(overrides: Partial<Key> = {}): Key {
  return {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    home: false,
    end: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    tab: false,
    backspace: false,
    delete: false,
    meta: false,
    super: false,
    hyper: false,
    capsLock: false,
    numLock: false,
    ...overrides,
  };
}

describe('Ink keyboard router', () => {
  test('routes generic keys to the active highest-priority focus scope', () => {
    const router = createInkKeyboardRouter();
    const handled: string[] = [];

    router.registerFocus({
      id: 'prompt',
      scope: 'prompt',
      priority: INK_KEYBOARD_PRIORITIES.prompt,
      isActive: true,
    });
    router.registerFocus({
      id: 'commands',
      scope: 'command-menu',
      priority: INK_KEYBOARD_PRIORITIES.commandMenu,
      isActive: true,
    });
    router.registerKeyHandler({
      id: 'prompt-handler',
      scope: 'prompt',
      priority: INK_KEYBOARD_PRIORITIES.prompt,
      isActive: true,
      handler: () => {
        handled.push('prompt');
      },
    });
    router.registerKeyHandler({
      id: 'command-handler',
      scope: 'command-menu',
      priority: INK_KEYBOARD_PRIORITIES.commandMenu,
      isActive: true,
      handler: () => {
        handled.push('command-menu');
      },
    });

    const result = router.dispatch('x', key());

    expect(result).toMatchObject({
      handled: true,
      scope: 'command-menu',
      focusId: 'commands',
    });
    expect(handled).toEqual(['command-menu']);
  });

  test('escape handlers run before global app cancel keybindings', () => {
    const router = createInkKeyboardRouter();
    const handled: string[] = [];

    router.registerFocus({
      id: 'modal',
      scope: 'modal',
      priority: INK_KEYBOARD_PRIORITIES.modal,
      isActive: true,
    });
    router.registerEscapeHandler({
      id: 'modal-escape',
      scope: 'modal',
      priority: INK_KEYBOARD_PRIORITIES.modal,
      isActive: true,
      handler: () => {
        handled.push('modal-escape');
      },
    });
    router.registerKeybinding('app:cancel', {
      id: 'global-cancel',
      scope: 'global',
      priority: INK_KEYBOARD_PRIORITIES.root,
      isActive: true,
      handler: () => {
        handled.push('global-cancel');
      },
    });

    const result = router.dispatch('', key({ escape: true }));

    expect(result).toMatchObject({
      handled: true,
      action: 'app:cancel',
      scope: 'modal',
    });
    expect(handled).toEqual(['modal-escape']);
  });

  test('resolves default keybinding actions through upstream Ink key events', () => {
    const router = createInkKeyboardRouter();
    const events: InkKeyEvent[] = [];

    router.registerFocus({
      id: 'root',
      scope: 'root',
      priority: INK_KEYBOARD_PRIORITIES.root,
      isActive: true,
    });
    router.registerKeybinding('panel:commands', {
      id: 'command-palette',
      scope: 'global',
      priority: INK_KEYBOARD_PRIORITIES.root,
      isActive: true,
      handler: (event) => {
        events.push(event);
      },
    });

    const result = router.dispatch('p', key({ ctrl: true }));

    expect(result).toMatchObject({
      handled: true,
      action: 'panel:commands',
    });
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('panel:commands');
  });

  test('carries focused Vim mode metadata into routed events', () => {
    const router = createInkKeyboardRouter();
    let seenMode: string | null = null;

    router.registerFocus({
      id: 'prompt',
      scope: 'prompt',
      priority: INK_KEYBOARD_PRIORITIES.prompt,
      isActive: true,
      vimMode: 'NORMAL',
    });
    router.registerKeyHandler({
      id: 'prompt-handler',
      scope: 'prompt',
      priority: INK_KEYBOARD_PRIORITIES.prompt,
      isActive: true,
      handler: (event) => {
        seenMode = event.vimMode;
      },
    });

    const result = router.dispatch('j', key());

    expect(result).toMatchObject({
      handled: true,
      vimMode: 'NORMAL',
    });
    expect(seenMode).toBe('NORMAL');
  });

  test('ignores key release events from terminals with enhanced keyboard reporting', () => {
    const router = createInkKeyboardRouter();
    let fired = false;

    router.registerKeyHandler({
      id: 'handler',
      scope: 'global',
      priority: INK_KEYBOARD_PRIORITIES.root,
      isActive: true,
      handler: () => {
        fired = true;
      },
    });

    const result = router.dispatch('x', key({ eventType: 'release' }));

    expect(result.handled).toBe(false);
    expect(fired).toBe(false);
  });
});
