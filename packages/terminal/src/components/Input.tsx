/** @jsxImportSource react */
import React, { useEffect, useMemo, useState, useRef, useCallback, useImperativeHandle } from 'react';
import { CommandHistory, getCommandHistory } from '@hasna/assistants-core';
import { Box, Text, Textarea, useInput, useWindowSize } from '../ui/ink';
import {
  normalizeLineEndings,
  countWords,
  countLines,
  formatPastePlaceholder,
  isLargePaste,
  DEFAULT_PASTE_THRESHOLDS,
  type PasteThresholds,
} from './prompt-input/helpers';
import { themeColor } from '../theme/colors';
import type { Key } from '../keybindings';

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

// Paste/text helpers live in the prompt-input suite (plan P5.1).

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
  /** Whether the prompt should accept focus and global input events */
  isActive?: boolean;
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

export function normalizePromptInputKey(input: string, key: Partial<Key>): Key {
  const isRawReturn = input === '\r' || input === '\n' || input === '\r\n';
  const isCtrlMReturn = input.toLowerCase() === 'm' && Boolean(key.ctrl) && !key.return;
  const isRawEscape = input === '\x1b';
  const isRawTab = input === '\t';

  return {
    upArrow: Boolean(key.upArrow),
    downArrow: Boolean(key.downArrow),
    leftArrow: Boolean(key.leftArrow),
    rightArrow: Boolean(key.rightArrow),
    pageDown: Boolean(key.pageDown),
    pageUp: Boolean(key.pageUp),
    home: Boolean(key.home),
    end: Boolean(key.end),
    return: Boolean(key.return) || isRawReturn || isCtrlMReturn,
    escape: Boolean(key.escape) || isRawEscape,
    ctrl: isCtrlMReturn ? false : Boolean(key.ctrl),
    shift: Boolean(key.shift),
    tab: Boolean(key.tab) || isRawTab,
    backspace: Boolean(key.backspace),
    delete: Boolean(key.delete),
    meta: Boolean(key.meta),
    super: key.super,
    hyper: key.hyper,
    capsLock: key.capsLock,
    numLock: key.numLock,
    eventType: key.eventType,
  };
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
  isActive = true,
  modelVariants = [],
  activeVariant = 0,
  reasoningEffort,
}: InputProps, ref) {
  // Paste handling configuration with defaults
  const pasteEnabled = pasteConfig?.enabled !== false;
  const pasteThresholds = pasteConfig?.thresholds ?? DEFAULT_PASTE_THRESHOLDS;
  const pasteMode = pasteConfig?.mode ?? 'placeholder';

  const preserveHistoryNavigationRef = useRef(false);
  const savedInputRef = useRef('');
  const valueRef = useRef('');
  const [value, setValue] = useState('');
  const [cursorOffset, setCursorOffset] = useState(0);

  // Large paste handling - when a large paste is detected, we show a placeholder
  // but keep the actual content stored for submission
  const [largePaste, setLargePaste] = useState<{
    content: string;
    placeholder: string;
  } | null>(null);
  const largePasteRef = useRef<typeof largePaste>(null);
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
  const { columns: terminalWidth } = useWindowSize();
  const screenWidth = terminalWidth || 80;
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
  const autocompleteRef = useRef<{
    mode: typeof autocompleteMode;
    items: Array<{ name: string }>;
    selectedIndex: number;
  }>({
    mode: null,
    items: [],
    selectedIndex: 0,
  });

  useEffect(() => {
    autocompleteRef.current = {
      mode: autocompleteMode,
      items: autocompleteItems,
      selectedIndex,
    };
  }, [autocompleteItems, autocompleteMode, selectedIndex]);

  // Keep selected index in range when list size changes
  useEffect(() => {
    if (autocompleteItems.length === 0) {
      setSelectedIndex(0);
      return;
    }
    setSelectedIndex((prev) => Math.min(prev, autocompleteItems.length - 1));
  }, [autocompleteItems.length]);

  // Helper to set the controlled textarea text and sync refs used by key handlers.
  const setTextareaValue = useCallback((nextValue: string, resetHistory: boolean = true, nextCursorOffset?: number) => {
    const normalized = normalizeLineEndings(nextValue);
    preserveHistoryNavigationRef.current = !resetHistory;
    valueRef.current = normalized;
    setValue(normalized);
    setCursorOffset(Math.max(0, Math.min(nextCursorOffset ?? normalized.length, normalized.length)));
    setSelectedIndex(0);
    if (resetHistory) {
      historyRef.current.resetIndex(normalized);
    }
  }, []);

  const clearLargePaste = useCallback(() => {
    largePasteRef.current = null;
    setLargePaste(null);
    setShowPastePreview(false);
  }, []);

  const getCurrentTextareaValue = useCallback(() => valueRef.current, []);

  const saveHistoryDraft = useCallback((nextValue: string) => {
    savedInputRef.current = nextValue;
    setSavedInput(nextValue);
  }, []);

  useImperativeHandle(ref, () => ({
    setValue: (nextValue: string, nextCursor, resetHistory = true) => {
      clearLargePaste();
      setTextareaValue(nextValue, resetHistory, nextCursor);
    },
    appendValue: (text: string) => {
      const cleaned = normalizeLineEndings(text);
      if (!cleaned) return;
      clearLargePaste();
      const current = valueRef.current;
      const newValue = current + cleaned;
      setTextareaValue(newValue);
    },
    clearValue: () => {
      clearLargePaste();
      setTextareaValue('');
    },
    getValue: () => valueRef.current,
  }), [clearLargePaste, setTextareaValue]);


  const handleSubmit = useCallback((submittedValue: string) => {
    const pendingLargePaste = largePasteRef.current;
    // If there's a large paste pending, use that content instead
    const rawValue = pendingLargePaste ? pendingLargePaste.content : submittedValue;
    const actualValue = normalizeLineEndings(rawValue);

    // Allow blank submission only for optional ask-user questions
    if (!actualValue.trim() && !allowBlankAnswer) return;

    // Add to history before submitting (use truncated version for history)
    const valueToAdd = actualValue.trim();
    if (valueToAdd && !isAskingUser) {
      const historyEntry = pendingLargePaste
        ? `[Pasted ${countWords(valueToAdd)} words]`
        : valueToAdd;
      historyRef.current.add(historyEntry);
    }

    // Clear large paste state before submitting
    if (pendingLargePaste) {
      clearLargePaste();
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
        setTextareaValue('');
        onSubmit(exactMatch.name, isProcessing ? 'inline' : 'normal');
        return;
      }
      const selected = filteredCommands[selectedIndex] || filteredCommands[0];
      if (selected) {
        historyRef.current.add(selected.name);
        setTextareaValue('');
        onSubmit(selected.name, isProcessing ? 'inline' : 'normal');
        return;
      }
    }

    if (isProcessing) {
      onSubmit(actualValue, 'inline');
    } else {
      onSubmit(actualValue, 'normal');
    }
    setTextareaValue('');
  }, [allowBlankAnswer, isAskingUser, autocompleteMode, filteredCommands, selectedIndex, isProcessing, onSubmit, setTextareaValue, allCommands, clearLargePaste]);

  // Sync textarea content changes to React state (for autocomplete logic)
  const handleContentChange = useCallback((nextValue: string) => {
    const newValue = normalizeLineEndings(nextValue);

    // Clear any pending large paste if user types normally
    if (largePaste && newValue !== valueRef.current) {
      clearLargePaste();
    }

    valueRef.current = newValue;
    setValue(newValue);
    setCursorOffset((current) => Math.max(0, Math.min(current, newValue.length)));
    setSelectedIndex(0);
    if (preserveHistoryNavigationRef.current) {
      preserveHistoryNavigationRef.current = false;
      return;
    }
    historyRef.current.resetIndex(newValue);
  }, [clearLargePaste, largePaste]);

  const handlePasteFilter = useCallback((rawText: string) => {
    const pastedText = normalizeLineEndings(rawText);
    if (!pasteEnabled || !isLargePaste(pastedText, pasteThresholds)) {
      clearLargePaste();
      return pastedText;
    }

    if (pasteMode === 'inline') {
      clearLargePaste();
      return pastedText;
    }

    const nextLargePaste = {
      content: pastedText,
      placeholder: formatPastePlaceholder(pastedText),
    };
    largePasteRef.current = nextLargePaste;
    setLargePaste(nextLargePaste);
    setShowPastePreview(pasteMode === 'preview' || pasteMode === 'confirm');
    return '';
  }, [clearLargePaste, pasteEnabled, pasteMode, pasteThresholds]);

  const handleTextareaInputFilter = useCallback((input: string, rawKey: Key) => {
    const key = normalizePromptInputKey(input, rawKey);
    if (key.return || key.tab || key.escape) return '';
    if (key.ctrl && input === 'c') return '';
    return input;
  }, []);

  // Handle keyboard input for control keys that override textarea behavior
  useInput((input, rawKey) => {
    const key = normalizePromptInputKey(input, rawKey as Partial<Key>);
    const currentValue = getCurrentTextareaValue();

    if (key.ctrl && input === 'c') {
      if (isProcessing && onStopProcessing) {
        onStopProcessing();
        return;
      }
      if (currentValue.length > 0) {
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
      if (largePasteRef.current) {
        clearLargePaste();
        return;
      }
      if (historyRef.current.isNavigating()) {
        setTextareaValue(savedInputRef.current || savedInput);
        saveHistoryDraft('');
      } else if (currentValue.length > 0) {
        setTextareaValue('');
      }
      return;
    }

    // Tab during processing: queue the message
    if (key.tab && isProcessing && currentValue.trim()) {
      onSubmit(currentValue, 'queue');
      setTextareaValue('');
      return;
    }

    if (!isAskingUser) {
      // Tab: autocomplete when idle
      if (key.tab) {
        const autocomplete = autocompleteRef.current;
        if (autocomplete.items.length > 0) {
          const selected = autocomplete.items[autocomplete.selectedIndex] || autocomplete.items[0];
          if (autocomplete.mode === 'file') {
            const atMatch = currentValue.match(/^(.*(?:^|\s))@[^\s]*$/);
            const prefix = atMatch ? atMatch[1] : '';
            const nextValue = prefix + selected.name + ' ';
            setTextareaValue(nextValue);
          } else {
            const nextValue = autocomplete.mode === 'skill'
              ? `$${selected.name} `
              : `${selected.name} `;
            setTextareaValue(nextValue);
          }
          return;
        }
      }

      // Arrow keys for autocomplete navigation (circular, single-line only)
      const autocomplete = autocompleteRef.current;
      if (autocomplete.items.length > 0 && !currentValue.includes('\n')) {
        if (key.downArrow) {
          setSelectedIndex((prev) => (prev + 1) % autocomplete.items.length);
          return;
        }
        if (key.upArrow) {
          setSelectedIndex((prev) => (prev - 1 + autocomplete.items.length) % autocomplete.items.length);
          return;
        }
      }
    }

    // Arrow up: history navigation
    if (key.upArrow) {
      const shouldNavigateHistory = currentValue.length === 0 || historyRef.current.isNavigating() || !currentValue.includes('\n');
      if (shouldNavigateHistory && !isAskingUser) {
        if (!historyRef.current.isNavigating()) {
          saveHistoryDraft(currentValue);
          historyRef.current.resetIndex(currentValue);
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
      if ((key.shift || key.ctrl) && currentValue.trim()) {
        onSubmit(currentValue, 'interrupt');
        setTextareaValue('');
        return;
      }
      if (key.meta && currentValue.trim() && input !== '\x1b\r' && input !== '\x1b\n') {
        onSubmit(currentValue, 'queue');
        setTextareaValue('');
        return;
      }
      handleSubmit(currentValue);
      setTextareaValue('');
      return;
    }
  }, { isActive });

  // Show different prompts based on state
  let placeholder = 'Type a message...';

  if (isAskingUser) {
    placeholder = askPlaceholder || 'Answer the question...';
  } else if (isProcessing) {
    placeholder = queueLength > 0
      ? 'Enter=queue next | Tab=queue | Shift+Enter=interrupt'
      : 'Enter=queue next | Shift+Enter=interrupt';
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
  const menuWidth = Math.max(20, screenWidth - 2);
  const menuBg = themeColor('surface');

  const autocompleteDropdown = (() => {
    if (autocompleteMode === 'skill' && filteredSkills.length > 0) {
      return (
        <Box
          width={menuWidth}
          flexDirection="column"
          backgroundColor={menuBg}
          paddingX={1}
          paddingY={0}
        >
          {visibleSkills.startIndex > 0 && (
            <Text fg={mutedColor} bg={menuBg}>  ↑ {visibleSkills.startIndex} more above</Text>
          )}
          {visibleSkills.items.map((skill, i) => {
            const actualIndex = visibleSkills.startIndex + i;
            const isSelected = actualIndex === selectedIndex;
            const rowBg = isSelected ? themeColor('primary') : menuBg;
            return (
              <Box flexDirection="row" key={skill.name} backgroundColor={rowBg}>
                <Text fg={isSelected ? themeColor('bgDarker') : themeColor('info')} bg={rowBg}>
                  {isSelected ? '▸ ' : '  '}
                  <Text bold>{skill.name.padEnd(18)}</Text>
                </Text>
                <Text fg={isSelected ? themeColor('bgDarker') : themeColor('text')} bg={rowBg}>
                  {truncateDescription(skill.description)}
                </Text>
              </Box>
            );
          })}
          {visibleSkills.startIndex + maxVisible < filteredSkills.length && (
            <Text fg={mutedColor} bg={menuBg}>  ↓ {filteredSkills.length - visibleSkills.startIndex - maxVisible} more below</Text>
          )}
        </Box>
      );
    }

    if (autocompleteMode === 'command' && filteredCommands.length > 0) {
      return (
        <Box
          width={menuWidth}
          flexDirection="column"
          backgroundColor={menuBg}
          paddingX={1}
          paddingY={0}
        >
          {visibleCommands.startIndex > 0 && (
            <Text fg={mutedColor} bg={menuBg}>  ↑ {visibleCommands.startIndex} more above</Text>
          )}
          {visibleCommands.items.map((cmd, i) => {
            const actualIndex = visibleCommands.startIndex + i;
            const isSelected = actualIndex === selectedIndex;
            const rowBg = isSelected ? themeColor('primary') : menuBg;
            return (
              <Box flexDirection="row" key={cmd.name} backgroundColor={rowBg}>
                <Text fg={isSelected ? themeColor('bgDarker') : themeColor('primary')} bg={rowBg}>
                  {isSelected ? '▸ ' : '  '}
                  <Text bold>{cmd.name.padEnd(18)}</Text>
                </Text>
                <Text fg={isSelected ? themeColor('bgDarker') : themeColor('text')} bg={rowBg}>
                  {cmd.description}
                </Text>
              </Box>
            );
          })}
          {visibleCommands.startIndex + maxVisible < filteredCommands.length && (
            <Text fg={mutedColor} bg={menuBg}>  ↓ {filteredCommands.length - visibleCommands.startIndex - maxVisible} more below</Text>
          )}
        </Box>
      );
    }

    if (autocompleteMode === 'file' && filteredFiles.length > 0) {
      return (
        <Box
          width={menuWidth}
          flexDirection="column"
          backgroundColor={menuBg}
          paddingX={1}
          paddingY={0}
        >
          {visibleFiles.startIndex > 0 && (
            <Text fg={mutedColor} bg={menuBg}>  ↑ {visibleFiles.startIndex} more above</Text>
          )}
          {visibleFiles.items.map((file, i) => {
            const actualIndex = visibleFiles.startIndex + i;
            const isSelected = actualIndex === selectedIndex;
            const rowBg = isSelected ? themeColor('primary') : menuBg;
            return (
              <Box flexDirection="row" key={file.name} backgroundColor={rowBg}>
                <Text fg={isSelected ? themeColor('bgDarker') : themeColor('info')} bg={rowBg}>
                  {isSelected ? '▸ ' : '  '}
                  {file.name}
                </Text>
              </Box>
            );
          })}
          {visibleFiles.startIndex + maxVisible < filteredFiles.length && (
            <Text fg={mutedColor} bg={menuBg}>  ↓ {filteredFiles.length - visibleFiles.startIndex - maxVisible} more below</Text>
          )}
        </Box>
      );
    }

    return null;
  })();

  return (
    <Box flexDirection="column" marginTop={0}>
      {autocompleteDropdown}

      {/* Editor area — OpenCode uses Background color, no borders */}
      <Box
        flexDirection="column"
        flexGrow={1}
        backgroundColor={bgColor}
        paddingX={1}
        minHeight={1}
      >
        {/* Recording indicator */}
        {recordingStatus === 'recording' && (
          <Box flexDirection="row" paddingY={0}>
            <Text fg={themeColor('error')} bg={bgColor} bold>Recording... </Text>
            <Text fg={textMuted} bg={bgColor}>[Ctrl+R or Enter to stop]</Text>
          </Box>
        )}
        {recordingStatus === 'transcribing' && (
          <Box flexDirection="row" paddingY={0}>
            <Text fg={themeColor('warning')} bg={bgColor} bold>Transcribing...</Text>
          </Box>
        )}
        {recordingStatus === 'talking' && (
          <Box paddingY={0} flexDirection="column">
            <Box flexDirection="row">
              <Text fg={themeColor('success')} bg={bgColor} bold>Talk mode </Text>
              <Text fg={textMuted} bg={bgColor}>[listening... Ctrl+C to stop]</Text>
            </Box>
            {partialTranscript ? (
              <Box flexDirection="row">
                <Text fg={textMuted} bg={bgColor}>{'> '}</Text>
                <Text bg={bgColor} italic>{partialTranscript}</Text>
              </Box>
            ) : null}
          </Box>
        )}

        {/* Input area - Ink Textarea handles editing while this component owns app-level submit modes. */}
        {/* No prompt character — per spec OpenCode has no ">" prompt */}
        {largePaste ? (
          /* Large paste placeholder view */
          <Box flexDirection="row">
            <Box flexDirection="row" flexGrow={1}>
              <Text fg={themeColor('warning')} bg={bgColor}>{largePaste.placeholder}</Text>
              <Text fg={textMuted} bg={bgColor}> [Enter to send, Esc to cancel]</Text>
            </Box>
          </Box>
        ) : (
          <Box flexDirection="row">
            <Textarea
              placeholder={placeholder}
              value={value}
              onChange={handleContentChange}
              cursorOffset={cursorOffset}
              onCursorOffsetChange={setCursorOffset}
              columns={textWidth}
              maxVisibleLines={Math.max(1, Math.min(6, lineCount))}
              isActive={isActive}
              cursorChar="|"
              showCursor={isActive}
              inputFilter={handleTextareaInputFilter}
              pasteFilter={handlePasteFilter}
              dimColor={false}
            />
          </Box>
        )}

        {/* Show line count if multiline */}
        {lineCount > 1 && (
          <Box>
            <Text fg={textMuted} bg={bgColor}>({lineCount} lines)</Text>
          </Box>
        )}

        {/* Model variants bar: "Build MiMo V2 Omni Free ... · low" */}
        {modelVariants.length > 0 && (
          <Box flexDirection="row" backgroundColor={bgColor}>
            {modelVariants.map((variant, i) => (
              <Text
                key={variant}
                fg={i === activeVariant ? secondaryCol : textMuted}
                bg={bgColor}
              >
                {i === activeVariant ? variant : variant}
                {i < modelVariants.length - 1 ? ' ' : ''}
              </Text>
            ))}
            {reasoningEffort && (
              <Text fg={themeColor('warning')} bg={bgColor}> {'\u00B7'} {reasoningEffort}</Text>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
});

Input.displayName = 'Input';
