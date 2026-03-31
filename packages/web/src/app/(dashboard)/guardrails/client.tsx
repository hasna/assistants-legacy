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
]

export function GuardrailsClient({ data }: { data: GuardrailRow[] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Guardrails</h1>
        <p className="text-muted-foreground text-sm">Security rules and content filtering configuration.</p>
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
