'use client';

import { useState } from 'react';
import { toast } from '@/lib/toast';

interface SetupWizardProps {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [anthropicKey, setAnthropicKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!anthropicKey.trim()) {
      toast.error('Anthropic API key is required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anthropicKey: anthropicKey.trim(),
          openaiKey: openaiKey.trim() || undefined,
        }),
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
          {/* Anthropic Key */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Anthropic API Key <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Get your key at{' '}
              <span className="text-primary">console.anthropic.com</span>
            </p>
          </div>

          {/* OpenAI Key (optional) */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              OpenAI API Key <span className="text-muted-foreground text-xs">(optional)</span>
            </label>
            <input
              type="password"
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Enables GPT models, Whisper STT, and DALL-E.
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !anthropicKey.trim()}
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
