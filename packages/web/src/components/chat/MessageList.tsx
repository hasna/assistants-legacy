'use client';

import { useEffect, useRef } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ToolCallBlock } from './ToolCallBlock';
import type { ChatMessage } from '@/hooks/use-chat';

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming?: boolean;
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold tracking-tight">What can I help with?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Ask me anything, or choose a suggestion below
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8">
        {messages.map((message, index) => (
          <div
            key={message.id}
            className={`mb-6 ${message.role === 'user' ? 'flex justify-end' : ''}`}
          >
            {message.role === 'user' ? (
              <div className="max-w-[85%] rounded-2xl bg-muted px-4 py-2.5">
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>
            ) : (
              <div className="w-full">
                {/* Tool calls */}
                {message.toolCalls &&
                  Array.isArray(message.toolCalls) &&
                  message.toolCalls.map((tc: unknown, i: number) => {
                    const call = tc as { id?: string; name?: string; input?: unknown };
                    const resultEntry =
                      message.toolResults &&
                      Array.isArray(message.toolResults)
                        ? (message.toolResults[i] as { content?: string } | undefined)
                        : undefined;

                    return (
                      <ToolCallBlock
                        key={call.id || i}
                        name={call.name || 'tool'}
                        input={call.input}
                        output={resultEntry?.content}
                      />
                    );
                  })}

                {/* Message content */}
                {message.content && (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <MarkdownRenderer content={message.content} />
                  </div>
                )}

                {/* Streaming indicator */}
                {isStreaming && index === messages.length - 1 && !message.content && (
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
