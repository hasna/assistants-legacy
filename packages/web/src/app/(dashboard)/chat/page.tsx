'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChatInput } from '@/components/chat/ChatInput';
import { MessageList } from '@/components/chat/MessageList';
import { ModelSelector } from '@/components/chat/ModelSelector';
import { SessionSidebar } from '@/components/chat/SessionSidebar';
import { SessionSearch } from '@/components/chat/SessionSearch';
import { SetupWizard } from '@/components/chat/SetupWizard';
import { useChat } from '@/hooks/use-chat';
import { useSessions } from '@/hooks/use-sessions';
import { useRouter } from 'next/navigation';
import { DEFAULT_MODEL } from '@/lib/models';

function ThinkingIndicator() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => setElapsed((Date.now() - start) / 1000), 100);
    return () => clearInterval(interval);
  }, []);
  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground shrink-0">
      <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
      <span>Thinking{elapsed > 1 ? `... ${elapsed.toFixed(1)}s` : '...'}</span>
    </div>
  );
}

const SUGGESTIONS = [
  'Summarize my recent sessions',
  'What pending tasks do I have?',
  'Show me my high-importance memories',
  'What skills are available?',
  'Help me write a git commit message',
  'Explain this codebase',
];

export default function NewChatPage() {
  const searchParams = useSearchParams();
  const resumeId = searchParams.get('resume');

  const router = useRouter();
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [resumedSessionId, setResumedSessionId] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupChecked, setSetupChecked] = useState(false);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful AI assistant.');

  // Check if API keys are configured
  useEffect(() => {
    fetch('/api/setup')
      .then((r) => r.json())
      .then((data) => {
        setNeedsSetup(!data.hasAnthropicKey);
        setSetupChecked(true);
      })
      .catch(() => setSetupChecked(true));
  }, []);
  const { messages, isStreaming, error, sendMessage, stopStreaming, clearMessages, loadMessages } = useChat(resumedSessionId ?? undefined);
  const { grouped } = useSessions();

  // Load session if ?resume=<id> param is present
  useEffect(() => {
    if (resumeId && resumeId !== resumedSessionId) {
      setResumedSessionId(resumeId);
      loadMessages(resumeId);
    }
  }, [resumeId, resumedSessionId, loadMessages]);

  const handleExport = (format: 'markdown' | 'json') => {
    if (format === 'markdown') {
      const md = messages.map(m => `**${m.role === 'user' ? 'You' : 'Assistant'}:**\n\n${m.content}`).join('\n\n---\n\n')
      const blob = new Blob([md], { type: 'text/markdown' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `chat-${Date.now()}.md`; a.click()
    } else {
      const json = JSON.stringify(messages, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `chat-${Date.now()}.json`; a.click()
    }
  }

  // Show setup wizard if API key is missing
  if (setupChecked && needsSetup) {
    return (
      <div className="flex h-full overflow-hidden">
        <SetupWizard onComplete={() => setNeedsSetup(false)} />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Session search overlay */}
      {showSearch && <SessionSearch onClose={() => setShowSearch(false)} />}

      {/* Session history sidebar */}
      <SessionSidebar
        grouped={grouped}
        isCollapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onSelectSession={(id) => router.push(`/chat?resume=${id}`)}
        onNewChat={() => { clearMessages(); setResumedSessionId(null); router.push('/chat'); }}
      />

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border/60 px-4 py-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="rounded p-1 hover:bg-accent text-muted-foreground hover:text-foreground"
              title="Session history"
            >
              ☰
            </button>
            <h1 className="text-sm font-medium">
              {resumedSessionId ? `Session ${resumedSessionId.slice(0, 8)}…` : 'New Chat'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSystemPrompt(!showSystemPrompt)}
              className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title="System prompt"
            >
              📝 Prompt
            </button>
            <ModelSelector value={model} onChange={setModel} />
          </div>
        </header>

        {/* System prompt editor */}
        {showSystemPrompt && (
          <div className="border-b border-border bg-muted/30 p-3 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">System Prompt</span>
              <button onClick={() => setShowSystemPrompt(false)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
            </div>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={4}
              placeholder="You are a helpful AI assistant..."
            />
          </div>
        )}

        {/* Streaming indicator */}
        {isStreaming && <ThinkingIndicator />}

        {/* Messages or empty state with suggestions */}
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
            <div className="text-center">
              <h2 className="text-2xl font-semibold tracking-tight">What can I help with?</h2>
              <p className="mt-2 text-sm text-muted-foreground">Ask me anything, or choose a suggestion below</p>
            </div>
            <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s, model)}
                  className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <MessageList messages={messages} isStreaming={isStreaming} onExport={messages.length > 0 ? handleExport : undefined} />
        )}

        {/* Error */}
        {error && (
          <div className="mx-auto w-full max-w-3xl px-4 shrink-0">
            <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
              <div>
                <span className="font-medium">Error: </span>
                {/* Parse and simplify JSON error messages */}
                {(() => {
                  try {
                    // Strip HTTP status code prefix like "401 {..." or "500 {..."
                    const jsonStr = error.replace(/^\d{3}\s+/, '')
                    const parsed = JSON.parse(jsonStr) as { error?: { message?: string; type?: string }; message?: string }
                    const msg = parsed?.error?.message || parsed?.message
                    if (msg) return msg
                    // Show friendly status-based messages
                    if (error.startsWith('401')) return 'Authentication failed — check your API key in settings'
                    if (error.startsWith('429')) return 'Rate limit reached — please wait a moment and try again'
                    if (error.startsWith('500')) return 'Server error — please try again'
                    return error
                  } catch {
                    if (error.startsWith('401')) return 'Authentication failed — check your API key in settings'
                    return error
                  }
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Input */}
        <ChatInput
          onSend={(msg) => sendMessage(msg, model)}
          onStop={stopStreaming}
          isStreaming={isStreaming}
          model={model}
          onModelChange={setModel}
          onSearchClick={() => setShowSearch(true)}
        />
      </div>
    </div>
  );
}
