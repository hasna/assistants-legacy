"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import type { GuardrailRow } from "./page"

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

const columns: ColumnDef<GuardrailRow>[] = [
  {
    accessorKey: "id",
    header: "ID",
    cell: ({ row }) => (
      <code className="text-xs">{row.original.id.slice(0, 8)}</code>
    ),
  },
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "scope",
    header: "Scope",
    cell: ({ row }) => row.original.scope ?? "\u2014",
  },
  {
    accessorKey: "enabled",
    header: "Enabled",
    cell: ({ row }) => (
      <span className={row.original.enabled ? "text-green-600" : "text-red-500"}>
        {row.original.enabled ? "\u2713" : "\u2717"}
      </span>
    ),
  },
  {
    accessorKey: "location",
    header: "Location",
    cell: ({ row }) => row.original.location ?? "\u2014",
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

export function GuardrailsClient({ data }: { data: GuardrailRow[] }) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Guardrails</h1>
      <DataTable
        columns={columns}
        data={data}
        filterColumn="name"
        filterPlaceholder="Filter by name..."
      />
    </div>
  )
}
