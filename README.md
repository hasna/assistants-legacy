# @hasna/assistants

Personal AI assistant that runs in your terminal — powered by Claude

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
