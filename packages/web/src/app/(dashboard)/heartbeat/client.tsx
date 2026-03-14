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
    return <Badge className="bg-blue-100 text-blue-800">{status}</Badge>
  }
  if (["completed", "done", "success"].includes(s)) {
    return <Badge className="bg-green-100 text-green-800">{status}</Badge>
  }
  if (["failed", "error"].includes(s)) {
    return <Badge className="bg-red-100 text-red-800">{status}</Badge>
  }
  if (["pending", "queued"].includes(s)) {
    return <Badge className="bg-yellow-100 text-yellow-800">{status}</Badge>
  }
  return <Badge>{status}</Badge>
}

const columns: ColumnDef<HeartbeatRow>[] = [
  {
    accessorKey: "id",
    header: "ID",
  },
  {
    accessorKey: "session_id",
    header: "Session ID",
    cell: ({ row }) => (
      <code className="text-xs">{row.original.session_id.slice(0, 8)}</code>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => statusBadge(row.original.status),
  },
  {
    accessorKey: "energy",
    header: "Energy",
    cell: ({ row }) =>
      row.original.energy != null ? row.original.energy : "\u2014",
  },
  {
    accessorKey: "context_tokens",
    header: "Context Tokens",
    cell: ({ row }) =>
      row.original.context_tokens != null
        ? row.original.context_tokens.toLocaleString()
        : "\u2014",
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
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Heartbeat</h1>
        <p className="text-muted-foreground text-sm">
          Session heartbeat history — state, context usage, and activity log.
        </p>
      </div>
      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
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
