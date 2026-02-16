/**
 * HookCliBridge - Discovery and execution of .hooks/ CLI hooks
 *
 * Modeled after ConnectorBridge for .connectors/ directory discovery.
 *
 * Directory structure:
 *   .hooks/
 *     hook-lint/
 *       package.json
 *       bin/index.js
 *     hook-security/
 *       ...
 *
 * CLI Protocol:
 *   hook-<name> --manifest  → JSON stdout with hook metadata
 *   hook-<name> <event>     → reads HookInput JSON from stdin, writes HookOutput JSON to stdout
 *   Exit codes: 0=success, 2=blocking error, other=non-blocking
 */

import { homedir } from 'os';
import { join, delimiter } from 'path';
import { existsSync, readdirSync, statSync } from 'fs';
import type { HookInput, HookOutput } from '@hasna/assistants-shared';
import { getRuntime } from '../runtime';
import { getDatabase } from '../database';

/**
 * CLI hook manifest returned by `hook-<name> --manifest`
 */
export interface HookCliManifest {
  name: string;
  description?: string;
  events: Array<{
    event: string;
    matcher?: string;
    timeout?: number;
  }>;
}

/**
 * Resolved CLI hook info
 */
interface ResolvedCliHook {
  name: string;
  cliPath: string;
  manifest: HookCliManifest;
}

/**
 * HookCliBridge - discovers and executes CLI-based hooks
 */
export class HookCliBridge {
  private cwd: string;
  private discovered: Map<string, ResolvedCliHook> = new Map();

  constructor(cwd?: string) {
    this.cwd = cwd || process.cwd();
  }

  private getHomeDir(): string {
    const envHome = process.env.HOME || process.env.USERPROFILE;
    return envHome && envHome.trim().length > 0 ? envHome : homedir();
  }

  /**
   * Auto-discover hook CLI names from .hooks/ directories and PATH
   */
  autoDiscoverHookNames(): string[] {
    const names = new Set<string>();

    // 1. Local .hooks/ directory
    const localHooksDir = join(this.cwd, '.hooks');
    this.scanHooksDir(localHooksDir, names);

    // 2. Global ~/.hooks/ directory
    const globalHooksDir = join(this.getHomeDir(), '.hooks');
    this.scanHooksDir(globalHooksDir, names);

    // 3. Scan PATH for hook-* executables
    const pathDirs = (process.env.PATH || '').split(delimiter);
    for (const dir of pathDirs) {
      if (!dir || !existsSync(dir)) continue;
      try {
        const entries = readdirSync(dir);
        for (const entry of entries) {
          if (entry.startsWith('hook-')) {
            const name = entry.replace(/^hook-/, '').replace(/\.(js|ts|sh|exe)$/, '');
            if (name) names.add(name);
          }
        }
      } catch {
        // Skip unreadable directories
      }
    }

    return Array.from(names);
  }

