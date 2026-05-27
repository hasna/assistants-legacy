/**
 * Tests for the configurable keybinding engine (plan 8d98da29 P3.1).
 * Covers parsing, matching against the app's (input, key) model, chord
 * sequences, config merge/disable, and display formatting.
 */
import { describe, expect, test } from 'bun:test';
import {
  parseKeystroke,
  parseChord,
  matchesKeystroke,
  KeybindingMatcher,
  resolveAction,
  defaultKeymap,
  mergeKeymap,
  loadUserKeymap,
  formatBinding,
  primaryBindingLabel,
  generateHelp,
  type Key,
} from '../src/keybindings';

/** Build a Key event with sensible defaults. */
function mkKey(over: Partial<Key> = {}): Key {
  return {
    upArrow: false, downArrow: false, leftArrow: false, rightArrow: false,
    pageDown: false, pageUp: false, home: false, end: false,
    return: false, escape: false, ctrl: false, shift: false,
    tab: false, backspace: false, delete: false, meta: false,
    ...over,
  };
}

describe('parser', () => {
  test('parses modifiers and key with aliases', () => {
    expect(parseKeystroke('ctrl+shift+k')).toEqual({ key: 'k', ctrl: true, alt: false, shift: true, meta: false });
    expect(parseKeystroke('esc').key).toBe('escape');
    expect(parseKeystroke('return').key).toBe('enter');
    expect(parseKeystroke('space').key).toBe(' ');
    expect(parseKeystroke('cmd+s')).toMatchObject({ key: 's', meta: true });
    expect(parseKeystroke('opt+a')).toMatchObject({ key: 'a', alt: true });
  });
  test('parses a multi-key chord', () => {
    const chord = parseChord('ctrl+k ctrl+s');
    expect(chord).toHaveLength(2);
    expect(chord[0]).toMatchObject({ key: 'k', ctrl: true });
    expect(chord[1]).toMatchObject({ key: 's', ctrl: true });
  });
});

describe('matchesKeystroke', () => {
  test('matches ctrl+letter against the (input, key) model', () => {
    expect(matchesKeystroke(parseKeystroke('ctrl+r'), 'r', mkKey({ ctrl: true }))).toBe(true);
    expect(matchesKeystroke(parseKeystroke('ctrl+r'), 'r', mkKey({ ctrl: false }))).toBe(false);
  });
  test('matches named keys via their boolean field', () => {
    expect(matchesKeystroke(parseKeystroke('escape'), '', mkKey({ escape: true }))).toBe(true);
    expect(matchesKeystroke(parseKeystroke('up'), '', mkKey({ upArrow: true }))).toBe(true);
    expect(matchesKeystroke(parseKeystroke('enter'), '', mkKey({ return: true }))).toBe(true);
  });
  test('ctrl+] (punctuation) matches', () => {
    expect(matchesKeystroke(parseKeystroke('ctrl+]'), ']', mkKey({ ctrl: true }))).toBe(true);
  });
  test('rejects when an unrequested ctrl is held', () => {
    expect(matchesKeystroke(parseKeystroke('a'), 'a', mkKey({ ctrl: true }))).toBe(false);
  });
  test('space matches the space input', () => {
    expect(matchesKeystroke(parseKeystroke('space'), ' ', mkKey())).toBe(true);
  });
});

