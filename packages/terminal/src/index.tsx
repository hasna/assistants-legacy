#!/usr/bin/env bun
// Initialize Bun runtime before any core imports
import { setRuntime, closeDatabase, createWorktree, removeWorktree } from '@hasna/assistants-core';
import type { WorktreeInfo } from '@hasna/assistants-core';
import { bunRuntime } from '@hasna/runtime-bun';
setRuntime(bunRuntime);

import React from 'react';
import { render } from 'ink';
import { App } from './components/App';
import { runHeadless } from './headless';
import { sanitizeTerminalOutput } from './output/sanitize';
import { parseArgs, main } from './cli/main';
import { printExitSummary, getExitStats } from './exit-summary';

// --- Graceful shutdown handling ---

// Forward reference for worktree cleanup (initialized after arg parsing)
let _worktreeCleanup: (() => void) | null = null;

function cleanup(): void {
  if (_worktreeCleanup) _worktreeCleanup();
  closeDatabase();
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  process.stderr.write(`Uncaught exception: ${error}\n`);
  cleanup();
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  process.stderr.write(`Unhandled rejection: ${reason}\n`);
  cleanup();
  process.exit(1);
});

// Version is embedded at build time via define in build.ts
const VERSION = process.env.ASSISTANTS_VERSION || 'dev';

// DEC Mode 2026 - Synchronized Output
// This prevents scrollback destruction by batching all updates atomically
// Supported by: Ghostty, WezTerm, Windows Terminal, VS Code terminal
const SYNC_START = '\x1b[?2026h';
const SYNC_END = '\x1b[?2026l';

/**
 * Patch stdout.write to use synchronized output (DEC 2026)
 *
 * Buffers all writes within a single synchronous frame (Ink render cycle) and
 * flushes them atomically in a single DEC 2026 sync block via queueMicrotask.
 * This prevents Ghostty (and similar terminals) from rendering partial frames
 * between individual write() calls, which caused the entire conversation
 * history to visually duplicate on every new message.
 *
 * Microtasks run after the current synchronous task completes but before any
 * I/O events, so terminal query/response sequences (used by ink-picture for
 * Sixel/iTerm2 inline images) still work correctly.
 */
function enableSynchronizedOutput(): () => void {
  const originalWrite = process.stdout.write.bind(process.stdout);
  let buffer = '';
  let flushScheduled = false;

  function flush() {
    flushScheduled = false;
    if (!buffer) return;
    const output = buffer;
    buffer = '';
    originalWrite(SYNC_START + output + SYNC_END);
  }

  process.stdout.write = function (
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((err?: Error) => void),
    callback?: (err?: Error) => void
  ): boolean {
    const raw = typeof chunk === 'string' ? chunk : chunk.toString();
    const safe = sanitizeTerminalOutput(raw);
    buffer += safe;

    if (!flushScheduled) {
      flushScheduled = true;
      queueMicrotask(flush);
    }

    // Invoke callbacks — the data is accepted (buffered), so report success.
    if (typeof encodingOrCallback === 'function') {
      encodingOrCallback();
    } else if (callback) {
      callback();
    }
    return true;
  } as typeof process.stdout.write;

  // Return cleanup function
  return () => {
    flush();
    process.stdout.write = originalWrite as typeof process.stdout.write;
  };
}

// Re-export parseArgs and main for testing
export { parseArgs, main };

// ─── Subcommand dispatch (before arg parsing) ────────────────────────────────

const subcommand = process.argv[2];

if (subcommand === 'mcp') {
  const sub = process.argv[3];
  const mcpCmd = 'claude mcp add --transport stdio --scope user assistants -- assistants-mcp';
  const codexBlock = `[mcp_servers.assistants]\ncommand = "assistants-mcp"\nargs = []`;
  const geminiBlock = `"assistants": { "command": "assistants-mcp", "args": [] }`;

  if (sub === '--claude') {
    const { execSync } = await import('child_process');
    try {
      execSync(mcpCmd, { stdio: 'inherit' });
      console.log('\n✓ Installed into Claude Code. Restart Claude Code to load the server.');
    } catch {
      console.error('Failed to run claude mcp add. Is Claude Code installed?');
      console.error(`Run manually: ${mcpCmd}`);
      process.exit(1);
    }
  } else if (sub === '--codex') {
    console.log('Add to ~/.codex/config.toml:\n');
    console.log(codexBlock);
  } else if (sub === '--gemini') {
    console.log('Add to ~/.gemini/settings.json under mcpServers:\n');
    console.log(geminiBlock);
  } else if (sub === '--print') {
    console.log(mcpCmd);
  } else {
    console.log(`assistants mcp — install the @hasna/assistants-mcp server

Usage:
  assistants mcp --claude    Install into Claude Code (recommended)
  assistants mcp --codex     Print Codex config block
  assistants mcp --gemini    Print Gemini config block
  assistants mcp --print     Print the raw install command

The MCP server provides: chat, run_prompt, list_sessions, get_session,
list_skills, execute_skill, describe_tools, search_tools.

Requires: assistants-mcp installed globally (bun add -g @hasna/assistants-mcp)`);
  }
  process.exit(0);
}

