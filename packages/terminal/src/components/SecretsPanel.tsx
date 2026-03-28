import React, { useEffect, useMemo, useState } from 'react';
import { useSafeInput as useInput } from '../hooks/useSafeInput';

// Maximum visible items in lists before pagination kicks in
const MAX_VISIBLE_ITEMS = 5;

type ViewMode = 'list' | 'detail' | 'delete-confirm' | 'add-form';

export interface SecretAddInput {
  name: string;
  value: string;
  scope: 'global' | 'assistant';
  description?: string;
}

interface SecretEntry {
  name: string;
  scope: 'global' | 'assistant';
  createdAt?: string;
  updatedAt?: string;
}

interface SecretsPanelProps {
  secrets: SecretEntry[];
  initialMode?: 'list' | 'add';
  onGet: (name: string, scope?: 'global' | 'assistant') => Promise<string>;
  onAdd: (input: SecretAddInput) => Promise<void>;
  onDelete: (name: string, scope: 'global' | 'assistant') => Promise<void>;
  onClose: () => void;
  error?: string | null;
}

interface AddField {
  key: keyof SecretAddInput;
  label: string;
  placeholder: string;
  required?: boolean;
  sensitive?: boolean;
}

const ADD_FIELDS: AddField[] = [
  { key: 'name', label: 'Name', placeholder: 'GITHUB_TOKEN', required: true },
  { key: 'value', label: 'Value', placeholder: 'secret value', required: true, sensitive: true },
  { key: 'scope', label: 'Scope', placeholder: 'assistant | global', required: true },
  { key: 'description', label: 'Description', placeholder: 'optional', required: false },
];

const defaultAddForm = (): SecretAddInput => ({
  name: '',
  value: '',
  scope: 'assistant',
  description: '',
});

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

function maskFieldValue(field: AddField, value: string): string {
  if (!value) return '';
  if (field.sensitive) {
    return '•'.repeat(Math.min(8, Math.max(4, value.length)));
  }
  if (field.key === 'description' && !value.trim()) {
    return '(optional)';
  }
  return value;
}

/**
 * Interactive panel for managing secrets
 */
