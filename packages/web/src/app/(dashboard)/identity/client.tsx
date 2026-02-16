"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import type { IdentityRow } from "./page"

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

const columns: ColumnDef<IdentityRow>[] = [
  {
    accessorKey: "key",
    header: "Key",
  },
  {
    accessorKey: "value",
    header: "Value",
    cell: ({ row }) => {
      const val = row.original.value
      return (
        <span className="text-sm" title={val}>
          {val && val.length > 100 ? val.slice(0, 100) + "\u2026" : val}
        </span>
      )
    },
  },
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
    accessorKey: "updated_at",
    header: "Updated",
    cell: ({ row }) => formatDate(row.original.updated_at),
  },
]

export function IdentityClient({ data }: { data: IdentityRow[] }) {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Identity</h1>
      <DataTable
        columns={columns}
        data={data}
        filterColumn="key"
        filterPlaceholder="Filter by key..."
      />
    </div>
  )
}
