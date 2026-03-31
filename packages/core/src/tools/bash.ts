import type { Tool, BashPermissionLevel } from '@hasna/assistants-shared';
import type { ToolExecutor } from './registry';
import { ErrorCodes, ToolExecutionError, toolError, toolPermissionDenied } from '../errors';
import { getSecurityLogger } from '../security/logger';
import { validateBashCommand } from '../security/bash-validator';
import { isPrivateHostOrResolved } from '../security/network-validator';
import { loadConfig } from '../config';
import { getRuntime } from '../runtime';

/**
 * Bash tool - execute shell commands (restricted to safe, read-only operations)
 */
function killProcess(proc: { kill: () => void }): void {
  proc.kill();
}

function stripQuotedSegments(input: string): string {
  let result = '';
  let quote: '"' | '\'' | null = null;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (quote) {
      if (quote === '"' && !escaped && char === '\\') {
        escaped = true;
        continue;
      }
      if (!escaped && char === quote) {
        quote = null;
        result += char;
        continue;
      }
      escaped = false;
      continue;
    }

    if (char === '"' || char === '\'') {
      quote = char;
      result += char;
      continue;
    }

    result += char;
  }

  return result;
}

function normalizeNewlinesOutsideQuotes(input: string): string {
  let result = '';
  let quote: '"' | '\'' | null = null;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (quote) {
      result += char;
      if (quote === '"' && !escaped && char === '\\') {
        escaped = true;
        continue;
      }
      if (!escaped && char === quote) {
        quote = null;
      }
      escaped = false;
      continue;
    }

    if (char === '"' || char === '\'') {
      quote = char;
      result += char;
      continue;
    }

    if (char === '\r' || char === '\n') {
      result += ' ';
      continue;
    }

    result += char;
  }

  return result;
}

