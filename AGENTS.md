# Agent Instructions

## Project: @hasna/assistants

Open-source terminal AI assistant published on npm as `@hasna/assistants`.

## What This Project Is

A general-purpose AI assistant that runs in your terminal. It's not just for coding — it handles research, writing, task management, automation, and more. Think of it as a personal assistant you talk to in your terminal.

Key capabilities:
- Interactive chat with Claude (and other LLMs)
- Execute bash commands, read/write files
- Custom skills (reusable prompt templates)
- Hooks (lifecycle interceptors for safety and automation)
- Connectors (integrations with external services)
- Memory persistence across sessions (SQLite)
- Voice input/output (optional)
- Multi-agent coordination (swarm)
- Scheduling and background tasks

## Repository Structure

This is a monorepo with 4 packages:

| Package | Purpose |
|---------|---------|
| `packages/core` | Agent loop, tools, skills, hooks, LLM client, connectors, memory — the brain |
| `packages/terminal` | Ink-based terminal UI — the face |
| `packages/shared` | Types, model catalog, utilities — shared between all packages |
| `packages/runtime-bun` | Bun-specific bindings (SQLite, filesystem) — the platform layer |

The root `build.ts` bundles everything into a single `dist/index.js` for npm publishing.

## Development Workflow

```bash
# Install dependencies
pnpm install

# Run in development
pnpm dev

# Build for distribution
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck
```

## Key Decisions

- **Bun-first**: We use Bun as the runtime. All Bun APIs are preferred over Node equivalents.
- **SQLite for persistence**: Local-first. No external database servers needed. Everything stores in `~/.assistants/`.
- **Single-file distribution**: The build bundles all workspace packages into one `dist/index.js`. Zero runtime npm dependencies.
- **Skills over plugins**: Extensibility is through SKILL.md files (declarative prompts), not code plugins.
- **Hooks for safety**: Lifecycle hooks validate tool usage, block dangerous commands, inject context.

## What We're Building

This is the open-source version of the assistant. The goal is to make it:

1. **Easy to install**: `bun add -g @hasna/assistants` and you're running
2. **Works standalone**: No servers, no databases to set up. Just an API key and go.
3. **Extensible**: Skills, hooks, and connectors let users customize everything
4. **Multi-model**: Claude is the default, but OpenAI and other providers are supported
5. **Privacy-first**: Everything runs locally. Data stays on your machine in SQLite.

## Contributing Guidelines

- Write tests for new features
- Follow Conventional Commits
- Keep the single-file build working — if you add a dependency, make sure it bundles
- Don't break the standalone experience — the assistant must work with just `ANTHROPIC_API_KEY`
- UI components go in `packages/terminal/src/components/`
- Core logic goes in `packages/core/src/`
- Shared types go in `packages/shared/src/`

---

## Using open-assistants as an AI Agent Tool

If you are an AI agent (Claude, Codex, or custom) wanting to **use** open-assistants
as a tool, this section is for you.

### Option 1: MCP Server (recommended for Claude Code / Claude Desktop)

```bash
# Install
bun add -g @hasna/assistants @hasna/assistants-mcp

# Register with Claude Code
assistants mcp --claude
# or: claude mcp add --transport stdio --scope user assistants -- assistants-mcp
```

**Available MCP tools:**

| Tool | Purpose |
|------|---------|
| `chat` | Multi-turn conversation with full tool access |
| `run_prompt` | One-shot prompt (no session overhead) |
| `list_sessions` | List resumable sessions |
| `get_session` | Inspect a session's messages |
| `list_skills` | List available skills |
| `execute_skill` | Run a skill by name |
| `describe_tools` | Get full tool documentation on demand |
| `search_tools` | Find tools by keyword |

Tools use **lean stubs** — call `describe_tools(["chat"])` for full parameter docs.

### Option 2: REST API + SDK

```bash
# Start the assistant (exposes REST API on port 3456)
assistants &

# SDK
bun add @hasna/assistants-sdk
```

```typescript
import { fromEnv } from '@hasna/assistants-sdk';
const c = fromEnv(); // reads ASSISTANTS_URL or ASSISTANTS_PORT

await c.isAlive()                        // → true/false
await c.ask('Summarize this repo')       // → string
await c.chat('msg', { onChunk: ... })    // streaming
await c.listSessions(10)                 // recent sessions
await c.getMemories('architecture')      // memory query
await c.notify('Build done', 'success')  // push notification
```

**Environment variables:**
- `ASSISTANTS_URL` — full base URL (highest priority)
- `ASSISTANTS_PORT` — port (default: 3456)
- `ASSISTANTS_HOST` — host (default: 127.0.0.1)
- `ASSISTANTS_PROFILE` — named profile (e.g. `work`, `personal`)

**@hasna ecosystem port map** (for cross-tool SDK integration):
| Tool | Port | SDK env var |
|------|------|-------------|
| assistants (local API) | 3456 | `ASSISTANTS_URL` |
| economy | 3456 | `ECONOMY_URL` |
| configs | 3457 | `CONFIGS_URL` |
| sessions | 3458 | `SESSIONS_URL` |
| attachments | 3459 | `ATTACHMENTS_URL` |
| emails | 3900 | `EMAILS_URL` |
| todos | 19427 | `TODOS_URL` |
| mementos | 19428 | `MEMENTOS_URL` |
| assistants (web) | 3000 | `ASSISTANTS_WEB_PORT` |

### Option 3: Headless CLI

```bash
# One-shot query
assistants -p "What does this codebase do?"

# JSON output (for parsing by other agents)
assistants -p "List all API endpoints" --output-format json

# Streaming JSON events
assistants -p "Analyze dependencies" --output-format stream-json

# Auto-approve tools for automation
assistants -p "Fix the failing test" --allowed-tools "Read,Edit,Bash"

# Continue a specific session
assistants -p "Continue" --resume <session-id>

# Custom model
assistants -p "..." --model claude-sonnet-4-6
```

### Agent Workflow Pattern

```bash
# Start work
mementos memory-inject --project <project> --format compact  # load context
assistants -p "$(todos show <task-id> --brief)"               # start session

# Do work via MCP or SDK
# ...

# End work
assistants sessions list  # find session ID
sessions ingest           # archive to @hasna/sessions
todos done <id>           # complete task with evidence
mementos memory-save      # save key learnings
```

### Skills — Reusable Prompts

```bash
# Discover skills via MCP
{"tool": "list_skills"}

# Execute a skill
{"tool": "execute_skill", "input": {"skill_name": "commit"}}
{"tool": "execute_skill", "input": {"skill_name": "review-pr", "arguments": "123"}}
```

User skills: `~/.assistants/skills/<name>/SKILL.md`
Project skills: `.assistants/skills/<name>/SKILL.md`

### Dashboard

```bash
assistants serve         # starts web dashboard on port 3000
assistants serve 8080    # custom port
# ASSISTANTS_WEB_PORT=8080 assistants serve
```

Dashboard shows: chat, sessions, memory, tasks, skills, heartbeat, connectors, and more.
