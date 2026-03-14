# @hasna/assistants

A general-purpose AI assistant that runs in your terminal. Built with [Ink](https://github.com/vadimdemedes/ink), powered by [Claude](https://anthropic.com).

**Not just for coding** — this assistant helps with research, writing, task management, automation, and anything you need.

## Install

```bash
bun add -g @hasna/assistants
```

Or run directly:

```bash
bunx @hasna/assistants
```

## Quick Start

1. Set your API key:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

2. Start the assistant:

```bash
assistants
```

That's it. Start chatting.

## Features

- Interactive terminal chat with Claude
- Execute bash commands with approval
- Read, write, and edit files
- Web search and content fetching
- Custom skills (reusable prompt templates)
- Hooks (lifecycle interceptors for safety and automation)
- Memory persistence across sessions
- Session history and resumption
- Voice input/output (optional)
- Connectors for external services (Notion, Gmail, Linear, etc.)
- Multi-agent coordination
- Scheduling and background tasks
- Project and plan management

## CLI

```bash
# Interactive mode
assistants

# Short alias
ast

# Run a one-off prompt (headless)
assistants -p "What does this codebase do?"

# JSON output
assistants -p "Summarize this project" --output-format json

# Stream JSON events
assistants -p "Explain this code" --output-format stream-json

# Auto-approve specific tools
assistants -p "Fix the bug" --allowed-tools "Read,Edit,Bash"

# Continue last conversation
assistants --continue

# Resume a specific session
assistants --resume <session_id>
```

### Subcommands

```bash
# Install the MCP server into Claude Code
assistants mcp --claude

# Start the web dashboard (port 3000 by default)
assistants serve
assistants serve 8080

# Activity report (last 7 days)
assistants report
assistants report 30 --markdown

# Show current configuration
assistants config

# List recent sessions
assistants sessions list
assistants sessions <session_id>
```

### Profiles

Isolate configuration and data per project or context:

```bash
ASSISTANTS_PROFILE=work assistants        # → ~/.assistants/profiles/work
ASSISTANTS_PROFILE=personal assistants    # → ~/.assistants/profiles/personal
```

## Interactive Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/exit` | Exit the assistant |
| `/new` | Start a new session |
| `/skills` | List available skills |
| `/hooks` | Manage hooks |
| `/connectors` | List connectors |
| `/memory` | View/manage memory |
| `/model` | Show/change model |
| `/config` | Show/edit configuration |
| `/schedule` | Create a scheduled task |
| `/voice` | Toggle voice mode |

Prefix with `!` to run a shell command: `!ls -la`

## Skills

Skills are reusable prompts in SKILL.md files:

```markdown
---
name: code-review
description: Review code for issues
argument-hint: <file-path>
allowed-tools: Read, Grep
---

Review the code at $ARGUMENTS and provide feedback on:
1. Potential bugs
2. Performance issues
3. Security concerns
```

Place in `~/.assistants/skills/code-review/SKILL.md` or `.assistants/skills/code-review/SKILL.md`.

## Hooks

Hooks intercept assistant behavior at lifecycle points:

```json
{
  "PreToolUse": [
    {
      "matcher": "Bash",
      "hooks": [
        {
          "type": "command",
          "command": "./validate.sh",
          "timeout": 5000
        }
      ]
    }
  ]
}
```

Events: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SessionStart`, `SessionEnd`, `Stop`, and more.

## Configuration

```
~/.assistants/           # Global
├── config.json
├── sessions/
├── skills/
└── hooks.json

.assistants/             # Project-level
├── config.json
├── skills/
└── hooks.json
```

## MCP Server

Install the MCP server so Claude Code (and other MCP clients) can use the assistant:

```bash
# Install globally
bun add -g @hasna/assistants-mcp

# Register with Claude Code
assistants mcp --claude
# or: claude mcp add --transport stdio --scope user assistants -- assistants-mcp
```

Set `ASSISTANTS_MCP_PROFILE` to control which tools are exposed:

| Profile | Tools | Use when |
|---------|-------|----------|
| `minimal` | 3 | Just running prompts |
| `standard` | 5 | Day-to-day use |
| `full` (default) | 8 | All tools including skills |

## SDK

Connect to a running assistant from code or scripts:

```bash
bun add @hasna/assistants-sdk
```

```typescript
import { fromEnv } from '@hasna/assistants-sdk';

const client = fromEnv(); // reads ASSISTANTS_URL or ASSISTANTS_PORT

// Health check
await client.isAlive()

// One-shot query
const answer = await client.ask('What files are here?');

// Streaming
await client.chat('Explain this code', {
  onChunk: (text) => process.stdout.write(text),
});

// Sessions, memories, notifications
const sessions = await client.listSessions(10);
const memories = await client.getMemories({ scope: 'shared', category: 'knowledge' });
await client.notify('Build complete', 'success');
```

## Programmatic Usage

```typescript
import { EmbeddedClient } from '@hasna/assistants';

const client = new EmbeddedClient(process.cwd(), {
  systemPrompt: 'You are a helpful assistant.',
  allowedTools: ['Read', 'Write', 'Bash'],
});

client.onChunk((chunk) => {
  if (chunk.type === 'text') process.stdout.write(chunk.content);
});

await client.initialize();
await client.send('What files are in this directory?');
client.disconnect();
```

## Web Dashboard

```bash
assistants serve        # starts on port 3000
assistants serve 8080   # custom port
```

Browse sessions, memory, tasks, skills, schedules, and more at `http://localhost:3000`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API access |
| `OPENAI_API_KEY` | No | Whisper STT + OpenAI models |
| `ELEVENLABS_API_KEY` | No | Voice TTS |
| `EXA_API_KEY` | No | Enhanced web search |
| `ASSISTANTS_PROFILE` | No | Named profile (`work`, `personal`, etc.) |
| `ASSISTANTS_MCP_PROFILE` | No | MCP tool set: `minimal`, `standard`, `full` |
| `TODOS_URL` | No | Auto-inject pending tasks from @hasna/todos |
| `SESSIONS_URL` | No | Auto-inject recent sessions from @hasna/sessions |

## Requirements

- [Bun](https://bun.sh) v1.0+
- An [Anthropic API key](https://console.anthropic.com/)

## Development

```bash
git clone https://github.com/hasna/assistants.git
cd assistants
pnpm install
pnpm dev
```

## License

Apache-2.0
