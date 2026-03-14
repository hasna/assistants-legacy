"use client"

import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import type { MemoryRow } from "./page"

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

const columns: ColumnDef<MemoryRow>[] = [
  {
    accessorKey: "id",
    header: "ID",
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.id.slice(0, 8)}</span>
    ),
  },
  {
    accessorKey: "scope",
    header: "Scope",
  },
  {
    accessorKey: "category",
    header: "Category",
  },
  {
    accessorKey: "key",
    header: "Key",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.key}</span>
    ),
  },
  {
    accessorKey: "summary",
    header: "Summary",
    cell: ({ row }) => {
      const text =
        row.original.summary || row.original.value
      return (
        <span className="max-w-xs truncate" title={text}>
          {text.length > 80 ? text.slice(0, 80) + "\u2026" : text}
        </span>
      )
    },
  },
  {
    accessorKey: "importance",
    header: "Imp.",
    cell: ({ row }) => {
      const score = row.original.importance
      if (score == null) return <span className="text-muted-foreground">—</span>
      let cls = "bg-gray-100 text-gray-600"
      if (score >= 8) cls = "bg-red-100 text-red-700 font-bold"
      else if (score >= 5) cls = "bg-yellow-100 text-yellow-700"
      return (
        <span className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
          {score}
        </span>
      )
    },
  },
  {
    accessorKey: "tags",
    header: "Tags",
  },
  {
    accessorKey: "source",
    header: "Source",
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => formatDate(row.original.created_at),
  },
  {
    accessorKey: "updated_at",
    header: "Updated",
    cell: ({ row }) => formatDate(row.original.updated_at),
  },
]

export function MemoryClient({ data }: { data: MemoryRow[] }) {
  useAutoRefresh()
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Memory</h1>
        <p className="text-muted-foreground text-sm">
          Stored memories and learned preferences.
        </p>
      </div>
      <DataTable
        columns={columns}
        data={data}
        filterColumn="key"
        filterPlaceholder="Filter by key..."
      />
    </div>
  )
}
