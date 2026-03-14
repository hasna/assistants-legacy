'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ToolCallBlock } from './ToolCallBlock';
import type { ChatMessage } from '@/hooks/use-chat';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);
  return (
    <button
      onClick={copy}
      className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground text-xs"
      title="Copy message"
    >
      {copied ? '✓' : '⎘'}
    </button>
  );
}

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming?: boolean;
  onExport?: (format: 'markdown' | 'json') => void;
}

export function MessageList({ messages, isStreaming, onExport }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showExport, setShowExport] = useState(false);

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
      {messages.length > 0 && onExport && (
        <div className="sticky top-0 z-10 flex justify-end px-4 pt-2 pb-1">
          <div className="relative">
            <button
              onClick={() => setShowExport(v => !v)}
              className="rounded-lg border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent shadow-sm"
              title="Export conversation"
            >
              ↓ Export
            </button>
            {showExport && (
              <div className="absolute right-0 top-full mt-1 rounded-lg border bg-background shadow-lg z-20 py-1 min-w-[140px]">
                <button onClick={() => { onExport('markdown'); setShowExport(false); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent">📄 Markdown (.md)</button>
                <button onClick={() => { onExport('json'); setShowExport(false); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent">📦 JSON (.json)</button>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="mx-auto max-w-3xl px-4 py-8">
        {messages.map((message, index) => (
          <div
            key={message.id}
            className={`group mb-6 ${message.role === 'user' ? 'flex justify-end' : ''}`}
          >
            {message.role === 'user' ? (
              <div className="flex items-start gap-1">
                <CopyButton text={message.content} />
                <div className="max-w-[85%] rounded-2xl bg-muted px-4 py-2.5">
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ) : (
              <div className="w-full">
                {/* Tool calls — stacked vertically above content */}
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

                {/* Message content + copy */}
                {message.content && (
                  <div className="flex items-start justify-between gap-2 mt-1">
                    <div className="flex-1 prose prose-sm max-w-none dark:prose-invert">
                      <MarkdownRenderer content={message.content} />
                    </div>
                    <CopyButton text={message.content} />
                  </div>
                )}

                {/* Streaming indicator */}
                {isStreaming && index === messages.length - 1 && !message.content && !message.toolCalls?.length && (
                  <div className="flex items-center gap-1 mt-2">
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
