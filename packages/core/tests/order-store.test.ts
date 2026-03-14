import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { setRuntime, hasRuntime } from '../src/runtime';
import { bunRuntime } from '../../runtime-bun/src';
import { closeDatabase, resetDatabaseSingleton, getDatabase } from '../src/database';
import { OrderStore } from '../src/orders/store';

if (!hasRuntime()) setRuntime(bunRuntime);

let tempDir: string;
let store: OrderStore;
let origDir: string | undefined;

beforeEach(() => {
  origDir = process.env.ASSISTANTS_DIR;
  tempDir = mkdtempSync(join(tmpdir(), 'order-test-'));
  process.env.ASSISTANTS_DIR = tempDir;
  closeDatabase();
  resetDatabaseSingleton();
  store = new OrderStore(getDatabase());
});

afterEach(() => {
  closeDatabase();
  resetDatabaseSingleton();
  if (origDir === undefined) delete process.env.ASSISTANTS_DIR;
  else process.env.ASSISTANTS_DIR = origDir;
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── Store CRUD ───────────────────────────────────────────────────────────────

describe('Store CRUD', () => {
  test('createStore succeeds and returns storeId', () => {
    const r = store.createStore('Amazon');
    expect(r.success).toBe(true);
    expect(r.storeId).toMatch(/^str_/);
  });

  test('createStore fails on duplicate name', () => {
    store.createStore('eBay');
    const r = store.createStore('eBay');
    expect(r.success).toBe(false);
  });

  test('getStore returns created store', () => {
    const r = store.createStore('Shopify');
    const s = store.getStore(r.storeId!);
    expect(s?.name).toBe('Shopify');
  });

  test('getStore returns null for unknown', () => {
    expect(store.getStore('no-such')).toBeNull();
  });

  test('getStoreByName finds by name (case-insensitive)', () => {
    store.createStore('Walmart');
    expect(store.getStoreByName('walmart')).not.toBeNull();
    expect(store.getStoreByName('WALMART')).not.toBeNull();
  });

  test('resolveStore finds by ID or name', () => {
    const r = store.createStore('Target');
    expect(store.resolveStore(r.storeId!)?.name).toBe('Target');
    expect(store.resolveStore('Target')?.name).toBe('Target');
  });

  test('listStores returns all stores', () => {
    store.createStore('Store A');
    store.createStore('Store B');
    expect(store.listStores().length).toBeGreaterThanOrEqual(2);
  });

  test('createStore persists options', () => {
    const r = store.createStore('MyStore', {
      url: 'https://mystore.com',
      category: 'electronics',
      notes: 'Primary vendor',
    });
    const s = store.getStore(r.storeId!);
    expect(s?.url).toBe('https://mystore.com');
    expect(s?.category).toBe('electronics');
    expect(s?.notes).toBe('Primary vendor');
  });
});

// ─── Order CRUD ───────────────────────────────────────────────────────────────

describe('Order CRUD', () => {
  let storeId: string;

  beforeEach(() => {
    const r = store.createStore('TestVendor');
    storeId = r.storeId!;
  });

  test('createOrder succeeds and returns orderId', () => {
    const r = store.createOrder(storeId, 'TestVendor');
    expect(r.success).toBe(true);
    expect(r.orderId).toMatch(/^ord_/);
  });

  test('getOrder returns created order', () => {
    const r = store.createOrder(storeId, 'TestVendor', { orderNumber: 'ORD-001' });
    const o = store.getOrder(r.orderId!);
    expect(o?.orderNumber).toBe('ORD-001');
    expect(o?.status).toBe('pending');
  });

  test('getOrder returns null for unknown', () => {
    expect(store.getOrder('ghost')).toBeNull();
  });

  test('listOrders returns all orders', () => {
    store.createOrder(storeId, 'TestVendor');
    store.createOrder(storeId, 'TestVendor');
    const orders = store.listOrders();
    expect(orders.length).toBeGreaterThanOrEqual(2);
  });

  test('listOrders filters by status', () => {
    store.createOrder(storeId, 'TestVendor');
    const pending = store.listOrders({ status: 'pending' });
    expect(pending.every(o => o.status === 'pending')).toBe(true);
  });

  test('listOrders filters by storeId', () => {
    const r2 = store.createStore('AnotherVendor');
    store.createOrder(storeId, 'TestVendor');
    store.createOrder(r2.storeId!, 'AnotherVendor');
    const forStore = store.listOrders({ storeId });
    expect(forStore.every(o => o.storeName === 'TestVendor')).toBe(true);
  });

  test('updateOrder changes status', () => {
    const r = store.createOrder(storeId, 'TestVendor');
    store.updateOrder(r.orderId!, { status: 'confirmed' });
    expect(store.getOrder(r.orderId!)?.status).toBe('confirmed');
  });

  test('cancelOrder marks as cancelled', () => {
    const r = store.createOrder(storeId, 'TestVendor');
    expect(store.cancelOrder(r.orderId!)).toBe(true);
    expect(store.getOrder(r.orderId!)?.status).toBe('cancelled');
  });

  test('cancelOrder returns false for unknown', () => {
    expect(store.cancelOrder('ghost')).toBe(false);
  });
});

// ─── Order items ──────────────────────────────────────────────────────────────

describe('Order items', () => {
  let storeId: string;
  let orderId: string;

  beforeEach(() => {
    storeId = store.createStore('ItemStore').storeId!;
    orderId = store.createOrder(storeId, 'ItemStore').orderId!;
  });

  test('addItem returns itemId', () => {
    const r = store.addItem(orderId, 'Widget', { quantity: 2, unitPrice: 9.99 });
    expect(r.success).toBe(true);
    expect(r.itemId).toMatch(/^itm_/);
  });

  test('getItems returns added items', () => {
    store.addItem(orderId, 'Widget', { quantity: 1 });
    store.addItem(orderId, 'Gadget', { quantity: 3 });
    const items = store.getItems(orderId);
    expect(items).toHaveLength(2);
    expect(items.some(i => i.name === 'Widget')).toBe(true);
  });

  test('getItems returns empty for new order', () => {
    expect(store.getItems(orderId)).toHaveLength(0);
  });
});
