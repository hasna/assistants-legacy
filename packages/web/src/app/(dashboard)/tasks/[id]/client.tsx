"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"

interface TaskData {
  id: string
  project_path: string
  description: string
  status: string
  priority: string
  result: string | null
  error: string | null
  assignee: string | null
  project_id: string | null
  blocked_by: string | null
  blocks: string | null
  is_recurring_template: number
  next_run_at: number | null
  recurrence: string | null
  created_at: number | string
  started_at: number | string | null
  completed_at: number | string | null
}

function formatDate(date: number | string | null): string {
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

function statusBadge(status: string) {
  const s = status.toLowerCase()
  if (["active", "running", "in_progress"].includes(s))
    return <Badge className="rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{status}</Badge>
  if (["completed", "done", "success"].includes(s))
    return <Badge className="rounded-full bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">{status}</Badge>
  if (["failed", "error"].includes(s))
    return <Badge className="rounded-full bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300">{status}</Badge>
  if (["pending", "queued"].includes(s))
    return <Badge className="rounded-full bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">{status}</Badge>
  return <Badge className="rounded-full">{status}</Badge>
}

function priorityBadge(priority: string) {
  const p = priority.toLowerCase()
  if (["critical", "urgent"].includes(p))
    return <Badge className="rounded-full bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300">{priority}</Badge>
  if (p === "high")
    return <Badge className="rounded-full bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">{priority}</Badge>
  if (p === "low")
    return <Badge className="rounded-full bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400">{priority}</Badge>
  return <Badge className="rounded-full">{priority}</Badge>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="text-sm">{children}</div>
    </div>
  )
}

export function TaskDetailClient({ data }: { data: TaskData }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Link href="/tasks" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Tasks
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <h1 className="text-2xl font-bold tracking-tight truncate">
            {data.description.length > 80 ? data.description.slice(0, 80) + "..." : data.description}
          </h1>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {statusBadge(data.status)}
          {priorityBadge(data.priority)}
          {data.assignee && <span>Assigned to <span className="font-medium text-foreground">{data.assignee}</span></span>}
          <span className="font-mono text-xs">{data.id.slice(0, 8)}</span>
        </div>
      </div>

      {/* Description */}
      <div className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold mb-2">Description</h2>
        <pre className="text-sm whitespace-pre-wrap break-words font-mono bg-muted/50 rounded-lg p-3">
          {data.description}
        </pre>
      </div>

      {/* Details Grid */}
      <div className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold mb-3">Details</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="Status">{statusBadge(data.status)}</Field>
          <Field label="Priority">{priorityBadge(data.priority)}</Field>
          <Field label="Assignee">{data.assignee || "\u2014"}</Field>
          <Field label="Project Path">
            <span className="font-mono text-xs">{data.project_path}</span>
          </Field>
          {data.project_id && (
            <Field label="Project ID">
              <span className="font-mono text-xs">{data.project_id}</span>
            </Field>
          )}
          <Field label="Created">{formatDate(data.created_at)}</Field>
          <Field label="Started">{formatDate(data.started_at)}</Field>
          <Field label="Completed">{formatDate(data.completed_at)}</Field>
        </div>
      </div>

      {/* Dependencies */}
      {(data.blocked_by || data.blocks) && (
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">Dependencies</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.blocked_by && (
              <Field label="Blocked By">
                <span className="font-mono text-xs">{data.blocked_by}</span>
              </Field>
            )}
            {data.blocks && (
              <Field label="Blocks">
                <span className="font-mono text-xs">{data.blocks}</span>
              </Field>
            )}
          </div>
        </div>
      )}

      {/* Result / Error */}
      {data.result && (
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold mb-2">Result</h2>
          <pre className="text-sm whitespace-pre-wrap break-words font-mono bg-muted/50 rounded-lg p-3">
            {data.result}
          </pre>
        </div>
      )}

      {data.error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 p-4">
          <h2 className="text-sm font-semibold mb-2 text-red-700 dark:text-red-400">Error</h2>
          <pre className="text-sm whitespace-pre-wrap break-words font-mono bg-red-100/50 dark:bg-red-900/20 rounded-lg p-3 text-red-800 dark:text-red-300">
            {data.error}
          </pre>
        </div>
      )}
    </div>
  )
}
