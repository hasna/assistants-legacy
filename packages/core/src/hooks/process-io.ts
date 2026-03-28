/**
 * Shared process I/O utilities for hook execution
 *
 * Extracts the duplicated stdin-writing pattern used across
 * executor.ts, tester.ts, and cli-bridge.ts into a single place.
 */

import type { HookInput } from '@hasna/assistants-shared';

/**
 * Stdin handle type that covers both Web WritableStream and Bun FileSink APIs
 */
type StdinHandle = {
  getWriter?: () => { write: (chunk: Uint8Array) => Promise<void> | void; close: () => Promise<void> | void };
  write?: (chunk: Uint8Array) => Promise<void> | void;
  end?: () => Promise<void> | void;
} | null;

/**
 * Write JSON-encoded hook input to a process stdin, then close the stream.
 * Handles both Web WritableStream (getWriter) and Bun FileSink (write/end) APIs.
 */
export async function writeInputToStdin(stdin: unknown, input: HookInput): Promise<void> {
  const handle = stdin as StdinHandle;
  if (!handle) return;

  const data = new TextEncoder().encode(JSON.stringify(input));

  if (handle.getWriter) {
    const writer = handle.getWriter();
    await writer.write(data);
    await writer.close();
  } else if (handle.write) {
    await handle.write(data);
    if (handle.end) {
      await handle.end();
    }
  }
}

/**
 * Fire-and-forget version of writeInputToStdin for async hooks.
 * Logs errors but does not throw.
 */
export function writeInputToStdinAsync(stdin: unknown, input: HookInput, label: string): void {
  const handle = stdin as StdinHandle;
  if (!handle) return;

  const data = new TextEncoder().encode(JSON.stringify(input));

  if (handle.getWriter) {
    const writer = handle.getWriter();
    void Promise.resolve(writer.write(data)).then(() => writer.close()).catch((err) => {
      console.error(`[Hook] Async hook stdin error (${label}):`, err);
    });
  } else if (handle.write) {
    void Promise.resolve(handle.write(data)).then(() => handle.end?.()).catch((err) => {
      console.error(`[Hook] Async hook stdin error (${label}):`, err);
    });
  }
}
