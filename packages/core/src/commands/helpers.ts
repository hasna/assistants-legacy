import type { TokenUsage } from './types';

// Version lookup - prefer explicit env to avoid stale hardcoded values
export const VERSION =
  process.env.ASSISTANTS_VERSION ||
  process.env.npm_package_version ||
  'unknown';

export type ConnectorAuthTimeoutResolve = (value: {
  exitCode: number;
  stdout: { toString: () => string };
}) => void;

export function resolveAuthTimeout(resolve: ConnectorAuthTimeoutResolve): void {
  resolve({ exitCode: 1, stdout: { toString: () => '{}' } });
}

export function splitArgs(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quote) {
      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char as '"' | "'";
      continue;
    }

    if (char === ' ' || char === '\t') {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) args.push(current);
  return args;
}

export function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export const DEFAULT_COMPACT_LIMIT = 20;
export const MAX_COMPACT_LIMIT = 100;

export interface DisclosureOptions {
  verbose: boolean;
  json: boolean;
  limit: number;
  cursor: number;
  args: string[];
  error?: string;
}

export function truncateText(value: unknown, maxLength = 80): string {
  const text = singleLine(typeof value === 'string' ? value : JSON.stringify(value ?? ''));
  if (text.length <= maxLength) return text;
  if (maxLength <= 3) return text.slice(0, maxLength);
  return `${text.slice(0, maxLength - 3)}...`;
}

export function parseDisclosureOptions(
  args: string[],
  defaults: { limit?: number; maxLimit?: number } = {}
): DisclosureOptions {
  const maxLimit = defaults.maxLimit ?? MAX_COMPACT_LIMIT;
  const defaultLimit = Math.min(defaults.limit ?? DEFAULT_COMPACT_LIMIT, maxLimit);
  const options: DisclosureOptions = {
    verbose: false,
    json: false,
    limit: defaultLimit,
    cursor: 0,
    args: [],
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--limit') {
      const value = args[i + 1];
      const parsed = Number(value);
      if (!value || !Number.isInteger(parsed) || parsed < 1) {
        options.error = '--limit requires a positive integer.';
        return options;
      }
      options.limit = Math.min(parsed, maxLimit);
      i += 1;
      continue;
    }
    if (arg === '--cursor') {
      const value = args[i + 1];
      const parsed = Number(value);
      if (!value || !Number.isInteger(parsed) || parsed < 0) {
        options.error = '--cursor requires a non-negative integer offset.';
        return options;
      }
      options.cursor = parsed;
      i += 1;
      continue;
    }
    options.args.push(arg);
  }

  return options;
}

export function pageItems<T>(items: T[], options: Pick<DisclosureOptions, 'limit' | 'cursor'>): {
  items: T[];
  total: number;
  shown: number;
  nextCursor: number | null;
} {
  const start = Math.min(options.cursor, items.length);
  const page = items.slice(start, start + options.limit);
  const nextCursor = start + page.length < items.length ? start + page.length : null;
  return { items: page, total: items.length, shown: page.length, nextCursor };
}

export function disclosureHint(
  options: Pick<DisclosureOptions, 'limit' | 'cursor' | 'verbose'>,
  total: number,
  shown: number,
  detailHint: string
): string {
  const parts: string[] = [];
  const nextCursor = options.cursor + shown;
  if (nextCursor < total) {
    parts.push(`Showing ${shown} of ${total}. Use --cursor ${nextCursor} for more or --limit ${Math.min(total, MAX_COMPACT_LIMIT)} to show more rows.`);
  } else if (total > shown) {
    parts.push(`Showing ${shown} of ${total}. Use --limit ${Math.min(total, MAX_COMPACT_LIMIT)} to show more rows.`);
  }
  if (!options.verbose) {
    parts.push(`Use --verbose or ${detailHint} for details.`);
  }
  return parts.length > 0 ? `\n${parts.join(' ')}\n` : '';
}

export function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function createTokenUsage(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    maxContextTokens: 200000,
  };
}

export function resetTokenUsage(tokenUsage: TokenUsage): void {
  tokenUsage.inputTokens = 0;
  tokenUsage.outputTokens = 0;
  tokenUsage.totalTokens = 0;
  tokenUsage.cacheReadTokens = 0;
  tokenUsage.cacheWriteTokens = 0;
}
