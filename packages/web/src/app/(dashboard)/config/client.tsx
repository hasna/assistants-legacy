"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"

export interface ConfigRow {
  scope: string
  scope_id: string | null
  key: string
  value: string
  updated_at: string
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

const columns: ColumnDef<ConfigRow>[] = [
  {
    accessorKey: "scope",
    header: "Scope",
  },
  {
    accessorKey: "scope_id",
    header: "Scope ID",
    cell: ({ row }) => row.original.scope_id ?? "\u2014",
  },
  {
    accessorKey: "key",
    header: "Key",
    cell: ({ row }) => (
      <code className="text-xs">{row.original.key}</code>
    ),
  },
  {
    accessorKey: "value",
    header: "Value",
    cell: ({ row }) => {
      const val = row.original.value
      const truncated = val.length > 100 ? val.slice(0, 100) + "\u2026" : val
      return <span className="text-sm" title={val}>{truncated}</span>
    },
  },
  {
    accessorKey: "updated_at",
    header: "Updated",
    cell: ({ row }) => formatDate(row.original.updated_at),
  },
]

export function ConfigClient({ data }: { data: ConfigRow[] }) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Config</h1>
      <DataTable
        columns={columns}
        data={data}
        filterColumn="key"
        filterPlaceholder="Filter by key..."
      />
    </div>
  )
}
