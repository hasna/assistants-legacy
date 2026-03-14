'use client';

import { useState } from 'react';
import { ChatInput } from '@/components/chat/ChatInput';
import { MessageList } from '@/components/chat/MessageList';
import { ModelSelector } from '@/components/chat/ModelSelector';
import { SessionSidebar } from '@/components/chat/SessionSidebar';
import { SessionSearch } from '@/components/chat/SessionSearch';
import { useChat } from '@/hooks/use-chat';
import { useSessions } from '@/hooks/use-sessions';
import { DEFAULT_MODEL } from '@/lib/models';

const SUGGESTIONS = [
  'Summarize my recent sessions',
  'What pending tasks do I have?',
  'Show me my high-importance memories',
  'What skills are available?',
  'Help me write a git commit message',
  'Explain this codebase',
];

export default function NewChatPage() {
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const { messages, isStreaming, error, sendMessage, stopStreaming } = useChat();
  const { grouped } = useSessions();

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

  return (
    <div className="flex h-full overflow-hidden">
      {/* Session search overlay */}
      {showSearch && <SessionSearch onClose={() => setShowSearch(false)} />}

      {/* Session history sidebar */}
      <SessionSidebar
        grouped={grouped}
        isCollapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onSelectSession={(id) => { window.location.href = `/chat?resume=${id}`; }}
        onNewChat={() => { window.location.href = '/chat'; }}
      />

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border px-4 py-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="rounded p-1 hover:bg-accent text-muted-foreground hover:text-foreground"
              title="Session history"
            >
              ☰
            </button>
            <h1 className="text-sm font-medium">New Chat</h1>
          </div>
          <ModelSelector value={model} onChange={setModel} />
        </header>

        {/* Streaming progress bar */}
        {isStreaming && (
          <div className="h-0.5 w-full bg-muted overflow-hidden shrink-0">
            <div className="h-full bg-primary animate-[stream_1.5s_ease-in-out_infinite]" style={{ width: '30%' }} />
          </div>
        )}

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
                  className="rounded-xl border px-4 py-3 text-left text-sm hover:bg-accent/60 transition-colors"
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
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
              <span className="shrink-0">⚠️</span>
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
