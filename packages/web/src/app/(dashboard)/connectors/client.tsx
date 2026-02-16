"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import type { ConnectorRow } from "./page"

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

const columns: ColumnDef<ConnectorRow>[] = [
  {
    accessorKey: "key",
    header: "Key",
  },
  {
    accessorKey: "data",
    header: "Data",
    cell: ({ row }) => {
      const val = row.original.data
      return (
        <span className="text-sm" title={val}>
          {val && val.length > 80 ? val.slice(0, 80) + "\u2026" : val}
        </span>
      )
    },
  },
  {
    accessorKey: "cached_at",
    header: "Cached At",
    cell: ({ row }) => formatDate(row.original.cached_at),
  },
]

export function ConnectorsClient({ data }: { data: ConnectorRow[] }) {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Connectors</h1>
      <DataTable
        columns={columns}
        data={data}
        filterColumn="key"
        filterPlaceholder="Filter by key..."
      />
    </div>
  )
}
