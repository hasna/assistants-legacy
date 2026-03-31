'use client';

import { useState, useRef, useCallback, type KeyboardEvent, type ChangeEvent } from 'react';
import { ArrowUp, Paperclip, Square, X } from 'lucide-react';

interface AttachedFile {
  name: string;
  type: string;
  size: number;
  content: string;
  preview?: string;
}

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  model?: string;
  onModelChange?: (model: string) => void;
  onSearchClick?: () => void;
}

export function ChatInput({
  onSend,
  onStop,
  isStreaming = false,
  disabled = false,
  model = 'Auto',
  onModelChange,
  onSearchClick,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const [showCommands, setShowCommands] = useState(false);
  const [commandFilter, setCommandFilter] = useState('');
  const [commandIndex, setCommandIndex] = useState(0);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles: AttachedFile[] = [];
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        const preview = URL.createObjectURL(file);
        const content = `[Image: ${file.name} (${(file.size / 1024).toFixed(1)}KB)]`;
        newFiles.push({ name: file.name, type: file.type, size: file.size, content, preview });
      } else {
        const text = await file.text();
        newFiles.push({ name: file.name, type: file.type, size: file.size, content: text.slice(0, 50000) });
      }
    }
    setAttachedFiles((prev) => [...prev, ...newFiles]);
    e.target.value = '';
  }, []);

  const SLASH_COMMANDS = [
    { name: '/clear', description: 'Clear conversation' },
    { name: '/sessions', description: 'Browse sessions' },
    { name: '/skills', description: 'List available skills' },
    { name: '/hooks', description: 'View lifecycle hooks' },
    { name: '/model', description: 'View current model' },
    { name: '/memory', description: 'View memories' },
    { name: '/help', description: 'Show help' },
  ];

  const filteredCommands = commandFilter
    ? SLASH_COMMANDS.filter((c) => c.name.startsWith(`/${commandFilter}`))
    : SLASH_COMMANDS;

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed && attachedFiles.length === 0) return;
    if (disabled) return;

    // Build message with file contents appended
    let message = trimmed;
    if (attachedFiles.length > 0) {
      const fileContents = attachedFiles.map((f) =>
        f.type.startsWith('image/') ? f.content : `\n---\n**File: ${f.name}**\n\`\`\`\n${f.content.slice(0, 10000)}\n\`\`\``
      ).join('\n');
      message = message ? `${message}\n${fileContents}` : fileContents;
    }

    onSend(message);
    setValue('');
    setAttachedFiles([]);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, onSend, attachedFiles]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (showCommands && filteredCommands.length > 0) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setCommandIndex((i) => (i + 1) % filteredCommands.length); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); setCommandIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length); return; }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
          e.preventDefault();
          const cmd = filteredCommands[commandIndex];
          if (cmd) { setValue(cmd.name + ' '); setShowCommands(false); }
          return;
        }
        if (e.key === 'Escape') { setShowCommands(false); return; }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (isStreaming) {
          onStop?.();
        } else {
          handleSend();
        }
      }
    },
    [handleSend, isStreaming, onStop, showCommands, filteredCommands, commandIndex]
  );

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4">
      <div className="relative rounded-2xl border border-border bg-card shadow-sm">
        {/* Slash command autocomplete */}
        {showCommands && filteredCommands.length > 0 && (
          <div className="absolute bottom-full left-0 mb-1 w-full max-w-sm rounded-xl border border-border bg-card shadow-lg py-1 z-50">
            {filteredCommands.map((cmd, i) => (
              <button
                key={cmd.name}
                onClick={() => { setValue(cmd.name + ' '); setShowCommands(false); textareaRef.current?.focus(); }}
                className={`flex w-full items-center justify-between px-3 py-2 text-sm transition-colors ${i === commandIndex ? 'bg-accent text-foreground' : 'hover:bg-accent/50'}`}
              >
                <span className="font-mono font-medium">{cmd.name}</span>
                <span className="text-xs text-muted-foreground">{cmd.description}</span>
              </button>
            ))}
          </div>
        )}
        {/* Textarea */}
        <div className="px-4 pt-3">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => {
              const v = e.target.value;
              setValue(v);
              handleInput();
              if (v.startsWith('/') && !v.includes(' ')) {
                setShowCommands(true);
                setCommandFilter(v.slice(1));
                setCommandIndex(0);
              } else {
                setShowCommands(false);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask, search, or make anything..."
            className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            rows={1}
            disabled={disabled}
          />
        </div>

        {/* Attached files */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 pb-1">
            {attachedFiles.map((file, i) => (
              <div key={i} className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2 py-1 text-xs">
                {file.preview ? (
                  <img src={file.preview} alt={file.name} className="h-6 w-6 rounded object-cover" />
                ) : (
                  <span className="text-muted-foreground">📎</span>
                )}
                <span className="max-w-[120px] truncate">{file.name}</span>
                <button
                  onClick={() => setAttachedFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Bottom bar */}
        <div className="flex items-center justify-between px-3 pb-2 pt-1">
          <div className="flex items-center gap-2">
            {/* Attach file */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.txt,.md,.ts,.tsx,.js,.jsx,.json,.py,.html,.css,.csv,.log,.yaml,.yml,.toml,.xml,.sql,.sh,.env"
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Attach file"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            {/* Model selector */}
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => onModelChange?.('')}
            >
              {model}
            </button>

          </div>

          {/* Send / Stop button */}
          <button
            type="button"
            onClick={isStreaming ? onStop : handleSend}
            disabled={!isStreaming && (!value.trim() || disabled)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-30"
          >
            {isStreaming ? (
              <Square className="h-3.5 w-3.5" fill="currentColor" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <p className="mt-2 text-center text-xs text-muted-foreground">
        Assistants can make mistakes. Verify important information.
        <span className="ml-2 opacity-50">
          <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px] font-mono">⌘↵</kbd> to send
        </span>
      </p>
    </div>
  );
}
