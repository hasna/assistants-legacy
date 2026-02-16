"use client"

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
    header: "Importance",
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
