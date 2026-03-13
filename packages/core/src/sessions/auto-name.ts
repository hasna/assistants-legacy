/**
 * Session auto-naming
 *
 * After the first user message gets a response, fires a background call
 * to a lightweight model (Haiku) to generate a short session title.
 */

import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_BACKGROUND_MODEL = 'claude-haiku-4-5-20251001';

/**
 * Generate a short 3-5 word title for a conversation based on the first user message.
 * Uses a lightweight model (Haiku) to keep costs and latency low.
 */
export async function generateSessionName(
  userMessage: string,
  options: {
    apiKey?: string;
    model?: string;
  } = {}
): Promise<string> {
  const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY required for session auto-naming');
  }

  const client = new Anthropic({ apiKey });
  const model = options.model || DEFAULT_BACKGROUND_MODEL;

  // Truncate very long messages to keep the request small
  const truncated = userMessage.length > 500 ? userMessage.slice(0, 500) + '...' : userMessage;

  const response = await client.messages.create({
    model,
    max_tokens: 30,
    messages: [
      {
        role: 'user',
        content: `Generate a 3-5 word title for this conversation. User asked: ${truncated}\n\nReply with ONLY the title, no quotes.`,
      },
    ],
  });

  const block = response.content[0];
  if (block.type === 'text') {
    // Clean up: remove quotes, trim whitespace
    return block.text.replace(/^["']|["']$/g, '').trim();
  }

  return 'Untitled Session';
}
