import type { Tool } from '@hasna/assistants-shared';
import type { ToolExecutor } from './registry';
import { resolve } from 'path';
import { homedir } from 'os';
import { ErrorCodes, ToolExecutionError } from '../errors';
import { isPathSafe } from '../security/path-validator';
import { getRuntime } from '../runtime';

/**
 * Resolve input path, expanding ~ to home directory.
 */
function resolveInputPath(inputPath: string): string {
  const envHome = process.env.HOME || process.env.USERPROFILE;
  const home = envHome && envHome.trim().length > 0 ? envHome : homedir();
  if (inputPath === '~') {
    return home;
  }
  if (inputPath.startsWith('~/')) {
    return resolve(home, inputPath.slice(2));
  }
  return resolve(inputPath);
}

/**
 * Diff tool — compare two files or a file against provided content using unified diff format.
 */
const diffTool: Tool = {
  name: 'diff',
  description:
    'Compare two files and show differences in unified diff format. ' +
    'Provide file_a and file_b to compare two files, or file_a and content_b to compare a file against a string.',
  parameters: {
    type: 'object',
    properties: {
      file_a: {
        type: 'string',
        description: 'Path to the first file (required).',
      },
      file_b: {
        type: 'string',
        description: 'Path to the second file. Mutually exclusive with content_b.',
      },
      content_b: {
        type: 'string',
        description: 'String content to compare against file_a. Mutually exclusive with file_b.',
      },
      context_lines: {
        type: 'number',
        description: 'Number of context lines around changes (default: 3).',
      },
    },
    required: ['file_a'],
  },
};

const diffExecutor: ToolExecutor = async (input, signal) => {
  const fileA = input.file_a as string | undefined;
  const fileB = input.file_b as string | undefined;
  const contentB = input.content_b as string | undefined;
  const contextLines = typeof input.context_lines === 'number' ? Math.max(0, Math.round(input.context_lines)) : 3;

  if (!fileA) {
    throw new ToolExecutionError('file_a is required.', {
      toolName: 'diff',
      toolInput: input,
      code: ErrorCodes.VALIDATION_SCHEMA_ERROR,
      recoverable: false,
      retryable: false,
      suggestion: 'Provide file_a as an absolute or relative path.',
    });
  }

  if (!fileB && contentB === undefined) {
    throw new ToolExecutionError('Either file_b or content_b must be provided.', {
      toolName: 'diff',
      toolInput: input,
      code: ErrorCodes.VALIDATION_SCHEMA_ERROR,
      recoverable: false,
      retryable: false,
      suggestion: 'Provide file_b (path to second file) or content_b (string to compare against).',
    });
  }

  if (fileB && contentB !== undefined) {
    throw new ToolExecutionError('Provide either file_b or content_b, not both.', {
      toolName: 'diff',
      toolInput: input,
      code: ErrorCodes.VALIDATION_SCHEMA_ERROR,
      recoverable: false,
      retryable: false,
      suggestion: 'Use file_b to compare two files, or content_b to compare a file against a string.',
    });
  }

  // Validate file_a path
  const resolvedA = resolveInputPath(fileA);
  const safetyA = await isPathSafe(resolvedA, 'read');
  if (!safetyA.safe) {
    throw new ToolExecutionError(`Cannot read file_a: ${safetyA.reason}`, {
      toolName: 'diff',
      toolInput: input,
      code: ErrorCodes.TOOL_PERMISSION_DENIED,
      recoverable: false,
      retryable: false,
    });
  }

  const runtime = getRuntime();

  if (fileB) {
    // Compare two files
    const resolvedB = resolveInputPath(fileB);
    const safetyB = await isPathSafe(resolvedB, 'read');
    if (!safetyB.safe) {
      throw new ToolExecutionError(`Cannot read file_b: ${safetyB.reason}`, {
        toolName: 'diff',
        toolInput: input,
        code: ErrorCodes.TOOL_PERMISSION_DENIED,
        recoverable: false,
        retryable: false,
      });
    }

    return runDiff(runtime, ['-u', `-U${contextLines}`, resolvedA, resolvedB], signal);
  }

  // Compare file_a against content_b using process substitution via a temp approach
  // Write content_b to stdin via a temp file label using /dev/stdin
  // Simpler: use diff with - for stdin
  return runDiffWithStdin(runtime, ['-u', `-U${contextLines}`, resolvedA, '-'], contentB as string, signal);
};

