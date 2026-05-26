import type { Message } from '@hasna/assistants-shared';
import { generateId, now } from '@hasna/assistants-shared';
import { createLLMClient } from '../llm/client';

const DEFAULT_BACKGROUND_MODEL = 'anthropic:claude-haiku-4-5-20251001';

export async function generateSessionName(
  userMessage: string,
  options: {
    apiKey?: string;
    model?: string;
  } = {}
): Promise<string> {
  const model = options.model || DEFAULT_BACKGROUND_MODEL;
  const truncated = userMessage.length > 500 ? userMessage.slice(0, 500) + '...' : userMessage;

  const llmClient = await createLLMClient({
    model,
    apiKey: options.apiKey,
    maxOutputTokens: 30,
    effortLevel: 'low',
  });

  const messages: Message[] = [
    {
      id: generateId(),
      role: 'user',
      timestamp: now(),
      content: `Generate a 3-5 word title for this conversation. User asked: ${truncated}\n\nReply with ONLY the title, no quotes.`,
    },
  ];

  let response = '';
  for await (const chunk of llmClient.chat(messages)) {
    if (chunk.type === 'text' && chunk.content) {
      response += chunk.content;
    } else if (chunk.type === 'error') {
      throw new Error(chunk.error || 'Session auto-name failed');
    }
  }

  return response.replace(/^["']|["']$/g, '').trim() || 'Untitled Session';
}
