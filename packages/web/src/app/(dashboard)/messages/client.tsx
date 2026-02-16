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
      return "bg-green-100 text-green-800"
    case "failed":
    case "error":
    case "blocked":
    case "block":
      return "bg-red-100 text-red-800"
    case "pending":
    case "queued":
      return "bg-yellow-100 text-yellow-800"
    case "active":
    case "running":
    case "in_progress":
      return "bg-blue-100 text-blue-800"
    default:
      return ""
  }
}

const columns: ColumnDef<AssistantMessageRow>[] = [
  {
    accessorKey: "id",
    header: "ID",
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.id.slice(0, 8)}</span>
    ),
  },
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
    accessorKey: "body",
    header: "Body",
    cell: ({ row }) => {
      const text = row.original.body
      return (
        <span className="max-w-xs truncate" title={text}>
          {text.length > 80 ? text.slice(0, 80) + "\u2026" : text}
        </span>
      )
    },
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
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => formatDate(row.original.created_at),
  },
]

export function MessagesClient({ data }: { data: AssistantMessageRow[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
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
