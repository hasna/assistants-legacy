"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import { Badge } from "@/components/ui/badge"
import type { AssistantMessageRow } from "./page"

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

function statusBadgeClass(status: string): string {
  switch (status.toLowerCase()) {
    case "completed":
    case "done":
    case "success":
    case "pass":
      return "rounded-full bg-green-50 text-green-700 border-green-200"
    case "failed":
    case "error":
    case "blocked":
    case "block":
      return "rounded-full bg-red-50 text-red-700 border-red-200"
    case "pending":
    case "queued":
      return "rounded-full bg-yellow-50 text-yellow-700 border-yellow-200"
    case "active":
    case "running":
    case "in_progress":
      return "rounded-full bg-blue-50 text-blue-700 border-blue-200"
    default:
      return "rounded-full"
  }
}

const columns: ColumnDef<AssistantMessageRow>[] = [
  {
    accessorKey: "from_assistant_name",
    header: "From",
  },
  {
    accessorKey: "to_assistant_name",
    header: "To",
  },
  {
    accessorKey: "subject",
    header: "Subject",
    cell: ({ row }) => (
      <span className="font-medium">
        {row.original.subject || (
          <span className="text-muted-foreground">{"\u2014"}</span>
        )}
      </span>
    ),
  },
  {
    accessorKey: "priority",
    header: "Priority",
    cell: ({ row }) =>
      row.original.priority || (
        <span className="text-muted-foreground">{"\u2014"}</span>
      ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className={statusBadgeClass(row.original.status)}
      >
        {row.original.status}
      </Badge>
    ),
  },
]

export function MessagesClient({ data }: { data: AssistantMessageRow[] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
        <p className="text-muted-foreground text-sm">
          Inter-assistant messages and communication.
        </p>
      </div>
      <DataTable
        columns={columns}
        data={data}
        filterColumn="subject"
        filterPlaceholder="Filter by subject..."
      />
    </div>
  )
}
