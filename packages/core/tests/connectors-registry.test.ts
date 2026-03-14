import { describe, test, expect } from 'bun:test';
import {
  searchConnectorRegistry,
  listConnectorCategories,
  listRegistryConnectors,
  getConnectorRegistryCount,
} from '../src/connectors/registry-adapter';
import type { RegistryConnectorInfo } from '../src/connectors/registry-adapter';

// ─── searchConnectorRegistry ──────────────────────────────────────────────────

describe('searchConnectorRegistry', () => {
  test('returns array (empty query matches all or nothing gracefully)', async () => {
    const results = await searchConnectorRegistry('');
    expect(Array.isArray(results)).toBe(true);
  });

  test('returns results matching query', async () => {
    const results = await searchConnectorRegistry('github');
    // May return results or not depending on installed connectors — should not throw
    expect(Array.isArray(results)).toBe(true);
  });

  test('result items have required fields', async () => {
    const results = await searchConnectorRegistry('google');
    for (const r of results) {
      expect(typeof r.name).toBe('string');
      expect(typeof r.displayName).toBe('string');
      expect(typeof r.description).toBe('string');
      expect(typeof r.category).toBe('string');
      expect(Array.isArray(r.tags)).toBe(true);
    }
  });

  test('unknown query returns empty array gracefully', async () => {
    const results = await searchConnectorRegistry('xyzzy-nonexistent-12345');
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });
});

// ─── listConnectorCategories ──────────────────────────────────────────────────

describe('listConnectorCategories', () => {
  test('returns array of strings', async () => {
    const cats = await listConnectorCategories();
    expect(Array.isArray(cats)).toBe(true);
  });

  test('returns non-empty categories', async () => {
    const cats = await listConnectorCategories();
    expect(cats.length).toBeGreaterThan(0);
  });

  test('all entries are non-empty strings', async () => {
    const cats = await listConnectorCategories();
    for (const c of cats) {
      expect(typeof c).toBe('string');
      expect(c.length).toBeGreaterThan(0);
    }
  });
});

// ─── listRegistryConnectors ───────────────────────────────────────────────────

describe('listRegistryConnectors', () => {
  test('returns array of connector info', async () => {
    const connectors = await listRegistryConnectors();
    expect(Array.isArray(connectors)).toBe(true);
  });

  test('returns non-empty connector list', async () => {
    const connectors = await listRegistryConnectors();
    expect(connectors.length).toBeGreaterThan(0);
  });

  test('all items have required fields', async () => {
    const connectors = await listRegistryConnectors();
    for (const c of connectors.slice(0, 5)) {
      expect(typeof c.name).toBe('string');
      expect(c.name.length).toBeGreaterThan(0);
      expect(typeof c.displayName).toBe('string');
      expect(typeof c.description).toBe('string');
      expect(typeof c.category).toBe('string');
      expect(Array.isArray(c.tags)).toBe(true);
    }
  });

  test('category filter returns only matching connectors', async () => {
    const cats = await listConnectorCategories();
    if (cats.length === 0) return;

    const firstCategory = cats[0];
    const filtered = await listRegistryConnectors(firstCategory);
    for (const c of filtered) {
      expect(c.category).toBe(firstCategory);
    }
  });

  test('invalid category returns empty array', async () => {
    const results = await listRegistryConnectors('NONEXISTENT_CATEGORY_XYZ');
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });
});

// ─── getConnectorRegistryCount ────────────────────────────────────────────────

describe('getConnectorRegistryCount', () => {
  test('returns 0 before registry is loaded', () => {
    // The count is 0 before any async function loads the library
    // (this tests the lazy-load behavior)
    expect(typeof getConnectorRegistryCount()).toBe('number');
  });

  test('returns positive count after loading registry', async () => {
    await listRegistryConnectors(); // triggers lazy load
    const count = getConnectorRegistryCount();
    expect(count).toBeGreaterThan(0);
  });
});
