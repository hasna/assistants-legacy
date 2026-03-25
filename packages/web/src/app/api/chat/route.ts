import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { TOOLS, executeTool } from '@/lib/tools';
import { DEFAULT_MODEL, WEB_MODEL_IDS } from '@/lib/models';

const UI_BLOCKS_PROMPT = `

## Rich UI Rendering

You can output rich, styled UI components by writing JSON inside \`\`\`ui fenced code blocks. The chat will render them as beautiful components instead of plain text. Use these when presenting structured data, metrics, tables, dashboards, or any data that benefits from visual formatting.

### Format

\`\`\`ui
{
  "type": "ComponentName",
  "props": { ... },
  "children": [ ... ]
}
\`\`\`

### Supported Components

| Type | Props |
|------|-------|
| Card | title?, description?, children |
| Stack | direction?: "vertical"\\|"horizontal", gap?, children |
| Grid | cols?: 2\\|3\\|4, gap?, children |
| Heading | level?: 1-6, content |
| Text | content, variant?: "default"\\|"muted"\\|"lead" |
| Badge | label, variant?: "default"\\|"secondary"\\|"destructive"\\|"outline" |
| Alert | title?, description, variant?: "default"\\|"destructive" |
| Separator | (no props) |
| Code | content, language? |
| Image | src, alt?, width?, height? |
| Table | headers: string[], rows: string[][] |
| List | items: string[], ordered? |
| Metric | label, value, change?, trend?: "up"\\|"down" |
| Progress | value, max?, label? |
| Tabs | items: {label, children: [...]}[] |
| Collapsible | title, children |
| Button | label, variant? |
| Link | label, href |

### Examples

Dashboard with metrics:
\`\`\`ui
{
  "type": "Grid",
  "props": { "cols": 3 },
  "children": [
    { "type": "Metric", "props": { "label": "Revenue", "value": "$12,345", "change": "+12%", "trend": "up" } },
    { "type": "Metric", "props": { "label": "Users", "value": "1,234", "change": "+5%", "trend": "up" } },
    { "type": "Metric", "props": { "label": "Bounce Rate", "value": "32%", "change": "-3%", "trend": "down" } }
  ]
}
\`\`\`

Data table:
\`\`\`ui
{
  "type": "Table",
  "props": {
    "headers": ["Name", "Status", "Role"],
    "rows": [
      ["Alice", "Active", "Admin"],
      ["Bob", "Inactive", "User"]
    ]
  }
}
\`\`\`

Card with mixed content:
\`\`\`ui
{
  "type": "Card",
  "props": { "title": "Status", "description": "Current system health" },
  "children": [
    { "type": "Stack", "props": { "direction": "horizontal" }, "children": [
      { "type": "Badge", "props": { "label": "Healthy", "variant": "default" } },
      { "type": "Badge", "props": { "label": "v2.1.0", "variant": "outline" } }
    ]},
    { "type": "Progress", "props": { "label": "CPU Usage", "value": 67 } }
  ]
}
\`\`\`

Use \`\`\`ui blocks when the user asks for dashboards, metrics, data summaries, tables, status reports, or any structured information. You can still use regular markdown for conversational text. Mix markdown and ui blocks freely in a single response.`;

/**
 * Load system prompt following same priority as terminal:
 * 1. ~/.hasna/assistants/ASSISTANTS.md (global)
 * 2. .assistants/ASSISTANTS.md (project, if applicable)
 * 3. Default fallback
 */
