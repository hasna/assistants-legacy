"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/lib/toast"

export interface TaskRow {
  id: string
  project_path: string
  description: string
  status: string
  priority: string
  result: string | null
  assignee: string | null
  project_id: string | null
  created_at: string
  completed_at: string | null
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

const columns: ColumnDef<TaskRow>[] = [
  {
    accessorKey: "id",
    header: "ID",
    cell: ({ row }) => (
      <code className="text-xs">{row.original.id.slice(0, 8)}</code>
    ),
  },
  {
    accessorKey: "description",
    header: "Description",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => statusBadge(row.original.status),
  },
  {
    accessorKey: "priority",
    header: "Priority",
    cell: ({ row }) => {
      const p = (row.original.priority ?? "").toLowerCase()
      if (p === "high" || p === "critical") return <Badge className="bg-red-100 text-red-800">{row.original.priority}</Badge>
      if (p === "medium" || p === "normal") return <Badge className="bg-yellow-100 text-yellow-800">{row.original.priority}</Badge>
      if (p === "low") return <Badge className="bg-gray-100 text-gray-600">{row.original.priority}</Badge>
      return <Badge variant="outline">{row.original.priority || "—"}</Badge>
    },
  },
  {
    accessorKey: "assignee",
    header: "Assignee",
    cell: ({ row }) => row.original.assignee ?? "\u2014",
  },
  {
    accessorKey: "project_path",
    header: "Project",
    cell: ({ row }) => {
      const path = row.original.project_path
      if (!path) return <span className="text-muted-foreground">—</span>
      const parts = path.replace(/\\/g, "/").split("/")
      const name = parts[parts.length - 1] || parts[parts.length - 2] || path
      return <span className="text-sm font-medium" title={path}>{name}</span>
    },
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => formatDate(row.original.created_at),
  },
  {
    accessorKey: "completed_at",
    header: "Completed",
    cell: ({ row }) => formatDate(row.original.completed_at),
  },
  {
    id: "status_action",
    header: "",
    cell: function StatusCell({ row }) {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const router = useRouter()
      const s = row.original.status.toLowerCase()

      const advance = async () => {
        const next = s === "pending" ? "in_progress" : s === "in_progress" ? "completed" : null
        if (!next) return
        const res = await fetch(`/api/tasks/${row.original.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        })
        if (res.ok) { toast.success(`→ ${next}`); router.refresh() }
        else toast.error("Failed to update status")
      }

      if (s === "completed" || s === "failed" || s === "cancelled") return null
      const label = s === "pending" ? "▶ Start" : "✓ Done"
      const cls = s === "pending" ? "hover:bg-blue-50 hover:text-blue-700" : "hover:bg-green-50 hover:text-green-700"
      return (
        <button onClick={(e) => { e.stopPropagation(); advance() }} className={`text-xs border rounded px-2 py-1 ${cls}`}>
          {label}
        </button>
      )
    },
  },
]

function NewTaskForm({ onClose }: { onClose: () => void }) {
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState("normal")
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  const save = async () => {
    if (!description.trim()) { toast.error("Description is required"); return }
    setSaving(true)
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: description.trim(), priority, status: "pending" }),
    })
    setSaving(false)
    if (res.ok) { toast.success("Task created"); onClose(); router.refresh() }
    else toast.error("Failed to create task")
  }

  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">New Task</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">✕</button>
      </div>
      <div className="flex flex-col gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Description *</label>
          <textarea
            className="w-full rounded border px-2 py-1.5 text-sm mt-0.5 h-20 resize-none"
            placeholder="What needs to be done?"
            value={description}
            onChange={e => setDescription(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && e.metaKey) save() }}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Priority</label>
          <select className="w-full rounded border px-2 py-1 text-sm mt-0.5" value={priority} onChange={e => setPriority(e.target.value)}>
            <option value="low">low</option>
            <option value="normal">normal</option>
            <option value="high">high</option>
            <option value="critical">critical</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="rounded bg-primary text-primary-foreground px-4 py-1.5 text-sm hover:bg-primary/90 disabled:opacity-50">
          {saving ? "Creating…" : "Create Task"}
        </button>
        <button onClick={onClose} className="rounded border px-4 py-1.5 text-sm hover:bg-accent">Cancel</button>
      </div>
    </div>
  )
}

const KANBAN_COLS = [
  { status: 'pending', label: 'Pending', cls: 'border-yellow-200 bg-yellow-50/30' },
  { status: 'in_progress', label: 'In Progress', cls: 'border-blue-200 bg-blue-50/30' },
  { status: 'completed', label: 'Completed', cls: 'border-green-200 bg-green-50/30' },
  { status: 'failed', label: 'Failed', cls: 'border-red-200 bg-red-50/30' },
]

function KanbanBoard({ data }: { data: TaskRow[] }) {
  const router = useRouter()
  const byStatus = (status: string) => data.filter(t => t.status === status)

  const advance = async (id: string, next: string) => {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    })
    if (res.ok) { toast.success(`→ ${next}`); router.refresh() }
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {KANBAN_COLS.map(col => {
        const tasks = byStatus(col.status)
        return (
          <div key={col.status} className={`rounded-xl border-2 ${col.cls} p-3 flex flex-col gap-2`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{col.label}</span>
              <span className="rounded-full bg-background border px-1.5 py-0.5 text-xs font-medium">{tasks.length}</span>
            </div>
            {tasks.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4 rounded-lg border border-dashed">Empty</div>
            )}
            {tasks.slice(0, 15).map(t => (
              <div key={t.id} className="rounded-lg border bg-background p-3 text-xs shadow-sm">
                <p className="font-medium line-clamp-2 mb-2">{t.description}</p>
                <div className="flex items-center justify-between gap-1">
                  {t.priority !== 'normal' && (
                    <span className={`px-1 py-0.5 rounded text-xs ${t.priority === 'high' || t.priority === 'critical' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{t.priority}</span>
                  )}
                  <div className="ml-auto flex gap-1">
                    {col.status === 'pending' && <button onClick={() => advance(t.id, 'in_progress')} className="text-xs border rounded px-1.5 py-0.5 hover:bg-blue-50 hover:text-blue-700">▶</button>}
                    {col.status === 'in_progress' && <button onClick={() => advance(t.id, 'completed')} className="text-xs border rounded px-1.5 py-0.5 hover:bg-green-50 hover:text-green-700">✓</button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function TaskDetailRow({ task, onClose }: { task: TaskRow; onClose: () => void }) {
  const router = useRouter()
  const advance = async (next: string) => {
    const res = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) })
    if (res.ok) { toast.success(`→ ${next}`); router.refresh() }
    else toast.error("Failed")
  }
  const s = task.status.toLowerCase()
  return (
    <tr>
      <td colSpan={9} className="bg-muted/30 px-4 py-4 border-b">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">{task.description.slice(0, 80)}{task.description.length > 80 ? '…' : ''}</span>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">✕</button>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <div><span className="text-muted-foreground">ID:</span> <code className="ml-1 font-mono">{task.id}</code></div>
            <div><span className="text-muted-foreground">Status:</span> <strong className="ml-1">{task.status}</strong></div>
            <div><span className="text-muted-foreground">Priority:</span> <strong className="ml-1">{task.priority || '—'}</strong></div>
            <div><span className="text-muted-foreground">Assignee:</span> <span className="ml-1">{task.assignee || '—'}</span></div>
            {task.project_path && <div className="col-span-2"><span className="text-muted-foreground">Project:</span> <code className="ml-1 text-xs font-mono">{task.project_path}</code></div>}
            {task.result && <div className="col-span-2"><span className="text-muted-foreground">Result:</span> <span className="ml-1">{task.result.slice(0, 200)}</span></div>}
          </div>
          {task.description.length > 80 && (
            <p className="text-xs text-muted-foreground bg-background rounded border p-2">{task.description}</p>
          )}
          <div className="flex gap-2">
            {s === 'pending' && <button onClick={() => advance('in_progress')} className="text-xs rounded border px-3 py-1 hover:bg-blue-50 hover:text-blue-700">▶ Start</button>}
            {s === 'in_progress' && <button onClick={() => advance('completed')} className="text-xs rounded border px-3 py-1 hover:bg-green-50 hover:text-green-700">✓ Complete</button>}
            {(s === 'pending' || s === 'in_progress') && <button onClick={() => advance('cancelled')} className="text-xs rounded border px-3 py-1 hover:bg-red-50 hover:text-red-600">✕ Cancel</button>}
          </div>
        </div>
      </td>
    </tr>
  )
}

export function TasksClient({ data }: { data: TaskRow[] }) {
  useAutoRefresh()
  const [showNew, setShowNew] = useState(false)
  const [view, setView] = useState<'table' | 'board'>('table')
  const [expanded, setExpanded] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border overflow-hidden text-xs">
            <button onClick={() => setView('table')} className={`px-2.5 py-1.5 ${view === 'table' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>≡ Table</button>
            <button onClick={() => setView('board')} className={`px-2.5 py-1.5 ${view === 'board' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>⊞ Board</button>
          </div>
          <button onClick={() => setShowNew(true)} className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90">
            + New Task
          </button>
        </div>
      </div>
      {showNew && <NewTaskForm onClose={() => setShowNew(false)} />}
      {view === 'board' ? <KanbanBoard data={data} /> : (
        <DataTable
          columns={columns}
          data={data}
          filterColumn="description"
          filterPlaceholder="Filter by description..."
          onRowClick={(row) => setExpanded(expanded === (row as TaskRow).id ? null : (row as TaskRow).id)}
          expandedRow={expanded}
          renderExpanded={(row) => <TaskDetailRow task={row as TaskRow} onClose={() => setExpanded(null)} />}
        />
      )}
    </div>
  )
}