export class BashTool {
  static readonly tool: Tool = {
    name: 'bash',
    description: 'Execute a shell command. Permission level is controlled by permissions.bash in config: "none" (disabled), "readonly" (default — ls, cat, grep, find, git status/log/diff, pwd, which, echo), or "readwrite" (broader commands, destructive ops still blocked).',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute (read-only commands only)',
        },
        cwd: {
          type: 'string',
          description: 'Working directory for the command (optional)',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 30000)',
        },
      },
      required: ['command'],
    },
  };

  // Allowed command prefixes (read-only operations)
  private static readonly ALLOWED_COMMANDS = [
    // File reading
    'cat', 'head', 'tail', 'less', 'more',
    // Directory listing
    'ls', 'tree', 'find', 'locate',
    // Search
    'grep', 'rg', 'ag', 'ack',
    // File info
    'wc', 'file', 'stat', 'du', 'df',
    // System info
    'pwd', 'whoami', 'date', 'which', 'where', 'type', 'env', 'printenv',
    // Echo for simple output
    'echo',
    // HTTP requests
    'curl',
    // Git read-only
    'git status', 'git log', 'git diff', 'git branch', 'git show', 'git remote', 'git tag',
    // Connectors
    'connect-',
    'connect_',
    'connectors',
    // Node/bun info
    'node --version', 'bun --version', 'npm --version', 'pnpm --version',
    // JSON processing (read-only)
    'jq',
  ];

  // Explicitly blocked commands
  private static readonly BLOCKED_PATTERNS = [
    // Deletion
    /\brm\b/, /\brmdir\b/, /\bunlink\b/,
    // Modification
    /\bmv\b/, /\bcp\b/,
    // Permission changes
    /\bchmod\b/, /\bchown\b/, /\bchgrp\b/,
    // Privilege escalation
    /\bsudo\b/, /\bsu\b/, /\bdoas\b/,
    // Package installation
    /\bnpm\s+(install|i|add|ci)\b/, /\bpnpm\s+(install|i|add)\b/,
    /\byarn\s+(install|add)\b/, /\bbun\s+(install|add|i)\b/,
    /\bpip\s+install\b/, /\bpip3\s+install\b/,
    /\bbrew\s+install\b/, /\bapt\s+install\b/, /\bapt-get\s+install\b/,
    // Git writes
    /\bgit\s+(push|commit|checkout|reset|rebase|merge|pull|stash|cherry-pick|revert)\b/,
    /\bgit\s+add\b/,
    /\bgit\s+remote\s+(add|set-url|remove|rm|rename)\b/,
    /\bgit\s+tag\s+(-d|--delete|-f)\b/,
    /\bgit\s+branch\s+(-d|-D|-m|--delete|--move)\b/,
    // Dangerous pipes (piping to shell)
    /\|\s*(bash|sh|zsh|fish)\b/,
    /curl.*\|\s*(bash|sh)/, /wget.*\|\s*(bash|sh)/,
    // Semicolon chaining (sequential execution regardless of result)
    /;/,
    // Newlines (can hide commands)
    /[\r\n]/,
    // File writing via redirection
    />\s*[^|]/, />>/,
    // Process control
    /\bkill\b/, /\bpkill\b/, /\bkillall\b/,
    // System modification
    /\bmkfs\b/, /\bdd\b/, /\bfdisk\b/, /\bparted\b/,
    // Network dangerous
    /\bnc\s+-l/, /\bnetcat\s+-l/,
    // Editors (would hang)
    /\bvim?\b/, /\bnano\b/, /\bemacs\b/,
    // Make/build (can modify)
    /\bmake\b/, /\bcmake\b/,
    // Docker (can be dangerous)
    /\bdocker\s+(run|exec|build|push)\b/,
  ];

  private static readonly SAFE_GLOBAL_BUN_PACKAGES = [
    /^connect-[a-z0-9._-]+$/i,
    /^@hasna\/[a-z0-9._-]+$/i,
  ];

  // Additional commands allowed in readwrite mode (on top of ALLOWED_COMMANDS)
  private static readonly READWRITE_ALLOWED_COMMANDS = [
    // File creation/modification
    'mkdir', 'touch', 'cp', 'mv', 'ln',
    // File writing
    'tee',
    // Editors (non-interactive)
    'sed', 'awk',
    // Archive
    'tar', 'zip', 'unzip', 'gzip', 'gunzip', 'bzip2', 'bunzip2',
    // Git write operations
    'git add', 'git commit', 'git push', 'git pull', 'git checkout', 'git switch',
    'git merge', 'git rebase', 'git stash', 'git cherry-pick', 'git revert',
    'git reset', 'git restore', 'git init', 'git clone', 'git fetch',
    'git branch',
    // Package management
    'npm', 'pnpm', 'yarn', 'bun', 'pip', 'pip3',
    // Build tools
    'make', 'cmake',
    // Process management
    'kill', 'pkill',
    // Permission (non-destructive)
    'chmod', 'chown',
    // Docker
    'docker',
    // Node/Bun execution
    'node', 'bun', 'npx', 'bunx', 'tsx', 'ts-node',
    // Python
    'python', 'python3',
    // Misc write
    'rm', 'rmdir',
    // Redirect/pipe support is handled by not blocking ; and > in readwrite
  ];

  // Patterns blocked even in readwrite mode (catastrophically destructive)
  private static readonly READWRITE_BLOCKED_PATTERNS = [
    // Recursive force delete of root or home
    /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?(-[a-zA-Z]*r[a-zA-Z]*\s+)?(\/|~\/?\s|\.\.\/)/,
    /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+)?(-[a-zA-Z]*f[a-zA-Z]*\s+)?(\/|~\/?\s|\.\.\/)/,
    /\brm\s+-rf\s+\/(?!\S)/, /\brm\s+-rf\s+~\/?(?:\s|$)/,
    // Disk/filesystem destruction
    /\bmkfs\b/, /\bdd\b/, /\bfdisk\b/, /\bparted\b/,
    // Privilege escalation
    /\bsudo\b/, /\bsu\b/, /\bdoas\b/,
    // chmod 777 (overly permissive)
    /\bchmod\s+777\b/,
    // Dangerous curl piped to shell
    /curl.*\|\s*(bash|sh)/, /wget.*\|\s*(bash|sh)/,
    // Network listeners
    /\bnc\s+-l/, /\bnetcat\s+-l/,
    // Interactive editors (would hang)
    /\bvim?\b/, /\bnano\b/, /\bemacs\b/,
    // Fork bombs and similar
    /:\(\)\s*\{/, /\bfork\s*bomb/i,
  ];

  private static getBunGlobalInstallInfo(command: string): {
    isMatch: boolean;
    allowedByDefault: boolean;
  } {
    const parts = this.splitCommandByOperators(command);
    if (parts.length !== 1) {
      return { isMatch: false, allowedByDefault: false };
    }

    const tokens = command.trim().split(/\s+/);
    if (tokens.length < 4) {
      return { isMatch: false, allowedByDefault: false };
    }
    if (tokens[0] !== 'bun') {
      return { isMatch: false, allowedByDefault: false };
    }
    const action = tokens[1];
    if (!['add', 'install', 'i'].includes(action)) {
      return { isMatch: false, allowedByDefault: false };
    }

    const flagTokens = tokens.slice(2).filter((token) => token.startsWith('-'));
    const hasGlobalFlag = flagTokens.some((token) => token === '-g' || token === '--global');
    if (!hasGlobalFlag) {
      return { isMatch: false, allowedByDefault: false };
    }
    const allowedFlags = new Set(['-g', '--global']);
    if (flagTokens.some((token) => !allowedFlags.has(token))) {
      return { isMatch: false, allowedByDefault: false };
    }

    const packageTokens = tokens.slice(2).filter((token) => !token.startsWith('-'));
    if (packageTokens.length === 0) {
      return { isMatch: false, allowedByDefault: false };
    }

    const isValidPackage = (pkg: string) => /^[a-z0-9@][a-z0-9@._/-]*$/i.test(pkg);
    if (packageTokens.some((pkg) => !isValidPackage(pkg))) {
      return { isMatch: false, allowedByDefault: false };
    }

    const allowedByDefault = packageTokens.every((pkg) =>
      this.SAFE_GLOBAL_BUN_PACKAGES.some((pattern) => pattern.test(pkg))
    );

    return { isMatch: true, allowedByDefault };
  }

  /**
   * Check if a command part (single command without chaining) is allowed
   */
  private static isCommandPartAllowed(commandPart: string, allowlist: string[]): boolean {
    const trimmed = commandPart.trim().toLowerCase();
    for (const allowed of allowlist) {
      const allowedLower = allowed.toLowerCase();
      if (allowedLower.endsWith('-') || allowedLower.endsWith('_')) {
        if (trimmed.startsWith(allowedLower)) return true;
        continue;
      }
      if (trimmed === allowedLower || trimmed.startsWith(`${allowedLower} `)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if all parts of a chained command are allowed.
   * Supports && (and), || (or), and | (pipe) operators.
   */
  private static areAllCommandPartsAllowed(command: string, allowlist: string[]): boolean {
    // Split by &&, ||, and | while respecting quotes
    const parts = this.splitCommandByOperators(command);
    if (parts.length === 0) return false;

    for (const part of parts) {
      if (!this.isCommandPartAllowed(part, allowlist)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Tokenize a command string into args, respecting simple quotes.
   */
  private static tokenizeArgs(input: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let quote: '"' | '\'' | null = null;
    let escaped = false;

    for (let i = 0; i < input.length; i += 1) {
      const char = input[i];

      if (quote === '"' && !escaped && char === '\\') {
        escaped = true;
        continue;
      }

      if (quote) {
        if (!escaped && char === quote) {
          quote = null;
          continue;
        }
        current += char;
        escaped = false;
        continue;
      }

      if (char === '"' || char === '\'') {
        quote = char;
        continue;
      }

      if (/\s/.test(char)) {
        if (current) {
          tokens.push(current);
          current = '';
        }
        continue;
      }

      current += char;
    }

    if (current) tokens.push(current);
    return tokens;
  }

  /**
   * Extract URL/host targets from a curl command string.
   * Non-flag args in curl are treated as URLs; skip known non-URL flag values.
   */
  private static extractCurlUrls(command: string): string[] {
    const urls: string[] = [];
    const curlMatch = command.match(/^curl\s+(.+)$/i);
    if (!curlMatch) return urls;

    const args = curlMatch[1];
    const tokens = this.tokenizeArgs(args);
    const skipValueFlags = new Set([
      '-d', '--data', '--data-raw', '--data-binary', '--data-urlencode',
      '-F', '--form',
      '-H', '--header',
      '-u', '--user',
      '-o', '--output', '-O', '--remote-name',
      '-e', '--referer',
      '-A', '--user-agent',
      '-b', '--cookie', '-c', '--cookie-jar',
      '-x', '--proxy',
    ]);

    let skipNext = false;
    for (const token of tokens) {
      if (!token) continue;

      if (skipNext) {
        skipNext = false;
        continue;
      }

      if (token.startsWith('--url=')) {
        urls.push(token.slice('--url='.length));
        continue;
      }

      if (token.startsWith('-')) {
        if (skipValueFlags.has(token)) {
          skipNext = true;
        }
        continue;
      }

      if (token.startsWith('@')) {
        continue;
      }

      urls.push(token);
    }

    return urls;
  }

  /**
   * Validate that curl URLs don't target private/internal networks (SSRF protection)
   */
  private static async validateCurlSsrf(command: string): Promise<{ valid: boolean; blockedUrl?: string }> {
    const trimmed = command.trim().toLowerCase();

    // Only check if it's a curl command
    if (!trimmed.startsWith('curl ')) {
      return { valid: true };
    }

    const urls = this.extractCurlUrls(command.trim());

    for (const urlStr of urls) {
      const candidate = urlStr.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//)
        ? urlStr
        : `http://${urlStr}`;
      try {
        const url = new URL(candidate);
        if (await isPrivateHostOrResolved(url.hostname)) {
          return { valid: false, blockedUrl: urlStr };
        }
      } catch {
        // Invalid URL - curl will fail anyway, let it through
        continue;
      }
    }

    return { valid: true };
  }

  /**
   * Split a command string by operators (&&, ||, |) while respecting quotes
   */
  private static splitCommandByOperators(command: string): string[] {
    const parts: string[] = [];
    let current = '';
    let quote: '"' | '\'' | null = null;
    let escaped = false;
    let i = 0;

    while (i < command.length) {
      const char = command[i];

      // Handle escape in double quotes
      if (quote === '"' && !escaped && char === '\\') {
        escaped = true;
        current += char;
        i++;
        continue;
      }

      // Handle quotes
      if (!quote && (char === '"' || char === '\'')) {
        quote = char;
        current += char;
        i++;
        continue;
      }

      if (quote && !escaped && char === quote) {
        quote = null;
        current += char;
        i++;
        continue;
      }

      escaped = false;

      // Check for operators (only outside quotes)
      if (!quote) {
        // Check for && or ||
        if ((char === '&' && command[i + 1] === '&') ||
            (char === '|' && command[i + 1] === '|')) {
          if (current.trim()) parts.push(current.trim());
          current = '';
          i += 2;
          continue;
        }

        // Check for single |
        if (char === '|') {
          if (current.trim()) parts.push(current.trim());
          current = '';
          i++;
          continue;
        }
      }

      current += char;
      i++;
    }

    if (current.trim()) parts.push(current.trim());
    return parts;
  }

  static readonly executor: ToolExecutor = async (input, signal) => {
    const command = input.command as string;
    const cwd = (input.cwd as string) || process.cwd();
    const timeoutInput = Number(input.timeout);
    const timeout = Number.isFinite(timeoutInput) && timeoutInput > 0 ? timeoutInput : 30000; // Reduced default timeout

    let allowEnv = true;
    let allowAll = false;
    let allowPackageInstall = false;
    let bashPermission: BashPermissionLevel = 'readonly';
    try {
      const config = await loadConfig(cwd);
      const bashConfig = config.validation?.perTool?.bash;
      allowEnv = bashConfig?.allowEnv ?? true;
      allowAll = bashConfig?.allowAll ?? false;
      allowPackageInstall = bashConfig?.allowPackageInstall ?? false;
      bashPermission = config.permissions?.bash ?? 'readonly';
    } catch {
      allowEnv = true;
      allowAll = false;
      allowPackageInstall = false;
      bashPermission = 'readonly';
    }

    // If bash is disabled via permissions, block immediately
    if (bashPermission === 'none') {
      throw toolPermissionDenied(
        'bash',
        'Bash is disabled. Change permissions.bash in config to "readonly" or "readwrite" to enable.',
        input as Record<string, unknown>,
      );
    }

    const baseCommand = command.replace(/\s*2>&1\s*/g, ' ').trim();
    const baseTrimmed = baseCommand.toLowerCase();
    const allowConnectorNewlines = baseTrimmed.startsWith('connect-') || baseTrimmed.startsWith('connect_') || baseTrimmed.startsWith('connectors');
    const commandForExec = allowConnectorNewlines
      ? normalizeNewlinesOutsideQuotes(baseCommand).trim()
      : baseCommand;
    const commandForChecks = commandForExec;
    const commandSansQuotes = stripQuotedSegments(commandForChecks);
    const bunInstallInfo = this.getBunGlobalInstallInfo(commandForChecks);
    const allowGlobalInstall = bunInstallInfo.isMatch && (bunInstallInfo.allowedByDefault || allowPackageInstall);

    const securityCheck = validateBashCommand(commandForChecks);
    if (!securityCheck.valid) {
      getSecurityLogger().log({
        eventType: 'blocked_command',
        severity: securityCheck.severity || 'high',
        details: {
          tool: 'bash',
          command,
          reason: securityCheck.reason || 'Blocked command',
        },
        sessionId: (input.sessionId as string) || 'unknown',
      });
      throw toolPermissionDenied('bash', securityCheck.reason || 'Blocked command', input as Record<string, unknown>);
    }

    if (!allowAll && !allowGlobalInstall) {
      // Choose blocked patterns based on permission level
      const blockedPatterns = bashPermission === 'readwrite'
        ? this.READWRITE_BLOCKED_PATTERNS
        : this.BLOCKED_PATTERNS;

      // Check against blocked patterns
      for (const pattern of blockedPatterns) {
        if (pattern.test(commandSansQuotes)) {
          getSecurityLogger().log({
            eventType: 'blocked_command',
            severity: 'high',
            details: {
              tool: 'bash',
              command,
              reason: 'Blocked command pattern detected',
            },
            sessionId: (input.sessionId as string) || 'unknown',
          });
          const modeLabel = bashPermission === 'readwrite' ? 'readwrite' : 'readonly';
          throw toolPermissionDenied(
            'bash',
            `Blocked: command is not allowed in ${modeLabel} mode. ${bashPermission === 'readonly' ? 'Only read-only commands are permitted (ls, cat, grep, find, git status/log/diff, etc.).' : 'Destructive operations (rm -rf /, mkfs, dd, sudo, etc.) are blocked even in readwrite mode.'}`,
            input as Record<string, unknown>,
          );
        }
      }
    }

    const commandTrimmed = commandForChecks.trim().toLowerCase();
    const isEnvCommand = /^(env|printenv)(\s|$)/.test(commandTrimmed);
    if (!allowEnv && isEnvCommand) {
      getSecurityLogger().log({
        eventType: 'blocked_command',
        severity: 'medium',
        details: {
          tool: 'bash',
          command,
          reason: 'env/printenv disabled by config',
        },
        sessionId: (input.sessionId as string) || 'unknown',
      });
      throw toolPermissionDenied('bash', 'Command not allowed: env/printenv disabled by config.', input as Record<string, unknown>);
    }

    if (!allowAll && !allowGlobalInstall) {
      // Build allowlist based on permission level
      let allowlist = allowEnv
        ? this.ALLOWED_COMMANDS
        : this.ALLOWED_COMMANDS.filter((allowed) => allowed !== 'env' && allowed !== 'printenv');

      // In readwrite mode, expand the allowlist with write commands
      if (bashPermission === 'readwrite') {
        allowlist = [...allowlist, ...this.READWRITE_ALLOWED_COMMANDS];
      }

      const isAllowed = this.areAllCommandPartsAllowed(commandForChecks, allowlist);

      if (!isAllowed) {
        getSecurityLogger().log({
          eventType: 'blocked_command',
          severity: 'medium',
          details: {
            tool: 'bash',
            command,
            reason: 'Command not in allowlist',
          },
          sessionId: (input.sessionId as string) || 'unknown',
        });
        const modeLabel = bashPermission === 'readwrite' ? 'readwrite' : 'readonly';
        throw toolPermissionDenied(
          'bash',
          `Blocked: command is not allowed in ${modeLabel} mode. ${bashPermission === 'readonly' ? 'Permitted commands: cat, head, tail, ls, find, grep, wc, file, stat, pwd, which, echo, curl, git status/log/diff/branch/show, connectors' : 'The command is not in the readwrite allowlist. Destructive system operations remain blocked.'}`,
          input as Record<string, unknown>,
        );
      }

      // SSRF protection for curl commands
      const ssrfCheck = await this.validateCurlSsrf(commandForChecks);
      if (!ssrfCheck.valid) {
        getSecurityLogger().log({
          eventType: 'blocked_command',
          severity: 'high',
          details: {
            tool: 'bash',
            command,
            reason: `SSRF protection: curl to private/internal network blocked (${ssrfCheck.blockedUrl})`,
          },
          sessionId: (input.sessionId as string) || 'unknown',
        });
        throw toolPermissionDenied(
          'bash',
          `Cannot fetch from local/private network addresses for security reasons: ${ssrfCheck.blockedUrl}`,
          input as Record<string, unknown>,
        );
      }
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let abortListenerAttached = false;
    let handleAbort: (() => void) | null = null;
    try {
      if (signal?.aborted) {
        throw new ToolExecutionError('Command execution aborted', {
          toolName: 'bash',
          toolInput: input,
          code: ErrorCodes.TOOL_EXECUTION_FAILED,
          recoverable: false,
          retryable: true,
          suggestion: 'Try again if you want to resume the command.',
        });
      }

      const runtime = getRuntime();
      const isWindows = process.platform === 'win32';
      const shellBinary = isWindows ? 'cmd' : (runtime.which('bash') || 'sh');
      const shellArgs = isWindows ? ['/c', commandForExec] : ['-lc', commandForExec];
      const proc = runtime.spawn([shellBinary, ...shellArgs], {
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      let aborted = false;
      handleAbort = () => {
        if (aborted) return;
        aborted = true;
        killProcess(proc);
      };
      if (signal) {
        signal.addEventListener('abort', handleAbort, { once: true });
        abortListenerAttached = true;
      }

      // Set up timeout
      timeoutId = setTimeout(killProcess, timeout, proc);

      const [stdout, stderr] = await Promise.all([
        proc.stdout ? new Response(proc.stdout).text() : '',
        proc.stderr ? new Response(proc.stderr).text() : '',
      ]);

      const exitCode = await proc.exited;

      if (aborted) {
        throw new ToolExecutionError('Command execution aborted', {
          toolName: 'bash',
          toolInput: input,
          code: ErrorCodes.TOOL_EXECUTION_FAILED,
          recoverable: false,
          retryable: true,
          suggestion: 'Try again if you want to resume the command.',
        });
      }

      if (exitCode !== 0) {
        throw toolError('bash', `Exit code ${exitCode}\n${stderr || stdout}`.trim(), {
          input: input as Record<string, unknown>,
        });
      }

      return stdout.trim() || 'Command completed successfully (no output)';
    } catch (error) {
      if (error instanceof ToolExecutionError) throw error;
      throw toolError('bash', error instanceof Error ? error.message : String(error), {
        input: input as Record<string, unknown>,
      });
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (signal && abortListenerAttached && handleAbort) {
        signal.removeEventListener('abort', handleAbort);
      }
    }
  };
}

export const __test__ = {
  killProcess,
};
