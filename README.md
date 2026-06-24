# @hasna/assistants

Legacy CLI distribution for Hasna Assistants. This package installs the
`assistants` terminal app; typed SDK and MCP usage are published as separate
packages.

[![npm](https://img.shields.io/npm/v/@hasna/assistants)](https://www.npmjs.com/package/@hasna/assistants)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

## Install

```bash
npm install -g @hasna/assistants
```

## CLI Usage

```bash
assistants --help
```

## Package Surface

`@hasna/assistants` is intentionally CLI-only. It does not expose top-level
`exports` or `types`, because importing the CLI package would couple SDK users
to terminal UI startup code, bundled command assets, and Bun-specific runtime
behavior.

Use these package surfaces instead:

- `@hasna/assistants-sdk` for typed TypeScript/JavaScript SDK imports that
  connect to a local assistant API.
- `@hasna/assistants-mcp` for the MCP server binary and MCP-specific runtime
  integration.
- `@hasna/assistants` for global CLI installation and terminal usage.

Example SDK install:

```bash
npm install @hasna/assistants-sdk
```

```ts
import { AssistantsClient } from "@hasna/assistants-sdk";

const client = new AssistantsClient({ port: 3456 });
const answer = await client.ask("Summarize today's tasks");
console.log(answer);
```

Example MCP install:

```bash
npm install -g @hasna/assistants-mcp
assistants-mcp --help
```

This repository is retained for compatibility with existing CLI installs. New
automation should depend directly on the SDK or MCP package rather than treating
the root CLI package as an importable library.

## Cloud Sync

This package supports cloud sync via `@hasna/cloud`:

```bash
cloud setup
cloud sync push --service assistants
cloud sync pull --service assistants
```

## Data Directory

Data is stored in `~/.hasna/assistants/`.

## License

Apache-2.0 -- see [LICENSE](LICENSE)
