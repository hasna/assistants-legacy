/**
 * Agent Loop Factory
 *
 * Creates the AI SDK-backed agent loop.
 */

import type { AssistantBackend } from '../identity/types';
import { AssistantLoop, type AssistantLoopOptions } from './loop';

export type AgentLoop = AssistantLoop;

export function createAgentLoop(
  _backend: AssistantBackend | undefined,
  options: AssistantLoopOptions = {}
): AgentLoop {
  return new AssistantLoop(options);
}
