/**
 * QoL terminal command handlers extracted from App.tsx
 * These commands are handled at the terminal level (not sent to the LLM).
 * Each function returns a Message to display, or null if no message needed.
 */

import type { Message, TokenUsage } from '@hasna/assistants-shared';
import { generateId, now } from '@hasna/assistants-shared';
import { SessionStorage, type SavedSessionInfo } from '@hasna/assistants-core';

/** Helper to create an assistant message */
function assistantMsg(content: string): Message {
  return {
    id: generateId(),
    role: 'assistant',
    content,
    timestamp: now(),
  } as Message;
}

/**
 * /export [path] — Export conversation as markdown
 */
export async function handleExport(
  args: string,
  sessionId: string,
  sessionCwd: string,
  modelName: string,
  messages: Message[],
  tokenUsage?: TokenUsage,
): Promise<Message> {
  const defaultPath = `${sessionCwd}/conversation-${sessionId.slice(0, 8)}.md`;
  const outputPath = args || defaultPath;

  const lines: string[] = [];
  const date = new Date().toISOString().split('T')[0];
  lines.push(`# Conversation — ${date}`);
  lines.push('');
  lines.push(`**Model:** ${modelName}  `);
  lines.push(`**Session:** ${sessionId}  `);
  if (tokenUsage) {
    lines.push(`**Tokens:** ${tokenUsage.inputTokens.toLocaleString()} in / ${tokenUsage.outputTokens.toLocaleString()} out  `);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of messages) {
    if (msg.role === 'user') {
      lines.push('## User', '', msg.content, '');
    } else if (msg.role === 'assistant') {
      lines.push('## Assistant', '', msg.content, '');
    }
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      for (const tc of msg.toolCalls) {
        lines.push(
          `<details><summary>Tool: ${tc.name}</summary>`,
          '',
          '```json',
          JSON.stringify(tc.input, null, 2),
          '```',
          '',
          '</details>',
          '',
        );
      }
    }
    lines.push('---', '');
  }

  try {
    const content = lines.join('\n');
    await Bun.write(outputPath, content);
    const sizeKB = (content.length / 1024).toFixed(1);
    return assistantMsg(`Conversation exported to \`${outputPath}\` (${sizeKB} KB, ${messages.length} messages).`);
  } catch (err) {
    return assistantMsg(`Failed to export: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * /undo — Show git diff preview before reverting
 */
export function handleUndo(cwd: string): Message {
  try {
    const diffProc = Bun.spawnSync(['git', 'diff'], { cwd });
    const stagedProc = Bun.spawnSync(['git', 'diff', '--staged'], { cwd });
    const diff = diffProc.stdout.toString().trim();
    const staged = stagedProc.stdout.toString().trim();
    const fullDiff = [diff, staged].filter(Boolean).join('\n');

    if (!fullDiff) {
      return assistantMsg('No uncommitted changes to undo.');
    }

    const truncatedDiff = fullDiff.length > 3000
      ? fullDiff.slice(0, 3000) + '\n... (truncated)'
      : fullDiff;
    return assistantMsg(
      `**Changes that will be reverted:**\n\n\`\`\`diff\n${truncatedDiff}\n\`\`\`\n\nType \`/undo confirm\` to revert these changes, or anything else to cancel.`,
    );
  } catch (err) {
    return assistantMsg(`Failed to get diff: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * /undo confirm — Actually revert changes
 */
export function handleUndoConfirm(cwd: string): Message {
  try {
    Bun.spawnSync(['git', 'checkout', '.'], { cwd });
    Bun.spawnSync(['git', 'reset', 'HEAD', '.'], { cwd });
    return assistantMsg('All uncommitted changes have been reverted.');
  } catch (err) {
    return assistantMsg(`Failed to undo: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * /pin — Pin the last assistant message
 * Returns: { message, newPinId } or { message, clear: true }
 */
export function handlePin(
  args: string,
  messages: Message[],
  pinnedCount: number,
): { message: Message; pinId?: string; clear?: boolean } {
  if (args === 'clear') {
    return { message: assistantMsg('All pins cleared.'), clear: true };
  }

  const assistantMsgs = messages.filter((m) => m.role === 'assistant');
  const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
  if (!lastAssistant) {
    return { message: assistantMsg('No assistant message to pin.') };
  }

  const preview = lastAssistant.content.slice(0, 60);
  return {
    message: assistantMsg(
      `Pinned: "${preview}${lastAssistant.content.length > 60 ? '…' : ''}" (${pinnedCount + 1} total pins)`,
    ),
    pinId: lastAssistant.id,
  };
}

/**
 * /pins — List all pinned messages
 */
export function handlePins(
  messages: Message[],
  pinnedMessageIds: Set<string>,
): Message {
  const pinned = messages.filter((m) => pinnedMessageIds.has(m.id));
  if (pinned.length === 0) {
    return assistantMsg('No pinned messages. Use `/pin` to bookmark the last assistant response.');
  }

  const lines = pinned.map((m, i) => {
    const preview = m.content.length > 200 ? m.content.slice(0, 200) + '…' : m.content;
    return `**Pin ${i + 1}:**\n${preview}`;
  });
  return assistantMsg(`Pinned messages (${pinned.length}):\n\n${lines.join('\n\n---\n\n')}`);
}

/**
 * /replay [N] — Redisplay last N messages
 */
export function handleReplay(args: string, messages: Message[]): Message {
  const count = parseInt(args, 10) || 3;
  const conversationMsgs = messages.filter(
    (m) => m.role === 'user' || m.role === 'assistant',
  );
  const lastN = conversationMsgs.slice(-count);

  if (lastN.length === 0) {
    return assistantMsg('No messages to replay.');
  }

  const lines: string[] = [`--- Replay (last ${lastN.length} messages) ---`, ''];
  for (const msg of lastN) {
    const label = msg.role === 'user' ? '**You:**' : '**Assistant:**';
    const content = msg.content.length > 500 ? msg.content.slice(0, 500) + '…' : msg.content;
    lines.push(`${label} ${content}`, '');
  }
  lines.push('--- End replay ---');
  return assistantMsg(lines.join('\n'));
}

/**
 * /history [query] — Search past sessions
 */
export function handleHistory(query: string): Message {
  const searchQuery = query.toLowerCase();
  const allSessions = SessionStorage.listAllSessions();
  const maxToSearch = 50;
  const sessionsToSearch = allSessions.slice(0, maxToSearch);

  type HistoryResult = { session: SavedSessionInfo; preview: string };
  const results: HistoryResult[] = [];

  for (const session of sessionsToSearch) {
    if (searchQuery) {
      const data = SessionStorage.loadSession(session.id, session.assistantId);
      if (!data?.messages) continue;
      const msgs = data.messages as Array<{ role?: string; content?: string }>;
      const match = msgs.find((m) => m.content && m.content.toLowerCase().includes(searchQuery));
      if (match) {
        const preview = msgs.find((m) => m.role === 'user')?.content?.slice(0, 80) || '(no preview)';
        results.push({ session, preview });
      }
    } else {
      const data = SessionStorage.loadSession(session.id, session.assistantId);
      const msgs = (data?.messages || []) as Array<{ role?: string; content?: string }>;
      const preview = msgs.find((m) => m.role === 'user')?.content?.slice(0, 80) || '(no preview)';
      results.push({ session, preview });
    }
    if (results.length >= 15) break;
  }

  if (results.length === 0) {
    return assistantMsg(searchQuery ? `No sessions found matching "${query}".` : 'No saved sessions found.');
  }

  const header = searchQuery ? `Sessions matching "${query}":` : 'Recent sessions:';
  const lines = results.map((r, i) => {
    const date = new Date(r.session.updatedAt).toLocaleDateString();
    const id = r.session.id.slice(0, 8);
    return `${i + 1}. **${date}** \`${id}\` (${r.session.messageCount} msgs) — ${r.preview}`;
  });
  return assistantMsg(`${header}\n\n${lines.join('\n')}\n\nResume with: \`assistants --resume <id or name>\``);
}

/**
 * /templates — List available session templates
 */
export function handleTemplates(): Message {
  const templates = [
    { name: 'coding', description: 'Code generation, debugging, and refactoring' },
    { name: 'research', description: 'Deep research, analysis, and comparison' },
    { name: 'writing', description: 'Creative and technical writing' },
  ];
  const lines = templates.map((t) => `- **${t.name}** — ${t.description}`);
  return assistantMsg(`Available templates:\n\n${lines.join('\n')}\n\nUse: \`/new <template>\` (e.g. \`/new coding\`)`);
}
