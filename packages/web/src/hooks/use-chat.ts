'use client';

import { useState, useCallback, useRef } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: unknown[];
  toolResults?: unknown[];
}

export function useChat(sessionId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadMessages = useCallback(async (sid: string) => {
    try {
      const res = await fetch(`/api/chat/${sid}`);
      const data = await res.json();
      if (data.messages) {
        setMessages(data.messages);
      }
    } catch (err) {
      setError('Failed to load messages');
    }
  }, []);

  const sendMessage = useCallback(async (content: string, model?: string) => {
    setError(null);

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsStreaming(true);

    const assistantMessage: ChatMessage = {
      id: `msg-${Date.now()}-assistant`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, assistantMessage]);

    try {
      // Abort any in-flight stream before starting a new one
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      const allMessages = [...messages, userMessage].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: allMessages,
          model,
          sessionId,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Chat request failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'text') {
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === 'assistant') {
                    updated[updated.length - 1] = {
                      ...last,
                      content: last.content + data.text,
                    };
                  }
                  return updated;
                });
              } else if (data.type === 'tool_use_start' || data.type === 'tool_use_complete') {
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === 'assistant') {
                    const calls = [...(last.toolCalls || [])];
                    if (data.type === 'tool_use_start') {
                      calls.push({ id: data.id, name: data.tool, input: undefined });
                    } else {
                      // Update the matching call with its input
                      const idx = calls.findIndex((c) => (c as { id?: string }).id === data.id);
                      if (idx >= 0) {
                        calls[idx] = { ...calls[idx] as Record<string, unknown>, input: data.input };
                      }
                    }
                    updated[updated.length - 1] = { ...last, toolCalls: calls };
                  }
                  return updated;
                });
              } else if (data.type === 'tool_result') {
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === 'assistant') {
                    const results = [...(last.toolResults || [])];
                    results.push({ id: data.id, tool: data.tool, content: data.result });
                    updated[updated.length - 1] = { ...last, toolResults: results };
                  }
                  return updated;
                });
              } else if (data.type === 'error') {
                setError(data.error);
              }
            } catch {
              // Skip malformed events
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled
      } else {
        setError(err instanceof Error ? err.message : 'Failed to send message');
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [messages, sessionId]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    isStreaming,
    error,
    sendMessage,
    stopStreaming,
    clearMessages,
    loadMessages,
  };
}