describe('resolveAction (single keystroke)', () => {
  const km = defaultKeymap();
  test('resolves default bindings to their actions', () => {
    expect(resolveAction(km, 'c', mkKey({ ctrl: true }))).toBe('app:interrupt');
    expect(resolveAction(km, '', mkKey({ escape: true }))).toBe('app:cancel');
    expect(resolveAction(km, 'r', mkKey({ ctrl: true }))).toBe('app:pushToTalk');
    expect(resolveAction(km, ']', mkKey({ ctrl: true }))).toBe('session:cycle');
  });
  test('returns null for an unbound key', () => {
    expect(resolveAction(km, 'z', mkKey({ ctrl: true }))).toBeNull();
  });

  // Pins the action-id contract the App.tsx global-input switch depends on
  // (plan P3.2). If a default binding's action id drifts, this fails.
  test('every default app action id resolves from a real keystroke', () => {
    const cases: Array<[string, string, Partial<Key>]> = [
      ['app:interrupt', 'c', { ctrl: true }],
      ['app:cancel', '', { escape: true }],
      ['app:clearScreen', 'l', { ctrl: true }],
      ['app:pushToTalk', 'r', { ctrl: true }],
      ['app:toggleVerbose', 'o', { ctrl: true }],
      ['session:cycle', ']', { ctrl: true }],
      ['panel:assistantsDashboard', 'a', { ctrl: true }],
      ['panel:budget', 'b', { ctrl: true }],
      ['panel:commands', 'p', { ctrl: true }],
      ['panel:messages', 'm', { ctrl: true }],
    ];
    for (const [action, input, key] of cases) {
      expect(resolveAction(km, input, mkKey(key))).toBe(action);
    }
  });
});

describe('KeybindingMatcher chords', () => {
  test('two-key chord requires both keystrokes in order', () => {
    const m = new KeybindingMatcher({ 'app:save': ['ctrl+k ctrl+s'] });
    const r1 = m.resolve('k', mkKey({ ctrl: true }));
    expect(r1.type).toBe('pending');
    expect(m.isPending).toBe(true);
    const r2 = m.resolve('s', mkKey({ ctrl: true }));
    expect(r2).toEqual({ type: 'match', action: 'app:save' });
    expect(m.isPending).toBe(false);
  });
  test('a wrong second key aborts the chord', () => {
    const m = new KeybindingMatcher({ 'app:save': ['ctrl+k ctrl+s'] });
    expect(m.resolve('k', mkKey({ ctrl: true })).type).toBe('pending');
    expect(m.resolve('x', mkKey({ ctrl: true })).type).toBe('none');
    expect(m.isPending).toBe(false);
  });
});

describe('config merge', () => {
  test('user override replaces the default for that action', () => {
    const km = mergeKeymap({ 'app:interrupt': 'ctrl+x' });
    expect(km['app:interrupt']).toEqual(['ctrl+x']);
    expect(km['app:cancel']).toEqual(['escape']); // untouched
  });
  test('"none" disables an action', () => {
    const km = mergeKeymap({ 'app:pushToTalk': 'none' });
    expect(resolveAction(km, 'r', mkKey({ ctrl: true }))).toBeNull();
  });
  test('accepts an array and keeps unknown (plugin) actions', () => {
    const km = mergeKeymap({ 'plugin:foo': ['ctrl+f', 'ctrl+g'] });
    expect(km['plugin:foo']).toEqual(['ctrl+f', 'ctrl+g']);
  });
  test('loadUserKeymap reads the keybindings field', () => {
    const km = loadUserKeymap({ keybindings: { 'app:interrupt': 'ctrl+x' } });
    expect(km['app:interrupt']).toEqual(['ctrl+x']);
  });
});

describe('formatting', () => {
  test('formatBinding renders a readable label', () => {
    expect(formatBinding('ctrl+r')).toBe('Ctrl+R');
    expect(formatBinding('ctrl+k ctrl+s')).toBe('Ctrl+K Ctrl+S');
    expect(formatBinding('escape')).toBe('Esc');
    expect(formatBinding('up')).toBe('↑');
  });
  test('primaryBindingLabel returns the first binding, empty when disabled', () => {
    const km = defaultKeymap();
    expect(primaryBindingLabel(km, 'app:interrupt')).toBe('Ctrl+C');
    expect(primaryBindingLabel(mergeKeymap({ 'app:interrupt': 'none' }), 'app:interrupt')).toBe('');
  });
  test('generateHelp lists every bound action sorted', () => {
    const help = generateHelp(defaultKeymap());
    expect(help.length).toBeGreaterThan(0);
    expect(help.every((r) => r.keys !== '')).toBe(true);
    const actions = help.map((r) => r.action);
    expect([...actions]).toEqual([...actions].sort());
  });
});
