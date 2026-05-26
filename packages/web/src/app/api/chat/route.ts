import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import {
  jsonSchema,
  stepCountIs,
  streamText,
  tool,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';
import { TOOLS, executeTool } from '@/lib/tools';
import { DEFAULT_MODEL, WEB_MODEL_IDS } from '@/lib/models';
import { getProviderInfo, type LLMProvider } from '@hasna/assistants-shared';

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

function parseProviderModel(modelId: string): { provider: LLMProvider; model: string } {
  const separator = modelId.indexOf(':');
  if (separator <= 0 || separator === modelId.length - 1) {
    throw new Error(`Invalid AI SDK model id "${modelId}"`);
  }

  const provider = modelId.slice(0, separator) as LLMProvider;
  const providerInfo = getProviderInfo(provider);
  if (!providerInfo) {
    throw new Error(`Unsupported AI SDK provider "${provider}"`);
  }

  return { provider, model: modelId.slice(separator + 1) };
}

function resolveApiKey(provider: LLMProvider): string | undefined {
  const providerInfo = getProviderInfo(provider);
  return providerInfo ? process.env[providerInfo.apiKeyEnv] : undefined;
}

function createModel(modelId: string): LanguageModel {
  const { provider, model } = parseProviderModel(modelId);
  const apiKey = resolveApiKey(provider);
  if (!apiKey) {
    const providerInfo = getProviderInfo(provider);
    const envName = providerInfo?.apiKeyEnv ?? `${provider.toUpperCase()}_API_KEY`;
    throw new Error(`${envName} is not set. Add it to your environment variables.`);
  }

  switch (provider) {
    case 'anthropic':
      return createAnthropic({ apiKey })(model);
    case 'openai':
      return createOpenAI({ apiKey })(model);
    case 'xai':
      return createXai({ apiKey })(model);
    case 'mistral':
      return createMistral({ apiKey })(model);
    case 'google':
      return createGoogleGenerativeAI({ apiKey })(model);
  }
}

function buildTools(): ToolSet {
  const tools: ToolSet = {};
  for (const item of TOOLS) {
    tools[item.name] = tool({
      description: item.description,
      inputSchema: jsonSchema(item.input_schema as Record<string, unknown>),
      execute: async (input) => executeTool(item.name, input as Record<string, string>),
    });
  }
  return tools;
}

function buildMessages(messages: Array<{ role: string; content: string }>): ModelMessage[] {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: message.content,
    }));
}

export async function POST(request: Request) {
  try {
    const { messages, model, sessionId } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages are required' }, { status: 400 });
    }

    const requestedModel = typeof model === 'string' ? model : '';
    const selectedModel = WEB_MODEL_IDS.has(requestedModel) ? requestedModel : DEFAULT_MODEL;
    const systemPrompt = `${await loadSystemPrompt(sessionId)}${UI_BLOCKS_PROMPT}`;
    const languageModel = createModel(selectedModel);

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
          const result = streamText({
            model: languageModel,
            maxOutputTokens: 8192,
            system: systemPrompt,
            messages: buildMessages(messages),
            tools: buildTools(),
            stopWhen: stepCountIs(5),
          });

          for await (const part of result.fullStream) {
            if (part.type === 'text-delta') {
              fullResponse += part.text;
              emit({ type: 'text', text: part.text });
            } else if (part.type === 'tool-call') {
              emit({ type: 'tool_use_start', tool: part.toolName, id: part.toolCallId });
              emit({ type: 'tool_use_complete', tool: part.toolName, id: part.toolCallId, input: part.input });
            } else if (part.type === 'tool-result') {
              const output = typeof part.output === 'string' ? part.output : JSON.stringify(part.output);
              emit({ type: 'tool_result', id: part.toolCallId, tool: part.toolName, result: output.slice(0, 500) });
            } else if (part.type === 'tool-error') {
              const error = part.error instanceof Error ? part.error.message : String(part.error);
              emit({ type: 'tool_result', id: part.toolCallId, tool: part.toolName, result: `Error: ${error}` });
            } else if (part.type === 'error') {
              const error = part.error instanceof Error ? part.error.message : String(part.error);
              emit({ type: 'error', error });
            }
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
