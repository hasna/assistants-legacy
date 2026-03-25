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
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Identity</h1>
        <p className="text-muted-foreground text-sm">
          Assistant identity configuration — name, persona, and scope settings.
        </p>
      </div>
      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground text-sm">
            No identity records found. Configure your assistant in{" "}
            <code className="bg-muted rounded px-1 py-0.5 text-xs">
              ~/.hasna/assistants/config.json
            </code>
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data}
          filterColumn="key"
          filterPlaceholder="Filter by key..."
        />
      )}
    </div>
  )
}
