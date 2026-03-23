import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  OrdersManager,
  OrderListItem,
  StoreListItem,
  Store,
  Order,
  OrderItem,
  OrderStatus,
} from '@hasna/assistants-core';
import { useSafeInput as useInput } from '../hooks/useSafeInput';

interface OrdersPanelProps {
  manager: OrdersManager;
  onClose: () => void;
}

type ViewMode = 'list' | 'order-detail' | 'store-detail' | 'order-create' | 'store-add';
type MainTab = 'orders' | 'stores' | 'overview';
type StatusFilter = 'all' | OrderStatus;

const MAIN_TABS: MainTab[] = ['orders', 'stores', 'overview'];
const STATUS_FILTERS: StatusFilter[] = [
  'all',
  'pending',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'returned',
];
const MAX_VISIBLE_ROWS = 12;

function formatRelativeTime(isoDate: string | null | undefined): string {
  if (!isoDate) return 'never';
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const abs = Math.abs(diffMs);
  const mins = Math.floor(abs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'now';
}

function formatCurrency(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null) return '-';
  return `${currency || 'USD'} ${amount.toFixed(2)}`;
}

function fit(value: string, width: number, align: 'left' | 'right' = 'left'): string {
  const raw = value || '';
  if (raw.length > width) {
    return width > 3 ? `${raw.slice(0, width - 3)}...` : raw.slice(0, width);
  }
  return align === 'right' ? raw.padStart(width, ' ') : raw.padEnd(width, ' ');
}

function statusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'pending': return 'yellow';
    case 'processing': return 'cyan';
    case 'shipped': return 'blue';
    case 'delivered': return 'green';
    case 'cancelled': return 'red';
    case 'returned': return 'magenta';
    default: return 'gray';
  }
}

function visibleWindow(selectedIndex: number, total: number): { start: number; end: number; above: number; below: number } {
  if (total <= MAX_VISIBLE_ROWS) {
    return { start: 0, end: total, above: 0, below: 0 };
  }

  const half = Math.floor(MAX_VISIBLE_ROWS / 2);
  let start = selectedIndex - half;
  let end = start + MAX_VISIBLE_ROWS;

  if (start < 0) {
    start = 0;
    end = MAX_VISIBLE_ROWS;
  }
  if (end > total) {
    end = total;
    start = Math.max(0, end - MAX_VISIBLE_ROWS);
  }

  return {
    start,
    end,
    above: start,
    below: total - end,
  };
}

