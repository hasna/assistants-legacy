import React, { useEffect, useMemo, useState, useRef, useCallback, useImperativeHandle } from 'react';
import { useTerminalDimensions } from '@opentui/react';
import type { TextareaRenderable } from '@opentui/core';
import { CommandHistory, getCommandHistory } from '@hasna/assistants-core';
import { useSafeInput as useInput } from '../hooks/useSafeInput';
import { themeColor } from '../theme/colors';

// Deterministic color palette for assistant badges (white text on colored bg)
const ASSISTANT_COLORS = [
  '#6B4C9A', // purple
  '#2E86AB', // cerulean
  '#A23B72', // mulberry
  '#1B813E', // forest
  '#C1440E', // rust
  '#5B5EA6', // indigo
  '#9B2335', // crimson
  '#2D6A4F', // teal green
  '#7C4DFF', // violet
  '#D4621B', // tangerine
];

function getAssistantColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return ASSISTANT_COLORS[Math.abs(hash) % ASSISTANT_COLORS.length];
}

// Available commands with descriptions
const COMMANDS = [
  // Core commands
  { name: '/help', description: 'show available commands' },
  { name: '/clear', description: 'clear the conversation' },
  { name: '/new', description: 'start a new conversation' },
  { name: '/exit', description: 'exit assistants' },
  { name: '/templates', description: 'list session templates' },
  // Session management
  { name: '/sessions', description: 'list/switch sessions (Ctrl+])' },
  { name: '/history', description: 'search past sessions' },
  { name: '/status', description: 'show session status' },
  { name: '/tokens', description: 'show token usage' },
  { name: '/cost', description: 'show estimated API cost' },
  { name: '/model', description: 'select or switch model interactively' },
  { name: '/compact', description: 'summarize to save context' },
  { name: '/replay', description: 'redisplay last N messages' },
  // Skills and tools
  { name: '/skills', description: 'browse, create, and manage skills' },
  { name: '/connectors', description: 'list available connectors' },
  // Configuration
  { name: '/config', description: 'show configuration' },
  { name: '/init', description: 'initialize assistants in project' },
  { name: '/pin', description: 'bookmark last assistant message' },
  { name: '/pins', description: 'show pinned messages' },
  { name: '/memory', description: 'show what AI remembers' },
  { name: '/context', description: 'manage injected project context' },
  { name: '/hooks', description: 'manage hooks (list, add, remove, test)' },
  { name: '/onboarding', description: 'rerun onboarding setup' },
  // Projects and plans
  { name: '/projects', description: 'manage projects in this folder' },
  { name: '/plans', description: 'manage project plans' },
  // Scheduling
  { name: '/schedules', description: 'manage scheduled commands' },
  // Budgets
  { name: '/budget', description: 'manage budget profiles' },
  { name: '/budgets', description: 'manage budget profiles' },
  // Identity and assistant
  { name: '/assistants', description: 'switch or list assistants' },
  { name: '/identity', description: 'manage assistant identity' },
  { name: '/whoami', description: 'show current identity' },
  // Voice features
  { name: '/voice', description: 'toggle voice mode' },
  { name: '/say', description: 'speak text aloud' },
  { name: '/talk', description: 'live voice conversation (2s pause to send)' },
  // Assistant communication
  { name: '/messages', description: 'assistant messaging and email inbox' },
  { name: '/communication', description: 'manage calls, SMS, WhatsApp, routing' },
  // Resources
  { name: '/wallet', description: 'manage assistant wallet' },
  { name: '/secrets', description: 'manage assistant secrets' },
  { name: '/jobs', description: 'manage background jobs' },
  { name: '/contacts', description: 'manage contacts address book' },
  { name: '/docs', description: 'interactive app documentation' },
  // Export
  { name: '/export', description: 'export conversation to markdown' },
  // Git
  { name: '/diff', description: 'show git diff of changes' },
  { name: '/undo', description: 'revert uncommitted changes' },
  // System
  { name: '/logs', description: 'view security event logs' },
  { name: '/verification', description: 'scope verification status' },
  { name: '/feedback', description: 'submit feedback on GitHub' },
];

interface SkillInfo {
  name: string;
  description: string;
  argumentHint?: string;
}

