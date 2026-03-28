import React, { useMemo, useState } from 'react';
import type { ToolCall, ToolResult } from '@hasna/assistants-shared';
import { basename } from 'path';
import { themeColor } from '../theme/colors';
import { CodeBlock, getFiletypeForToolResult, getFiletypeFromPath, shouldHighlightToolResult } from './CodeBlock';
import { truncateToolResult, truncateToolResultWithInfo } from './toolDisplay';
import { TerminalImage } from './TerminalImage';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';

/**
 * ToolCallDisplay renders a single tool call in OpenCode style:
 *   -> ToolName params
 * with expandable results using <code>/<diff> components.
 *
 * [brutus] Created for OpenCode-style tool call rendering.
 */

// ============================================
// Edit Tool Diff Helpers
// ============================================

function generateUnifiedDiff(oldText: string, newText: string, filePath?: string): string {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const file = filePath ? basename(filePath) : 'file';

  const diffLines: string[] = [
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
  ];

  for (const line of oldLines) {
    diffLines.push(`-${line}`);
  }
  for (const line of newLines) {
    diffLines.push(`+${line}`);
  }

  return diffLines.join('\n');
}

function isEditToolCall(toolCall: ToolCall): boolean {
  return (
    (toolCall.name === 'edit' || toolCall.name === 'file_edit') &&
    typeof toolCall.input.old_string === 'string' &&
    typeof toolCall.input.new_string === 'string' &&
    toolCall.input.old_string !== '' &&
    toolCall.input.new_string !== ''
  );
}

// ============================================
// URL linkification
// ============================================

