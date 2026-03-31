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
      return "rounded-full bg-blue-50 text-blue-700 border-blue-200"
    case "completed":
    case "done":
    case "success":
    case "pass":
      return "rounded-full bg-green-50 text-green-700 border-green-200"
    case "enabled":
      return "rounded-full bg-green-50 text-green-700 border-green-200"
    case "disabled":
      return "rounded-full bg-gray-50 text-gray-600 border-gray-200"
    case "failed":
    case "error":
    case "blocked":
    case "block":
      return "rounded-full bg-red-50 text-red-700 border-red-200"
    case "pending":
    case "queued":
      return "rounded-full bg-yellow-50 text-yellow-700 border-yellow-200"
    default:
      return "rounded-full"
  }
}

const columns: ColumnDef<WebhookRow>[] = [
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
]

export function WebhooksClient({ data }: { data: WebhookRow[] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Webhooks</h1>
          <p className="text-muted-foreground text-sm">
            Registered webhook endpoints and delivery status.
          </p>
        </div>
        <button className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent hover:-translate-y-px transition-all duration-150" title="Coming soon">+ Add Webhook</button>
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