if (subcommand === 'config') {
  const { loadConfig, getConfigDir, getActiveProfile } = await import('@hasna/assistants-core');
  const cwd = process.argv[3] || process.cwd();
  const profile = getActiveProfile();
  const config = await loadConfig(cwd);
  console.log(`Config directory: ${getConfigDir()}${profile ? ` (profile: ${profile})` : ''}`);
  console.log(`CWD: ${cwd}\n`);
  console.log(JSON.stringify({
    llm: config.llm,
    voice: { enabled: config.voice?.enabled },
    scheduler: config.scheduler,
    heartbeat: { enabled: config.heartbeat?.enabled, intervalMs: config.heartbeat?.intervalMs },
    context: { maxContextTokens: config.context?.maxContextTokens },
    validation: config.validation,
  }, null, 2));
  process.exit(0);
}

if (subcommand === 'sessions') {
  const { SessionStorage } = await import('@hasna/assistants-core');
  const sub = process.argv[3];
  const limit = parseInt(process.argv[4] || '20', 10);

  if (!sub || sub === 'list') {
    const sessions = SessionStorage.listAllSessions().slice(0, limit);
    if (sessions.length === 0) {
      console.log('No sessions found.');
    } else {
      console.log(`Sessions (${sessions.length}):\n`);
      for (const s of sessions) {
        const date = s.startedAt ? new Date(s.startedAt).toLocaleString() : 'unknown';
        const msgs = s.messageCount ?? 0;
        const label = s.label ? ` "${s.label}"` : '';
        console.log(`  ${s.id}${label}  (${msgs} msgs, ${date})`);
      }
    }
  } else {
    // Treat as session ID
    const data = SessionStorage.loadSession(sub);
    if (!data) {
      console.error(`Session "${sub}" not found.`);
      process.exit(1);
    }
    console.log(`Session: ${sub}`);
    console.log(`Started: ${data.startedAt || 'unknown'}`);
    console.log(`CWD: ${data.cwd || 'unknown'}`);
    const messages = (data.messages || []) as Array<{ role: string; content: unknown }>;
    console.log(`Messages: ${messages.length}\n`);
    for (const m of messages.slice(-10)) {
      const role = m.role === 'user' ? 'User' : 'Assistant';
      const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      console.log(`[${role}] ${text.slice(0, 200)}${text.length > 200 ? '…' : ''}\n`);
    }
  }
  process.exit(0);
}