// Default paste threshold configuration (can be overridden via props)
const DEFAULT_PASTE_THRESHOLDS = {
  chars: 500,
  words: 100,
  lines: 20,
};

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countLines(text: string): number {
  return text.split('\n').length;
}

function formatPastePlaceholder(text: string): string {
  const chars = text.length;
  const words = countWords(text);
  return `📋 Pasted ${words.toLocaleString()} words / ${chars.toLocaleString()} chars`;
}

interface PasteThresholds {
  chars?: number;
  words?: number;
  lines?: number;
}

function isLargePaste(text: string, thresholds: PasteThresholds = DEFAULT_PASTE_THRESHOLDS): boolean {
  const charThreshold = thresholds.chars ?? DEFAULT_PASTE_THRESHOLDS.chars;
  const wordThreshold = thresholds.words ?? DEFAULT_PASTE_THRESHOLDS.words;
  const lineThreshold = thresholds.lines ?? DEFAULT_PASTE_THRESHOLDS.lines;

  return (
    text.length > charThreshold ||
    countWords(text) > wordThreshold ||
    countLines(text) > lineThreshold
  );
}

interface PasteConfig {
  /** Whether large paste handling is enabled (default: true) */
  enabled?: boolean;
  /** Paste detection thresholds */
  thresholds?: PasteThresholds;
  /** Display mode: 'placeholder' (default), 'preview', 'confirm', 'inline' */
  mode?: 'placeholder' | 'preview' | 'confirm' | 'inline';
}

interface InputProps {
  onSubmit: (value: string, mode: 'normal' | 'interrupt' | 'queue' | 'inline') => void;
  onStopProcessing?: () => void;
  isProcessing?: boolean;
  queueLength?: number;
  commands?: { name: string; description: string }[];
  skills?: SkillInfo[];
  isAskingUser?: boolean;
  askPlaceholder?: string;
  allowBlankAnswer?: boolean;
  /** Active assistant name shown on the top-right of the input border */
  assistantName?: string;
  /** Optional command history instance (uses global singleton if not provided) */
  history?: CommandHistory;
  /** Optional paste handling configuration */
  pasteConfig?: PasteConfig;
  /** Whether push-to-talk recording is active */
  isRecording?: boolean;
  /** Recording status: 'recording', 'transcribing', or 'talking' */
  recordingStatus?: 'recording' | 'transcribing' | 'talking' | null;
  /** Callback to stop recording (e.g. when Enter is pressed during recording) */
  onStopRecording?: () => void;
  /** Callback to search files for @ autocomplete */
  onFileSearch?: (query: string) => string[];
  /** Live partial transcript from streaming STT (talk mode) */
  partialTranscript?: string;
  /** Model variant labels for the variants bar (e.g. ["Build", "MiMo V2", ...]) */
  modelVariants?: string[];
  /** Index of the active variant (default 0) */
  activeVariant?: number;
  /** Reasoning effort level (e.g. "low", "medium", "high") */
  reasoningEffort?: string;
}

export interface InputHandle {
  setValue: (value: string, cursor?: number, resetHistory?: boolean) => void;
  appendValue: (text: string) => void;
  clearValue: () => void;
  getValue: () => string;
}

