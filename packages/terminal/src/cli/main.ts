/**
 * CLI argument parsing and main entry point
 * Extracted for testability
 */

export interface ParsedOptions {
  cwd: string;
  version: boolean;
  help: boolean;
  print: string | null;
  headlessTimeoutMs: number | null;
  outputFormat: 'text' | 'json' | 'stream-json';
  allowedTools: string[];
  systemPrompt: string | null;
  jsonSchema: string | null;
  continue: boolean;
  resume: string | null;
  cwdProvided: boolean;
  permissionMode: 'normal' | 'plan' | 'auto-accept' | null;
  worktree: string | boolean | null;
  /** LLM temperature override (0–2). Sets ASSISTANTS_TEMPERATURE env var. */
  temperature: number | null;
  /** Abort headless run if estimated cost (USD) exceeds this threshold. */
  costLimit: number | null;
  /** Skip session persistence and memory tools for this run. */
  noMemory: boolean;
  errors: string[];
}

/**
 * Check if a string looks like a flag (starts with -)
 */
function isFlag(arg: string | undefined): boolean {
  return arg !== undefined && arg.startsWith('-') && arg !== '--';
}

/**
 * Parse CLI arguments into options object
 * Supports:
 * - `--` (end-of-options) to allow prompts starting with `-`
 * - Proper handling of missing option values
 */
