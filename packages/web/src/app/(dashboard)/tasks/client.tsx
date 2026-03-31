"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import { Badge } from "@/components/ui/badge"
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog"
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

const columns: ColumnDef<TaskRow>[] = [
  {
    accessorKey: "id",
    header: "ID",
    cell: ({ row }) => (
      <code className="text-xs">{row.original.id.slice(0, 8)}</code>
    ),
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
      if (p === "high" || p === "critical") return <Badge className="rounded-full bg-red-50 text-red-700">{row.original.priority}</Badge>
      if (p === "medium" || p === "normal") return <Badge className="rounded-full bg-yellow-50 text-yellow-700">{row.original.priority}</Badge>
      if (p === "low") return <Badge className="rounded-full bg-gray-50 text-gray-600">{row.original.priority}</Badge>
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

      const updateStatus = async (next: string) => {
        const res = await fetch(`/api/tasks/${row.original.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        })
        if (res.ok) { toast.success(`Status → ${next}`); router.refresh() }
        else toast.error("Failed to update status")
      }

      return (
        <select
          value={row.original.status}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => updateStatus(e.target.value)}
          className="text-xs border rounded-lg px-1.5 py-1 bg-transparent cursor-pointer hover:bg-accent transition-colors"
        >
          <option value="pending">pending</option>
          <option value="in_progress">in_progress</option>
          <option value="completed">completed</option>
          <option value="failed">failed</option>
          <option value="cancelled">cancelled</option>
        </select>
      )
    },
  },
  {
    id: "delete_action",
    header: "",
    cell: function DeleteCell({ row }) {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const [confirmOpen, setConfirmOpen] = useState(false)
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const router = useRouter()

      const deleteTask = async () => {
        const res = await fetch(`/api/tasks/${row.original.id}`, { method: "DELETE" })
        if (res.ok) { toast.success("Task deleted"); router.refresh() }
        else toast.error("Failed to delete task")
      }

      return (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmOpen(true) }}
            className="text-xs border rounded-lg px-2 py-1 text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors"
          >
            Delete
          </button>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Delete task?"
            description="This action cannot be undone."
            confirmLabel="Delete"
            variant="destructive"
            onConfirm={deleteTask}
          />
        </>
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
    <div className="rounded-xl border border-border bg-card shadow-xs p-4 flex flex-col gap-3">
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
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const byStatus = (status: string) => data.filter(t => t.status === status)

  const changeStatus = async (id: string, next: string) => {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    })
    if (res.ok) { toast.success(`Status → ${next}`); router.refresh() }
  }

  const deleteTask = async (id: string) => {
    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" })
    if (res.ok) { toast.success("Task deleted"); router.refresh() }
    else toast.error("Failed to delete task")
  }

  const handleDrop = (targetStatus: string) => {
    if (dragId) {
      const task = data.find(t => t.id === dragId)
      if (task && task.status !== targetStatus) {
        changeStatus(dragId, targetStatus)
      }
    }
    setDragId(null)
    setDragOver(null)
  }

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {KANBAN_COLS.map(col => {
          const tasks = byStatus(col.status)
          const isOver = dragOver === col.status
          return (
            <div
              key={col.status}
              className={`rounded-xl border-2 ${col.cls} p-3 flex flex-col gap-2 transition-colors ${isOver ? 'ring-2 ring-primary/30 bg-primary/5' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(col.status) }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => { e.preventDefault(); handleDrop(col.status) }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{col.label}</span>
                <span className="rounded-full bg-background border px-1.5 py-0.5 text-xs font-medium">{tasks.length}</span>
              </div>
              {tasks.length === 0 && (
                <div className={`text-xs text-muted-foreground text-center py-4 rounded-xl border border-dashed ${isOver ? 'border-primary/40 bg-primary/5' : 'border-border/60'}`}>
                  {isOver ? 'Drop here' : 'Empty'}
                </div>
              )}
              {tasks.slice(0, 15).map(t => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={() => setDragId(t.id)}
                  onDragEnd={() => { setDragId(null); setDragOver(null) }}
                  className={`rounded-xl border border-border bg-background p-3 text-xs shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-grab active:cursor-grabbing ${dragId === t.id ? 'opacity-50' : ''}`}
                >
                  <p className="font-medium line-clamp-2 mb-2">{t.description}</p>
                  <div className="flex items-center justify-between gap-1">
                    {t.priority !== 'normal' && (
                      <span className={`px-1.5 py-0.5 rounded-full text-xs ${t.priority === 'high' || t.priority === 'critical' ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-600'}`}>{t.priority}</span>
                    )}
                    <div className="ml-auto flex gap-1">
                      {col.status === 'pending' && <button onClick={() => changeStatus(t.id, 'in_progress')} className="text-xs border rounded px-1.5 py-0.5 hover:bg-blue-50 hover:text-blue-700">▶</button>}
                      {col.status === 'in_progress' && <button onClick={() => changeStatus(t.id, 'completed')} className="text-xs border rounded px-1.5 py-0.5 hover:bg-green-50 hover:text-green-700">✓</button>}
                      <button onClick={() => setDeleteTarget(t.id)} className="text-xs border rounded px-1.5 py-0.5 text-red-500 hover:bg-red-50 hover:text-red-700">✕</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title="Delete task?"
        description="This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => { if (deleteTarget) deleteTask(deleteTarget); setDeleteTarget(null) }}
      />
    </>
  )
}

function TaskDetailRow({ task, onClose }: { task: TaskRow; onClose: () => void }) {
  const router = useRouter()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const advance = async (next: string) => {
    const res = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) })
    if (res.ok) { toast.success(`Status → ${next}`); router.refresh() }
    else toast.error("Failed")
  }

  const deleteTask = async () => {
    const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" })
    if (res.ok) { toast.success("Task deleted"); onClose(); router.refresh() }
    else toast.error("Failed to delete task")
  }

  const s = task.status.toLowerCase()
  return (
    <tr>
      <td colSpan={9} className="bg-muted/30 px-4 py-4 border-b">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">{task.description.slice(0, 80)}{task.description.length > 80 ? '...' : ''}</span>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">✕</button>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <div><span className="text-muted-foreground">ID:</span> <code className="ml-1 font-mono">{task.id}</code></div>
            <div>
              <span className="text-muted-foreground">Status:</span>
              <select
                value={task.status}
                onChange={(e) => advance(e.target.value)}
                className="ml-1 text-xs border rounded px-1 py-0.5 bg-transparent cursor-pointer font-semibold"
              >
                <option value="pending">pending</option>
                <option value="in_progress">in_progress</option>
                <option value="completed">completed</option>
                <option value="failed">failed</option>
                <option value="cancelled">cancelled</option>
              </select>
            </div>
            <div><span className="text-muted-foreground">Priority:</span> <strong className="ml-1">{task.priority || '—'}</strong></div>
            <div><span className="text-muted-foreground">Assignee:</span> <span className="ml-1">{task.assignee || '—'}</span></div>
            {task.project_path && <div className="col-span-2"><span className="text-muted-foreground">Project:</span> <code className="ml-1 text-xs font-mono">{task.project_path}</code></div>}
            {task.result && <div className="col-span-2"><span className="text-muted-foreground">Result:</span> <span className="ml-1">{task.result.slice(0, 200)}</span></div>}
          </div>
          {task.description.length > 80 && (
            <p className="text-xs text-muted-foreground bg-background rounded border p-2">{task.description}</p>
          )}
          <div className="flex gap-2">
            {s === 'pending' && <button onClick={() => advance('in_progress')} className="text-xs rounded-lg border px-3 py-1 hover:bg-blue-50 hover:text-blue-700 transition-colors">Start</button>}
            {s === 'in_progress' && <button onClick={() => advance('completed')} className="text-xs rounded-lg border px-3 py-1 hover:bg-green-50 hover:text-green-700 transition-colors">Complete</button>}
            {(s === 'pending' || s === 'in_progress') && <button onClick={() => advance('cancelled')} className="text-xs rounded-lg border px-3 py-1 hover:bg-red-50 hover:text-red-600 transition-colors">Cancel</button>}
            <button onClick={() => setConfirmDelete(true)} className="text-xs rounded-lg border px-3 py-1 text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors">Delete</button>
          </div>
        </div>
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Delete task?"
          description="This action cannot be undone."
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={deleteTask}
        />
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
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border overflow-hidden text-xs">
            <button onClick={() => setView('table')} className={`px-2.5 py-1.5 transition-colors ${view === 'table' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>Table</button>
            <button onClick={() => setView('board')} className={`px-2.5 py-1.5 transition-colors ${view === 'board' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>Board</button>
          </div>
          <button onClick={() => setShowNew(true)} className="rounded-xl bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 shadow-xs transition-colors">
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