export function OrdersPanel({ manager, onClose }: OrdersPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [tab, setTab] = useState<MainTab>('orders');
  const [statusFilterIndex, setStatusFilterIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [stores, setStores] = useState<StoreListItem[]>([]);

  const [detailOrder, setDetailOrder] = useState<{ order: Order; items: OrderItem[] } | null>(null);
  const [detailStore, setDetailStore] = useState<{ store: Store; orders: OrderListItem[] } | null>(null);

  const [createOrderStore, setCreateOrderStore] = useState('');
  const [createOrderDescription, setCreateOrderDescription] = useState('');
  const [createOrderStep, setCreateOrderStep] = useState<'store' | 'description'>('store');

  const [newStoreName, setNewStoreName] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadData = useCallback(() => {
    try {
      setOrders(manager.listOrders({ limit: 200 }));
      setStores(manager.listStores());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [manager]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 2400);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  const activeStatusFilter = STATUS_FILTERS[statusFilterIndex] || 'all';

  const filteredOrders = useMemo(() => {
    if (activeStatusFilter === 'all') return orders;
    return orders.filter((order) => order.status === activeStatusFilter);
  }, [orders, activeStatusFilter]);

  const listCount = useMemo(() => {
    if (tab === 'orders') return filteredOrders.length;
    if (tab === 'stores') return stores.length;
    return 0;
  }, [tab, filteredOrders.length, stores.length]);

  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, listCount - 1)));
  }, [listCount]);

  const switchTab = useCallback((next: MainTab) => {
    setTab(next);
    setSelectedIndex(0);
    setViewMode('list');
  }, []);

  const openSelectedOrder = useCallback(() => {
    const order = filteredOrders[selectedIndex];
    if (!order) return;
    const detail = manager.getOrder(order.id);
    if (!detail) {
      setStatusMessage('Order not found.');
      return;
    }
    setDetailOrder(detail);
    setViewMode('order-detail');
  }, [filteredOrders, manager, selectedIndex]);

  const openSelectedStore = useCallback(() => {
    const store = stores[selectedIndex];
    if (!store) return;
    const detail = manager.getStoreDetails(store.id);
    if (!detail) {
      setStatusMessage('Store not found.');
      return;
    }
    setDetailStore(detail);
    setViewMode('store-detail');
  }, [manager, selectedIndex, stores]);

  const cancelSelectedOrder = useCallback(() => {
    const order = filteredOrders[selectedIndex];
    if (!order) return;
    const result = manager.cancelOrder(order.id);
    setStatusMessage(result.success ? result.message : `Error: ${result.message}`);
    loadData();
  }, [filteredOrders, selectedIndex, manager, loadData]);

  useInput((input, key) => {
    if (viewMode === 'order-create') {
      if (key.escape) {
        setViewMode('list');
      }
      return;
    }

    if (viewMode === 'store-add') {
      if (key.escape) {
        setViewMode('list');
      }
      return;
    }

    if (viewMode === 'order-detail') {
      if (key.escape || key.backspace) {
        setViewMode('list');
        setDetailOrder(null);
        return;
      }
      if (input === 'q') {
        onClose();
        return;
      }
      if (input === 'c') {
        const id = detailOrder?.order.id;
        if (!id) return;
        const result = manager.cancelOrder(id);
        setStatusMessage(result.success ? result.message : `Error: ${result.message}`);
        const refreshed = manager.getOrder(id);
        if (refreshed) {
          setDetailOrder(refreshed);
        }
        loadData();
      }
      return;
    }

    if (viewMode === 'store-detail') {
      if (key.escape || key.backspace) {
        setViewMode('list');
        setDetailStore(null);
        return;
      }
      if (input === 'q') {
        onClose();
      }
      return;
    }

    if (input === 'q' || key.escape) {
      onClose();
      return;
    }

    if (input === '1') {
      switchTab('orders');
      return;
    }
    if (input === '2') {
      switchTab('stores');
      return;
    }
    if (input === '3') {
      switchTab('overview');
      return;
    }

    if (key.leftArrow) {
      const index = MAIN_TABS.indexOf(tab);
      const next = index > 0 ? MAIN_TABS[index - 1] : MAIN_TABS[MAIN_TABS.length - 1];
      switchTab(next);
      return;
    }

    if (key.rightArrow) {
      const index = MAIN_TABS.indexOf(tab);
      const next = index < MAIN_TABS.length - 1 ? MAIN_TABS[index + 1] : MAIN_TABS[0];
      switchTab(next);
      return;
    }

    if (tab === 'orders' && (input === '[' || input === ']')) {
      setStatusFilterIndex((prev) => {
        if (input === '[') {
          return prev === 0 ? STATUS_FILTERS.length - 1 : prev - 1;
        }
        return prev === STATUS_FILTERS.length - 1 ? 0 : prev + 1;
      });
      setSelectedIndex(0);
      return;
    }

    if (input === 'k' || key.upArrow) {
      if (listCount === 0) return;
      setSelectedIndex((prev) => (prev === 0 ? listCount - 1 : prev - 1));
      return;
    }

    if (input === 'j' || key.downArrow) {
      if (listCount === 0) return;
      setSelectedIndex((prev) => (prev >= listCount - 1 ? 0 : prev + 1));
      return;
    }

    if (key.return) {
      if (tab === 'orders') {
        openSelectedOrder();
      } else if (tab === 'stores') {
        openSelectedStore();
      }
      return;
    }

    if (input === 'r') {
      loadData();
      setStatusMessage('Refreshed.');
      return;
    }

    if (input === 'n' && (tab === 'orders' || tab === 'overview')) {
      setCreateOrderStore('');
      setCreateOrderDescription('');
      setCreateOrderStep('store');
      setViewMode('order-create');
      return;
    }

    if (input === 'a' && tab === 'stores') {
      setNewStoreName('');
      setViewMode('store-add');
      return;
    }

    if (input === 'c' && tab === 'orders') {
      cancelSelectedOrder();
    }
  });

  const tabBar = (
    <box marginBottom={1}>
      {MAIN_TABS.map((entry, index) => (
        <box key={entry} marginRight={1}>
          <text attributes={tab === entry ? 32 : undefined}>
            {`${index + 1}:${entry}`}
          </text>
        </box>
      ))}
    </box>
  );

  const controls = useMemo(() => {
    if (viewMode === 'order-create' || viewMode === 'store-add') {
      return 'Esc cancel';
    }
    if (viewMode === 'order-detail') {
      return 'Backspace/Esc back | c cancel-order | q close';
    }
    if (viewMode === 'store-detail') {
      return 'Backspace/Esc back | q close';
    }
    if (tab === 'orders') {
      return 'q close | 1/2/3 tabs | [ ] filter | up/down | Enter view | n new | c cancel | r refresh';
    }
    if (tab === 'stores') {
      return 'q close | 1/2/3 tabs | up/down | Enter view | a add-store | r refresh';
    }
    return 'q close | 1/2/3 tabs | n new-order | r refresh';
  }, [tab, viewMode]);

  const header = (
    <box borderStyle="rounded" borderColor="#d4d4d8" borderLeft={false} borderRight={false} paddingX={1} marginBottom={1}>
      <text fg="blue"><b>Orders</b></text>
      <text fg="gray"> | {controls}</text>
    </box>
  );

  if (viewMode === 'order-create') {
    return (
      <box flexDirection="column">
        {header}
        <box flexDirection="column" paddingX={1}>
          <text><b>Create Order</b></text>
          <text fg="gray">Store can be existing or new. New stores are auto-registered.</text>
          <text> </text>
          {createOrderStep === 'store' ? (
            <box>
              <text>Store: </text>
              <input
                value={createOrderStore}
                onChange={setCreateOrderStore}
                onSubmit={() => {
                  if (!createOrderStore.trim()) {
                    setStatusMessage('Store is required.');
                    return;
                  }
                  setCreateOrderStep('description');
                }}
                placeholder="Store name"
                focus
              />
            </box>
          ) : (
            <box flexDirection="column">
              <text>Store: {createOrderStore}</text>
              <box>
                <text>Description: </text>
                <input
                  value={createOrderDescription}
                  onChange={setCreateOrderDescription}
                  onSubmit={() => {
                    const result = manager.createOrder(
                      createOrderStore.trim(),
                      createOrderDescription.trim()
                        ? { description: createOrderDescription.trim() }
                        : undefined
                    );
                    setStatusMessage(result.success ? result.message : `Error: ${result.message}`);
                    loadData();
                    setViewMode('list');
                    switchTab('orders');
                  }}
                  placeholder="Optional description"
                  focus
                />
              </box>
              <text fg="gray">Submit empty description to create without one.</text>
            </box>
          )}
        </box>
      </box>
    );
  }

  if (viewMode === 'store-add') {
    return (
      <box flexDirection="column">
        {header}
        <box flexDirection="column" paddingX={1}>
          <text><b>Add Store</b></text>
          <text> </text>
          <box>
            <text>Name: </text>
            <input
              value={newStoreName}
              onChange={setNewStoreName}
              onSubmit={() => {
                if (!newStoreName.trim()) {
                  setStatusMessage('Store name is required.');
                  return;
                }
                const result = manager.addStore(newStoreName.trim());
                setStatusMessage(result.success ? result.message : `Error: ${result.message}`);
                loadData();
                setViewMode('list');
                switchTab('stores');
              }}
              placeholder="Store name"
              focus
            />
          </box>
        </box>
      </box>
    );
  }

  if (viewMode === 'order-detail' && detailOrder) {
    const { order, items } = detailOrder;
    const tracking = manager.getTracking(order.id);

    return (
      <box flexDirection="column">
        {header}
        {statusMessage ? <box marginBottom={1}><text fg="yellow">{statusMessage}</text></box> : null}
        {error ? <box marginBottom={1}><text fg="red">Error: {error}</text></box> : null}

        <box flexDirection="column" paddingX={1}>
          <text><b>Order Detail</b></text>
          <text>ID: {order.id}</text>
          <text>Store: {order.storeName}</text>
          <box>
            <text>Status: </text>
            <text fg={statusColor(order.status)}>{order.status}</text>
          </box>
          {order.orderNumber ? <text>Order #: {order.orderNumber}</text> : null}
          {order.description ? <text>Description: {order.description}</text> : null}
          <text>Total: {formatCurrency(order.totalAmount, order.currency)}</text>
          {order.shippingAddress ? <text>Shipping: {order.shippingAddress}</text> : null}
          {order.paymentMethod ? <text>Payment: {order.paymentMethod}</text> : null}
          {order.notes ? <text>Notes: {order.notes}</text> : null}
          <text>Created: {formatRelativeTime(order.createdAt)}</text>
          <text>Updated: {formatRelativeTime(order.updatedAt)}</text>

          {tracking?.trackingNumber ? (
            <box flexDirection="column" marginTop={1}>
              <text><b>Tracking</b></text>
              <text>Number: {tracking.trackingNumber}</text>
              {tracking.trackingUrl ? <text>URL: {tracking.trackingUrl}</text> : null}
            </box>
          ) : null}

          <box flexDirection="column" marginTop={1}>
            <text><b>{`Items (${items.length})`}</b></text>
            {items.length === 0 ? (
              <text fg="gray">No items.</text>
            ) : (
              <box flexDirection="column" borderStyle="rounded" borderColor="#d4d4d8" borderLeft={false} borderRight={false} paddingX={1}>
                <text><b>{`${fit('NAME', 24)} ${fit('QTY', 4, 'right')} ${fit('UNIT', 12, 'right')} ${fit('TOTAL', 12, 'right')} ${fit('STATUS', 10)}`}</b></text>
                {items.map((item) => {
                  const row = `${fit(item.name, 24)} ${fit(String(item.quantity), 4, 'right')} ${fit(formatCurrency(item.unitPrice, order.currency), 12, 'right')} ${fit(formatCurrency(item.totalPrice, order.currency), 12, 'right')} ${fit(item.status, 10)}`;
                  return (
                    <text key={item.id}>{row}</text>
                  );
                })}
              </box>
            )}
          </box>
        </box>
      </box>
    );
  }

  if (viewMode === 'store-detail' && detailStore) {
    const recent = detailStore.orders;

    return (
      <box flexDirection="column">
        {header}
        {statusMessage ? <box marginBottom={1}><text fg="yellow">{statusMessage}</text></box> : null}
        {error ? <box marginBottom={1}><text fg="red">Error: {error}</text></box> : null}

        <box flexDirection="column" paddingX={1}>
          <text><b>Store Detail</b></text>
          <text>ID: {detailStore.store.id}</text>
          <text>Name: {detailStore.store.name}</text>
          <text>Category: {detailStore.store.category}</text>
          {detailStore.store.url ? <text>URL: {detailStore.store.url}</text> : null}
          <text>Updated: {formatRelativeTime(detailStore.store.updatedAt)}</text>

          <box flexDirection="column" marginTop={1}>
            <text><b>{`Recent Orders (${recent.length})`}</b></text>
            {recent.length === 0 ? (
              <text fg="gray">No orders for this store yet.</text>
            ) : (
              <box flexDirection="column" borderStyle="rounded" borderColor="#d4d4d8" borderLeft={false} borderRight={false} paddingX={1}>
                <text><b>{`${fit('ID', 14)} ${fit('STATUS', 10)} ${fit('TOTAL', 12)} ${fit('UPDATED', 10)}`}</b></text>
                {recent.slice(0, 20).map((order) => {
                  const row = `${fit(order.id, 14)} ${fit(order.status, 10)} ${fit(formatCurrency(order.totalAmount, order.currency), 12)} ${fit(formatRelativeTime(order.updatedAt), 10)}`;
                  return <text key={order.id}>{row}</text>;
                })}
              </box>
            )}
          </box>
        </box>
      </box>
    );
  }

  const tableWindow = visibleWindow(selectedIndex, listCount);
  const visibleOrders = filteredOrders.slice(tableWindow.start, tableWindow.end);
  const visibleStores = stores.slice(tableWindow.start, tableWindow.end);

  const overviewCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const order of orders) {
      counts[order.status] = (counts[order.status] || 0) + 1;
    }
    return counts;
  }, [orders]);

  return (
    <box flexDirection="column">
      {header}
      {tabBar}

      {tab === 'orders' ? (
        <box marginBottom={1}>
          <text fg="gray">Status filter: </text>
          {STATUS_FILTERS.map((status, idx) => (
            <text key={status} attributes={idx === statusFilterIndex ? 32 : undefined}>{` ${status} `}</text>
          ))}
        </box>
      ) : null}

      {statusMessage ? <box marginBottom={1}><text fg="yellow">{statusMessage}</text></box> : null}
      {error ? <box marginBottom={1}><text fg="red">Error: {error}</text></box> : null}

      {tab === 'orders' ? (
        <box flexDirection="column" borderStyle="rounded" borderColor="#d4d4d8" borderLeft={false} borderRight={false} paddingX={1}>
          {filteredOrders.length === 0 ? (
            <text fg="gray">No orders for this filter. Press n to create an order.</text>
          ) : (
            <>
              <text><b>{`${fit('ID', 14)} ${fit('STORE', 18)} ${fit('STATUS', 10)} ${fit('TOTAL', 12)} ${fit('ITEMS', 5, 'right')} ${fit('UPDATED', 10)}`}</b></text>

              {tableWindow.above > 0 ? (
                <text fg="gray">{`... ${tableWindow.above} more above`}</text>
              ) : null}

              {visibleOrders.map((order, idx) => {
                const actualIndex = tableWindow.start + idx;
                const isSelected = actualIndex === selectedIndex;
                const marker = isSelected ? '> ' : '  ';
                const row = `${marker}${fit(order.id, 14)} ${fit(order.storeName, 18)} ${fit(order.status, 10)} ${fit(formatCurrency(order.totalAmount, order.currency), 12)} ${fit(String(order.itemCount), 5, 'right')} ${fit(formatRelativeTime(order.updatedAt), 10)}`;
                return (
                  <text key={order.id} attributes={isSelected ? 32 : undefined}>{row}</text>
                );
              })}

              {tableWindow.below > 0 ? (
                <text fg="gray">{`... ${tableWindow.below} more below`}</text>
              ) : null}
            </>
          )}
        </box>
      ) : null}

      {tab === 'stores' ? (
        <box flexDirection="column" borderStyle="rounded" borderColor="#d4d4d8" borderLeft={false} borderRight={false} paddingX={1}>
          {stores.length === 0 ? (
            <text fg="gray">No stores yet. Press a to add one.</text>
          ) : (
            <>
              <text><b>{`${fit('ID', 14)} ${fit('NAME', 22)} ${fit('CATEGORY', 12)} ${fit('ORD', 4, 'right')} ${fit('LAST', 10)}`}</b></text>

              {tableWindow.above > 0 ? (
                <text fg="gray">{`... ${tableWindow.above} more above`}</text>
              ) : null}

              {visibleStores.map((store, idx) => {
                const actualIndex = tableWindow.start + idx;
                const isSelected = actualIndex === selectedIndex;
                const marker = isSelected ? '> ' : '  ';
                const row = `${marker}${fit(store.id, 14)} ${fit(store.name, 22)} ${fit(store.category, 12)} ${fit(String(store.orderCount), 4, 'right')} ${fit(formatRelativeTime(store.lastOrderAt), 10)}`;
                return (
                  <text key={store.id} attributes={isSelected ? 32 : undefined}>{row}</text>
                );
              })}

              {tableWindow.below > 0 ? (
                <text fg="gray">{`... ${tableWindow.below} more below`}</text>
              ) : null}
            </>
          )}
        </box>
      ) : null}

      {tab === 'overview' ? (
        <box flexDirection="column" borderStyle="rounded" borderColor="#d4d4d8" borderLeft={false} borderRight={false} paddingX={1}>
          <text><b>Summary</b></text>
          <text>{`Orders: ${orders.length}`}</text>
          <text>{`Stores: ${stores.length}`}</text>
          <text> </text>
          <text><b>Status counts</b></text>
          {Object.keys(overviewCounts).length === 0 ? (
            <text fg="gray">No orders yet.</text>
          ) : (
            STATUS_FILTERS.filter((status) => status !== 'all').map((status) => (
              <box key={status}>
                <text fg={statusColor(status)}>{fit(status, 10)}</text>
                <text>{overviewCounts[status] || 0}</text>
              </box>
            ))
          )}

          <text> </text>
          <text><b>Recent orders</b></text>
          {orders.length === 0 ? (
            <text fg="gray">No recent orders.</text>
          ) : (
            <>
              <text><b>{`${fit('STORE', 18)} ${fit('STATUS', 10)} ${fit('TOTAL', 12)} ${fit('UPDATED', 10)}`}</b></text>
              {orders.slice(0, 6).map((order) => {
                const row = `${fit(order.storeName, 18)} ${fit(order.status, 10)} ${fit(formatCurrency(order.totalAmount, order.currency), 12)} ${fit(formatRelativeTime(order.updatedAt), 10)}`;
                return <text key={order.id}>{row}</text>;
              })}
            </>
          )}
        </box>
      ) : null}
    </box>
  );
}
