# @hasna/assistants-mcp

MCP (Model Context Protocol) server for running AI assistants. Connect your assistants to Claude Desktop, Cursor, or any MCP-compatible client.

## MCP Profiles (token optimization)

Set `ASSISTANTS_MCP_PROFILE` to control how many tools are exposed:

| Profile | Tools | Use when |
|---------|-------|----------|
| `minimal` | 3 | Just running prompts — saves ~63% token cost |
| `standard` | 5 | Day-to-day use — chat + session management |
| `full` (default) | 8 | All tools including skills |

```bash
# In your MCP client config or environment
ASSISTANTS_MCP_PROFILE=standard assistants-mcp
ASSISTANTS_MCP_PROFILE=minimal assistants-mcp   # only run_prompt + discovery tools
```

All profiles include `describe_tools` and `search_tools` for on-demand discovery.

## Install

```bash
bun add -g @hasna/assistants-mcp

# Then install into Claude Code:
assistants mcp --claude
```

Or manually add to Claude Code:
```bash
claude mcp add --transport stdio --scope user assistants -- assistants-mcp
```

## Tools

This server uses **lean stubs** — tool descriptions are minimal by default to save tokens. Call `describe_tools` or `search_tools` to get full documentation on demand.

List and session tools are compact by default. `list_sessions`, `list_skills`, `get_session`, and the `assistants://sessions*` resources support `limit`, `cursor`, `verbose`, and explicit `full` detail where applicable. The default session view is a bounded preview; request `full=true` only when the complete transcript is needed.

| Tool | Description |
|------|-------------|
| `chat` | Send a message to the assistant (supports session resumption) |
| `run_prompt` | Run a one-shot prompt, no session created |
| `list_sessions` | List previous sessions that can be resumed |
| `get_session` | Get messages and metadata of a session |
| `list_skills` | List available skills (SKILL.md files) |
| `execute_skill` | Run a named skill with arguments |
| `describe_tools` | Get full docs for tools (no args = all tools) |
| `search_tools` | Search tools by keyword |

## Setup

### Claude Code (recommended)

```bash
assistants mcp --claude
# or
claude mcp add --transport stdio --scope user assistants -- assistants-mcp
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "assistants": {
      "command": "assistants-mcp",
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

### Cursor

Add to your MCP settings:

```json
{
  "assistants": {
    "command": "assistants-mcp"
  }
}
```

### Codex

```bash
assistants mcp --codex
```

## Development

```bash
# Run the MCP server directly
bun run packages/mcp/src/index.ts

# Build for distribution
cd packages/mcp && bun run build
```

## License

MIT
