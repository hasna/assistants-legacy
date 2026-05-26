/**
 * Per-type message components (plan 8d98da29 P4.2).
 *
 * Message rendering split out of the former 661-line Messages.tsx into focused,
 * independently-testable units: role renderers (User/Assistant), the dispatcher,
 * grouped tool messages, the tool-rendering parts, and pure text helpers.
 */
export { MessageBubble, CombinedToolMessage } from './MessageBubble';
export { UserMessage } from './UserMessage';
export { AssistantMessage } from './AssistantMessage';
export { ToolCallsBlock, ToolResultPanel, ActiveToolsPanel, type ActivityEntry } from './ToolParts';
export { stripAnsi, normalizeUserDisplay, startsWithListOrTable } from './helpers';