function readPromptIfExists(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

async function loadSystemPrompt(sessionId?: string): Promise<string> {
  const prompts: string[] = [];

  // Global prompt: ~/.hasna/assistants/ASSISTANTS.md
  const globalPath = join(homedir(), '.hasna', 'assistants', 'ASSISTANTS.md');
  const globalPrompt = readPromptIfExists(globalPath);
  if (globalPrompt) prompts.push(globalPrompt);

  // Project prompt: <session cwd>/.assistants/ASSISTANTS.md
  let sessionCwd: string | null = null;
  if (sessionId) {
    try {
      const { getDb } = await import('@/lib/db');
      const db = getDb();
      const row = db.prepare('SELECT cwd FROM persisted_sessions WHERE id = ?').get(sessionId) as {
        cwd?: string;
      } | undefined;
      sessionCwd = row?.cwd ?? null;
    } catch {
      sessionCwd = null;
    }
  }

  const projectPath = join(sessionCwd || process.cwd(), '.assistants', 'ASSISTANTS.md');
  const projectPrompt = readPromptIfExists(projectPath);
  if (projectPrompt) prompts.push(projectPrompt);

  if (prompts.length > 0) {
    return prompts.join('\n\n---\n\n');
  }

  // Default - matches packages/core/src/config.ts DEFAULT_SYSTEM_PROMPT
  return `You are a helpful AI assistant by Hasna, running in the terminal. Your name and capabilities are defined by your identity configuration — do not invent a name for yourself.

## Runtime Environment
- Use **Bun** as the default runtime for JavaScript/TypeScript scripts
- When creating scripts, use the shebang \`#!/usr/bin/env bun\`
- Prefer Bun APIs (Bun.file, Bun.write, etc.) over Node.js equivalents when available
- For package management, prefer \`bun install\` over \`npm install\`

## Code Style
- Write clean, readable code with meaningful variable names
- Add comments only when the logic isn't self-evident
- Prefer simple solutions over complex abstractions
- Use TypeScript when type safety is beneficial

## Communication
- Be concise and direct in responses
- Ask clarifying questions when requirements are ambiguous
- Explain your reasoning when making architectural decisions
- Use the ask_user tool to collect structured answers when you need details

## Task Management
- Use task tools (tasks_list, tasks_add, tasks_complete) to manage work items
- Check the task queue with tasks_list before starting multi-step work
- When the user mentions "tasks", "todo", or work items, use task tools - not connectors
- Complete tasks with tasks_complete when finished, or tasks_fail if blocked`;
}

export async function POST(request: Request) {
  try {
    const { messages, model, sessionId } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages are required' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY is not set. Add it to your environment variables.' },
        { status: 503 }
      );
    }

    const requestedModel = typeof model === 'string' ? model : '';
    const selectedModel = WEB_MODEL_IDS.has(requestedModel) ? requestedModel : DEFAULT_MODEL;
    const systemPrompt = `${await loadSystemPrompt(sessionId)}${UI_BLOCKS_PROMPT}`;

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey });

    // Save user message to shared DB if sessionId provided
    if (sessionId) {
      try {
        const { getDb } = await import('@/lib/db');
        const db = getDb();
        const lastMsg = messages[messages.length - 1];
        if (lastMsg?.role === 'user') {
          db.prepare(`
            INSERT OR IGNORE INTO session_messages (id, session_id, role, content, timestamp)
            VALUES (?, ?, 'user', ?, ?)
          `).run(`msg-${Date.now()}`, sessionId, lastMsg.content, Date.now());

          db.prepare(`UPDATE persisted_sessions SET updated_at = ? WHERE id = ?`)
            .run(Date.now(), sessionId);
        }
      } catch (e) {
        console.warn('[chat] Failed to persist user message:', e instanceof Error ? e.message : e);
      }
    }

    const encoder = new TextEncoder();
    let fullResponse = '';

    const stream = new ReadableStream({
      async start(controller) {
        const emit = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          // Build conversation messages for the API
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const conversationMessages: any[] = messages.map((m: { role: string; content: string }) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }));

          const MAX_TOOL_ROUNDS = 5;

          for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            const response = await anthropic.messages.create({
              model: selectedModel,
              max_tokens: 8192,
              system: systemPrompt,
              tools: TOOLS,
              messages: conversationMessages,
              stream: true,
            });

            // Collect content blocks from this response for the conversation history
            const contentBlocks: Array<Record<string, unknown>> = [];
            let currentToolUse: { id: string; name: string; inputJson: string } | null = null;
            let stopReason: string | null = null;

            for await (const event of response) {
              if (event.type === 'content_block_start') {
                if (event.content_block.type === 'text') {
                  contentBlocks.push({ type: 'text', text: '' });
                } else if (event.content_block.type === 'tool_use') {
                  currentToolUse = {
                    id: event.content_block.id,
                    name: event.content_block.name,
                    inputJson: '',
                  };
                  emit({ type: 'tool_use_start', tool: event.content_block.name, id: event.content_block.id });
                }
              } else if (event.type === 'content_block_delta') {
                const delta = event.delta;
                if ('text' in delta) {
                  fullResponse += delta.text;
                  // Update the last text block
                  const last = contentBlocks[contentBlocks.length - 1];
                  if (last && last.type === 'text') {
                    last.text = (last.text as string) + delta.text;
                  }
                  emit({ type: 'text', text: delta.text });
                } else if ('partial_json' in delta && currentToolUse) {
                  currentToolUse.inputJson += delta.partial_json;
                }
              } else if (event.type === 'content_block_stop') {
                if (currentToolUse) {
                  let input: unknown = {};
                  try { input = JSON.parse(currentToolUse.inputJson); } catch {}
                  contentBlocks.push({
                    type: 'tool_use',
                    id: currentToolUse.id,
                    name: currentToolUse.name,
                    input,
                  });
                  emit({ type: 'tool_use_complete', tool: currentToolUse.name, id: currentToolUse.id, input });
                  currentToolUse = null;
                }
              } else if (event.type === 'message_delta') {
                if ('stop_reason' in event.delta) {
                  stopReason = event.delta.stop_reason as string;
                }
              }
            }

            // If the model wants to use tools, execute them and loop
            if (stopReason === 'tool_use') {
              const toolUseBlocks = contentBlocks.filter(b => b.type === 'tool_use');

              // Add assistant message with all content blocks
              conversationMessages.push({
                role: 'assistant',
                content: contentBlocks,
              });

              // Execute each tool and build results
              const toolResults: Array<Record<string, unknown>> = [];
              for (const block of toolUseBlocks) {
                const toolName = block.name as string;
                const toolInput = block.input as Record<string, string>;
                const toolId = block.id as string;
                let result: string;

                try {
                  result = await executeTool(toolName, toolInput);
                } catch (err) {
                  result = `Error: ${err instanceof Error ? err.message : 'Tool execution failed'}`;
                }

                emit({ type: 'tool_result', id: toolId, tool: toolName, result: result.slice(0, 500) });
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: toolId,
                  content: result,
                });
              }

              // Add tool results as user message
              conversationMessages.push({
                role: 'user',
                content: toolResults,
              });

              // Continue the loop — Claude will respond to the tool results
              continue;
            }

            // No tool use → we're done
            break;
          }

          // Save assistant response to shared DB
          if (sessionId && fullResponse) {
            try {
              const { getDb } = await import('@/lib/db');
              const db = getDb();
              db.prepare(`
                INSERT OR IGNORE INTO session_messages (id, session_id, role, content, timestamp)
                VALUES (?, ?, 'assistant', ?, ?)
              `).run(`msg-${Date.now()}-resp`, sessionId, fullResponse, Date.now());
            } catch (e) {
              console.warn('[chat] Failed to persist assistant response:', e instanceof Error ? e.message : e);
            }
          }

          emit({ type: 'done' });
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : 'Stream error';
          emit({ type: 'error', error: errMsg });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to process chat request' },
      { status: 500 }
    );
  }
}
