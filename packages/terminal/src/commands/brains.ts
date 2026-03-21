// brains subcommand for assistants CLI
// Usage: assistants brains <gather|train|model> [options]

import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getConfigDir } from '@hasna/assistants-core';
import { gatherTrainingData, getActiveModel, setActiveModel, clearActiveModel, DEFAULT_MODEL } from '@hasna/assistants-core';

function printSuccess(msg: string): void {
  console.log(`✓ ${msg}`);
}

function printError(msg: string): void {
  console.error(`✗ ${msg}`);
}

function printInfo(msg: string): void {
  console.log(`ℹ ${msg}`);
}

function printUsage(): void {
  console.log(`
assistants brains — Fine-tuned model training and management

Usage:
  assistants brains gather [options]         Gather training data and write JSONL
  assistants brains train [options]          Start a fine-tuning job
  assistants brains model                    Show active model
  assistants brains model set <model-id>     Set the active fine-tuned model
  assistants brains model clear              Clear the active model (revert to default)

gather options:
  --limit <n>        Maximum number of examples
  --since <date>     Only include sessions since this date (ISO 8601)
  --output <dir>     Output directory (default: ~/.assistants/training/)
  --json             Output result summary as JSON

train options:
  --base-model <m>   Base model (default: gpt-4o-mini-2024-07-18)
  --provider <p>     Provider: openai|thinker-labs (default: openai)
  --dataset <path>   Path to JSONL dataset (auto-detects latest)
  --name <name>      Display name for the fine-tuned model
  --json             Output result as JSON
`);
}

