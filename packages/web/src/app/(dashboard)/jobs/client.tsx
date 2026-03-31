"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import { Badge } from "@/components/ui/badge"

export interface JobRow {
  id: string
  session_id: string
  connector_name: string
  action: string
  status: string
  created_at: string
  started_at: string | null
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

const columns: ColumnDef<JobRow>[] = [
  {
    accessorKey: "connector_name",
    header: "Connector",
  },
  {
    accessorKey: "action",
    header: "Action",
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

export function JobsClient({ data }: { data: JobRow[] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Jobs</h1>
        <p className="text-muted-foreground text-sm">Connector job execution history and status.</p>
      </div>
      <DataTable
        columns={columns}
        data={data}
        filterColumn="connector_name"
        filterPlaceholder="Filter by connector..."
      />
    </div>
  )
}
