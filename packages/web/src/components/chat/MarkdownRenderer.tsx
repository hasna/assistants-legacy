'use client';

import { useState, useCallback } from 'react';
import { Check, Copy } from 'lucide-react';
import { JsonRenderer, type UISpec } from './JsonRenderer';

interface MarkdownRendererProps {
  content: string;
}

/**
 * Lightweight markdown renderer without external dependencies.
 * Handles the most common markdown elements: headers, bold, italic,
 * code blocks, inline code, lists, links, and paragraphs.
 */
export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const blocks = parseBlocks(content);

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  );
}

// ============================================
// Block parsing
// ============================================

type BlockType =
  | { type: 'paragraph'; content: string }
  | { type: 'heading'; level: number; content: string }
  | { type: 'code'; language: string; content: string }
  | { type: 'ui'; spec: UISpec }
  | { type: 'ui_loading' }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'blockquote'; content: string }
  | { type: 'hr' };

function parseBlocks(text: string): BlockType[] {
  const blocks: BlockType[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith('```')) {
      const language = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      const closed = i < lines.length; // did we find the closing ```?
      const content = codeLines.join('\n');
      const isUiLang = language === 'ui' || language === 'json-render';

      if (isUiLang) {
        if (closed) {
          try {
            const spec = JSON.parse(content) as UISpec;
            if (spec && typeof spec.type === 'string') {
              blocks.push({ type: 'ui', spec });
              i++;
              continue;
            }
          } catch {
            // Closed but invalid JSON — show as code block
          }
        } else {
          // Still streaming — show loading placeholder instead of raw JSON
          blocks.push({ type: 'ui_loading' });
          continue;
        }
      }
      blocks.push({ type: 'code', language, content });
      if (closed) i++; // skip closing ```
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, content: headingMatch[2] });
      i++;
      continue;
    }

    // HR
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ type: 'blockquote', content: quoteLines.join('\n') });
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'list', ordered: false, items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ type: 'list', ordered: true, items });
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph (collect consecutive non-empty lines)
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('```') && !lines[i].startsWith('#')) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', content: paraLines.join('\n') });
    }
  }

  return blocks;
}

// ============================================
// Block component
// ============================================

function Block({ block }: { block: BlockType }) {
  switch (block.type) {
    case 'heading': {
      const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      const sizes: Record<number, string> = {
        1: 'text-2xl font-bold',
        2: 'text-xl font-semibold',
        3: 'text-lg font-semibold',
        4: 'text-base font-semibold',
        5: 'text-sm font-semibold',
        6: 'text-sm font-medium',
      };
      return <Tag className={sizes[block.level]}><InlineContent text={block.content} /></Tag>;
    }

    case 'paragraph':
      return <p className="leading-relaxed"><InlineContent text={block.content} /></p>;

    case 'code':
      return <CodeBlock language={block.language} content={block.content} />;

    case 'ui':
      return <JsonRenderer spec={block.spec} />;

    case 'ui_loading':
      return (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          Rendering...
        </div>
      );

    case 'list':
      return block.ordered ? (
        <ol className="list-decimal space-y-1 pl-6">
          {block.items.map((item, i) => (
            <li key={i}><InlineContent text={item} /></li>
          ))}
        </ol>
      ) : (
        <ul className="list-disc space-y-1 pl-6">
          {block.items.map((item, i) => (
            <li key={i}><InlineContent text={item} /></li>
          ))}
        </ul>
      );

    case 'blockquote':
      return (
        <blockquote className="border-l-2 border-muted-foreground/30 pl-4 italic text-muted-foreground">
          <InlineContent text={block.content} />
        </blockquote>
      );

    case 'hr':
      return <hr className="border-border" />;
  }
}

// ============================================
// Inline content (bold, italic, code, links)
// ============================================

function InlineContent({ text }: { text: string }) {
  // Process inline markdown
  const parts: Array<{ type: 'text' | 'bold' | 'italic' | 'code' | 'link' | 'image'; content: string; href?: string }> = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Inline code
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push({ type: 'code', content: codeMatch[1] });
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Bold
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) {
      parts.push({ type: 'bold', content: boldMatch[1] });
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic
    const italicMatch = remaining.match(/^\*(.+?)\*/);
    if (italicMatch) {
      parts.push({ type: 'italic', content: italicMatch[1] });
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Image ![alt](url)
    const imageMatch = remaining.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (imageMatch) {
      parts.push({ type: 'image', content: imageMatch[1], href: imageMatch[2] });
      remaining = remaining.slice(imageMatch[0].length);
      continue;
    }

    // Link
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      parts.push({ type: 'link', content: linkMatch[1], href: linkMatch[2] });
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Regular text (up to next special character)
    const nextSpecial = remaining.search(/[`*\[!]/);
    if (nextSpecial > 0) {
      parts.push({ type: 'text', content: remaining.slice(0, nextSpecial) });
      remaining = remaining.slice(nextSpecial);
    } else {
      parts.push({ type: 'text', content: remaining });
      remaining = '';
    }
  }

  return (
    <>
      {parts.map((part, i) => {
        switch (part.type) {
          case 'bold':
            return <strong key={i}>{part.content}</strong>;
          case 'italic':
            return <em key={i}>{part.content}</em>;
          case 'code':
            return (
              <code key={i} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
                {part.content}
              </code>
            );
          case 'image':
            return (
              <img
                key={i}
                src={part.href}
                alt={part.content}
                className="max-w-full rounded-lg border border-border shadow-sm my-2 cursor-pointer hover:shadow-md transition-shadow"
                style={{ maxHeight: '400px' }}
                onClick={() => window.open(part.href, '_blank')}
              />
            );
          case 'link':
            return (
              <a
                key={i}
                href={part.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:text-primary/80"
              >
                {part.content}
              </a>
            );
          default:
            return <span key={i}>{part.content}</span>;
        }
      })}
    </>
  );
}

// ============================================
// Code block with copy button
// ============================================

function CodeBlock({ language, content }: { language: string; content: string }) {
  const [copied, setCopied] = useState(false);
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  // Lazy-load shiki and highlight
  useState(() => {
    if (!language || content.length > 50000) return; // Skip very large blocks
    import('shiki').then(({ codeToHtml }) => {
      codeToHtml(content, {
        lang: language as any,
        theme: 'github-dark',
      }).then(setHighlightedHtml).catch(() => {});
    }).catch(() => {});
  });

  return (
    <div className="group relative overflow-hidden rounded-lg border border-border bg-muted/50">
      {language && (
        <div className="flex items-center justify-between border-b border-border bg-muted px-4 py-1.5 text-xs text-muted-foreground">
          <span>{language}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" /> Copy
              </>
            )}
          </button>
        </div>
      )}
      {highlightedHtml ? (
        <div
          className="overflow-x-auto p-4 text-sm [&_pre]:!bg-transparent [&_pre]:!p-0 [&_code]:font-mono"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      ) : (
        <pre className="overflow-x-auto p-4 text-sm">
          <code className="font-mono">{content}</code>
        </pre>
      )}
      {!language && (
        <button
          onClick={handleCopy}
          className="absolute right-2 top-2 rounded p-1 opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}
