#!/usr/bin/env bun
/**
 * @hasna/assistants MCP server entry point.
 *
 * Split into domain modules:
 *   mcp-utils.ts   — Auth, rate limiting, hooks, audit log, dynamic tools, validation (~313 LOC)
 *   mcp-server.ts  — createServer() implementation + CLI entrypoint (~808 LOC)
 */
import { setRuntime, hasRuntime } from '@hasna/assistants-core';
import { bunRuntime } from '@hasna/runtime-bun';

// Initialize Bun runtime
if (!hasRuntime()) {
  setRuntime(bunRuntime);
}

export * from './mcp-utils';
export { createServer } from './mcp-server';
