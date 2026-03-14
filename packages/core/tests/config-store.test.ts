import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { setRuntime, hasRuntime } from '../src/runtime';
import { bunRuntime } from '../../runtime-bun/src';
import { closeDatabase, resetDatabaseSingleton } from '../src/database';

// Ensure Bun runtime is initialized
if (!hasRuntime()) setRuntime(bunRuntime);

let tempDir: string;
let origAssistantsDir: string | undefined;

beforeEach(() => {
  origAssistantsDir = process.env.ASSISTANTS_DIR;
  tempDir = mkdtempSync(join(tmpdir(), 'config-store-test-'));
  process.env.ASSISTANTS_DIR = tempDir;
  // Force fresh DB for each test
  closeDatabase();
  resetDatabaseSingleton();
});

afterEach(() => {
  closeDatabase();
  resetDatabaseSingleton();
  if (origAssistantsDir === undefined) delete process.env.ASSISTANTS_DIR;
  else process.env.ASSISTANTS_DIR = origAssistantsDir;
  rmSync(tempDir, { recursive: true, force: true });
});

// Re-import functions after env setup — dynamic import ensures fresh DB path
async function getStoreModule() {
  // Use dynamic import to get a fresh module binding
  const m = await import('../src/config-store');
  return m;
}

// ─── getConfigValue / setConfigValue ─────────────────────────────────────────

describe('getConfigValue / setConfigValue', () => {
  test('getConfigValue returns null for missing key', async () => {
    const { getConfigValue } = await getStoreModule();
    expect(getConfigValue('nonexistent')).toBeNull();
  });

  test('setConfigValue + getConfigValue round-trip', async () => {
    const { getConfigValue, setConfigValue } = await getStoreModule();
    setConfigValue('myKey', 'myValue');
    expect(getConfigValue('myKey')).toBe('myValue');
  });

  test('setConfigValue updates existing value', async () => {
    const { getConfigValue, setConfigValue } = await getStoreModule();
    setConfigValue('key1', 'first');
    setConfigValue('key1', 'updated');
    expect(getConfigValue('key1')).toBe('updated');
  });

  test('scope isolation — different scopes return different values', async () => {
    const { getConfigValue, setConfigValue } = await getStoreModule();
    setConfigValue('setting', 'global-val', 'global', '');
    setConfigValue('setting', 'project-val', 'project', 'my-project');

    expect(getConfigValue('setting', 'global', '')).toBe('global-val');
    expect(getConfigValue('setting', 'project', 'my-project')).toBe('project-val');
    expect(getConfigValue('setting', 'project', 'other-project')).toBeNull();
  });

  test('default scope is global', async () => {
    const { getConfigValue, setConfigValue } = await getStoreModule();
    setConfigValue('key', 'value'); // uses default scope
    expect(getConfigValue('key')).toBe('value'); // uses default scope
  });

  test('stores and retrieves arbitrary string values', async () => {
    const { getConfigValue, setConfigValue } = await getStoreModule();
    setConfigValue('json-val', JSON.stringify({ a: 1, b: [2, 3] }));
    const raw = getConfigValue('json-val');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual({ a: 1, b: [2, 3] });
  });
});

// ─── isOnboardingCompleted / markOnboardingCompleted ─────────────────────────

describe('isOnboardingCompleted / markOnboardingCompleted', () => {
  test('returns false initially', async () => {
    const { isOnboardingCompleted } = await getStoreModule();
    expect(isOnboardingCompleted()).toBe(false);
  });

  test('returns true after markOnboardingCompleted', async () => {
    const { isOnboardingCompleted, markOnboardingCompleted } = await getStoreModule();
    markOnboardingCompleted();
    expect(isOnboardingCompleted()).toBe(true);
  });

  test('is idempotent — marking twice stays true', async () => {
    const { isOnboardingCompleted, markOnboardingCompleted } = await getStoreModule();
    markOnboardingCompleted();
    markOnboardingCompleted();
    expect(isOnboardingCompleted()).toBe(true);
  });
});

// ─── isFirstGreetingShown / markFirstGreetingShown ────────────────────────────

describe('isFirstGreetingShown / markFirstGreetingShown', () => {
  test('returns false initially', async () => {
    const { isFirstGreetingShown } = await getStoreModule();
    expect(isFirstGreetingShown()).toBe(false);
  });

  test('returns true after markFirstGreetingShown', async () => {
    const { isFirstGreetingShown, markFirstGreetingShown } = await getStoreModule();
    markFirstGreetingShown();
    expect(isFirstGreetingShown()).toBe(true);
  });

  test('greeting and onboarding are independent flags', async () => {
    const { isOnboardingCompleted, isFirstGreetingShown, markFirstGreetingShown } = await getStoreModule();
    markFirstGreetingShown();
    expect(isFirstGreetingShown()).toBe(true);
    expect(isOnboardingCompleted()).toBe(false); // unaffected
  });
});
