'use client';

import { useState, useEffect, use } from 'react';
import { ChatInput } from '@/components/chat/ChatInput';
import { MessageList } from '@/components/chat/MessageList';
import { ModelSelector } from '@/components/chat/ModelSelector';
import { useChat } from '@/hooks/use-chat';

export default function SessionChatPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const [model, setModel] = useState('claude-sonnet-4-5-20250929');
  const { messages, isStreaming, error, sendMessage, stopStreaming, loadMessages } = useChat(sessionId);

  useEffect(() => {
    if (sessionId) {
      loadMessages(sessionId);
    }
  }, [sessionId, loadMessages]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border/60 px-4 py-2">
        <h1 className="text-sm font-medium">
          Session: {sessionId.slice(0, 12)}...
        </h1>
        <ModelSelector value={model} onChange={setModel} />
      </header>

      {/* Messages */}
      <MessageList messages={messages} isStreaming={isStreaming} />

      {/* Error */}
      {error && (
        <div className="mx-auto w-full max-w-3xl px-4">
          <div className="rounded-xl bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
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
      />
    </div>
  );
}