if (subcommand === 'doctor') {
  const isJson = process.argv.includes('--json');
  const { getConfigDir, getActiveProfile } = await import('@hasna/assistants-core');
  const { existsSync } = await import('fs');
  const { join } = await import('path');

  const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];

  // API key
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
  checks.push({
    name: 'LLM API key',
    ok: hasAnthropicKey || hasOpenAIKey,
    detail: hasAnthropicKey ? 'ANTHROPIC_API_KEY set' : hasOpenAIKey ? 'OPENAI_API_KEY set' : 'Neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is set',
  });

  // Config directory
  const configDir = getConfigDir();
  checks.push({
    name: 'Config directory',
    ok: existsSync(configDir),
    detail: configDir,
  });

  // Profile
  const profile = getActiveProfile();
  checks.push({
    name: 'Profile',
    ok: true,
    detail: profile ? `ASSISTANTS_PROFILE=${profile}` : 'default (no profile set)',
  });

  // Database
  const dbPath = join(configDir, 'assistants.db');
  checks.push({
    name: 'Database',
    ok: existsSync(dbPath),
    detail: existsSync(dbPath) ? dbPath : `Not found at ${dbPath} (will be created on first run)`,
  });

  // MCP server binary
  let mcpInstalled = false;
  try {
    const { execSync } = await import('child_process');
    execSync('which assistants-mcp', { stdio: 'pipe' });
    mcpInstalled = true;
  } catch { /* not installed */ }
  checks.push({
    name: 'MCP server (assistants-mcp)',
    ok: mcpInstalled,
    detail: mcpInstalled ? 'installed' : 'not found — run: bun add -g @hasna/assistants-mcp',
  });

  // TODOS_URL connectivity
  if (process.env.TODOS_URL) {
    let todosOk = false;
    let todosDetail = '';
    try {
      const r = await fetch(`${process.env.TODOS_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
      todosOk = r.ok;
      todosDetail = r.ok ? `${process.env.TODOS_URL} — OK` : `${process.env.TODOS_URL} — HTTP ${r.status}`;
    } catch {
      todosDetail = `${process.env.TODOS_URL} — unreachable`;
    }
    checks.push({ name: 'todos integration (TODOS_URL)', ok: todosOk, detail: todosDetail });
  }

  // SESSIONS_URL connectivity
  if (process.env.SESSIONS_URL) {
    let sessionsOk = false;
    let sessionsDetail = '';
    try {
      const r = await fetch(`${process.env.SESSIONS_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
      sessionsOk = r.ok;
      sessionsDetail = r.ok ? `${process.env.SESSIONS_URL} — OK` : `${process.env.SESSIONS_URL} — HTTP ${r.status}`;
    } catch {
      sessionsDetail = `${process.env.SESSIONS_URL} — unreachable`;
    }
    checks.push({ name: 'sessions integration (SESSIONS_URL)', ok: sessionsOk, detail: sessionsDetail });
  }

  // Version
  checks.push({ name: 'Version', ok: true, detail: `assistants v${VERSION}` });

  if (isJson) {
    console.log(JSON.stringify({ checks, passing: checks.filter(c => c.ok).length, total: checks.length }, null, 2));
  } else {
    console.log('assistants doctor\n');
    for (const c of checks) {
      const icon = c.ok ? '✓' : '✗';
      console.log(`  ${icon}  ${c.name}${c.detail ? `: ${c.detail}` : ''}`);
    }
    const passing = checks.filter(c => c.ok).length;
    const failing = checks.filter(c => !c.ok).length;
    console.log(`\n  ${passing}/${checks.length} checks passed${failing > 0 ? ` — ${failing} issue(s) to fix` : ' — all good!'}`);
  }
  process.exit(checks.some(c => !c.ok) ? 1 : 0);
}

if (subcommand === 'serve') {
  const port = parseInt(process.argv[3] || process.env.ASSISTANTS_WEB_PORT || '3000', 10);
  const { execSync } = await import('child_process');
  const { join } = await import('path');
  const { existsSync } = await import('fs');

  // Find the web package relative to the CLI binary location
  const possibleWebDirs = [
    join(import.meta.dir, '..', '..', '..', 'web'),          // monorepo dev
    join(import.meta.dir, '..', 'web'),                       // dist structure
    join(process.env.HOME || '', '.assistants', 'web'),        // installed
  ];

  const webDir = possibleWebDirs.find(d => existsSync(join(d, 'package.json')));

  if (!webDir) {
    console.error('Web dashboard not found. Install @hasna/assistants with web support.');
    console.error('Tried:', possibleWebDirs.join(', '));
    process.exit(1);
  }

  const nextBin = join(webDir, 'node_modules', '.bin', 'next');
  const isBuilt = existsSync(join(webDir, '.next'));

  if (!isBuilt) {
    console.log('Building web dashboard (first run)...');
    try {
      execSync(`bun run build`, { cwd: webDir, stdio: 'inherit' });
    } catch {
      console.error('Build failed. Trying dev mode instead...');
      execSync(`bun run dev -- -p ${port}`, { cwd: webDir, stdio: 'inherit' });
      process.exit(0);
    }
  }

  console.log(`Starting web dashboard on http://localhost:${port}`);
  execSync(`${nextBin} start -p ${port}`, { cwd: webDir, stdio: 'inherit' });
  process.exit(0);
}

if (subcommand === 'report') {
  const days = parseInt(process.argv[3] || '7', 10);
  const isJson = process.argv.includes('--json');
  const isMarkdown = process.argv.includes('--markdown');

  const { SessionStorage } = await import('@hasna/assistants-core');
  const sessions = SessionStorage.listAllSessions();

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const recent = sessions.filter(s => new Date(s.updatedAt || s.startedAt).getTime() >= cutoff);

  // Aggregate stats
  const totalMessages = recent.reduce((sum, s) => sum + (s.messageCount ?? 0), 0);
  const byDate: Record<string, number> = {};
  for (const s of recent) {
    const date = (s.updatedAt || s.startedAt).slice(0, 10);
    byDate[date] = (byDate[date] || 0) + 1;
  }
  const avgPerDay = recent.length / Math.max(days, 1);

  // Build sparkline
  const sortedDates = Object.keys(byDate).sort();
  const counts = sortedDates.map(d => byDate[d]);
  const maxCount = Math.max(...counts, 1);
  const bars = '▁▂▃▄▅▆▇█';
  const sparkline = counts.map(c => bars[Math.floor((c / maxCount) * (bars.length - 1))]).join('');

  const report = {
    days,
    totalSessions: sessions.length,
    recentSessions: recent.length,
    recentMessages: totalMessages,
    avgSessionsPerDay: Math.round(avgPerDay * 10) / 10,
    sparkline,
    topProjects: Object.entries(
      recent.reduce((acc, s) => {
        const proj = s.cwd?.split('/').pop() ?? 'unknown';
        acc[proj] = (acc[proj] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    ).sort((a, b) => b[1] - a[1]).slice(0, 5),
  };

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
  } else if (isMarkdown) {
    console.log(`## assistants report — last ${days} days\n`);
    console.log(`| Metric | Value |`);
    console.log(`|--------|-------|`);
    console.log(`| Sessions (recent) | ${report.recentSessions} |`);
    console.log(`| Sessions (total) | ${report.totalSessions} |`);
    console.log(`| Messages | ${report.recentMessages} |`);
    console.log(`| Avg/day | ${report.avgSessionsPerDay} |`);
    if (report.topProjects.length > 0) {
      console.log(`\n**Top projects:** ${report.topProjects.map(([k, v]) => `${k} (${v})`).join(', ')}`);
    }
  } else {
    console.log(`assistants report — last ${days} days\n`);
    console.log(`  Sessions:   ${report.recentSessions} recent · ${report.totalSessions} total`);
    console.log(`  Messages:   ${report.recentMessages}`);
    console.log(`  Avg/day:    ${report.avgSessionsPerDay}`);
    if (sparkline) console.log(`  Activity:   ${sparkline}`);
    if (report.topProjects.length > 0) {
      console.log(`\n  Top projects:`);
      for (const [proj, count] of report.topProjects) {
        console.log(`    ${proj.padEnd(30)} ${count} sessions`);
      }
    }
  }
  process.exit(0);
}

const options = parseArgs(process.argv);

// Handle parsing errors
if (options.errors.length > 0) {
  for (const error of options.errors) {
    console.error(`Error: ${error}`);
  }
  process.exit(1);
}

// Handle version
if (options.version) {
  console.log(`assistants v${VERSION}`);
  process.exit(0);
}

// Handle help
if (options.help) {
  console.log(`
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
  process.exit(0);
}

// Worktree setup — create an isolated git worktree if requested
let activeWorktree: WorktreeInfo | null = null;

if (options.worktree !== null) {
  try {
    const worktreeName = typeof options.worktree === 'string' ? options.worktree : undefined;
    activeWorktree = createWorktree(options.cwd, worktreeName);
    options.cwd = activeWorktree.path;
    console.log(`Worktree created: ${activeWorktree.path}`);
  } catch (error) {
    console.error(`Error creating worktree: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

function cleanupWorktree(): void {
  if (activeWorktree) {
    const removed = removeWorktree(activeWorktree.path);
    if (removed) {
      console.log(`Worktree cleaned up: ${activeWorktree.path}`);
    } else {
      console.log(`Worktree retained (has changes): ${activeWorktree.path}`);
    }
    activeWorktree = null;
  }
}

// Register worktree cleanup with the global shutdown handler
_worktreeCleanup = cleanupWorktree;

// Headless mode
if (options.print !== null) {
  if (!options.print.trim()) {
    console.error('Error: Prompt is required with -p/--print flag');
    process.exit(1);
  }

  runHeadless({
    prompt: options.print,
    cwd: options.cwd,
    outputFormat: options.outputFormat,
    allowedTools: options.allowedTools.length > 0 ? options.allowedTools : undefined,
    systemPrompt: options.systemPrompt || undefined,
    jsonSchema: options.jsonSchema || undefined,
    continue: options.continue,
    resume: options.resume,
    cwdProvided: options.cwdProvided,
    timeoutMs: options.headlessTimeoutMs,
    permissionMode: options.permissionMode ?? undefined,
  })
    .then((result) => {
      cleanup();
      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      cleanup();
      console.error('Error:', error.message);
      process.exit(1);
    });
} else {
  // Interactive mode
  // Enable synchronized output for terminals that support DEC 2026 (Ghostty, WezTerm, etc.)
  // This batches all terminal writes and flushes them atomically, preserving scrollback
  // Can be disabled with ASSISTANTS_NO_SYNC=1 if causing rendering issues
  const useSyncOutput = process.env.ASSISTANTS_NO_SYNC !== '1';
  const disableSyncOutput = useSyncOutput ? enableSynchronizedOutput() : () => {};

  const appElement = <App cwd={options.cwd} version={VERSION} permissionMode={options.permissionMode ?? undefined} />;

  const { waitUntilExit } = render(
    appElement,
    {
      // Patch console to route through our synced output
      patchConsole: true,
      // Let the app decide how to handle Ctrl+C (clear input or stop processing).
      exitOnCtrlC: false,
    },
  );

  waitUntilExit().then(() => {
    // Restore original stdout.write before exiting
    disableSyncOutput();
    const stats = getExitStats();
    if (stats) {
      printExitSummary(stats);
    }
    cleanup();
    process.exit(0);
  });
}
