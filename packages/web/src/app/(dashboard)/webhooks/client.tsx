"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import { Badge } from "@/components/ui/badge"
import type { WebhookRow } from "./page"

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
    case "active":
    case "running":
    case "in_progress":
      return "bg-blue-100 text-blue-800"
    case "completed":
    case "done":
    case "success":
    case "pass":
      return "bg-green-100 text-green-800"
    case "enabled":
      return "bg-green-100 text-green-800"
    case "disabled":
      return "bg-gray-100 text-gray-800"
    case "failed":
    case "error":
    case "blocked":
    case "block":
      return "bg-red-100 text-red-800"
    case "pending":
    case "queued":
      return "bg-yellow-100 text-yellow-800"
    default:
      return ""
  }
}

const columns: ColumnDef<WebhookRow>[] = [
  {
    accessorKey: "id",
    header: "ID",
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.id.slice(0, 8)}</span>
    ),
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.name}</span>
    ),
  },
  {
    accessorKey: "source",
    header: "Source",
  },
  {
    accessorKey: "url",
    header: "URL",
    cell: ({ row }) => {
      const url = row.original.url ?? ""
      if (!url) return <span className="text-muted-foreground">—</span>
      return (
        <span className="font-mono text-xs" title={url}>
          {url.length > 40 ? url.slice(0, 40) + "\u2026" : url}
        </span>
      )
    },
  },
  {
    accessorKey: "events",
    header: "Events",
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
    accessorKey: "delivery_count",
    header: "Deliveries",
  },
  {
    accessorKey: "last_delivery_at",
    header: "Last Delivery",
    cell: ({ row }) => formatDate(row.original.last_delivery_at),
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => formatDate(row.original.created_at),
  },
]

export function WebhooksClient({ data }: { data: WebhookRow[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Webhooks</h1>
        <p className="text-muted-foreground text-sm">
          Registered webhook endpoints and delivery status.
        </p>
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