export function SecretsPanel({
  secrets,
  initialMode = 'list',
  onGet,
  onAdd,
  onDelete,
  onClose,
  error,
}: SecretsPanelProps) {
  const [mode, setMode] = useState<ViewMode>(initialMode === 'add' ? 'add-form' : 'list');
  const [secretIndex, setSecretIndex] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<SecretEntry | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [addForm, setAddForm] = useState<SecretAddInput>(() => defaultAddForm());
  const [addFieldIndex, setAddFieldIndex] = useState(0);

  const currentAddField = ADD_FIELDS[addFieldIndex];

  const resetAddForm = () => {
    setAddForm(defaultAddForm());
    setAddFieldIndex(0);
  };

  const openAddForm = () => {
    resetAddForm();
    setMode('add-form');
    setStatusMessage(null);
  };

  useEffect(() => {
    if (initialMode === 'add') {
      openAddForm();
      return;
    }
    if (mode === 'add-form') {
      setMode('list');
      setStatusMessage(null);
    }
  }, [initialMode]);

  useEffect(() => {
    setSecretIndex((prev) => Math.min(prev, Math.max(0, secrets.length - 1)));
  }, [secrets.length]);

  // Calculate visible range for secrets list
  const secretRange = useMemo(
    () => getVisibleRange(secretIndex, secrets.length),
    [secretIndex, secrets.length]
  );

  const currentSecret = secrets[secretIndex];

  useEffect(() => {
    if (mode === 'detail' && !currentSecret) {
      setMode('list');
      setRevealedValue(null);
    }
  }, [mode, currentSecret]);

  useEffect(() => {
    if (mode === 'delete-confirm' && !deleteTarget) {
      setMode('list');
    }
  }, [mode, deleteTarget]);

  // Handle reveal
  const handleReveal = async () => {
    if (!currentSecret || revealedValue !== null) return;

    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const value = await onGet(currentSecret.name, currentSecret.scope);
      setRevealedValue(value);
    } catch (err) {
      setStatusMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const normalizeScope = (rawScope: string): 'global' | 'assistant' | null => {
    const scope = rawScope.trim().toLowerCase();
    if (!scope) return 'assistant';
    if (scope === 'global' || scope === 'assistant') return scope;
    return null;
  };

  const normalizeAddInput = (form: SecretAddInput): SecretAddInput | null => {
    const scope = normalizeScope(String(form.scope));
    if (!scope) {
      return null;
    }

    const description = (form.description || '').trim();
    return {
      name: form.name.trim(),
      value: form.value,
      scope,
      description: description.length > 0 ? description : undefined,
    };
  };

  const advanceAddForm = async () => {
    if (!currentAddField) return;

    const currentValue = String(addForm[currentAddField.key] || '');
    if (currentAddField.required && !currentValue.trim()) {
      setStatusMessage(`${currentAddField.label} is required.`);
      return;
    }

    if (currentAddField.key === 'scope') {
      const normalizedScope = normalizeScope(currentValue);
      if (!normalizedScope) {
        setStatusMessage('Scope must be "assistant" or "global".');
        return;
      }
      setAddForm((prev) => ({ ...prev, scope: normalizedScope }));
    }

    if (addFieldIndex < ADD_FIELDS.length - 1) {
      setAddFieldIndex((prev) => prev + 1);
      setStatusMessage(null);
      return;
    }

    const normalized = normalizeAddInput(addForm);
    if (!normalized) {
      setStatusMessage('Scope must be "assistant" or "global".');
      return;
    }

    setIsProcessing(true);
    setStatusMessage(null);
    try {
      await onAdd(normalized);
      resetAddForm();
      setMode('list');
      setStatusMessage('Secret saved.');
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
      await onDelete(deleteTarget.name, deleteTarget.scope);
      setMode('list');
      setDeleteTarget(null);
      if (secretIndex >= secrets.length - 1 && secretIndex > 0) {
        setSecretIndex(secretIndex - 1);
      }
      setStatusMessage('Secret deleted.');
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
        setRevealedValue(null);
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

      if (secrets.length === 0) {
        return;
      }
      if (key.upArrow) {
        setSecretIndex((prev) => (prev === 0 ? secrets.length - 1 : prev - 1));
        return;
      }
      if (key.downArrow) {
        setSecretIndex((prev) => (prev === secrets.length - 1 ? 0 : prev + 1));
        return;
      }
      if (key.return && currentSecret) {
        setMode('detail');
        setRevealedValue(null);
        setStatusMessage(null);
        return;
      }
      // Number keys for quick selection
      const num = parseInt(input, 10);
      if (!isNaN(num) && num >= 1 && num <= secrets.length) {
        setSecretIndex(num - 1);
      }
      return;
    }

    // Detail mode
    if (mode === 'detail') {
      if (input === 'r') {
        void handleReveal();
        return;
      }
      if (input === 'n') {
        openAddForm();
        return;
      }
      if (input === 'x' || key.delete) {
        if (currentSecret) {
          setDeleteTarget(currentSecret);
          setMode('delete-confirm');
        }
        return;
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
  });

  // Add form
  if (mode === 'add-form') {
    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg="cyan"><b>Add Secret</b></text>
          <text fg="gray"> ({addFieldIndex + 1}/{ADD_FIELDS.length})</text>
        </box>

        <box
          flexDirection="column"
          borderStyle="rounded"
          borderColor="#d4d4d8" border={["top", "bottom"]}
          paddingX={1}
          paddingY={1}
        >
          {ADD_FIELDS.map((field, index) => {
            const value = String(addForm[field.key] || '');
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
  if (secrets.length === 0) {
    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg="cyan"><b>Secrets</b></text>
        </box>
        <box
          flexDirection="column"
          borderStyle="rounded"
          borderColor="#d4d4d8" border={["top", "bottom"]}
          paddingX={1}
          paddingY={1}
        >
          <text fg="gray">No secrets stored.</text>
          <text fg="gray">Press n to add your first secret.</text>
        </box>
        {(error || statusMessage) && (
          <box marginTop={1}>
            <text fg={(error || statusMessage || '').startsWith('Error') ? 'red' : 'yellow'}>
              {error || statusMessage}
            </text>
          </box>
        )}
        <box marginTop={1}>
          <text fg="gray">n add secret | q quit</text>
        </box>
      </box>
    );
  }

  // Delete confirmation
  if (mode === 'delete-confirm' && deleteTarget) {
    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg="red"><b>Delete Secret</b></text>
        </box>
        <box
          flexDirection="column"
          borderStyle="rounded"
          borderColor="#d4d4d8" border={["top", "bottom"]}
          paddingX={1}
          paddingY={1}
        >
          <text>Are you sure you want to delete "{deleteTarget.name}"?</text>
          <text fg="gray">Scope: {deleteTarget.scope}</text>
          <text fg="gray">This action cannot be undone.</text>
        </box>
        {(error || statusMessage) && (
          <box marginTop={1}>
            <text fg={(error || statusMessage || '').startsWith('Error') ? 'red' : 'yellow'}>
              {error || statusMessage}
            </text>
          </box>
        )}
        <box marginTop={1}>
          <text fg="gray">y confirm | n cancel</text>
        </box>
      </box>
    );
  }

  // Detail view
  if (mode === 'detail' && currentSecret) {
    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg="cyan"><b>{currentSecret.name}</b></text>
        </box>

        <box
          flexDirection="column"
          borderStyle="rounded"
          borderColor="#d4d4d8" border={["top", "bottom"]}
          paddingX={1}
          paddingY={1}
        >
          <box>
            <text fg="gray">Scope: </text>
            <text fg={currentSecret.scope === 'global' ? 'yellow' : 'blue'}>
              {currentSecret.scope}
            </text>
          </box>

          {currentSecret.createdAt && (
            <box>
              <text fg="gray">Created: </text>
              <text>{new Date(currentSecret.createdAt).toLocaleString()}</text>
            </box>
          )}

          {currentSecret.updatedAt && (
            <box>
              <text fg="gray">Updated: </text>
              <text>{new Date(currentSecret.updatedAt).toLocaleString()}</text>
            </box>
          )}

          <box marginTop={1}>
            <text fg="gray">Value: </text>
            {revealedValue !== null ? (
              <text fg="green">{revealedValue}</text>
            ) : (
              <text fg="gray">••••••••</text>
            )}
          </box>
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
            {revealedValue === null && 'r reveal | '}
            x delete | n add | Esc back
          </text>
        </box>
      </box>
    );
  }

  // List view (default)
  const visibleSecrets = secrets.slice(secretRange.start, secretRange.end);

  return (
    <box flexDirection="column" paddingY={1}>
      <box marginBottom={1}>
        <text fg="cyan"><b>Secrets</b></text>
        {secrets.length > MAX_VISIBLE_ITEMS && (
          <text fg="gray"> ({secretIndex + 1}/{secrets.length})</text>
        )}
      </box>

      <box
        flexDirection="column"
        borderStyle="rounded"
        borderColor="#d4d4d8" border={["top", "bottom"]}
        paddingX={1}
      >
        {secretRange.hasMore.above > 0 && (
          <box paddingY={0}>
            <text fg="gray">  ↑ {secretRange.hasMore.above} more above</text>
          </box>
        )}

        {visibleSecrets.map((secret, visibleIdx) => {
          const actualIdx = secretRange.start + visibleIdx;
          const isSelected = actualIdx === secretIndex;
          const prefix = isSelected ? '> ' : '  ';
          const nameDisplay = secret.name.padEnd(25);
          const scopeColor = secret.scope === 'global' ? 'yellow' : 'blue';

          return (
            <box key={`${secret.name}-${secret.scope}`} paddingY={0}>
              <text attributes={isSelected ? 32 : undefined} fg={!isSelected ? "gray" : undefined}>
                {prefix}{nameDisplay}
              </text>
              <text fg={scopeColor} attributes={isSelected ? 32 : undefined}>
                {secret.scope.padEnd(8)}
              </text>
            </box>
          );
        })}

        {secretRange.hasMore.below > 0 && (
          <box paddingY={0}>
            <text fg="gray">  ↓ {secretRange.hasMore.below} more below</text>
          </box>
        )}
      </box>

      <box marginTop={1}>
        <text fg="gray">Legend: </text>
        <text fg="yellow">global</text>
        <text fg="gray"> = shared | </text>
        <text fg="blue">assistant</text>
        <text fg="gray"> = assistant-specific</text>
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
          ↑↓ select | Enter view | n add | q quit
        </text>
      </box>
    </box>
  );
}
