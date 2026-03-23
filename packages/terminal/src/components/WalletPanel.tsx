import React, { useEffect, useMemo, useState } from 'react';
import { useSafeInput as useInput } from '../hooks/useSafeInput';

// Maximum visible items in lists before pagination kicks in
const MAX_VISIBLE_ITEMS = 5;

type ViewMode = 'list' | 'detail' | 'delete-confirm' | 'add-form';

export interface WalletAddInput {
  name: string;
  cardholderName: string;
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
}

interface CardEntry {
  id: string;
  name: string;
  last4: string;
  brand?: string;
  cardType?: string;
  cardholderName?: string;
  number?: string;
  expiry?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault?: boolean;
  createdAt?: string;
}

interface WalletPanelProps {
  cards: CardEntry[];
  initialMode?: 'list' | 'add';
  onGet: (cardId: string) => Promise<CardEntry & { number?: string }>;
  onAdd: (input: WalletAddInput) => Promise<void>;
  onRemove: (cardId: string) => Promise<void>;
  onClose: () => void;
  error?: string | null;
}

interface AddField {
  key: keyof WalletAddInput;
  label: string;
  placeholder: string;
  sensitive?: boolean;
}

const ADD_FIELDS: AddField[] = [
  { key: 'name', label: 'Card Name', placeholder: 'Business Visa' },
  { key: 'cardholderName', label: 'Cardholder Name', placeholder: 'Name on card' },
  { key: 'cardNumber', label: 'Card Number', placeholder: '4111 1111 1111 1111' },
  { key: 'expiryMonth', label: 'Expiry Month', placeholder: 'MM (01-12)' },
  { key: 'expiryYear', label: 'Expiry Year', placeholder: 'YYYY' },
  { key: 'cvv', label: 'CVV', placeholder: '3-4 digits', sensitive: true },
];

/**
 * Calculate the visible window range for paginated lists
 */
function getVisibleRange(
  selectedIndex: number,
  totalItems: number,
  maxVisible: number = MAX_VISIBLE_ITEMS
): { start: number; end: number; hasMore: { above: number; below: number } } {
  if (totalItems <= maxVisible) {
    return {
      start: 0,
      end: totalItems,
      hasMore: { above: 0, below: 0 },
    };
  }

  const halfWindow = Math.floor(maxVisible / 2);
  let start = selectedIndex - halfWindow;
  let end = selectedIndex + (maxVisible - halfWindow);

  if (start < 0) {
    start = 0;
    end = maxVisible;
  }

  if (end > totalItems) {
    end = totalItems;
    start = Math.max(0, totalItems - maxVisible);
  }

  return {
    start,
    end,
    hasMore: {
      above: start,
      below: totalItems - end,
    },
  };
}

/**
 * Format card expiry
 */
function formatExpiry(month?: number, year?: number, fallback?: string): string {
  if (fallback && fallback.trim()) return fallback;
  if (!month || !year) return 'N/A';
  return `${month.toString().padStart(2, '0')}/${year.toString().slice(-2)}`;
}

function formatCardType(type?: string): string {
  if (!type) return 'unknown';
  return type.toUpperCase();
}

function maskFieldValue(field: AddField, value: string): string {
  if (!value) return '';
  if (field.key === 'cardNumber') {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 4) return digits;
    return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
  }
  if (field.sensitive) {
    return '*'.repeat(Math.min(value.length, 6));
  }
  return value;
}

/**
 * Interactive panel for managing wallet cards
 */
