"use client"

import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import { Badge } from "@/components/ui/badge"
import type { HeartbeatRow } from "./page"

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

function statusBadge(status: string) {
  const s = status.toLowerCase()
  if (["active", "running", "in_progress"].includes(s)) {
    return <Badge className="rounded-full bg-blue-50 text-blue-700">{status}</Badge>
  }
  if (["completed", "done", "success"].includes(s)) {
    return <Badge className="rounded-full bg-green-50 text-green-700">{status}</Badge>
  }
  if (["failed", "error"].includes(s)) {
    return <Badge className="rounded-full bg-red-50 text-red-700">{status}</Badge>
  }
  if (["pending", "queued"].includes(s)) {
    return <Badge className="rounded-full bg-yellow-50 text-yellow-700">{status}</Badge>
  }
  return <Badge className="rounded-full">{status}</Badge>
}

const columns: ColumnDef<HeartbeatRow>[] = [
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => statusBadge(row.original.status),
  },
  {
    accessorKey: "energy",
    header: "Energy",
    cell: ({ row }) => {
      const e = row.original.energy
      if (e == null) return <span className="text-muted-foreground">—</span>
      const pct = Math.min(100, Math.max(0, e))
      const cls = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500'
      return (
        <div className="flex items-center gap-2 min-w-[60px]">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${cls}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs tabular-nums w-8 text-right">{pct}%</span>
        </div>
      )
    },
  },
  {
    accessorKey: "context_tokens",
    header: "Context",
    cell: ({ row }) => {
      const tokens = row.original.context_tokens
      if (tokens == null) return <span className="text-muted-foreground">—</span>
      const maxCtx = 200_000
      const pct = Math.min(100, Math.round((tokens / maxCtx) * 100))
      const cls = pct >= 80 ? 'bg-red-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-blue-500'
      return (
        <div className="flex items-center gap-2 min-w-[80px]">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${cls}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs tabular-nums">{(tokens / 1000).toFixed(1)}k</span>
        </div>
      )
    },
  },
  {
    accessorKey: "action",
    header: "Action",
    cell: ({ row }) => {
      const val = row.original.action
      if (!val) return <span className="text-muted-foreground">—</span>
      // Try to parse JSON and extract a readable summary
      try {
        const parsed = JSON.parse(val) as Record<string, unknown>
        const sessionId = parsed.sessionId as string | undefined
        const state = parsed.state as string | undefined
        const lastTool = parsed.lastTool as string | undefined
        const lastMessage = parsed.lastMessage as string | undefined

        const parts: string[] = []
        if (state) parts.push(state)
        if (lastTool) parts.push(`tool: ${lastTool}`)
        if (lastMessage) parts.push(`"${String(lastMessage).slice(0, 40)}"`)
        if (sessionId) parts.push(`sess ${sessionId.slice(0, 6)}`)

        const summary = parts.join(" · ") || val.slice(0, 60)
        return (
          <span className="text-sm" title={val}>
            {summary.length > 70 ? summary.slice(0, 70) + "…" : summary}
          </span>
        )
      } catch {
        return (
          <span className="text-sm font-mono text-xs text-muted-foreground" title={val}>
            {val.length > 60 ? val.slice(0, 60) + "…" : val}
          </span>
        )
      }
    },
  },
  {
    accessorKey: "timestamp",
    header: "Timestamp",
    cell: ({ row }) => formatDate(row.original.timestamp),
  },
]

export function HeartbeatClient({ data }: { data: HeartbeatRow[] }) {
  useAutoRefresh()
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Heartbeat</h1>
        <p className="text-muted-foreground text-sm">
          Session heartbeat history — state, context usage, and activity log.
        </p>
      </div>
      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 p-12 text-center">
          <p className="text-muted-foreground text-sm">
            No heartbeat history yet. Heartbeats are recorded while the assistant is active.
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data}
          filterColumn="session_id"
          filterPlaceholder="Filter by session ID..."
        />
      )}
    </div>
  )
}