export function parseArgs(argv: string[]): ParsedOptions {
  const args = argv.slice(2);
  const options: ParsedOptions = {
    cwd: process.cwd(),
    version: false,
    help: false,
    print: null,
    headlessTimeoutMs: null,
    outputFormat: 'text',
    allowedTools: [],
    systemPrompt: null,
    jsonSchema: null,
    continue: false,
    resume: null,
    cwdProvided: false,
    permissionMode: null,
    worktree: null,
    temperature: null,
    costLimit: null,
    noMemory: false,
    errors: [],
  };

  let endOfOptions = false;
  const positionalArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // After --, treat all remaining args as positional
    if (arg === '--') {
      endOfOptions = true;
      continue;
    }

    // If past end-of-options, collect as positional
    if (endOfOptions) {
      positionalArgs.push(arg);
      continue;
    }

    // Version
    if (arg === '--version' || arg === '-v') {
      options.version = true;
      continue;
    }

    // Help
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    // Print (headless mode)
    // If next arg is missing, is a flag, or is '--' (end-of-options), set to empty string
    // The actual prompt will come from positional args after '--' if present
    if (arg === '--print' || arg === '-p') {
      const nextArg = args[i + 1];
      if (nextArg === undefined || isFlag(nextArg) || nextArg === '--') {
        // Missing value or end-of-options marker - set to empty string
        // Positional args after '--' will be used as the prompt if present
        options.print = '';
      } else {
        options.print = nextArg;
        i++;
      }
      continue;
    }

    // Output format
    if (arg === '--output-format') {
      const nextArg = args[i + 1];
      if (nextArg === undefined || isFlag(nextArg)) {
        options.errors.push('--output-format requires a value (text, json, or stream-json)');
      } else if (nextArg === 'text' || nextArg === 'json' || nextArg === 'stream-json') {
        options.outputFormat = nextArg;
        i++;
      } else {
        options.errors.push(`Invalid output format "${nextArg}". Valid options: text, json, stream-json`);
        i++;
      }
      continue;
    }

    // Allowed tools
    if (arg === '--allowed-tools' || arg === '--allowedTools') {
      const nextArg = args[i + 1];
      if (nextArg === undefined || isFlag(nextArg)) {
        options.errors.push(`${arg} requires a comma-separated list of tool names`);
      } else {
        // Normalize: split by comma, trim, filter empty, dedupe while preserving order
        const seen = new Set<string>();
        options.allowedTools = nextArg
          .split(',')
          .map((t) => t.trim())
          .filter((t) => {
            if (!t || seen.has(t)) return false;
            seen.add(t);
            return true;
          });
        i++;
      }
      continue;
    }

    // System prompt
    if (arg === '--system-prompt') {
      const nextArg = args[i + 1];
      if (nextArg === undefined || isFlag(nextArg)) {
        options.errors.push('--system-prompt requires a value');
      } else {
        options.systemPrompt = nextArg;
        i++;
      }
      continue;
    }

    // JSON schema
    if (arg === '--json-schema') {
      const nextArg = args[i + 1];
      if (nextArg === undefined || isFlag(nextArg)) {
        options.errors.push('--json-schema requires a JSON schema string');
      } else {
        options.jsonSchema = nextArg;
        i++;
      }
      continue;
    }

    // Headless timeout
    if (arg === '--headless-timeout' || arg === '--headless-timeout-ms') {
      const nextArg = args[i + 1];
      if (nextArg === undefined || isFlag(nextArg)) {
        options.errors.push(`${arg} requires a millisecond value`);
      } else {
        const parsed = Number(nextArg);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          options.errors.push(`${arg} must be a positive number of milliseconds`);
        } else {
          options.headlessTimeoutMs = Math.floor(parsed);
        }
        i++;
      }
      continue;
    }

    // Continue last session
    if (arg === '--continue' || arg === '-c') {
      options.continue = true;
      continue;
    }

    // Resume specific session
    if (arg === '--resume' || arg === '-r') {
      const nextArg = args[i + 1];
      if (nextArg === undefined || isFlag(nextArg)) {
        options.errors.push(`${arg} requires a session ID or name`);
      } else {
        options.resume = nextArg;
        i++;
      }
      continue;
    }

    // Working directory
    if (arg === '--cwd') {
      const nextArg = args[i + 1];
      if (nextArg === undefined || isFlag(nextArg)) {
        options.errors.push('--cwd requires a path');
      } else {
        options.cwd = nextArg;
        options.cwdProvided = true;
        i++;
      }
      continue;
    }

    // Permission mode
    if (arg === '--permission-mode' || arg === '--mode') {
      const nextArg = args[i + 1];
      if (nextArg === undefined || isFlag(nextArg)) {
        options.errors.push(`${arg} requires a value (normal, plan, or auto-accept)`);
      } else {
        const modeMap: Record<string, 'normal' | 'plan' | 'auto-accept'> = {
          normal: 'normal',
          plan: 'plan',
          auto: 'auto-accept',
          'auto-accept': 'auto-accept',
        };
        const mode = modeMap[nextArg.toLowerCase()];
        if (!mode) {
          options.errors.push(`Invalid permission mode "${nextArg}". Valid options: normal, plan, auto-accept`);
        } else {
          options.permissionMode = mode;
        }
        i++;
      }
      continue;
    }

    // Worktree (isolated working directory)
    if (arg === '--worktree') {
      const nextArg = args[i + 1];
      if (nextArg === undefined || isFlag(nextArg)) {
        // No name provided — auto-generate
        options.worktree = true;
      } else {
        options.worktree = nextArg;
        i++;
      }
      continue;
    }

    // Temperature
    if (arg === '--temperature') {
      const nextArg = args[i + 1];
      if (nextArg === undefined || isFlag(nextArg)) {
        options.errors.push('--temperature requires a number between 0 and 2');
      } else {
        const t = parseFloat(nextArg);
        if (!Number.isFinite(t) || t < 0 || t > 2) {
          options.errors.push(`--temperature must be between 0 and 2, got "${nextArg}"`);
        } else {
          options.temperature = t;
        }
        i++;
      }
      continue;
    }

    // Cost limit
    if (arg === '--cost-limit') {
      const nextArg = args[i + 1];
      if (nextArg === undefined || isFlag(nextArg)) {
        options.errors.push('--cost-limit requires a dollar amount (e.g. 0.50)');
      } else {
        const c = parseFloat(nextArg);
        if (!Number.isFinite(c) || c <= 0) {
          options.errors.push(`--cost-limit must be a positive dollar amount, got "${nextArg}"`);
        } else {
          options.costLimit = c;
        }
        i++;
      }
      continue;
    }

    // No memory (stateless run)
    if (arg === '--no-memory') {
      options.noMemory = true;
      continue;
    }

    // Unknown arg - treat as positional
    if (!arg.startsWith('-')) {
      positionalArgs.push(arg);
    }
  }

  // If -p was used and there are positional args after --, use them as the prompt
  if (options.print === '' && positionalArgs.length > 0) {
    options.print = positionalArgs.join(' ');
  }

  // If -p was never used but we have positional args after --, use as prompt
  if (options.print === null && positionalArgs.length > 0) {
    options.print = positionalArgs.join(' ');
  }

  return options;
}

export interface HeadlessOptions {
  prompt: string;
  cwd: string;
  outputFormat: 'text' | 'json' | 'stream-json';
  allowedTools?: string[];
  systemPrompt?: string;
  jsonSchema?: string;
  continue?: boolean;
  resume?: string | null;
  cwdProvided?: boolean;
  timeoutMs?: number | null;
  permissionMode?: 'normal' | 'plan' | 'auto-accept';
  /** LLM temperature override (0–2). Applied via ASSISTANTS_TEMPERATURE env var. */
  temperature?: number | null;
  /** Abort if estimated USD cost exceeds this amount. */
  costLimit?: number | null;
  /** Disable session persistence and memory read/write for this run. */
  noMemory?: boolean;
}

