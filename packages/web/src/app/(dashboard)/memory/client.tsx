"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import type { MemoryRow, MemoryStats } from "./page"
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog"
import { toast } from "@/lib/toast"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

function formatDate(date: string | number | null): string {
  if (!date) return "—"
  const d = new Date(typeof date === "number" && date < 1e12 ? date * 1000 : date)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

function importanceBadge(score: number | null) {
  if (score == null) return <span className="text-muted-foreground">—</span>
  let cls = "bg-gray-100 text-gray-600"
  if (score >= 8) cls = "bg-red-50 text-red-700 font-bold"
  else if (score >= 5) cls = "bg-yellow-50 text-yellow-700"
  return <span className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-medium ${cls}`}>{score}</span>
}

// Expandable row detail
function MemoryDetail({ row, onClose, onDelete }: { row: MemoryRow; onClose: () => void; onDelete: (id: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(row.value)
  const [importance, setImportance] = useState(String(row.importance ?? 5))
  const router = useRouter()

  const save = async () => {
    const res = await fetch(`/api/memory/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value, importance: parseInt(importance) }),
    })
    if (res.ok) { toast.success("Memory updated"); setEditing(false); router.refresh() }
    else toast.error("Failed to update")
  }

  return (
    <tr>
      <td colSpan={7} className="bg-muted/30 px-4 py-3 border-b">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">{row.id}</span>
            <div className="flex gap-2">
              {!editing && <button onClick={() => setEditing(true)} className="text-xs border rounded-lg px-2 py-1 hover:bg-accent transition-colors">Edit</button>}
              <button onClick={() => onDelete(row.id)} className="text-xs border rounded-lg px-2 py-1 hover:bg-red-50 hover:text-red-600 transition-colors">Delete</button>
              <button onClick={onClose} className="text-xs border rounded-lg px-2 py-1 hover:bg-accent transition-colors">Close</button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div><span className="text-muted-foreground">Scope:</span> <strong>{row.scope}</strong></div>
            <div><span className="text-muted-foreground">Category:</span> <strong>{row.category}</strong></div>
            <div><span className="text-muted-foreground">Source:</span> {row.source}</div>
            <div><span className="text-muted-foreground">Created:</span> {formatDate(row.created_at)}</div>
            <div><span className="text-muted-foreground">Updated:</span> {formatDate(row.updated_at)}</div>
          </div>
          {editing ? (
            <div className="flex flex-col gap-2 mt-1">
              <textarea className="w-full rounded border p-2 text-sm font-mono h-24 resize-none" value={value} onChange={e => setValue(e.target.value)} />
              <div className="flex items-center gap-3">
                <label className="text-xs text-muted-foreground">Importance (1-10):</label>
                <input type="number" min={1} max={10} className="w-16 rounded border px-2 py-1 text-xs" value={importance} onChange={e => setImportance(e.target.value)} />
                <button onClick={save} className="text-xs rounded bg-primary text-primary-foreground px-3 py-1 hover:bg-primary/90">Save</button>
                <button onClick={() => setEditing(false)} className="text-xs rounded border px-3 py-1 hover:bg-accent">Cancel</button>
              </div>
            </div>
          ) : (
            <pre className="bg-background rounded border p-2 text-xs font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">{row.value}</pre>
          )}
        </div>
      </td>
    </tr>
  )
}

