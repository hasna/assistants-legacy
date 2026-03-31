"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import { Badge } from "@/components/ui/badge"

export interface PlanRow {
  id: string
  name: string
  description: string | null
  status: string
  created_at: string
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

const columns: ColumnDef<PlanRow>[] = [
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => statusBadge(row.original.status),
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => formatDate(row.original.created_at),
  },
]

export function PlansClient({ data }: { data: PlanRow[] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Plans</h1>
          <p className="text-muted-foreground text-sm">Execution plans and their current status.</p>
        </div>
        <button className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent hover:-translate-y-px transition-all duration-150" title="Coming soon">+ New Plan</button>
      </div>
      <DataTable
        columns={columns}
        data={data}
        filterColumn="name"
        filterPlaceholder="Filter by name..."
      />
    </div>
  )
}