export function WalletPanel({
  cards,
  initialMode = 'list',
  onGet,
  onAdd,
  onRemove,
  onClose,
  error,
}: WalletPanelProps) {
  const [mode, setMode] = useState<ViewMode>('list');
  const [cardIndex, setCardIndex] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<CardEntry | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detailCard, setDetailCard] = useState<CardEntry | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [addForm, setAddForm] = useState<WalletAddInput>({
    name: '',
    cardholderName: '',
    cardNumber: '',
    expiryMonth: '',
    expiryYear: '',
    cvv: '',
  });
  const [addFieldIndex, setAddFieldIndex] = useState(0);

  useEffect(() => {
    setCardIndex((prev) => Math.min(prev, Math.max(0, cards.length - 1)));
  }, [cards.length]);

  useEffect(() => {
    if (initialMode === 'add') {
      setMode('add-form');
      setAddFieldIndex(0);
    } else {
      setMode('list');
    }
    setStatusMessage(null);
  }, [initialMode]);

  // Calculate visible range for cards list
  const cardRange = useMemo(
    () => getVisibleRange(cardIndex, cards.length),
    [cardIndex, cards.length]
  );

  const currentCard = cards[cardIndex];
  const currentAddField = ADD_FIELDS[addFieldIndex];

  useEffect(() => {
    if (mode === 'detail' && !detailCard) {
      setMode('list');
    }
  }, [mode, detailCard]);

  useEffect(() => {
    if (mode === 'delete-confirm' && !deleteTarget) {
      setMode('list');
    }
  }, [mode, deleteTarget]);

  const resetAddForm = () => {
    setAddForm({
      name: '',
      cardholderName: '',
      cardNumber: '',
      expiryMonth: '',
      expiryYear: '',
      cvv: '',
    });
    setAddFieldIndex(0);
  };

  const openAddForm = () => {
    resetAddForm();
    setStatusMessage(null);
    setMode('add-form');
  };

  // Handle view details
  const handleViewDetails = async () => {
    if (!currentCard) return;

    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const details = await onGet(currentCard.id);
      setDetailCard(details);
      setMode('detail');
    } catch (err) {
      setStatusMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const normalizeAddInput = (form: WalletAddInput): WalletAddInput => {
    const expiryMonthNum = parseInt(form.expiryMonth.trim(), 10);
    const normalizedMonth = Number.isFinite(expiryMonthNum)
      ? String(expiryMonthNum).padStart(2, '0')
      : form.expiryMonth.trim();

    const rawYear = form.expiryYear.trim();
    const normalizedYear = /^\d{2}$/.test(rawYear) ? `20${rawYear}` : rawYear;

    return {
      name: form.name.trim(),
      cardholderName: form.cardholderName.trim(),
      cardNumber: form.cardNumber.trim(),
      expiryMonth: normalizedMonth,
      expiryYear: normalizedYear,
      cvv: form.cvv.trim(),
    };
  };

  const advanceAddForm = async () => {
    if (!currentAddField) return;
    const rawValue = addForm[currentAddField.key];
    if (!rawValue || !rawValue.trim()) {
      setStatusMessage(`${currentAddField.label} is required.`);
      return;
    }

    if (addFieldIndex < ADD_FIELDS.length - 1) {
      setAddFieldIndex((prev) => prev + 1);
      setStatusMessage(null);
      return;
    }

    setIsProcessing(true);
    setStatusMessage(null);
    try {
      await onAdd(normalizeAddInput(addForm));
      resetAddForm();
      setMode('list');
      setStatusMessage('Card added.');
    } catch (err) {
      setStatusMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!deleteTarget) return;

    setIsProcessing(true);
    try {
      await onRemove(deleteTarget.id);
      setMode('list');
      setDeleteTarget(null);
      setDetailCard(null);
      // Adjust index if needed (use anticipated length after deletion)
      const newLength = cards.length - 1;
      if (cardIndex >= newLength && cardIndex > 0) {
        setCardIndex(cardIndex - 1);
      }
      setStatusMessage('Card removed.');
    } catch (err) {
      setStatusMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Keyboard navigation
  useInput((input, key) => {
    if (isProcessing) return;

    if (mode === 'add-form') {
      if (key.escape) {
        if (addFieldIndex > 0) {
          setAddFieldIndex((prev) => prev - 1);
        } else {
          setMode('list');
        }
        setStatusMessage(null);
      }
      return;
    }

    // Exit with q or Escape at top level
    if (input === 'q' || (key.escape && mode === 'list')) {
      onClose();
      return;
    }

    // Escape to go back
    if (key.escape) {
      if (mode === 'detail') {
        setMode('list');
        setDetailCard(null);
      } else if (mode === 'delete-confirm') {
        setMode('detail');
        setDeleteTarget(null);
      }
      return;
    }

    // List mode navigation
    if (mode === 'list') {
      if (input === 'n') {
        openAddForm();
        return;
      }

      if (cards.length === 0) {
        return;
      }

      if (key.upArrow) {
        setCardIndex((prev) => (prev === 0 ? cards.length - 1 : prev - 1));
        return;
      }
      if (key.downArrow) {
        setCardIndex((prev) => (prev === cards.length - 1 ? 0 : prev + 1));
        return;
      }
      if (key.return && currentCard) {
        void handleViewDetails();
        return;
      }
      // Number keys for quick selection
      const num = parseInt(input, 10);
      if (!Number.isNaN(num) && num >= 1 && num <= cards.length) {
        setCardIndex(num - 1);
      }
      return;
    }

    // Detail mode
    if (mode === 'detail') {
      if (input === 'x' || key.delete) {
        if (detailCard) {
          setDeleteTarget(detailCard);
          setMode('delete-confirm');
        }
        return;
      }
      if (input === 'n') {
        openAddForm();
      }
      return;
    }

    // Delete confirm mode
    if (mode === 'delete-confirm') {
      if (input === 'y') {
        void handleDelete();
        return;
      }
      if (input === 'n') {
        setMode('detail');
        setDeleteTarget(null);
      }
    }
  }, { isActive: true });

  // Delete confirmation
  if (mode === 'delete-confirm' && deleteTarget) {
    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg="red"><b>Remove Card</b></text>
        </box>
        <box
          flexDirection="column"
          borderStyle="rounded"
          borderColor="#d4d4d8" borderLeft={false} borderRight={false}
          paddingX={1}
          paddingY={1}
        >
          <text>Are you sure you want to remove "{deleteTarget.name}"?</text>
          <text fg="gray">Card ending in {deleteTarget.last4}</text>
          <text fg="gray">This action cannot be undone.</text>
        </box>
        <box marginTop={1}>
          <text fg="gray">y confirm | n cancel</text>
        </box>
      </box>
    );
  }

  // Detail view
  if (mode === 'detail' && detailCard) {
    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg="cyan"><b>{detailCard.name}</b></text>
          {detailCard.isDefault && <text fg="yellow"> (default)</text>}
        </box>

        <box
          flexDirection="column"
          borderStyle="rounded"
          borderColor="#d4d4d8" borderLeft={false} borderRight={false}
          paddingX={1}
          paddingY={1}
        >
          <box>
            <text fg="gray">Card Number: </text>
            <text>**** **** **** {detailCard.last4}</text>
          </box>

          {detailCard.cardholderName && (
            <box>
              <text fg="gray">Cardholder: </text>
              <text>{detailCard.cardholderName}</text>
            </box>
          )}

          <box>
            <text fg="gray">Brand: </text>
            <text>{formatCardType(detailCard.cardType || detailCard.brand)}</text>
          </box>

          <box>
            <text fg="gray">Expires: </text>
            <text>{formatExpiry(detailCard.expiryMonth, detailCard.expiryYear, detailCard.expiry)}</text>
          </box>

          {detailCard.createdAt && (
            <box>
              <text fg="gray">Added: </text>
              <text>{new Date(detailCard.createdAt).toLocaleString()}</text>
            </box>
          )}
        </box>

        {(error || statusMessage) && (
          <box marginTop={1}>
            <text fg={(error || statusMessage || '').startsWith('Error') ? 'red' : 'green'}>
              {error || statusMessage}
            </text>
          </box>
        )}

        <box marginTop={1}>
          <text fg="gray">
            x remove | n add card | Esc back
          </text>
        </box>
      </box>
    );
  }

  // Add form
  if (mode === 'add-form') {
    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg="cyan"><b>Add Card</b></text>
          <text fg="gray"> ({addFieldIndex + 1}/{ADD_FIELDS.length})</text>
        </box>

        <box
          flexDirection="column"
          borderStyle="rounded"
          borderColor="#d4d4d8" borderLeft={false} borderRight={false}
          paddingX={1}
          paddingY={1}
        >
          {ADD_FIELDS.map((field, index) => {
            const value = addForm[field.key];
            const isCurrent = index === addFieldIndex;
            const isCompleted = index < addFieldIndex;
            const label = `${field.label}: `;
            if (isCurrent) {
              return (
                <box key={field.key}>
                  <text fg="cyan">{label}</text>
                  <input
                    value={value}
                    onChange={(nextValue) => {
                      setAddForm((prev) => ({
                        ...prev,
                        [field.key]: nextValue,
                      }));
                    }}
                    onSubmit={() => {
                      void advanceAddForm();
                    }}
                    placeholder={field.placeholder}
                  />
                </box>
              );
            }

            if (isCompleted) {
              return (
                <box key={field.key}>
                  <text fg="gray">{label}</text>
                  <text>{maskFieldValue(field, value)}</text>
                </box>
              );
            }

            return (
              <box key={field.key}>
                <text fg="gray">{label}</text>
                <text fg="gray">{field.placeholder}</text>
              </box>
            );
          })}
        </box>

        {(error || statusMessage) && (
          <box marginTop={1}>
            <text fg={(error || statusMessage || '').startsWith('Error') ? 'red' : 'yellow'}>
              {error || statusMessage}
            </text>
          </box>
        )}

        <box marginTop={1}>
          <text fg="gray">Enter next field | Esc back</text>
        </box>
      </box>
    );
  }

  // Empty state
  if (cards.length === 0) {
    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg="cyan"><b>Wallet</b></text>
        </box>
        <box
          flexDirection="column"
          borderStyle="rounded"
          borderColor="#d4d4d8" borderLeft={false} borderRight={false}
          paddingX={1}
          paddingY={1}
        >
          <text fg="gray">No cards stored in wallet.</text>
          <text fg="gray">Press n to add your first card.</text>
          <box marginTop={1}>
            <text fg="yellow">Warning:</text>
          </box>
          <text fg="gray">Store card data only if you have proper compliance controls.</text>
        </box>
        {(error || statusMessage) && (
          <box marginTop={1}>
            <text fg={(error || statusMessage || '').startsWith('Error') ? 'red' : 'yellow'}>
              {error || statusMessage}
            </text>
          </box>
        )}
        <box marginTop={1}>
          <text fg="gray">n add card | q quit</text>
        </box>
      </box>
    );
  }

  // List view (default)
  const visibleCards = cards.slice(cardRange.start, cardRange.end);

  return (
    <box flexDirection="column" paddingY={1}>
      <box marginBottom={1}>
        <text fg="cyan"><b>Wallet</b></text>
        {cards.length > MAX_VISIBLE_ITEMS && (
          <text fg="gray"> ({cardIndex + 1}/{cards.length})</text>
        )}
      </box>

      <box
        flexDirection="column"
        borderStyle="rounded"
        borderColor="#d4d4d8" borderLeft={false} borderRight={false}
        paddingX={1}
      >
        {cardRange.hasMore.above > 0 && (
          <box paddingY={0}>
            <text fg="gray">  ↑ {cardRange.hasMore.above} more above</text>
          </box>
        )}

        {visibleCards.map((card, visibleIdx) => {
          const actualIdx = cardRange.start + visibleIdx;
          const isSelected = actualIdx === cardIndex;
          const prefix = isSelected ? '> ' : '  ';
          const statusIcon = card.isDefault ? '*' : 'o';
          const statusColor = card.isDefault ? 'yellow' : 'gray';
          const cardType = card.cardType || card.brand || '';

          return (
            <box key={card.id} paddingY={0}>
              <text attributes={isSelected ? 32 : undefined} fg={!isSelected ? "gray" : undefined}>
                {prefix}
              </text>
              <text fg={statusColor} attributes={isSelected ? 32 : undefined}>
                {statusIcon}
              </text>
              <text attributes={isSelected ? 32 : undefined} fg={!isSelected ? "gray" : undefined}>
                {' '}{card.name}
              </text>
              <text attributes={isSelected ? 32 : undefined} fg="gray">
                {' '}**** {card.last4}
              </text>
              {cardType && (
                <text attributes={isSelected ? 32 : undefined} fg="gray">
                  {' '}({cardType})
                </text>
              )}
            </box>
          );
        })}

        {cardRange.hasMore.below > 0 && (
          <box paddingY={0}>
            <text fg="gray">  ↓ {cardRange.hasMore.below} more below</text>
          </box>
        )}
      </box>

      {(error || statusMessage) && (
        <box marginTop={1}>
          <text fg={(error || statusMessage || '').startsWith('Error') ? 'red' : 'yellow'}>
            {error || statusMessage}
          </text>
        </box>
      )}

      <box marginTop={1}>
        <text fg="gray">
          ↑↓ select | Enter view | n add card | q quit
        </text>
      </box>
    </box>
  );
}