export interface MainDependencies {
  runHeadless: (options: HeadlessOptions) => Promise<void>;
  print: (message: string) => void;
  exit: (code: number) => void;
  VERSION: string;
}

/**
 * Main CLI entry point
 * Accepts dependencies for testability
 */
export async function main(
  argv: string[],
  deps: MainDependencies
): Promise<void> {
  const options = parseArgs(argv);
  const { runHeadless, print, exit, VERSION } = deps;

  // Handle parsing errors
  if (options.errors.length > 0) {
    for (const error of options.errors) {
      print(`Error: ${error}`);
    }
    exit(1);
    return;
  }

  // Handle version
  if (options.version) {
    print(`assistants v${VERSION}`);
    exit(0);
    return;
  }

  // Handle help
  if (options.help) {
    print(`
assistants - Your personal AI assistant

Usage:
  assistants [options]                    Start interactive mode
  assistants -p "<prompt>" [options]      Run in headless mode
  assistants mcp [--claude|--codex|--print]  Install MCP server
  assistants doctor [--json]              Health check (API key, config, integrations)
  assistants serve [port]                 Start web dashboard (default: 3000)
  assistants report [days]                Activity report (default: 7 days)
  assistants config [cwd]                 Show current configuration
  assistants sessions [list|<id>]         List or inspect sessions

Options:
  -h, --help                   Show this help message
  -v, --version                Show version number

Headless Mode:
  -p, --print <prompt>         Run non-interactively with the given prompt
  --output-format <format>     Output format: text (default), json, stream-json
  --allowed-tools <tools>      Comma-separated tools to auto-approve (e.g., "Read,Edit,Bash")
  --system-prompt <prompt>     Custom system prompt
  --json-schema <schema>       JSON Schema for structured output (use with --output-format json)
  --headless-timeout-ms <ms>   Abort headless run after the given timeout (ms)
  -c, --continue               Continue the most recent conversation
  -r, --resume <id_or_name>    Resume a session by ID or name
  --cwd <path>                 Set working directory
  --worktree [name]            Run in an isolated git worktree (auto-cleaned on exit)
  --permission-mode <mode>     Permission mode: normal, plan (read-only), auto-accept
  --temperature <0-2>          LLM temperature override (default: model default)
  --cost-limit <dollars>       Abort if estimated cost exceeds this USD amount
  --no-memory                  Stateless run — skip session persistence and memory

Examples:
  # Ask a question
  assistants -p "What does the auth module do?"

  # Run with JSON output
  assistants -p "Summarize this project" --output-format json

  # Stream JSON events
  assistants -p "Explain this code" --output-format stream-json

  # Auto-approve tools
  assistants -p "Fix the bug in auth.py" --allowed-tools "Read,Edit,Bash"

  # Get structured output
  assistants -p "List all functions" --output-format json --json-schema '{"type":"array","items":{"type":"string"}}'

  # Continue conversation
  assistants -p "What else can you tell me?" --continue

Interactive Mode:
  - Type your message and press Enter to send
  - Use $skill-name to invoke a skill
  - Use /command for built-in commands
  - Press Ctrl+] to switch sessions
  - Press Ctrl+C to exit
`);
    exit(0);
    return;
  }

  // Headless mode
  if (options.print !== null) {
    if (!options.print.trim()) {
      print('Error: Prompt is required with -p/--print flag');
      exit(1);
      return;
    }

    // Apply env-var-based overrides before handing off to runHeadless
    if (options.temperature !== null) {
      process.env.ASSISTANTS_TEMPERATURE = String(options.temperature);
    }
    if (options.noMemory) {
      process.env.ASSISTANTS_NO_MEMORY = '1';
    }

    await runHeadless({
      prompt: options.print,
      cwd: options.cwd,
      outputFormat: options.outputFormat,
      allowedTools:
        options.allowedTools.length > 0 ? options.allowedTools : undefined,
      systemPrompt: options.systemPrompt || undefined,
      jsonSchema: options.jsonSchema || undefined,
      continue: options.continue,
      resume: options.resume,
      cwdProvided: options.cwdProvided,
      timeoutMs: options.headlessTimeoutMs,
      temperature: options.temperature,
      costLimit: options.costLimit,
      noMemory: options.noMemory,
    });
  }

  // Note: Interactive mode is handled by index.tsx directly
  // since it requires React/Ink rendering
}