const URL_PATTERN = /https?:\/\/[^\s<>"\])\u0000-\u001F]+/g;

function linkifyText(text: string): React.ReactNode {
  if (!text) return text;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  URL_PATTERN.lastIndex = 0;
  while ((match = URL_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const url = match[0];
    parts.push(<link key={match.index} href={url}>{url}</link>);
    lastIndex = match.index + url.length;
  }
  if (lastIndex === 0) return text;
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return <>{parts}</>;
}

function indentMultiline(text: string, padding: string): string {
  const parts = text.split('\n');
  if (parts.length <= 1) return text;
  return [parts[0], ...parts.slice(1).map((line) => `${padding}${line}`)].join('\n');
}

// ============================================
// Tool name formatting
// ============================================

const TOOL_NAME_MAP: Record<string, string> = {
  bash: 'Bash',
  read: 'Read',
  write: 'Write',
  glob: 'Glob',
  grep: 'Grep',
  web_fetch: 'WebFetch',
  web_search: 'WebSearch',
  curl: 'Curl',
  edit: 'Edit',
  file_edit: 'Edit',
  display_image: 'Image',
  schedule: 'Schedule',
  submit_feedback: 'Feedback',
  ask_user: 'Ask',
  notion: 'Notion',
  gmail: 'Gmail',
  googledrive: 'GoogleDrive',
  googlecalendar: 'GoogleCalendar',
  linear: 'Linear',
  slack: 'Slack',
};

export function capitalizeToolName(name: string): string {
  if (TOOL_NAME_MAP[name]) return TOOL_NAME_MAP[name];
  return name
    .replace(/^connect[_-]/, '')
    .split(/[_-]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Get short context from tool call input for display as params
 */
function getToolParams(toolCall: ToolCall): string {
  const { name, input } = toolCall;
  switch (name) {
    case 'bash':
      return truncate(String(input.command || ''), 60);
    case 'read': {
      const path = String(input.path || input.file_path || '');
      return basename(path) || path;
    }
    case 'write': {
      const writePath = String(input.filename || input.path || input.file_path || '');
      return basename(writePath) || writePath;
    }
    case 'edit':
    case 'file_edit': {
      const editPath = String(input.file_path || input.path || '');
      return basename(editPath) || editPath;
    }
    case 'glob':
      return truncate(String(input.pattern || ''), 60);
    case 'grep':
      return truncate(String(input.pattern || ''), 60);
    case 'web_search':
      return truncate(String(input.query || ''), 60);
    case 'web_fetch':
    case 'curl': {
      const url = String(input.url || '');
      try { return new URL(url).hostname; } catch { return truncate(url, 60); }
    }
    case 'schedule':
      return String(input.action || '');
    case 'submit_feedback':
      return String(input.type || 'feedback');
    default: {
      const action = input.action || input.command || input.operation;
      if (action) return truncate(String(action), 60);
      const entries = Object.entries(input)
        .filter(([_, v]) => v !== undefined && v !== null && v !== '')
        .slice(0, 1);
      if (entries.length > 0) {
        const str = typeof entries[0][1] === 'string' ? entries[0][1] as string : JSON.stringify(entries[0][1]);
        return truncate(String(str), 50);
      }
      return '';
    }
  }
}

// ============================================
// Compact summary builder
// ============================================

function getToolCategory(name: string): string {
  switch (name) {
    case 'grep': case 'glob': case 'web_search': return 'search';
    case 'read': return 'read';
    case 'write': case 'edit': case 'file_edit': return 'write';
    case 'bash': return 'bash';
    case 'web_fetch': case 'curl': return 'fetch';
    case 'memory_recall': return 'memory_recall';
    case 'memory_save': return 'memory_save';
    case 'memory_forget': return 'memory_forget';
    case 'memory_list': case 'memory_stats': case 'memory_export': return 'memory_query';
    case 'memory_update': case 'memory_import': return 'memory_update';
    default: return 'other';
  }
}

export function buildToolCallSummary(toolCalls: ToolCall[], isRunning: boolean): string {
  const groups = new Map<string, number>();
  for (const tc of toolCalls) {
    const cat = getToolCategory(tc.name);
    groups.set(cat, (groups.get(cat) || 0) + 1);
  }

  const parts: string[] = [];
  for (const [category, count] of groups) {
    const pl = count === 1;
    switch (category) {
      case 'search': parts.push(isRunning ? `Searching for ${count} ${pl ? 'pattern' : 'patterns'}` : `Searched ${count} ${pl ? 'pattern' : 'patterns'}`); break;
      case 'read': parts.push(isRunning ? `reading ${count} ${pl ? 'file' : 'files'}` : `read ${count} ${pl ? 'file' : 'files'}`); break;
      case 'write': parts.push(isRunning ? `writing ${count} ${pl ? 'file' : 'files'}` : `wrote ${count} ${pl ? 'file' : 'files'}`); break;
      case 'bash': parts.push(isRunning ? `running ${count} ${pl ? 'command' : 'commands'}` : `ran ${count} ${pl ? 'command' : 'commands'}`); break;
      case 'fetch': parts.push(isRunning ? `fetching ${count} ${pl ? 'URL' : 'URLs'}` : `fetched ${count} ${pl ? 'URL' : 'URLs'}`); break;
      case 'memory_recall': parts.push(isRunning ? `recalling ${count} ${pl ? 'memory' : 'memories'}` : `Recalled ${count} ${pl ? 'memory' : 'memories'}`); break;
      case 'memory_save': parts.push(isRunning ? `saving ${count} ${pl ? 'memory' : 'memories'}` : `wrote ${count} ${pl ? 'memory' : 'memories'}`); break;
      case 'memory_forget': parts.push(isRunning ? `forgetting ${count} ${pl ? 'memory' : 'memories'}` : `forgot ${count} ${pl ? 'memory' : 'memories'}`); break;
      case 'memory_query': parts.push(isRunning ? `querying memories` : `queried memories`); break;
      case 'memory_update': parts.push(isRunning ? `updating ${count} ${pl ? 'memory' : 'memories'}` : `updated ${count} ${pl ? 'memory' : 'memories'}`); break;
      default: parts.push(isRunning ? `running ${count} ${pl ? 'tool' : 'tools'}` : `ran ${count} ${pl ? 'tool' : 'tools'}`); break;
    }
  }

  if (parts.length > 0) {
    parts[0] = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  }
  return parts.join(', ');
}

// ============================================
// Main Components
// ============================================

interface ToolCallDisplayProps {
  toolCall: ToolCall;
  result?: ToolResult;
  /** Whether this tool is currently running */
  isRunning?: boolean;
  /** Elapsed time in ms */
  elapsedMs?: number;
  /** Show full output */
  verboseTools?: boolean;
}

/**
 * Single tool call display per OpenCode spec:
 * - Left border with borderDim (TextMuted) color
 * - "ToolName: params" header line in muted text
 * - Result content truncated to max 10 lines with "[N more lines]"
 * - Error results shown in error color
 *
 * [brutus] Rewritten to match OpenCode spec exactly.
 */
export function ToolCallDisplay({
  toolCall,
  result,
  isRunning = false,
  elapsedMs,
  verboseTools = false,
}: ToolCallDisplayProps) {
  const mutedCol = themeColor('muted');
  const errorCol = themeColor('error');
  const borderDimCol = themeColor('borderDim');

  const isError = result?.isError;
  const toolName = capitalizeToolName(toolCall.name);
  const params = getToolParams(toolCall);

  // Build header: "ToolName: params" or "ToolName: Building command..." when running
  const headerText = isRunning
    ? `${toolName}: ${getInProgressText(toolCall.name)}`
    : params
      ? `${toolName}: ${params}`
      : toolName;

  // Handle display_image specially
  if (result && toolCall.name === 'display_image' && !result.isError) {
    try {
      const imgData = JSON.parse(result.content);
      if (imgData.path) {
        return (
          <box
            borderStyle="single"
            borderColor={borderDimCol}
            border={['left']}
            paddingLeft={1}
            flexDirection="column"
          >
            <text fg={mutedCol}>{headerText}</text>
            <TerminalImage src={imgData.path} width={imgData.width} height={imgData.height} alt={imgData.alt || 'image'} />
          </box>
        );
      }
    } catch { /* fall through */ }
  }

  return (
    <box
      borderStyle="single"
      borderColor={borderDimCol}
      border={['left']}
      paddingLeft={1}
      flexDirection="column"
    >
      {/* Tool call header: "ToolName: params" in muted */}
      <text fg={mutedCol}>{headerText}</text>

      {/* Result content — truncated to 10 lines per spec */}
      {result && !isRunning && (
        <ToolCallResultContent
          toolCall={toolCall}
          result={result}
          verboseTools={verboseTools}
        />
      )}
    </box>
  );
}

/**
 * Renders tool result content below the header line.
 * Per OpenCode spec: max 10 lines, "[N more lines]" truncation indicator,
 * error results in error color. Uses <diff> for edits, <code> for file/code.
 *
 * [brutus] Updated to match OpenCode spec — 10 line max, "[N more lines]" hint.
 */
function ToolCallResultContent({
  toolCall,
  result,
  verboseTools = false,
}: {
  toolCall: ToolCall;
  result: ToolResult;
  verboseTools?: boolean;
}) {
  const mutedCol = themeColor('muted');
  const errorCol = themeColor('error');

  // Error results shown in error color
  if (result.isError) {
    const errorText = result.content || 'Unknown error';
    return <text fg={errorCol}>Error: {errorText}</text>;
  }

  // Show <diff> for edit tool calls
  if (isEditToolCall(toolCall)) {
    return <EditDiffView toolCall={toolCall} />;
  }

  // Truncate to 10 lines per OpenCode spec
  const truncatedResult = truncateToolResultWithInfo(result, 10, 800, { verbose: verboseTools });
  const resultText = truncatedResult?.content || '';
  if (!resultText) return null;

  const wasTruncated = !verboseTools && truncatedResult?.truncation.wasTruncated;
  const moreLines = truncatedResult ? truncatedResult.truncation.originalLines - truncatedResult.truncation.displayedLines : 0;

  if (shouldHighlightToolResult(toolCall.name, resultText, result.isError)) {
    const filetype = getFiletypeForToolResult(toolCall);
    return (
      <box flexDirection="column">
        <CopyableCodeBlock content={resultText} filetype={filetype} />
        {wasTruncated && moreLines > 0 && (
          <text fg={mutedCol}>[{moreLines} more lines]</text>
        )}
      </box>
    );
  }

  return (
    <box flexDirection="column">
      <text fg={mutedCol}>{linkifyText(resultText)}</text>
      {wasTruncated && moreLines > 0 && (
        <text fg={mutedCol}>[{moreLines} more lines]</text>
      )}
    </box>
  );
}

/**
 * Returns in-progress text for a tool call per OpenCode spec.
 */
function getInProgressText(toolName: string): string {
  switch (toolName) {
    case 'bash': return 'Building command...';
    case 'edit':
    case 'file_edit': return 'Preparing edit...';
    case 'write': return 'Preparing write...';
    case 'read':
    case 'view': return 'Reading...';
    case 'grep':
    case 'glob': return 'Searching...';
    case 'web_search': return 'Searching...';
    case 'web_fetch':
    case 'curl':
    case 'fetch': return 'Fetching...';
    default: return 'Working...';
  }
}

function EditDiffView({ toolCall }: { toolCall: ToolCall }) {
  const oldStr = String(toolCall.input.old_string || '');
  const newStr = String(toolCall.input.new_string || '');
  const filePath = String(toolCall.input.file_path || toolCall.input.path || '');
  const filetype = filePath ? getFiletypeFromPath(filePath) : undefined;

  const diffText = useMemo(
    () => generateUnifiedDiff(oldStr, newStr, filePath),
    [oldStr, newStr, filePath],
  );

  return (
    <box marginLeft={3}>
      <diff
        diff={diffText}
        view="unified"
        showLineNumbers={false}
        filetype={filetype}
        width="100%"
      />
    </box>
  );
}

function CopyableCodeBlock({ content, filetype }: { content: string; filetype?: string }) {
  const { copy, justCopied } = useCopyToClipboard();

  return (
    <box flexDirection="column">
      <box flexDirection="row" justifyContent="flex-end">
        <box onMouseUp={() => copy(content)}>
          <text fg={justCopied ? themeColor('success') : '#636d83'}>
            {justCopied ? '[copied]' : '[copy]'}
          </text>
        </box>
      </box>
      <CodeBlock content={content} filetype={filetype} />
    </box>
  );
}

// ============================================
// Compact Summary for multiple tool calls
// ============================================

interface ToolCallSummaryProps {
  toolCalls: ToolCall[];
  toolResults?: ToolResult[];
  isRunning?: boolean;
}

/**
 * Renders a compact one-line summary for 2+ tool calls.
 * Uses borderDim left border per OpenCode spec.
 *
 * [brutus] Updated to use left border instead of arrow prefix.
 */
export function ToolCallSummary({ toolCalls, toolResults = [], isRunning = false }: ToolCallSummaryProps) {
  const mutedCol = themeColor('muted');
  const borderDimCol = themeColor('borderDim');

  const summary = buildToolCallSummary(toolCalls, !!isRunning);
  const suffix = isRunning ? '\u2026' : '';

  return (
    <box
      borderStyle="single"
      borderColor={borderDimCol}
      border={['left']}
      paddingLeft={1}
    >
      <text fg={mutedCol}>{summary}{suffix}</text>
    </box>
  );
}

// ============================================
// Duration formatting
// ============================================

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  return `${mins}m ${secs}s`;
}

export { formatDuration, getToolParams, linkifyText, indentMultiline, isEditToolCall, generateUnifiedDiff };
