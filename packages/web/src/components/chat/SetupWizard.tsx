'use client';

import { useState } from 'react';
import { LLM_PROVIDERS } from '@hasna/assistants-shared';
import { toast } from '@/lib/toast';

interface SetupWizardProps {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [providerKeys, setProviderKeys] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const hasAnyKey = Object.values(providerKeys).some((value) => value.trim().length > 0);

  const handleSave = async () => {
    if (!hasAnyKey) {
      toast.error('At least one provider API key is required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerKeys }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('API keys saved! You can now start chatting.');
        onComplete();
      } else {
        toast.error(data.error || 'Failed to save keys');
      }
    } catch {
      toast.error('Failed to save keys');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold tracking-tight">Welcome to Assistants</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Set up your API keys to get started.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          {LLM_PROVIDERS.map((provider) => (
            <div key={provider.id}>
              <label className="block text-sm font-medium mb-1.5">
                {provider.label} API Key
              </label>
              <input
                type="password"
                value={providerKeys[provider.id] ?? ''}
                onChange={(e) => setProviderKeys((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                placeholder={provider.apiKeyEnv}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {provider.description}
                {provider.docsUrl ? (
                  <>
                    {' '}
                    <span className="text-primary">{provider.docsUrl.replace(/^https?:\/\//, '')}</span>
                  </>
                ) : null}
              </p>
            </div>
          ))}

          <button
            onClick={handleSave}
            disabled={saving || !hasAnyKey}
            className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save & Start'}
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Keys are saved to <code className="bg-muted px-1 py-0.5 rounded">.env.local</code> and never leave your machine.
        </p>
      </div>
    </div>
  );
}
