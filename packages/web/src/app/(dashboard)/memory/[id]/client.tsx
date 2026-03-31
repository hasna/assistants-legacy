"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"

interface MemoryData {
  id: string
  scope: string
  scope_id: string | null
  category: string
  key: string
  value: string
  summary: string | null
  importance: number
  tags: string | null
  source: string
  created_at: string
  updated_at: string
  accessed_at: string | null
  access_count: number
  expires_at: string | null
}

function formatDate(date: string | number | null): string {
  if (!date) return "\u2014"
  const d = new Date(typeof date === "number" && date < 1e12 ? date * 1000 : date)
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function scopeBadge(scope: string) {
  const s = scope.toLowerCase()
  if (s === "global")
    return <Badge className="rounded-full bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">{scope}</Badge>
  if (s === "shared")
    return <Badge className="rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{scope}</Badge>
  if (s === "private")
    return <Badge className="rounded-full bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400">{scope}</Badge>
  return <Badge className="rounded-full">{scope}</Badge>
}

function categoryBadge(category: string) {
  const c = category.toLowerCase()
  if (c === "knowledge")
    return <Badge className="rounded-full bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">{category}</Badge>
  if (c === "preference")
    return <Badge className="rounded-full bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">{category}</Badge>
  if (c === "fact")
    return <Badge className="rounded-full bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">{category}</Badge>
  if (c === "history")
    return <Badge className="rounded-full bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">{category}</Badge>
  return <Badge className="rounded-full">{category}</Badge>
}

function importanceBadge(importance: number) {
  if (importance >= 9)
    return <Badge className="rounded-full bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300">{importance}/10</Badge>
  if (importance >= 7)
    return <Badge className="rounded-full bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">{importance}/10</Badge>
  if (importance >= 5)
    return <Badge className="rounded-full bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">{importance}/10</Badge>
  return <Badge className="rounded-full bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400">{importance}/10</Badge>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="text-sm">{children}</div>
    </div>
  )
}

export function MemoryDetailClient({ data }: { data: MemoryData }) {
  const tags = data.tags ? data.tags.split(",").map((t) => t.trim()).filter(Boolean) : []

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Link href="/memory" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Memory
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <h1 className="text-2xl font-bold tracking-tight font-mono">{data.key}</h1>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {scopeBadge(data.scope)}
          {categoryBadge(data.category)}
          {importanceBadge(data.importance)}
          <span>Source: {data.source}</span>
        </div>
      </div>

      {/* Value */}
      <div className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold mb-2">Value</h2>
        <pre className="text-sm whitespace-pre-wrap break-words font-mono bg-muted/50 rounded-lg p-3">
          {data.value}
        </pre>
      </div>

      {/* Summary */}
      {data.summary && (
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold mb-2">Summary</h2>
          <p className="text-sm">{data.summary}</p>
        </div>
      )}

      {/* Details Grid */}
      <div className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold mb-3">Details</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="Key"><span className="font-mono text-xs">{data.key}</span></Field>
          <Field label="Scope">{scopeBadge(data.scope)}</Field>
          {data.scope_id && <Field label="Scope ID"><span className="font-mono text-xs">{data.scope_id}</span></Field>}
          <Field label="Category">{categoryBadge(data.category)}</Field>
          <Field label="Importance">{importanceBadge(data.importance)}</Field>
          <Field label="Source">{data.source}</Field>
          <Field label="Access Count">{data.access_count ?? 0}</Field>
          <Field label="Created">{formatDate(data.created_at)}</Field>
          <Field label="Updated">{formatDate(data.updated_at)}</Field>
          {data.accessed_at && <Field label="Last Accessed">{formatDate(data.accessed_at)}</Field>}
          {data.expires_at && <Field label="Expires">{formatDate(data.expires_at)}</Field>}
        </div>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold mb-2">Tags</h2>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs font-mono">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