/**
 * Run diff command and return output.
 * diff exits 0 = identical, 1 = differences found, 2 = error.
 */
async function runDiff(
  runtime: ReturnType<typeof getRuntime>,
  args: string[],
  signal?: AbortSignal,
): Promise<string> {
  const proc = runtime.spawn(['diff', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  let aborted = false;
  let handleAbort: (() => void) | null = null;
  if (signal) {
    handleAbort = () => {
      aborted = true;
      proc.kill();
    };
    signal.addEventListener('abort', handleAbort, { once: true });
  }

  try {
    const [stdout, stderr] = await Promise.all([
      proc.stdout ? new Response(proc.stdout).text() : '',
      proc.stderr ? new Response(proc.stderr).text() : '',
    ]);

    const exitCode = await proc.exited;

    if (aborted) {
      throw new ToolExecutionError('Diff aborted.', {
        toolName: 'diff',
        toolInput: {},
        code: ErrorCodes.TOOL_EXECUTION_FAILED,
        recoverable: false,
        retryable: true,
      });
    }

    if (exitCode === 0) {
      return 'Files are identical — no differences found.';
    }

    if (exitCode === 1) {
      return stdout;
    }

    // exitCode === 2 or other: error
    throw new ToolExecutionError(`diff failed: ${stderr || stdout}`.trim(), {
      toolName: 'diff',
      toolInput: {},
      code: ErrorCodes.TOOL_EXECUTION_FAILED,
      recoverable: false,
      retryable: false,
    });
  } finally {
    if (signal && handleAbort) {
      signal.removeEventListener('abort', handleAbort);
    }
  }
}

/**
 * Run diff with content_b piped to stdin (using `-` as second file).
 */
async function runDiffWithStdin(
  runtime: ReturnType<typeof getRuntime>,
  args: string[],
  stdinContent: string,
  signal?: AbortSignal,
): Promise<string> {
  const proc = runtime.spawn(['diff', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'pipe',
  });

  let aborted = false;
  let handleAbort: (() => void) | null = null;
  if (signal) {
    handleAbort = () => {
      aborted = true;
      proc.kill();
    };
    signal.addEventListener('abort', handleAbort, { once: true });
  }

  try {
    // Write content to stdin
    if (proc.stdin) {
      const writer = proc.stdin.getWriter();
      await writer.write(new TextEncoder().encode(stdinContent));
      await writer.close();
    }

    const [stdout, stderr] = await Promise.all([
      proc.stdout ? new Response(proc.stdout).text() : '',
      proc.stderr ? new Response(proc.stderr).text() : '',
    ]);

    const exitCode = await proc.exited;

    if (aborted) {
      throw new ToolExecutionError('Diff aborted.', {
        toolName: 'diff',
        toolInput: {},
        code: ErrorCodes.TOOL_EXECUTION_FAILED,
        recoverable: false,
        retryable: true,
      });
    }

    if (exitCode === 0) {
      return 'Content is identical to file — no differences found.';
    }

    if (exitCode === 1) {
      return stdout;
    }

    throw new ToolExecutionError(`diff failed: ${stderr || stdout}`.trim(), {
      toolName: 'diff',
      toolInput: {},
      code: ErrorCodes.TOOL_EXECUTION_FAILED,
      recoverable: false,
      retryable: false,
    });
  } finally {
    if (signal && handleAbort) {
      signal.removeEventListener('abort', handleAbort);
    }
  }
}

export class DiffTool {
  static readonly tool: Tool = diffTool;
  static readonly executor: ToolExecutor = diffExecutor;
}
