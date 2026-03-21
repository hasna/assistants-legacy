// Training data gatherer for @hasna/assistants
// Used by open-brains to collect fine-tuning examples from session/interaction history

import { SessionStorage } from '../logger';

type GatherTrainingDataFn = (options?: {
  limit?: number;
  since?: Date;
}) => Promise<{
  source: string;
  examples: Array<{
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  }>;
  count: number;
}>;

const SYSTEM_PROMPT =
  "You are a personal AI assistant with full context of the user's work environment and projects.";

export const gatherTrainingData: GatherTrainingDataFn = async (options = {}) => {
  const limit = options.limit ?? 500;
  const examples: Array<{
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  }> = [];

  try {
    const allSessions = SessionStorage.listAllSessions();

    // Apply since filter
    const filtered = options.since
      ? allSessions.filter(
          (s) => new Date(s.updatedAt || s.startedAt).getTime() >= options.since!.getTime()
        )
      : allSessions;

    // Process most recent sessions first, up to limit * 2 to get enough examples
    const sessionInfos = filtered.slice(0, limit * 2);

    for (const info of sessionInfos) {
      if (examples.length >= limit) break;

      const session = SessionStorage.loadSession(info.id, info.assistantId ?? null);
      if (!session || !session.messages || session.messages.length < 2) continue;

      const rawMessages = session.messages as Array<Record<string, unknown>>;

      // Extract user/assistant turns (skip tool calls and system messages)
      const turns = rawMessages
        .filter(
          (m) =>
            (m['role'] === 'user' || m['role'] === 'assistant') &&
            typeof m['content'] === 'string' &&
            (m['content'] as string).trim().length > 0
        )
        .slice(0, 10)
        .map((m) => ({
          role: m['role'] as 'user' | 'assistant',
          content: (m['content'] as string).slice(0, 1000),
        }));

      if (turns.length < 2) continue;

      // Build a multi-turn example
      examples.push({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...turns,
        ],
      });

      // Also build a single-turn example from first exchange
      const firstUser = turns.find((t) => t.role === 'user');
      const firstAssistant = turns.find((t) => t.role === 'assistant');
      if (firstUser && firstAssistant) {
        examples.push({
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: firstUser.content },
            { role: 'assistant', content: firstAssistant.content },
          ],
        });
      }
    }
  } catch {
    // Partial failure is acceptable — return what we have
  }

  const finalExamples = examples.slice(0, limit);

  return {
    source: 'assistants',
    examples: finalExamples,
    count: finalExamples.length,
  };
};