  /**
   * Scan a .hooks/ directory for hook-* subdirectories
   */
  private scanHooksDir(dir: string, names: Set<string>): void {
    if (!existsSync(dir)) return;
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (!entry.startsWith('hook-')) continue;
        const fullPath = join(dir, entry);
        try {
          if (statSync(fullPath).isDirectory()) {
            const name = entry.replace(/^hook-/, '');
            if (name) names.add(name);
          }
        } catch {
          // Skip
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  /**
   * Resolve the CLI path for a hook by name
   * Priority: .hooks/hook-<name>/bin/index.js → ~/.hooks/hook-<name>/bin/index.js → PATH
   */
  resolveHookCli(name: string): string | null {
    // 1. Local .hooks/
    const localBin = join(this.cwd, '.hooks', `hook-${name}`, 'bin', 'index.js');
    if (existsSync(localBin)) return localBin;

    // 2. Global ~/.hooks/
    const globalBin = join(this.getHomeDir(), '.hooks', `hook-${name}`, 'bin', 'index.js');
    if (existsSync(globalBin)) return globalBin;

    // 3. PATH lookup
    try {
      const runtime = getRuntime();
      const which = runtime.which(`hook-${name}`);
      if (which) return which;
    } catch {
      // Runtime not available, try manual PATH search
      const pathDirs = (process.env.PATH || '').split(delimiter);
      for (const dir of pathDirs) {
        const candidate = join(dir, `hook-${name}`);
        if (existsSync(candidate)) return candidate;
      }
    }

    return null;
  }

  /**
   * Fast discovery using cached manifests from SQLite
   */
  fastDiscover(): ResolvedCliHook[] {
    const db = getDatabase();
    const rows = db.prepare(
      `SELECT name, cli_path, manifest FROM hook_cli_cache`
    ).all() as Array<{ name: string; cli_path: string; manifest: string }>;

    const hooks: ResolvedCliHook[] = [];
    for (const row of rows) {
      try {
        const manifest = JSON.parse(row.manifest) as HookCliManifest;
        const resolved: ResolvedCliHook = {
          name: row.name,
          cliPath: row.cli_path,
          manifest,
        };
        this.discovered.set(row.name, resolved);
        hooks.push(resolved);
      } catch {
        // Skip invalid cache entries
      }
    }

    return hooks;
  }

  /**
   * Full discovery: scan for hook CLIs, run --manifest, cache results
   */
  async discover(): Promise<ResolvedCliHook[]> {
    const names = this.autoDiscoverHookNames();
    const hooks: ResolvedCliHook[] = [];
    const db = getDatabase();
    const now = new Date().toISOString();

    for (const name of names) {
      const cliPath = this.resolveHookCli(name);
      if (!cliPath) continue;

      try {
        const manifest = await this.runManifest(cliPath);
        if (!manifest) continue;

        const resolved: ResolvedCliHook = { name, cliPath, manifest };
        this.discovered.set(name, resolved);
        hooks.push(resolved);

        // Cache in SQLite
        db.prepare(
          `INSERT OR REPLACE INTO hook_cli_cache (name, cli_path, manifest, cached_at)
           VALUES (?, ?, ?, ?)`
        ).run(name, cliPath, JSON.stringify(manifest), now);
      } catch {
        // Skip hooks that fail manifest discovery
      }
    }

    return hooks;
  }

  /**
   * Run --manifest on a hook CLI and parse the output
   */
  private async runManifest(cliPath: string): Promise<HookCliManifest | null> {
    try {
      const runtime = getRuntime();
      const args = cliPath.endsWith('.js')
        ? ['bun', cliPath, '--manifest']
        : [cliPath, '--manifest'];

      const proc = runtime.spawn(args, {
        cwd: this.cwd,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const timeoutId = setTimeout(() => {
        try { proc.kill(); } catch { /* ignore */ }
      }, 5000);

      const stdout = proc.stdout ? await new Response(proc.stdout).text() : '';
      clearTimeout(timeoutId);

      const exitCode = await proc.exited;
      if (exitCode !== 0) return null;

      return JSON.parse(stdout.trim()) as HookCliManifest;
    } catch {
      return null;
    }
  }

  /**
   * Execute a CLI hook for a given event
   */
  async executeCliHook(
    name: string,
    event: string,
    input: HookInput
  ): Promise<HookOutput | null> {
    const hook = this.discovered.get(name);
    if (!hook) return null;

    try {
      const runtime = getRuntime();
      const args = hook.cliPath.endsWith('.js')
        ? ['bun', hook.cliPath, event]
        : [hook.cliPath, event];

      const proc = runtime.spawn(args, {
        cwd: input.cwd || this.cwd,
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
      });

      // Find timeout from manifest event config
      const eventConfig = hook.manifest.events.find((e) => e.event === event);
      const timeout = eventConfig?.timeout || 30000;

      // Write input as JSON to stdin
      const inputData = new TextEncoder().encode(JSON.stringify(input));
      const stdin = proc.stdin as unknown as {
        getWriter?: () => { write: (chunk: Uint8Array) => Promise<void> | void; close: () => Promise<void> | void };
        write?: (chunk: Uint8Array) => Promise<void> | void;
        end?: () => Promise<void> | void;
      } | null;
      if (stdin?.getWriter) {
        const writer = stdin.getWriter();
        await writer.write(inputData);
        await writer.close();
      } else if (stdin?.write) {
        await stdin.write(inputData);
        if (stdin.end) {
          await stdin.end();
        }
      }

      // Set up timeout
      const timeoutId = setTimeout(() => {
        try { proc.kill(); } catch { /* ignore */ }
      }, timeout);

      const [stdout, stderr] = await Promise.all([
        proc.stdout ? new Response(proc.stdout).text() : '',
        proc.stderr ? new Response(proc.stderr).text() : '',
      ]);

      clearTimeout(timeoutId);
      const exitCode = await proc.exited;

      // Exit code 0: success, parse JSON output
      if (exitCode === 0) {
        try {
          return JSON.parse(stdout.trim()) as HookOutput;
        } catch {
          return { continue: true, additionalContext: stdout.trim() };
        }
      }

      // Exit code 2: blocking error
      if (exitCode === 2) {
        return {
          continue: false,
          stopReason: stderr.trim() || 'Blocked by CLI hook',
        };
      }

      // Other exit codes: non-blocking error
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get all discovered hooks in a format suitable for HookStore.upsertFromCli()
   */
  getDiscoveredHooksForUpsert(): Array<{
    id: string;
    event: string;
    matcher?: string;
    type: string;
    name?: string;
    description?: string;
    command?: string;
    timeout?: number;
    cliName: string;
  }> {
    const result: Array<{
      id: string;
      event: string;
      matcher?: string;
      type: string;
      name?: string;
      description?: string;
      command?: string;
      timeout?: number;
      cliName: string;
    }> = [];

    for (const [name, hook] of this.discovered) {
      for (const eventDef of hook.manifest.events) {
        result.push({
          id: `cli-${name}-${eventDef.event.toLowerCase()}`,
          event: eventDef.event,
          matcher: eventDef.matcher,
          type: 'cli',
          name: hook.manifest.name,
          description: hook.manifest.description,
          timeout: eventDef.timeout,
          cliName: name,
        });
      }
    }

    return result;
  }
}