export async function runBrainsCommand(argv: string[]): Promise<void> {
  // argv is process.argv slice starting from 'brains'
  const sub = argv[0]; // gather | train | model | undefined

  if (!sub || sub === '--help' || sub === '-h') {
    printUsage();
    process.exit(0);
  }

  // ── gather ────────────────────────────────────────────────────────────────

  if (sub === 'gather') {
    const isJson = argv.includes('--json');
    const limitIdx = argv.indexOf('--limit');
    const limit = limitIdx !== -1 ? parseInt(argv[limitIdx + 1] ?? '0', 10) : undefined;
    const sinceIdx = argv.indexOf('--since');
    const sinceStr = sinceIdx !== -1 ? argv[sinceIdx + 1] : undefined;
    const outputIdx = argv.indexOf('--output');
    const outputDir =
      outputIdx !== -1 ? argv[outputIdx + 1] : join(getConfigDir(), 'training');

    const since = sinceStr ? new Date(sinceStr) : undefined;
    if (since && isNaN(since.getTime())) {
      printError(`Invalid date: ${sinceStr}`);
      process.exit(1);
    }

    if (!isJson) printInfo('Gathering training data from sessions...');

    const result = await gatherTrainingData({ limit, since });

    if (!outputDir) {
      printError('Could not resolve output directory.');
      process.exit(1);
    }

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outputPath = join(outputDir, `assistants-training-${timestamp}.jsonl`);

    const jsonl = result.examples.map((ex) => JSON.stringify(ex)).join('\n');
    writeFileSync(outputPath, jsonl + '\n', 'utf-8');

    if (isJson) {
      console.log(JSON.stringify({ source: result.source, count: result.count, path: outputPath }));
    } else {
      printSuccess(`Gathered ${result.count} training examples from sessions`);
      console.log(`  Output: ${outputPath}`);
    }
    process.exit(0);
  }

  // ── train ─────────────────────────────────────────────────────────────────

  if (sub === 'train') {
    const isJson = argv.includes('--json');
    const baseModelIdx = argv.indexOf('--base-model');
    const baseModel = baseModelIdx !== -1 ? (argv[baseModelIdx + 1] ?? 'gpt-4o-mini-2024-07-18') : 'gpt-4o-mini-2024-07-18';
    const providerIdx = argv.indexOf('--provider');
    const provider = providerIdx !== -1 ? (argv[providerIdx + 1] ?? 'openai') : 'openai';
    const datasetIdx = argv.indexOf('--dataset');
    const nameIdx = argv.indexOf('--name');
    const nameArg = nameIdx !== -1 ? argv[nameIdx + 1] : undefined;

    let datasetPath = datasetIdx !== -1 ? argv[datasetIdx + 1] : undefined;
    if (!datasetPath) {
      const trainingDir = join(getConfigDir(), 'training');
      if (!existsSync(trainingDir)) {
        printError('No training data found. Run `assistants brains gather` first.');
        process.exit(1);
      }
      const files = readdirSync(trainingDir)
        .filter((f) => f.endsWith('.jsonl'))
        .sort()
        .reverse();
      const latestFile = files[0];
      if (!latestFile) {
        printError('No JSONL training files found. Run `assistants brains gather` first.');
        process.exit(1);
      }
      datasetPath = join(trainingDir, latestFile);
    }

    if (!datasetPath || !existsSync(datasetPath)) {
      printError(`Dataset file not found: ${datasetPath ?? '(unresolved)'}`);
      process.exit(1);
    }

    if (!isJson) printInfo(`Starting fine-tuning job with dataset: ${datasetPath}`);

    let brainsSDK: Record<string, unknown>;
    try {
      // @ts-ignore — optional peer dependency
      brainsSDK = (await import('@hasna/brains')) as Record<string, unknown>;
    } catch {
      printError('@hasna/brains is not installed. Run `bun add @hasna/brains` to enable training.');
      process.exit(1);
    }

    const startFinetune = brainsSDK['startFinetune'] as
      | ((opts: Record<string, unknown>) => Promise<Record<string, unknown>>)
      | undefined;
    if (typeof startFinetune !== 'function') {
      printError('@hasna/brains does not export startFinetune. Please update @hasna/brains.');
      process.exit(1);
    }

    const modelName = nameArg ?? `assistants-${new Date().toISOString().slice(0, 10)}`;
    const jobResult = await startFinetune({ provider, baseModel, datasetPath, name: modelName });

    if (isJson) {
      console.log(JSON.stringify(jobResult));
    } else {
      printSuccess(`Fine-tuning job started: ${String(jobResult['jobId'] ?? '(unknown)')}`);
      console.log(`  Provider:   ${provider}`);
      console.log(`  Base model: ${baseModel}`);
      console.log(`  Name:       ${modelName}`);
      if (jobResult['jobId']) {
        console.log();
        printInfo('Use `assistants brains model set <model-id>` once training completes.');
      }
    }
    process.exit(0);
  }

  // ── model ─────────────────────────────────────────────────────────────────

  if (sub === 'model') {
    const modelSub = argv[1]; // set | clear | get | undefined

    if (!modelSub || modelSub === 'get') {
      const active = getActiveModel();
      const isDefault = active === DEFAULT_MODEL;
      const isJson = argv.includes('--json');
      if (isJson) {
        console.log(JSON.stringify({ activeModel: active, isDefault }));
      } else {
        console.log(isDefault ? `Active model: ${active} (default)` : `Active model: ${active}`);
      }
      process.exit(0);
    }

    if (modelSub === 'set') {
      const modelId = argv[2];
      if (!modelId) {
        printError('Usage: assistants brains model set <model-id>');
        process.exit(1);
      }
      setActiveModel(modelId);
      printSuccess(`Active model set to: ${modelId}`);
      process.exit(0);
    }

    if (modelSub === 'clear') {
      clearActiveModel();
      printSuccess(`Active model cleared. Using default: ${DEFAULT_MODEL}`);
      process.exit(0);
    }

    printError(`Unknown model subcommand: ${modelSub}. Use: get | set <id> | clear`);
    process.exit(1);
  }

  printError(`Unknown brains subcommand: ${sub}`);
  printUsage();
  process.exit(1);
}
