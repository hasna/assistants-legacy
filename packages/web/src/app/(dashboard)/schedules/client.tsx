"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import { Badge } from "@/components/ui/badge"

export interface ScheduleRow {
  id: string
  project_path: string
  command: string
  schedule: string
  status: string
  session_id: string | null
  next_run_at: string | null
  last_run_at: string | null
  run_count: number
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

const columns: ColumnDef<ScheduleRow>[] = [
  {
    accessorKey: "id",
    header: "ID",
    cell: ({ row }) => (
      <code className="text-xs">{row.original.id.slice(0, 8)}</code>
    ),
  },
  {
    accessorKey: "command",
    header: "Command",
  },
  {
    accessorKey: "schedule",
    header: "Schedule",
    cell: ({ row }) => (
      <code className="text-xs">{row.original.schedule}</code>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => statusBadge(row.original.status),
  },
  {
    accessorKey: "next_run_at",
    header: "Next Run",
    cell: ({ row }) => formatDate(row.original.next_run_at),
  },
  {
    accessorKey: "last_run_at",
    header: "Last Run",
    cell: ({ row }) => formatDate(row.original.last_run_at),
  },
  {
    accessorKey: "run_count",
    header: "Run Count",
  },
  {
    accessorKey: "project_path",
    header: "Project Path",
  },
]

export function SchedulesClient({ data }: { data: ScheduleRow[] }) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Schedules</h1>
      <DataTable
        columns={columns}
        data={data}
        filterColumn="command"
        filterPlaceholder="Filter by command..."
      />
    </div>
  )
}
