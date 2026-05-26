# Feature Dependencies

This document describes the features available in the Assistants terminal package and their dependencies.

## Feature Matrix

| Feature | Required | Dependencies | Environment Variables | Notes |
|---------|----------|--------------|----------------------|-------|
| **Core Chat** | Yes | None | One AI SDK provider key | Basic AI chat functionality |
| **Bash Tool** | Yes | None | None | Execute shell commands |
| **Filesystem Tools** | Yes | None | None | Read/write/edit files |
| **Web Fetch** | Yes | None | None | Fetch web content |
| **Skills** | Yes | None | None | Local SKILL.md files |
| **Hooks** | Yes | None | None | Local hooks.json |
| **Commands** | Yes | None | None | Slash commands (/help, /exit, etc.) |
| **Projects** | Yes | None | None | Local SQLite storage |
| **Plans** | Yes | None | None | Task planning within projects |
| **Scheduling** | Yes | None | None | Cron-like scheduled tasks |
| **Session Management** | Yes | None | None | Local session persistence |
| **Connectors** | Optional | `connectors` CLI | Varies per connector | Third-party integrations |
| **Voice TTS** | Optional | ElevenLabs API | `ELEVENLABS_API_KEY` | Text-to-speech output |
| **Voice STT** | Optional | OpenAI Whisper API | `OPENAI_API_KEY` | Speech-to-text input |
| **System TTS** | Optional | macOS `say` command | None | Built-in macOS TTS |
| **System STT** | Optional | macOS Dictation | None | Built-in macOS speech recognition |
| **Email Inbox** | Optional | AWS S3, SES | `AWS_*` credentials | Receive/send emails |
| **Secrets Storage** | Optional | AWS Secrets Manager | `AWS_*` credentials | Secure credential storage |
| **Wallet** | Optional | AWS Secrets Manager | `AWS_*` credentials | Crypto wallet management |
| **Identity** | Optional | None | None | Assistant identity management |

## Configuration Levels

### Minimum Configuration (Basic Chat)

The only required configuration to run the terminal is one supported provider key:

```bash
export ANTHROPIC_API_KEY="<anthropic-api-key>"
# or OPENAI_API_KEY / GEMINI_API_KEY / XAI_API_KEY / MISTRAL_API_KEY
```

This enables:
- AI chat through the AI SDK
- Bash command execution
- File reading/writing/editing
- Web content fetching
- Local skills and hooks
- Session history persistence

### Recommended Configuration

For most users, we recommend:

```bash
# Required: one supported provider key
export ANTHROPIC_API_KEY="<anthropic-api-key>"
# or OPENAI_API_KEY / GEMINI_API_KEY / XAI_API_KEY / MISTRAL_API_KEY

# Optional but useful
export EXA_API_KEY="..."  # Enhanced web search
```

This adds:
- Better web search capabilities via Exa

### Full-Featured Configuration

For all features:

```bash
# Required: one supported provider key
export ANTHROPIC_API_KEY="<anthropic-api-key>"
# or OPENAI_API_KEY / GEMINI_API_KEY / XAI_API_KEY / MISTRAL_API_KEY

# Voice features
export ELEVENLABS_API_KEY="..."  # Premium TTS
export OPENAI_API_KEY="..."      # Whisper STT

# AWS features (inbox, secrets, wallet)
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_REGION="us-east-1"

# Optional enhancements
export EXA_API_KEY="..."  # Web search
```

## Environment Variables Reference

| Variable | Required | Feature | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | One LLM key required | Core | Anthropic models |
| `OPENAI_API_KEY` | One LLM key required | Core / Voice STT | OpenAI models and Whisper speech-to-text |
| `GEMINI_API_KEY` | One LLM key required | Core | Google Gemini models |
| `XAI_API_KEY` | One LLM key required | Core | xAI models |
| `MISTRAL_API_KEY` | One LLM key required | Core | Mistral models |
| `ELEVENLABS_API_KEY` | No | Voice TTS | ElevenLabs text-to-speech |
| `EXA_API_KEY` | No | Web Search | Enhanced semantic search |
| `AWS_ACCESS_KEY_ID` | No | AWS Features | AWS authentication |
| `AWS_SECRET_ACCESS_KEY` | No | AWS Features | AWS authentication |
| `AWS_REGION` | No | AWS Features | AWS region (default: us-east-1) |

## Built-in Tools

These tools are always available and require no additional configuration:

### Bash Tool
Execute shell commands with configurable timeout and working directory tracking.

### Filesystem Tools
- **Read**: Read file contents
- **Write**: Create or overwrite files
- **Edit**: Make precise edits to existing files
- **Glob**: Find files by pattern
- **Grep**: Search file contents

### Web Tools
- **WebFetch**: Retrieve and process web page content
- **WebSearch**: Search the web (enhanced with Exa API if available)

### Feedback Tool
Request user input during task execution.

### Wait/Sleep Tools
Pause execution for specified durations.

## Optional Integrations

### Connectors
Connectors allow integration with external services like Notion, Google Drive, Gmail, etc.

Connectors are managed via the `connectors` CLI. Install any connector with a single command:

**Installation:**
```bash
# Example: Install Notion connector
connectors install notion
```

### Voice Features

**ElevenLabs TTS**: High-quality voice synthesis
```bash
export ELEVENLABS_API_KEY="your-key"
```

**OpenAI Whisper STT**: Accurate speech recognition
```bash
export OPENAI_API_KEY="your-key"
```

**System Voice** (macOS only): Uses built-in `say` command and Dictation - no API key needed.

### AWS Features

Email inbox, secrets storage, and wallet features require AWS credentials:

```bash
export AWS_ACCESS_KEY_ID="your-key"
export AWS_SECRET_ACCESS_KEY="your-secret"
export AWS_REGION="us-east-1"
```

## Feature Detection

The terminal automatically detects available features at startup based on:

1. Environment variables present
2. CLI tools in PATH (for connectors)
3. Platform capabilities (macOS for system voice)

Missing optional features are silently skipped - the terminal will work with whatever is available.

## Troubleshooting

### "No LLM provider API key set"
Set one provider key: `export ANTHROPIC_API_KEY="<anthropic-api-key>"` or `OPENAI_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`, or `MISTRAL_API_KEY`.

### Connector not found
Install the connector via `connectors install <name>`, e.g., `connectors install notion`

### Voice not working
- **ElevenLabs**: Check `ELEVENLABS_API_KEY` is set correctly
- **Whisper**: Check `OPENAI_API_KEY` is set correctly
- **System voice**: Only available on macOS

### AWS features not working
Ensure all three AWS variables are set:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
