import { ErrorCodes, ToolExecutionError } from '../errors';

export interface FetchWithTimeoutOptions extends RequestInit {
  timeout?: number;
  toolName?: string;
  toolInput?: unknown;
}

/**
 * Fetch a URL with an automatic timeout.
 *
 * Creates an AbortController, sets a timeout that aborts the request, performs
 * the fetch, and clears the timeout on completion.  If the request is aborted
 * due to the timeout, a ToolExecutionError with TOOL_TIMEOUT code is thrown.
 *
 * Any existing AbortSignal supplied in `options.signal` is composed
 * with the timeout signal so either can abort the request.
 */
export async function fetchWithTimeout(
  url: string,
  options?: FetchWithTimeoutOptions,
): Promise<Response> {
  const {
    timeout = 30_000,
    signal: externalSignal,
    toolName,
    toolInput,
    ...fetchInit
  } = options ?? {};
  const errorToolName = toolName ?? 'fetch';
  const errorToolInput = toolInput ?? { url };

  const controller = new AbortController();
  let abortReason: 'timeout' | 'external' | null = null;

  const handleExternalAbort = () => {
    if (abortReason) return;
    abortReason = 'external';
    controller.abort();
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      abortReason = 'external';
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', handleExternalAbort, { once: true });
    }
  }

  const timeoutId = setTimeout(() => {
    if (abortReason) return;
    abortReason = 'timeout';
    controller.abort();
  }, timeout);

  try {
    const response = await fetch(url, {
      ...fetchInit,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      if (abortReason === 'timeout') {
        throw new ToolExecutionError(`Request timed out after ${timeout}ms`, {
          toolName: errorToolName,
          toolInput: errorToolInput,
          code: ErrorCodes.TOOL_TIMEOUT,
          recoverable: true,
          retryable: true,
          suggestion: 'Try again or increase the timeout.',
        });
      }
      throw new ToolExecutionError('Request aborted', {
        toolName: errorToolName,
        toolInput: errorToolInput,
        code: ErrorCodes.TOOL_EXECUTION_FAILED,
        recoverable: false,
        retryable: true,
        suggestion: 'Try again if you want to resume the request.',
      });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', handleExternalAbort);
    }
  }
}
