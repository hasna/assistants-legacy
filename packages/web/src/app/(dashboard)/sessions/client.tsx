"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog"
import { toast } from "@/lib/toast"
import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"

export interface SessionRow {
  id: string
  cwd: string
  started_at: number
  updated_at: number
  label: string | null
  status: string
  message_count?: number
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

function statusBadge(status: string) {
  const s = status.toLowerCase()
  if (["active", "running", "in_progress"].includes(s)) {
    return <Badge className="rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{status}</Badge>
  }
  if (["completed", "done", "success"].includes(s)) {
    return <Badge className="rounded-full bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">{status}</Badge>
  }
  if (["failed", "error"].includes(s)) {
    return <Badge className="rounded-full bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300">{status}</Badge>
  }
  if (["pending", "queued"].includes(s)) {
    return <Badge className="rounded-full bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">{status}</Badge>
  }
  return <Badge>{status}</Badge>
}

const columns: ColumnDef<SessionRow>[] = [
  {
    accessorKey: "cwd",
    header: "Project",
    cell: ({ row }) => {
      const cwd = row.original.cwd
      if (!cwd) return <span className="text-muted-foreground">—</span>
      const parts = cwd.replace(/\\/g, "/").split("/")
      const name = parts[parts.length - 1] || parts[parts.length - 2] || cwd
      return (
        <span className="text-sm font-medium" title={cwd}>
          {name}
        </span>
      )
    },
  },
  {
    accessorKey: "label",
    header: "Label",
    cell: ({ row }) => row.original.label ?? "\u2014",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => statusBadge(row.original.status),
  },
  {
    accessorKey: "started_at",
    header: "Started",
    cell: ({ row }) => formatDate(row.original.started_at),
  },
  {
    accessorKey: "message_count",
    header: "Msgs",
    cell: ({ row }) => {
      const count = row.original.message_count
      if (count == null || count === 0) return <span className="text-muted-foreground">—</span>
      return <span className="tabular-nums text-sm">{count}</span>
    },
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <Link
        href={`/chat?resume=${row.original.id}`}
        className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium hover:bg-accent hover:-translate-y-px transition-all duration-150"
        title="Resume this session in Chat"
      >
        Resume
      </Link>
    ),
  },
]

function SessionDetail({ session, onClose }: { session: SessionRow; onClose: () => void }) {
  const cwd = session.cwd
  const parts = cwd.replace(/\\/g, "/").split("/")
  const projectName = parts[parts.length - 1] || cwd

  return (
    <tr>
      <td colSpan={8} className="bg-muted/30 px-4 py-4 border-b">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{session.label || projectName}</span>
              {session.status && (
                <span className={`text-xs px-2 py-0.5 rounded-full border ${session.status === 'active' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-gray-50 text-gray-600 border-gray-100'}`}>
                  {session.status}
                </span>
              )}
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">✕</button>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <div><span className="text-muted-foreground">ID:</span> <code className="ml-1 font-mono">{session.id}</code></div>
            <div><span className="text-muted-foreground">Working Dir:</span> <span className="ml-1 font-mono text-xs break-all">{cwd}</span></div>
            <div><span className="text-muted-foreground">Started:</span> <span className="ml-1">{new Date(session.started_at < 1e12 ? session.started_at * 1000 : session.started_at).toLocaleString()}</span></div>
            <div><span className="text-muted-foreground">Updated:</span> <span className="ml-1">{new Date(session.updated_at < 1e12 ? session.updated_at * 1000 : session.updated_at).toLocaleString()}</span></div>
          </div>
          <div className="flex gap-2 mt-1">
            <Link href={`/chat?resume=${session.id}`} className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 shadow-xs transition-colors">
              Resume in Chat
            </Link>
          </div>
        </div>
      </td>
    </tr>
  )
}

function getDateGroup(ts: number): string {
  const d = new Date(ts < 1e12 ? ts * 1000 : ts)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)
  const sessionDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (sessionDate >= today) return 'Today'
  if (sessionDate >= yesterday) return 'Yesterday'
  if (sessionDate >= weekAgo) return 'This Week'
  return 'Older'
}

export function SessionsClient({ data }: { data: SessionRow[] }) {
  useAutoRefresh()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState(true)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<SessionRow[] | null>(null)
  const router = useRouter()

  const requestBulkDelete = (rows: SessionRow[]) => {
    setConfirmTarget(rows)
    setConfirmOpen(true)
  }

  const bulkDelete = async () => {
    const rows = confirmTarget
    if (!rows) return
    setConfirmOpen(false)
    const res = await fetch('/api/sessions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: rows.map(r => r.id) }),
    })
    if (res.ok) { toast.success(`Deleted ${rows.length} session${rows.length > 1 ? 's' : ''}`); router.refresh() }
    else toast.error('Failed to delete')
    setConfirmTarget(null)
  }

  const bulkExport = (rows: SessionRow[]) => {
    const json = JSON.stringify(rows, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sessions-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${rows.length} session${rows.length > 1 ? 's' : ''}`)
  }

  const bulkArchive = async (rows: SessionRow[]) => {
    const res = await fetch('/api/sessions/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: rows.map(r => r.id) }),
    })
    if (res.ok) { toast.success(`Archived ${rows.length} session${rows.length > 1 ? 's' : ''}`); router.refresh() }
    else toast.error('Archive not available — delete instead')
  }

  const bulkActions = [
    { label: 'Delete selected', onClick: requestBulkDelete, variant: 'destructive' as const },
    { label: 'Export selected', onClick: bulkExport },
    { label: 'Archive selected', onClick: bulkArchive },
  ]

  // Group sessions by date
  const groups = groupBy ? (() => {
    const map = new Map<string, SessionRow[]>()
    const order = ['Today', 'Yesterday', 'This Week', 'Older']
    for (const s of data) {
      const g = getDateGroup(s.updated_at)
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(s)
    }
    return order.filter(g => map.has(g)).map(g => ({ label: g, sessions: map.get(g)! }))
  })() : null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Sessions</h1>
        <button
          onClick={() => setGroupBy(!groupBy)}
          className={`text-xs border rounded-xl px-2.5 py-1.5 transition-colors ${groupBy ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
        >
          {groupBy ? 'Grouped' : 'Group by date'}
        </button>
      </div>
      {groupBy && groups ? (
        <div className="flex flex-col gap-6">
          {groups.map(({ label, sessions }) => (
            <div key={label}>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">{label} ({sessions.length})</div>
              <DataTable
                columns={columns}
                data={sessions}
                filterColumn="cwd"
                filterPlaceholder="Filter by directory..."
                bulkActions={bulkActions}
                onRowClick={(row) => setExpanded(expanded === (row as SessionRow).id ? null : (row as SessionRow).id)}
                expandedRow={expanded}
                renderExpanded={(row) => <SessionDetail session={row as SessionRow} onClose={() => setExpanded(null)} />}
              />
            </div>
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data}
          filterColumn="cwd"
          filterPlaceholder="Filter by directory..."
          bulkActions={bulkActions}
          onRowClick={(row) => setExpanded(expanded === (row as SessionRow).id ? null : (row as SessionRow).id)}
          expandedRow={expanded}
          renderExpanded={(row) => <SessionDetail session={row as SessionRow} onClose={() => setExpanded(null)} />}
        />
      )}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${confirmTarget?.length ?? 0} session${(confirmTarget?.length ?? 0) > 1 ? 's' : ''}?`}
        description="This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={bulkDelete}
      />
    </div>
  )
}