export const Input = React.forwardRef<InputHandle, InputProps>(function Input({
  onSubmit,
  onStopProcessing,
  isProcessing,
  queueLength = 0,
  commands,
  skills = [],
  isAskingUser = false,
  askPlaceholder,
  allowBlankAnswer = false,
  assistantName,
  history: historyProp,
  pasteConfig,
  isRecording = false,
  recordingStatus,
  onStopRecording,
  onFileSearch,
  partialTranscript = '',
  modelVariants = [],
  activeVariant = 0,
  reasoningEffort,
}: InputProps, ref) {
  // Paste handling configuration with defaults
  const pasteEnabled = pasteConfig?.enabled !== false;
  const pasteThresholds = pasteConfig?.thresholds ?? DEFAULT_PASTE_THRESHOLDS;
  const pasteMode = pasteConfig?.mode ?? 'placeholder';

  // The OpenTUI <textarea> handles all text editing (cursor, insert, delete, undo/redo, etc.)
  // We track `value` in React state purely for autocomplete/history logic.
  const textareaRef = useRef<TextareaRenderable>(null);
  const [value, setValue] = useState('');

  // Large paste handling - when a large paste is detected, we show a placeholder
  // but keep the actual content stored for submission
  const [largePaste, setLargePaste] = useState<{
    content: string;
    placeholder: string;
  } | null>(null);
  const [showPastePreview, setShowPastePreview] = useState(false);

  // Command history - use prop or global singleton
  const historyRef = useRef<CommandHistory>(historyProp || getCommandHistory());
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Track whether we've modified the input since starting history navigation
  const [savedInput, setSavedInput] = useState<string>('');

  // Load history on mount
  useEffect(() => {
    historyRef.current.load().then(() => {
      setHistoryLoaded(true);
    });
  }, []);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const termDims = useTerminalDimensions();
  const screenWidth = termDims.width || 80;
  const textWidth = Math.max(10, screenWidth - 4);

  // Merge built-in commands with passed commands
  const allCommands = useMemo(() => {
    const merged = [...COMMANDS];
    if (commands) {
      for (const cmd of commands) {
        if (!merged.find(c => c.name === cmd.name)) {
          merged.push(cmd);
        }
      }
    }
    return merged.sort((a, b) => a.name.localeCompare(b.name));
  }, [commands]);

  // Determine autocomplete mode
  const autocompleteMode = useMemo(() => {
    if (isAskingUser) return null;
    if (value.startsWith('$') && !value.includes(' ')) {
      return 'skill';
    }
    if (value.startsWith('/') && !value.includes(' ')) {
      return 'command';
    }
    // Detect @ file picker: @ at start or after a space
    if (onFileSearch) {
      const atMatch = value.match(/(?:^|.*\s)@([^\s]*)$/);
      if (atMatch) {
        return 'file';
      }
    }
    return null;
  }, [value, isAskingUser, onFileSearch]);

  // Filter commands based on input
  const filteredCommands = useMemo(() => {
    if (autocompleteMode !== 'command') return [];
    const search = value.toLowerCase();
    return allCommands.filter(cmd => cmd.name.toLowerCase().startsWith(search));
  }, [value, autocompleteMode, allCommands]);

  // Filter skills based on input
  const filteredSkills = useMemo(() => {
    if (autocompleteMode !== 'skill') return [];
    const search = value.slice(1).toLowerCase(); // Remove $ prefix
    return skills.filter(skill => skill.name.toLowerCase().startsWith(search));
  }, [value, autocompleteMode, skills]);

  // Extract file search query and filter files
  const fileSearchQuery = useMemo(() => {
    if (autocompleteMode !== 'file') return '';
    const atMatch = value.match(/(?:^|.*\s)@([^\s]*)$/);
    return atMatch ? atMatch[1] : '';
  }, [value, autocompleteMode]);

  const filteredFiles = useMemo(() => {
    if (autocompleteMode !== 'file' || !onFileSearch) return [];
    return onFileSearch(fileSearchQuery);
  }, [autocompleteMode, fileSearchQuery, onFileSearch]);

  // Combined items for selection
  const autocompleteItems: Array<{ name: string }> = autocompleteMode === 'skill'
    ? filteredSkills
    : autocompleteMode === 'file'
      ? filteredFiles.map(f => ({ name: f }))
      : filteredCommands;

  // Keep selected index in range when list size changes
  useEffect(() => {
    if (autocompleteItems.length === 0) {
      setSelectedIndex(0);
      return;
    }
    setSelectedIndex((prev) => Math.min(prev, autocompleteItems.length - 1));
  }, [autocompleteItems.length]);

  // Helper to set the textarea text and sync React state
  const setTextareaValue = useCallback((nextValue: string, resetHistory: boolean = true) => {
    const normalized = normalizeLineEndings(nextValue);
    const ta = textareaRef.current;
    if (ta) {
      if (normalized === '') {
        // Use clear() for empty values — ensures placeholder re-renders correctly
        ta.clear();
      } else {
        ta.setText(normalized);
      }
    }
    setValue(normalized);
    setSelectedIndex(0);
    if (resetHistory) {
      historyRef.current.resetIndex(normalized);
    }
  }, []);

  const clearLargePaste = useCallback(() => {
    setLargePaste(null);
    setShowPastePreview(false);
  }, []);

  useImperativeHandle(ref, () => ({
    setValue: (nextValue: string, _nextCursor?: number, resetHistory = true) => {
      clearLargePaste();
      setTextareaValue(nextValue, resetHistory);
    },
    appendValue: (text: string) => {
      const cleaned = normalizeLineEndings(text);
      if (!cleaned) return;
      clearLargePaste();
      const ta = textareaRef.current;
      const current = ta ? ta.plainText : value;
      const newValue = current + cleaned;
      setTextareaValue(newValue);
    },
    clearValue: () => {
      clearLargePaste();
      setTextareaValue('');
    },
    getValue: () => textareaRef.current ? textareaRef.current.plainText : value,
  }), [clearLargePaste, setTextareaValue, value]);


  const handleSubmit = useCallback((submittedValue: string) => {
    // If there's a large paste pending, use that content instead
    const rawValue = largePaste ? largePaste.content : submittedValue;
    const actualValue = normalizeLineEndings(rawValue);

    // Allow blank submission only for optional ask-user questions
    if (!actualValue.trim() && !allowBlankAnswer) return;

    // Add to history before submitting (use truncated version for history)
    const valueToAdd = actualValue.trim();
    if (valueToAdd && !isAskingUser) {
      const historyEntry = largePaste
        ? `[Pasted ${countWords(valueToAdd)} words]`
        : valueToAdd;
      historyRef.current.add(historyEntry);
    }

    // Clear large paste state before submitting
    if (largePaste) {
      setLargePaste(null);
      setShowPastePreview(false);
    }

    if (
      autocompleteMode === 'command' &&
      filteredCommands.length > 0 &&
      !actualValue.includes(' ')
    ) {
      // Re-filter using actualValue (fresh from key handler) instead of stale filteredCommands.
      // When typing quickly, React state may lag, causing wrong autocomplete selection.
      const freshSearch = actualValue.toLowerCase();
      const exactMatch = allCommands.find(cmd => cmd.name.toLowerCase() === freshSearch);
      if (exactMatch) {
        historyRef.current.add(exactMatch.name);
        onSubmit(exactMatch.name, isProcessing ? 'inline' : 'normal');
        setTextareaValue('');
        return;
      }
      const selected = filteredCommands[selectedIndex] || filteredCommands[0];
      if (selected) {
        historyRef.current.add(selected.name);
        onSubmit(selected.name, isProcessing ? 'inline' : 'normal');
        setTextareaValue('');
        return;
      }
    }

    if (isProcessing) {
      onSubmit(actualValue, 'inline');
    } else {
      onSubmit(actualValue, 'normal');
    }
    setTextareaValue('');
  }, [largePaste, allowBlankAnswer, isAskingUser, autocompleteMode, filteredCommands, selectedIndex, isProcessing, onSubmit, setTextareaValue, allCommands]);

  // Sync textarea content changes to React state (for autocomplete logic)
  const handleContentChange = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const newValue = ta.plainText;

    // Clear any pending large paste if user types normally
    if (largePaste && newValue !== value) {
      setLargePaste(null);
      setShowPastePreview(false);
    }

    setValue(newValue);
    setSelectedIndex(0);
    historyRef.current.resetIndex(newValue);
  }, [value, largePaste]);

  // Handle keyboard input for control keys that override textarea behavior
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      if (isProcessing && onStopProcessing) {
        onStopProcessing();
        return;
      }
      if (value.length > 0) {
        setTextareaValue('');
      }
      return;
    }

    // Escape during processing: ALWAYS stop
    if (key.escape && isProcessing && onStopProcessing) {
      onStopProcessing();
      return;
    }

    // Escape: clear large paste, clear input, or exit history mode
    if (key.escape && !isAskingUser) {
      if (largePaste) {
        setLargePaste(null);
        setShowPastePreview(false);
        return;
      }
      if (historyRef.current.isNavigating()) {
        setTextareaValue(savedInput);
        setSavedInput('');
      } else if (value.length > 0) {
        setTextareaValue('');
      }
      return;
    }

    // Tab during processing: queue the message
    if (key.tab && isProcessing && value.trim()) {
      onSubmit(value, 'queue');
      setTextareaValue('');
      return;
    }

    if (!isAskingUser) {
      // Tab: autocomplete when idle
      if (key.tab) {
        if (autocompleteItems.length > 0) {
          const selected = autocompleteItems[selectedIndex] || autocompleteItems[0];
          if (autocompleteMode === 'file') {
            const atMatch = value.match(/^(.*(?:^|\s))@[^\s]*$/);
            const prefix = atMatch ? atMatch[1] : '';
            const nextValue = prefix + selected.name + ' ';
            setTextareaValue(nextValue);
          } else {
            const nextValue = autocompleteMode === 'skill'
              ? `$${selected.name} `
              : `${selected.name} `;
            setTextareaValue(nextValue);
          }
          return;
        }
      }

      // Arrow keys for autocomplete navigation (circular, single-line only)
      if (autocompleteItems.length > 0 && !value.includes('\n')) {
        if (key.downArrow) {
          setSelectedIndex((prev) => (prev + 1) % autocompleteItems.length);
          return;
        }
        if (key.upArrow) {
          setSelectedIndex((prev) => (prev - 1 + autocompleteItems.length) % autocompleteItems.length);
          return;
        }
      }
    }

    // Arrow up: history navigation
    if (key.upArrow) {
      const shouldNavigateHistory = value.length === 0 || historyRef.current.isNavigating() || !value.includes('\n');
      if (shouldNavigateHistory && !isAskingUser) {
        if (!historyRef.current.isNavigating()) {
          setSavedInput(value);
          historyRef.current.resetIndex(value);
        }
        const prev = historyRef.current.previous();
        if (prev !== null) {
          setTextareaValue(prev, false);
        }
        return;
      }
      // Multi-line vertical movement handled natively by textarea
      return;
    }

    // Arrow down: history navigation
    if (key.downArrow) {
      if (historyRef.current.isNavigating() && !isAskingUser) {
        const next = historyRef.current.next();
        if (next !== null) {
          setTextareaValue(next, false);
        }
        return;
      }
      // Multi-line vertical movement handled natively by textarea
      return;
    }

    if (key.return) {
      if (isRecording && onStopRecording) {
        onStopRecording();
        return;
      }
      // Read fresh value from textarea DOM to avoid stale React state when typing fast
      const freshValue = textareaRef.current?.plainText ?? value;
      if ((key.shift || key.ctrl) && freshValue.trim()) {
        onSubmit(freshValue, 'interrupt');
        setTextareaValue('');
        return;
      }
      if (key.meta && freshValue.trim() && input !== '\x1b\r' && input !== '\x1b\n') {
        onSubmit(freshValue, 'queue');
        setTextareaValue('');
        return;
      }
      handleSubmit(freshValue);
      setTextareaValue('');
      return;
    }
  });

  // Show different prompts based on state
  let placeholder = 'Type a message...';

  if (isAskingUser) {
    placeholder = askPlaceholder || 'Answer the question...';
  } else if (isProcessing) {
    placeholder = queueLength > 0
      ? 'Enter=inline | Tab=queue | Shift+Enter=interrupt'
      : 'Enter=send inline | Shift+Enter=interrupt';
  }

  // Truncate description to fit in terminal
  const truncateDescription = (desc: string, maxLen: number = 60) => {
    if (desc.length <= maxLen) return desc;
    return desc.slice(0, maxLen - 3) + '...';
  };

  // Autocomplete dropdown settings
  const maxVisible = 8;

  // Calculate visible window for scrolling
  const getVisibleItems = <T extends { name: string }>(items: T[]): { items: T[]; startIndex: number } => {
    if (items.length <= maxVisible) {
      return { items, startIndex: 0 };
    }

    let startIndex = Math.max(0, selectedIndex - Math.floor(maxVisible / 2));
    startIndex = Math.min(startIndex, items.length - maxVisible);

    return {
      items: items.slice(startIndex, startIndex + maxVisible),
      startIndex,
    };
  };

  const visibleSkills = getVisibleItems(filteredSkills);
  const visibleCommands = getVisibleItems(filteredCommands);
  const fileItems = useMemo(() => filteredFiles.map(f => ({ name: f })), [filteredFiles]);
  const visibleFiles = getVisibleItems(fileItems);

  // [cassius] Theme-aware colors for light/dark terminal contrast
  const mutedColor = themeColor('muted');

  const lineCount = value.split('\n').length;

  // OpenCode spec colors — editor uses BackgroundSecondary for visible contrast
  const bgColor = themeColor('surface');        // BackgroundSecondary: #252525 dark / #f0f0f0 light
  const textColor = themeColor('text');         // Text: #e0e0e0 dark / #2a2a2a light
  const textMuted = themeColor('muted');        // TextMuted: #6a6a6a dark / #8a8a8a light

  const secondaryCol = themeColor('secondary');

  return (
    <box flexDirection="column" marginTop={0}>
      {/* Editor area — OpenCode uses Background color, no borders */}
      <box
        flexDirection="column"
        flexGrow={1}
        bg={bgColor}
        paddingX={1}
        minHeight={1}
      >
        {/* Recording indicator */}
        {recordingStatus === 'recording' && (
          <box flexDirection="row" paddingY={0}>
            <text fg={themeColor('error')} bg={bgColor}><b>Recording... </b></text>
            <text fg={textMuted} bg={bgColor}>[Ctrl+R or Enter to stop]</text>
          </box>
        )}
        {recordingStatus === 'transcribing' && (
          <box flexDirection="row" paddingY={0}>
            <text fg={themeColor('warning')} bg={bgColor}><b>Transcribing...</b></text>
          </box>
        )}
        {recordingStatus === 'talking' && (
          <box paddingY={0} flexDirection="column">
            <box flexDirection="row">
              <text fg={themeColor('success')} bg={bgColor}><b>Talk mode </b></text>
              <text fg={textMuted} bg={bgColor}>[listening... Ctrl+C to stop]</text>
            </box>
            {partialTranscript ? (
              <box flexDirection="row">
                <text fg={textMuted} bg={bgColor}>{'> '}</text>
                <text bg={bgColor}><i>{partialTranscript}</i></text>
              </box>
            ) : null}
          </box>
        )}

        {/* Input area - OpenTUI <textarea> handles all editing natively */}
        {/* No prompt character — per spec OpenCode has no ">" prompt */}
        {largePaste ? (
          /* Large paste placeholder view */
          <box flexDirection="row">
            <box flexDirection="row" flexGrow={1}>
              <text fg={themeColor('warning')} bg={bgColor}>{largePaste.placeholder}</text>
              <text fg={textMuted} bg={bgColor}> [Enter to send, Esc to cancel]</text>
            </box>
          </box>
        ) : (
          <box flexDirection="row">
            <textarea
              ref={textareaRef}
              placeholder={placeholder}
              placeholderColor={textMuted}
              wrapMode="word"
              focused
              flexGrow={1}
              height={Math.max(1, lineCount)}
              textColor={textColor}
              focusedTextColor={textColor}
              backgroundColor="transparent"
              focusedBackgroundColor="transparent"
              fg={textColor}
              onContentChange={handleContentChange}
              onSubmit={() => handleSubmit(value)}
            />
          </box>
        )}

        {/* Show line count if multiline */}
        {lineCount > 1 && (
          <box>
            <text fg={textMuted} bg={bgColor}>({lineCount} lines)</text>
          </box>
        )}

        {/* Model variants bar: "Build MiMo V2 Omni Free ... · low" */}
        {modelVariants.length > 0 && (
          <box flexDirection="row" bg={bgColor}>
            {modelVariants.map((variant, i) => (
              <text
                key={variant}
                fg={i === activeVariant ? secondaryCol : textMuted}
                bg={bgColor}
              >
                {i === activeVariant ? variant : variant}
                {i < modelVariants.length - 1 ? ' ' : ''}
              </text>
            ))}
            {reasoningEffort && (
              <text fg={themeColor('warning')} bg={bgColor}> {'\u00B7'} {reasoningEffort}</text>
            )}
          </box>
        )}
      </box>

      {/* Skills autocomplete dropdown - below input */}
      {autocompleteMode === 'skill' && filteredSkills.length > 0 && (
        <box flexDirection="column" bg={themeColor('surface')} paddingX={1} paddingY={0}>
          {/* Scroll indicator - top */}
          {visibleSkills.startIndex > 0 && (
            <text fg={mutedColor}>  ↑ {visibleSkills.startIndex} more above</text>
          )}
          {visibleSkills.items.map((skill, i) => {
            const actualIndex = visibleSkills.startIndex + i;
            const isSelected = actualIndex === selectedIndex;
            const rowBg = isSelected ? themeColor('primary') : themeColor('surface');
            return (
              <box flexDirection="row" key={skill.name} bg={rowBg}>
                <text fg={isSelected ? themeColor('bgDarker') : themeColor('info')} bg={rowBg}>
                  {isSelected ? '▸ ' : '  '}
                  <b>{skill.name.padEnd(18)}</b>
                </text>
                <text fg={isSelected ? themeColor('bgDarker') : themeColor('text')} bg={rowBg}>
                  {truncateDescription(skill.description)}
                </text>
              </box>
            );
          })}
          {/* Scroll indicator - bottom */}
          {visibleSkills.startIndex + maxVisible < filteredSkills.length && (
            <text fg={mutedColor}>  ↓ {filteredSkills.length - visibleSkills.startIndex - maxVisible} more below</text>
          )}
        </box>
      )}

      {/* Commands autocomplete dropdown - below input */}
      {autocompleteMode === 'command' && filteredCommands.length > 0 && (
        <box flexDirection="column" bg={themeColor('surface')} paddingX={1} paddingY={0}>
          {/* Scroll indicator - top */}
          {visibleCommands.startIndex > 0 && (
            <text fg={mutedColor}>  ↑ {visibleCommands.startIndex} more above</text>
          )}
          {visibleCommands.items.map((cmd, i) => {
            const actualIndex = visibleCommands.startIndex + i;
            const isSelected = actualIndex === selectedIndex;
            const rowBg = isSelected ? themeColor('primary') : themeColor('surface');
            return (
              <box flexDirection="row" key={cmd.name} bg={rowBg}>
                <text fg={isSelected ? themeColor('bgDarker') : themeColor('primary')} bg={rowBg}>
                  {isSelected ? '▸ ' : '  '}
                  <b>{cmd.name.padEnd(18)}</b>
                </text>
                <text fg={isSelected ? themeColor('bgDarker') : themeColor('text')} bg={rowBg}>
                  {cmd.description}
                </text>
              </box>
            );
          })}
          {/* Scroll indicator - bottom */}
          {visibleCommands.startIndex + maxVisible < filteredCommands.length && (
            <text fg={mutedColor}>  ↓ {filteredCommands.length - visibleCommands.startIndex - maxVisible} more below</text>
          )}
        </box>
      )}

      {/* File autocomplete dropdown - below input */}
      {autocompleteMode === 'file' && filteredFiles.length > 0 && (
        <box flexDirection="column" bg={themeColor('surface')} paddingX={1} paddingY={0}>
          {/* Scroll indicator - top */}
          {visibleFiles.startIndex > 0 && (
            <text fg={mutedColor}>  ↑ {visibleFiles.startIndex} more above</text>
          )}
          {visibleFiles.items.map((file, i) => {
            const actualIndex = visibleFiles.startIndex + i;
            const isSelected = actualIndex === selectedIndex;
            const rowBg = isSelected ? themeColor('primary') : themeColor('surface');
            return (
              <box flexDirection="row" key={file.name} bg={rowBg}>
                <text fg={isSelected ? themeColor('bgDarker') : themeColor('info')} bg={rowBg}>
                  {isSelected ? '▸ ' : '  '}
                  {file.name}
                </text>
              </box>
            );
          })}
          {/* Scroll indicator - bottom */}
          {visibleFiles.startIndex + maxVisible < filteredFiles.length && (
            <text fg={mutedColor}>  ↓ {filteredFiles.length - visibleFiles.startIndex - maxVisible} more below</text>
          )}
        </box>
      )}
    </box>
  );
});

Input.displayName = 'Input';
