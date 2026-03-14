# @hasna/assistants-sdk

Zero-dependency TypeScript SDK for connecting to a local [@hasna/assistants](https://npmjs.com/package/@hasna/assistants) API server.

```bash
bun add @hasna/assistants-sdk
# or
npm install @hasna/assistants-sdk
```

## Usage

```ts
import { fromEnv, createClient, AssistantsClient } from '@hasna/assistants-sdk';

// From environment variables (ASSISTANTS_PORT, ASSISTANTS_HOST)
const client = fromEnv();

// Or explicitly
const client = createClient({ port: 3456 });

// Or construct directly
const client = new AssistantsClient({ port: 3456, host: '127.0.0.1' });
```

## API

### Health

```ts
await client.getStatus();
// → { running: true, uptime: 12345, sessionId: 'abc', version: '1.1.92' }

await client.isAlive();
// → true | false
```

### Chat

```ts
// Streaming (SSE)
const result = await client.chat('What is 2+2?', {
  onChunk: (text) => process.stdout.write(text),
  onDone: () => console.log('\n✓'),
  onError: (err) => console.error(err),
});
// result.text = '4'

// One-shot (waits for full response)
const answer = await client.ask('What is 2+2?');
// → '4'
```

### Sessions

```ts
// List recent sessions
const sessions = await client.listSessions(20);
// → [{ id, startedAt, messageCount, cwd, assistantId }, ...]

// Get session details
const session = await client.getSession('session-id');
// → { id, messages, cwd, startedAt, ... }
```

### Memories

```ts
// Get all memories
const memories = await client.getMemories();
// → [{ key, value, scope, category, importance }, ...]

// Filter by keyword
const results = await client.getMemories('auth');
```

### Notifications

```ts
// Get recent notifications
const notifications = await client.getNotifications();
// → [{ id, message, timestamp, type }, ...]

// Push a notification to the running assistant
await client.notify('Build complete', 'success');
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ASSISTANTS_PORT` | `3456` | Port of the local API server |
| `ASSISTANTS_HOST` | `127.0.0.1` | Host of the local API server |

## Requirements

The assistant API server must be running. Start it by launching `@hasna/assistants` in the terminal — it automatically starts a local API server on port 3456.

## Compatibility

Works in Node.js ≥18, Bun, Deno, and browsers (with a running local server accessible from the page).

## License

Apache-2.0
