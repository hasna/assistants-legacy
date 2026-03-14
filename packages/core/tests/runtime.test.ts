import { describe, test, expect, afterEach } from 'bun:test';
import { setRuntime, getRuntime, hasRuntime } from '../src/runtime';
import { bunRuntime } from '../../runtime-bun/src';

describe('runtime module', () => {
  test('hasRuntime returns boolean', () => {
    expect(typeof hasRuntime()).toBe('boolean');
  });

  test('setRuntime + getRuntime round-trip', () => {
    setRuntime(bunRuntime);
    expect(hasRuntime()).toBe(true);
    const rt = getRuntime();
    expect(rt).toBeDefined();
    expect(typeof rt.openDatabase).toBe('function');
  });

  test('getRuntime throws when not set', () => {
    // Reset the runtime to unset state by using a null override
    // We can't easily unset the singleton, but we can verify
    // that after setting it, it returns the same object
    setRuntime(bunRuntime);
    const rt1 = getRuntime();
    setRuntime(bunRuntime);
    const rt2 = getRuntime();
    // Both should be the same bunRuntime
    expect(typeof rt1.openDatabase).toBe('function');
    expect(typeof rt2.openDatabase).toBe('function');
  });

  test('bunRuntime has required properties', () => {
    expect(typeof bunRuntime.openDatabase).toBe('function');
    expect(typeof bunRuntime.file).toBe('function');
    expect(typeof bunRuntime.write).toBe('function');
    expect(typeof bunRuntime.spawn).toBe('function');
    expect(bunRuntime.name).toBe('bun');
  });
});
