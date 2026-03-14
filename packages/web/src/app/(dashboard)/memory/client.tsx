"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import type { MemoryRow } from "./page"
import { toast } from "@/lib/toast"

function formatDate(date: string | number | null): string {
  if (!date) return "—"
  const d = new Date(typeof date === "number" && date < 1e12 ? date * 1000 : date)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

function importanceBadge(score: number | null) {
  if (score == null) return <span className="text-muted-foreground">—</span>
  let cls = "bg-gray-100 text-gray-600"
  if (score >= 8) cls = "bg-red-100 text-red-700 font-bold"
  else if (score >= 5) cls = "bg-yellow-100 text-yellow-700"
  return <span className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{score}</span>
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
              {!editing && <button onClick={() => setEditing(true)} className="text-xs border rounded px-2 py-1 hover:bg-accent">✏️ Edit</button>}
              <button onClick={() => onDelete(row.id)} className="text-xs border rounded px-2 py-1 hover:bg-red-50 hover:text-red-600">🗑 Delete</button>
              <button onClick={onClose} className="text-xs border rounded px-2 py-1 hover:bg-accent">✕</button>
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

// New memory form
function NewMemoryForm({ onClose }: { onClose: () => void }) {
  const [key, setKey] = useState("")
  const [value, setValue] = useState("")
  const [scope, setScope] = useState("private")
  const [category, setCategory] = useState("fact")
  const [importance, setImportance] = useState("5")
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  const save = async () => {
    if (!key.trim() || !value.trim()) { toast.error("Key and value are required"); return }
    setSaving(true)
    const res = await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: key.trim(), value: value.trim(), scope, category, importance: parseInt(importance) }),
    })
    setSaving(false)
    if (res.ok) { toast.success("Memory saved"); onClose(); router.refresh() }
    else toast.error("Failed to save")
  }

  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">New Memory</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">✕</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Key *</label>
          <input className="w-full rounded border px-2 py-1 text-sm mt-0.5" placeholder="e.g. user.preference.theme" value={key} onChange={e => setKey(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Value *</label>
          <textarea className="w-full rounded border px-2 py-1 text-sm mt-0.5 h-20 resize-none" placeholder="Memory content..." value={value} onChange={e => setValue(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Scope</label>
          <select className="w-full rounded border px-2 py-1 text-sm mt-0.5" value={scope} onChange={e => setScope(e.target.value)}>
            <option value="private">private</option>
            <option value="shared">shared</option>
            <option value="global">global</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Category</label>
          <select className="w-full rounded border px-2 py-1 text-sm mt-0.5" value={category} onChange={e => setCategory(e.target.value)}>
            <option value="fact">fact</option>
            <option value="preference">preference</option>
            <option value="knowledge">knowledge</option>
            <option value="history">history</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Importance (1-10)</label>
          <input type="number" min={1} max={10} className="w-full rounded border px-2 py-1 text-sm mt-0.5" value={importance} onChange={e => setImportance(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="rounded bg-primary text-primary-foreground px-4 py-1.5 text-sm hover:bg-primary/90 disabled:opacity-50">{saving ? "Saving…" : "Save Memory"}</button>
        <button onClick={onClose} className="rounded border px-4 py-1.5 text-sm hover:bg-accent">Cancel</button>
      </div>
    </div>
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

export function MemoryClient({ data }: { data: MemoryRow[] }) {
  useAutoRefresh()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const router = useRouter()

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this memory?")) return
    const res = await fetch(`/api/memory/${id}`, { method: "DELETE" })
    if (res.ok) { toast.success("Memory deleted"); setExpanded(null); router.refresh() }
    else toast.error("Failed to delete")
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Memory</h1>
          <p className="text-muted-foreground text-sm">Stored memories and learned preferences.</p>
        </div>
        <button onClick={() => setShowNew(true)} className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90">
          + New Memory
        </button>
      </div>

      {showNew && <NewMemoryForm onClose={() => setShowNew(false)} />}

      <DataTable
        columns={columns}
        data={data}
        filterColumn="key"
        filterPlaceholder="Filter by key..."
        onRowClick={(row) => setExpanded(expanded === row.id ? null : row.id)}
        expandedRow={expanded}
        renderExpanded={(row) => (
          <MemoryDetail
            row={row as MemoryRow}
            onClose={() => setExpanded(null)}
            onDelete={handleDelete}
          />
        )}
      />
    </div>
  )
}
