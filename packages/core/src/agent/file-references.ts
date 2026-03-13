/**
 * Expand @path/to/file references in user messages.
 *
 * When the user types @src/file.js in their message, this module reads
 * the file and appends its content as a fenced code block. For directories
 * (@src/dir/), it lists the directory contents instead.
 */
import { resolve, extname } from 'path';
import { readFile, readdir, stat } from 'fs/promises';
import { isPathSafe } from '../security/path-validator';

/** Map common file extensions to markdown code-fence language identifiers */
const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  py: 'python', rb: 'ruby', rs: 'rust', go: 'go', java: 'java',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', cs: 'csharp',
  swift: 'swift', kt: 'kotlin', scala: 'scala', sh: 'bash', zsh: 'bash',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml',
  html: 'html', css: 'css', scss: 'scss', less: 'less', sql: 'sql',
  md: 'markdown', graphql: 'graphql', proto: 'protobuf',
  dockerfile: 'dockerfile', makefile: 'makefile',
};

/** Maximum file size (in bytes) we'll inline. Larger files are skipped. */
const MAX_INLINE_SIZE = 256 * 1024; // 256KB

/**
 * Pattern to match @path references in user messages.
 * - Must start at beginning of string or after whitespace
 * - Path must contain at least one / or . to distinguish from @mentions
 * - Stops at whitespace
 */
const FILE_REF_PATTERN = /(?:^|\s)@((?:[^\s@]+\/[^\s]*|[^\s@]+\.[a-zA-Z0-9]+))/g;

export interface FileReferenceMatch {
  path: string;
}

/**
 * Extract @file references from a message string.
 */
export function extractFileReferences(message: string): FileReferenceMatch[] {
  const matches: FileReferenceMatch[] = [];
  let match: RegExpExecArray | null;

  // Reset lastIndex since we reuse the regex
  FILE_REF_PATTERN.lastIndex = 0;

  while ((match = FILE_REF_PATTERN.exec(message)) !== null) {
    matches.push({ path: match[1] });
  }

  return matches;
}

/**
 * Expand all @file references in a message by reading file contents
 * and appending them as context blocks.
 */
export async function expandFileReferences(
  message: string,
  cwd: string
): Promise<string> {
  const refs = extractFileReferences(message);
  if (refs.length === 0) return message;

  const contextBlocks: string[] = [];

  for (const ref of refs) {
    try {
      const resolved = resolve(cwd, ref.path);

      // Validate path through security
      const safety = await isPathSafe(resolved, 'read', { cwd });
      if (!safety.safe) {
        contextBlocks.push(`[${ref.path}]: Access denied — ${safety.reason}`);
        continue;
      }

      const fileStat = await stat(resolved).catch(() => null);
      if (!fileStat) {
        contextBlocks.push(`[${ref.path}]: File not found`);
        continue;
      }

      if (fileStat.isDirectory()) {
        // List directory contents
        const entries = await readdir(resolved, { withFileTypes: true });
        const listing = entries
          .map(e => `${e.isDirectory() ? '\u{1F4C1}' : '\u{1F4C4}'} ${e.name}`)
          .join('\n');
        const dirLabel = ref.path.endsWith('/') ? ref.path : ref.path + '/';
        contextBlocks.push(`[Contents of ${dirLabel}]:\n${listing}`);
      } else if (fileStat.isFile()) {
        // Skip files larger than threshold
        if (fileStat.size > MAX_INLINE_SIZE) {
          contextBlocks.push(
            `[${ref.path}]: File too large (${(fileStat.size / 1024).toFixed(0)}KB) — use the Read tool instead`
          );
          continue;
        }

        const content = await readFile(resolved, 'utf-8');
        const ext = extname(resolved).slice(1).toLowerCase();
        const lang = EXT_TO_LANG[ext] || ext || '';
        contextBlocks.push(`[Content of ${ref.path}]:\n\`\`\`${lang}\n${content}\n\`\`\``);
      }
    } catch (error) {
      contextBlocks.push(
        `[${ref.path}]: Error reading — ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (contextBlocks.length > 0) {
    return message + '\n\n' + contextBlocks.join('\n\n');
  }

  return message;
}
