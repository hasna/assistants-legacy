"use client"

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

export function TasksClient({ data }: { data: TaskRow[] }) {
  useAutoRefresh()
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Tasks</h1>
      <DataTable
        columns={columns}
        data={data}
        filterColumn="description"
        filterPlaceholder="Filter by description..."
      />
    </div>
  )
}