// Create memory dialog
function CreateMemoryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [key, setKey] = useState("")
  const [value, setValue] = useState("")
  const [scope, setScope] = useState("shared")
  const [category, setCategory] = useState("knowledge")
  const [importance, setImportance] = useState("5")
  const [tags, setTags] = useState("")
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  const reset = () => {
    setKey(""); setValue(""); setScope("shared"); setCategory("knowledge"); setImportance("5"); setTags("")
  }

  const save = async () => {
    if (!key.trim() || !value.trim()) { toast.error("Key and value are required"); return }
    setSaving(true)
    const tagsArray = tags.trim() ? tags.split(",").map(t => t.trim()).filter(Boolean) : []
    const res = await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: key.trim(), value: value.trim(), scope, category, importance: parseInt(importance), tags: tagsArray }),
    })
    setSaving(false)
    if (res.ok) { toast.success("Memory created"); reset(); onOpenChange(false); router.refresh() }
    else toast.error("Failed to create memory")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Memory</DialogTitle>
          <DialogDescription>Add a new memory to the knowledge store.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Key *</label>
            <input className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm shadow-xs mt-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" placeholder="e.g. user-preference-theme" value={key} onChange={e => setKey(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Value *</label>
            <Textarea className="mt-1 h-24 resize-none" placeholder="Memory content..." value={value} onChange={e => setValue(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Scope</label>
              <select className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm shadow-xs mt-1" value={scope} onChange={e => setScope(e.target.value)}>
                <option value="global">global</option>
                <option value="shared">shared</option>
                <option value="private">private</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <select className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm shadow-xs mt-1" value={category} onChange={e => setCategory(e.target.value)}>
                <option value="knowledge">knowledge</option>
                <option value="fact">fact</option>
                <option value="preference">preference</option>
                <option value="history">history</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Importance</label>
              <input type="number" min={1} max={10} className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm shadow-xs mt-1" value={importance} onChange={e => setImportance(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tags <span className="text-muted-foreground font-normal">(comma-separated)</span></label>
            <input className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm shadow-xs mt-1" placeholder="e.g. architecture, decision, backend" value={tags} onChange={e => setTags(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={() => onOpenChange(false)} className="rounded-xl border border-input px-4 py-2 text-sm hover:bg-accent transition-colors">Cancel</button>
          <button onClick={save} disabled={saving} className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 shadow-xs transition-colors">{saving ? "Saving..." : "Create Memory"}</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const columns: ColumnDef<MemoryRow>[] = [
  { accessorKey: "id", header: "ID", cell: ({ row }) => <span className="font-mono text-xs">{row.original.id.slice(0, 8)}</span> },
  { accessorKey: "scope", header: "Scope" },
  { accessorKey: "category", header: "Category" },
  { accessorKey: "key", header: "Key", cell: ({ row }) => <span className="font-medium">{row.original.key}</span> },
  {
    accessorKey: "summary", header: "Summary",
    cell: ({ row }) => {
      const text = row.original.summary || row.original.value
      return <span className="max-w-xs truncate text-muted-foreground" title={text}>{text.length > 80 ? text.slice(0, 80) + "…" : text}</span>
    },
  },
  { accessorKey: "importance", header: "Imp.", cell: ({ row }) => importanceBadge(row.original.importance) },
  { accessorKey: "updated_at", header: "Updated", cell: ({ row }) => formatDate(row.original.updated_at) },
]

function ImportanceChart({ byImportance }: { byImportance: Record<number, number> }) {
  const max = Math.max(...Object.values(byImportance), 1)
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">By Importance</h3>
      <div className="flex items-end gap-1 h-16">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((level) => {
          const count = byImportance[level] || 0
          const height = max > 0 ? Math.max(2, (count / max) * 100) : 2
          const color = level >= 8 ? "bg-red-400" : level >= 5 ? "bg-yellow-400" : "bg-gray-300"
          return (
            <div key={level} className="flex-1 flex flex-col items-center gap-0.5">
              <div className={`w-full rounded-sm ${color}`} style={{ height: `${height}%` }} title={`${level}: ${count}`} />
              <span className="text-[9px] text-muted-foreground">{level}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ScopeChart({ byScope }: { byScope: Record<string, number> }) {
  const total = Object.values(byScope).reduce((a, b) => a + b, 0) || 1
  const colors: Record<string, string> = { global: "bg-blue-400", shared: "bg-green-400", private: "bg-purple-400" }
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">By Scope</h3>
      <div className="flex rounded-full h-3 overflow-hidden">
        {Object.entries(byScope).map(([scope, count]) => (
          <div key={scope} className={colors[scope] || "bg-gray-300"} style={{ width: `${(count / total) * 100}%` }} title={`${scope}: ${count}`} />
        ))}
      </div>
      <div className="flex gap-3 mt-2">
        {Object.entries(byScope).map(([scope, count]) => (
          <div key={scope} className="flex items-center gap-1.5 text-xs">
            <span className={`h-2 w-2 rounded-full ${colors[scope] || "bg-gray-300"}`} />
            <span className="text-muted-foreground">{scope}: {count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MemoryClient({ data, stats }: { data: MemoryRow[]; stats?: MemoryStats }) {
  useAutoRefresh()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string>("")
  const [scopeFilter, setScopeFilter] = useState<string>("")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null)
  const router = useRouter()

  const requestDelete = (id: string) => {
    setConfirmTarget(id)
    setConfirmOpen(true)
  }

  const handleDelete = async () => {
    const id = confirmTarget
    if (!id) return
    setConfirmOpen(false)
    const res = await fetch(`/api/memory/${id}`, { method: "DELETE" })
    if (res.ok) { toast.success("Memory deleted"); setExpanded(null); router.refresh() }
    else toast.error("Failed to delete")
    setConfirmTarget(null)
  }

  const filtered = data.filter(m => {
    if (categoryFilter && m.category !== categoryFilter) return false
    if (scopeFilter && m.scope !== scopeFilter) return false
    return true
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="shrink-0">
          <h1 className="text-2xl font-bold tracking-tight">Memory</h1>
          <p className="text-muted-foreground text-sm">Stored memories and learned preferences.</p>
        </div>
        <button onClick={() => setShowNew(true)} className="rounded-xl bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 shadow-xs transition-colors">
          + New Memory
        </button>
      </div>

      {/* Memory stats visualization */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ImportanceChart byImportance={stats.byImportance} />
          <ScopeChart byScope={stats.byScope} />
        </div>
      )}

      {/* Filters row */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          className="rounded-lg border px-2.5 py-1.5 text-sm bg-background"
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
        >
          <option value="">All categories</option>
          <option value="preference">preference</option>
          <option value="fact">fact</option>
          <option value="knowledge">knowledge</option>
          <option value="history">history</option>
        </select>
        <select
          className="rounded-lg border px-2.5 py-1.5 text-sm bg-background"
          value={scopeFilter}
          onChange={e => setScopeFilter(e.target.value)}
        >
          <option value="">All scopes</option>
          <option value="global">global</option>
          <option value="shared">shared</option>
          <option value="private">private</option>
        </select>
        {(categoryFilter || scopeFilter) && (
          <button onClick={() => { setCategoryFilter(""); setScopeFilter("") }} className="text-xs text-muted-foreground hover:text-foreground border rounded-lg px-2 py-1.5">
            × Clear filters
          </button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} of {data.length}</span>
      </div>

      <CreateMemoryDialog open={showNew} onOpenChange={setShowNew} />

      <DataTable
        columns={columns}
        data={filtered}
        filterColumn="key"
        filterPlaceholder="Filter by key..."
        onRowClick={(row) => setExpanded(expanded === row.id ? null : row.id)}
        expandedRow={expanded}
        renderExpanded={(row) => (
          <MemoryDetail
            row={row as MemoryRow}
            onClose={() => setExpanded(null)}
            onDelete={requestDelete}
          />
        )}
      />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this memory?"
        description="This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
