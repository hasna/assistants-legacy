'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Terminal } from 'lucide-react';

interface ToolCallBlockProps {
  name: string;
  input?: unknown;
  output?: string;
}

export function ToolCallBlock({ name, input, output }: ToolCallBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="my-2 rounded-lg border border-border bg-muted/30 text-sm">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-mono text-xs font-medium">{name}</span>
        {output && !isExpanded && (
          <span className="ml-auto text-xs text-muted-foreground">
            {output.length > 50 ? output.slice(0, 50) + '...' : output}
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-border px-3 py-2">
          {input != null && (
            <div className="mb-2">
              <span className="text-xs font-medium text-muted-foreground">Input:</span>
              <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 font-mono text-xs">
                {typeof input === 'string'
                  ? input
                  : JSON.stringify(input, null, 2)}
              </pre>
            </div>
          )}
          {output && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">Output:</span>
              <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 font-mono text-xs">
                {output.length > 2000 ? output.slice(0, 2000) + '\n... (truncated)' : output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
