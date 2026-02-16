'use client';

import React, { useState } from 'react';
import { TrendingUp, TrendingDown, ChevronDown } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';

// ============================================
// Types
// ============================================

export interface UISpec {
  type: string;
  props?: Record<string, unknown>;
  children?: UISpec[];
}

interface JsonRendererProps {
  spec: UISpec;
}

// ============================================
// Renderer
// ============================================

export function JsonRenderer({ spec }: JsonRendererProps) {
  try {
    return <RenderNode spec={spec} />;
  } catch {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
        Failed to render UI component
      </div>
    );
  }
}

function RenderNode({ spec }: { spec: UISpec }) {
  const { type, props = {}, children } = spec;
  const render = COMPONENT_MAP[type];
  if (!render) {
    return (
      <div className="text-xs text-muted-foreground">
        Unknown component: {type}
      </div>
    );
  }
  return render(props, children);
}

function renderChildren(children?: UISpec[]) {
  if (!children || children.length === 0) return null;
  return (
    <>
      {children.map((child, i) => (
        <RenderNode key={i} spec={child} />
      ))}
    </>
  );
}

// ============================================
// Component map
// ============================================

type RenderFn = (props: Record<string, unknown>, children?: UISpec[]) => React.JSX.Element;

const COMPONENT_MAP: Record<string, RenderFn> = {
  Card: (props, children) => (
    <Card>
      {(props.title != null || props.description != null) && (
        <CardHeader>
          {props.title != null && <CardTitle>{String(props.title)}</CardTitle>}
          {props.description != null && <CardDescription>{String(props.description)}</CardDescription>}
        </CardHeader>
      )}
      <CardContent>{renderChildren(children)}</CardContent>
    </Card>
  ),

  Stack: (props, children) => {
    const direction = props.direction === 'horizontal' ? 'flex-row' : 'flex-col';
    const gap = props.gap ? `gap-${props.gap}` : 'gap-3';
    return <div className={`flex ${direction} ${gap}`}>{renderChildren(children)}</div>;
  },

  Grid: (props, children) => {
    const colsMap: Record<number, string> = {
      2: 'grid-cols-2',
      3: 'grid-cols-3',
      4: 'grid-cols-4',
    };
    const cols = colsMap[Number(props.cols)] || 'grid-cols-2';
    const gap = props.gap ? `gap-${props.gap}` : 'gap-3';
    return <div className={`grid ${cols} ${gap}`}>{renderChildren(children)}</div>;
  },

  Heading: (props) => {
    const level = Math.min(Math.max(Number(props.level) || 2, 1), 6);
    const sizes: Record<number, string> = {
      1: 'text-2xl font-bold',
      2: 'text-xl font-semibold',
      3: 'text-lg font-semibold',
      4: 'text-base font-semibold',
      5: 'text-sm font-semibold',
      6: 'text-sm font-medium',
    };
    const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
    return <Tag className={sizes[level]}>{String(props.content || '')}</Tag>;
  },

  Text: (props) => {
    const variants: Record<string, string> = {
      default: 'leading-relaxed',
      muted: 'text-sm text-muted-foreground',
      lead: 'text-lg text-muted-foreground',
    };
    const cls = variants[String(props.variant || 'default')] || variants.default;
    return <p className={cls}>{String(props.content || '')}</p>;
  },

  Badge: (props) => {
    const variant = (props.variant as 'default' | 'secondary' | 'destructive' | 'outline') || 'default';
    return <Badge variant={variant}>{String(props.label || '')}</Badge>;
  },

  Alert: (props) => {
    const isDestructive = props.variant === 'destructive';
    return (
      <div
        className={`rounded-lg border p-4 ${
          isDestructive
            ? 'border-destructive/50 bg-destructive/10 text-destructive'
            : 'border-border bg-muted/50'
        }`}
      >
        {props.title != null && (
          <p className="mb-1 font-semibold">{String(props.title)}</p>
        )}
        <p className="text-sm">{String(props.description || '')}</p>
      </div>
    );
  },

  Separator: () => <Separator className="my-2" />,

  Code: (props) => (
    <div className="overflow-hidden rounded-lg border border-border bg-muted/50">
      {props.language != null && (
        <div className="border-b border-border bg-muted px-4 py-1.5 text-xs text-muted-foreground">
          {String(props.language)}
        </div>
      )}
      <pre className="overflow-x-auto p-4 text-sm">
        <code className="font-mono">{String(props.content || '')}</code>
      </pre>
    </div>
  ),

  Image: (props) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={String(props.src || '')}
      alt={String(props.alt || '')}
      width={props.width ? Number(props.width) : undefined}
      height={props.height ? Number(props.height) : undefined}
      className="max-w-full rounded-lg"
    />
  ),

  Table: (props) => {
    const headers = (props.headers as string[]) || [];
    const rows = (props.rows as string[][]) || [];
    return (
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((h, i) => (
              <TableHead key={i}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, ri) => (
            <TableRow key={ri}>
              {row.map((cell, ci) => (
                <TableCell key={ci}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  },

  List: (props) => {
    const items = (props.items as string[]) || [];
    const Tag = props.ordered ? 'ol' : 'ul';
    return (
      <Tag className={`space-y-1 pl-6 ${props.ordered ? 'list-decimal' : 'list-disc'}`}>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </Tag>
    );
  },

  Metric: (props) => {
    const trend = props.trend as 'up' | 'down' | undefined;
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">{String(props.label || '')}</p>
          <p className="mt-1 text-3xl font-bold tracking-tight">{String(props.value || '')}</p>
          {props.change != null && (
            <div className={`mt-1 flex items-center gap-1 text-sm ${
              trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-muted-foreground'
            }`}>
              {trend === 'up' && <TrendingUp className="h-4 w-4" />}
              {trend === 'down' && <TrendingDown className="h-4 w-4" />}
              <span>{String(props.change)}</span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  },

  Progress: (props) => {
    const value = Number(props.value) || 0;
    const max = Number(props.max) || 100;
    const pct = Math.min(Math.max((value / max) * 100, 0), 100);
    return (
      <div className="space-y-1">
        {props.label != null && (
          <div className="flex items-center justify-between text-sm">
            <span>{String(props.label)}</span>
            <span className="text-muted-foreground">{Math.round(pct)}%</span>
          </div>
        )}
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  },

  Tabs: (props) => {
    const items = (props.items as Array<{ label: string; children: UISpec[] }>) || [];
    if (items.length === 0) return <div />;
    return (
      <Tabs defaultValue="tab-0">
        <TabsList>
          {items.map((item, i) => (
            <TabsTrigger key={i} value={`tab-${i}`}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {items.map((item, i) => (
          <TabsContent key={i} value={`tab-${i}`}>
            {renderChildren(item.children)}
          </TabsContent>
        ))}
      </Tabs>
    );
  },

  Collapsible: (props, children) => <CollapsibleBlock title={String(props.title || '')} children={children} />,

  Button: (props) => {
    const variant = (props.variant as 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost') || 'outline';
    return (
      <Button variant={variant} className="pointer-events-none">
        {String(props.label || '')}
      </Button>
    );
  },

  Link: (props) => (
    <a
      href={String(props.href || '#')}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 hover:text-primary/80"
    >
      {String(props.label || props.href || '')}
    </a>
  ),
};

// ============================================
// Stateful sub-components
// ============================================

function CollapsibleBlock({ title, children }: { title: string; children?: UISpec[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted/50">
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`} />
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pt-2">
        {renderChildren(children)}
      </CollapsibleContent>
    </Collapsible>
  );
}
