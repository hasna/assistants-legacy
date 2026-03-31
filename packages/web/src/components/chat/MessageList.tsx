'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ToolCallBlock } from './ToolCallBlock';
import type { ChatMessage } from '@/hooks/use-chat';

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function TokenBadge({ content, toolCalls }: { content: string; toolCalls?: unknown[] }) {
  const textTokens = estimateTokens(content);
  const toolTokens = toolCalls ? toolCalls.reduce((acc, tc) => acc + estimateTokens(JSON.stringify(tc)), 0) : 0;
  const total = textTokens + toolTokens;
  if (total === 0) return null;
  return (
    <span className="text-[10px] text-muted-foreground/60 tabular-nums" title={`~${total} tokens estimated`}>
      ~{formatTokenCount(total)} tokens
    </span>
  );
}

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
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRegenerate?: () => void;
}

function EditableUserMessage({ message, onSave }: { message: ChatMessage; onSave: (newContent: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);

  if (editing) {
    return (
      <div className="max-w-[85%] rounded-2xl bg-muted px-4 py-2.5">
        <textarea
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSave(editValue); setEditing(false); }
            if (e.key === 'Escape') { setEditing(false); setEditValue(message.content); }
          }}
          className="w-full resize-none bg-transparent text-sm outline-none min-h-[60px]"
          rows={3}
        />
        <div className="flex gap-2 mt-1">
          <button onClick={() => { onSave(editValue); setEditing(false); }} className="text-xs text-primary hover:underline">Save</button>
          <button onClick={() => { setEditing(false); setEditValue(message.content); }} className="text-xs text-muted-foreground hover:underline">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-1">
      <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton text={message.content} />
        <button
          onClick={() => setEditing(true)}
          className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground text-xs"
          title="Edit message"
        >
          ✎
        </button>
      </div>
      <div className="max-w-[85%] rounded-2xl bg-muted px-4 py-2.5">
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}

export function MessageList({ messages, isStreaming, onExport, onEditMessage, onRegenerate }: MessageListProps) {
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
              <EditableUserMessage
                message={message}
                onSave={(newContent) => onEditMessage?.(message.id, newContent)}
              />
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

                {/* Token estimate + regenerate */}
                {message.content && (
                  <div className="mt-1 flex items-center gap-2">
                    <TokenBadge content={message.content} toolCalls={message.toolCalls as unknown[]} />
                    {index === messages.length - 1 && !isStreaming && onRegenerate && (
                      <button
                        onClick={onRegenerate}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-muted-foreground hover:text-foreground"
                        title="Regenerate response"
                      >
                        ↻ Regenerate
                      </button>
                    )}
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
        {/* Session total */}
        {messages.length > 1 && (
          <div className="flex justify-center py-2">
            <span className="text-[10px] text-muted-foreground/50 tabular-nums">
              Session: ~{formatTokenCount(messages.reduce((acc, m) => acc + estimateTokens(m.content) + (m.toolCalls ? estimateTokens(JSON.stringify(m.toolCalls)) : 0), 0))} tokens · {messages.length} messages
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
