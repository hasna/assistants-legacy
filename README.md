# @hasna/assistants

Personal AI assistant that runs in your terminal — powered by the AI SDK

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

List, search, status, and history commands are compact by default so they stay safe for agent terminals. Use `--limit <n>` and `--cursor <n>` to page through rows, `--verbose` for wider previews, `--json` for machine-readable output, and the matching `show`/`read`/`get` command or `--full` when you need complete detail.

Examples:

```bash
assistants sessions list --limit 10
assistants sessions <session-id> --verbose
assistants sessions <session-id> --full
assistants search "auth bug" --limit 5 --json
```

## Storage

This package stores assistant data locally under the Hasna data directory. It does not require the shared cloud package.

Programmatic storage helpers are exported from `@hasna/assistants/storage`:

```ts
import { getAssistantsStorageStatus, storagePush } from "@hasna/assistants/storage";

console.log(getAssistantsStorageStatus().local.dbPath);
await storagePush();
```

The CLI exposes the same surface:

```bash
assistants storage status --json
assistants storage push
assistants storage pull
assistants storage sync
```

Remote sync is optional and uses a package-owned SQLite snapshot in S3:

- `HASNA_ASSISTANTS_STORAGE_MODE=local|remote|hybrid`
- `HASNA_ASSISTANTS_S3_BUCKET=hasna-xyz-opensource-assistants-prod`
- `HASNA_ASSISTANTS_S3_PREFIX=assistants/`
- `HASNA_ASSISTANTS_AWS_REGION=us-east-1`
- `HASNA_ASSISTANTS_DB_PATH=/path/to/assistants.db`

## Data Directory

Data is stored in `~/.hasna/assistants/`.

## License

Apache-2.0 -- see [LICENSE](LICENSE)
