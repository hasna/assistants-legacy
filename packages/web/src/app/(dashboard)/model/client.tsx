"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"

export interface ModelConfigRow {
  key: string
  value: string
  scope: string
  scope_id: string | null
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

const columns: ColumnDef<ModelConfigRow>[] = [
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
    accessorKey: "scope",
    header: "Scope",
  },
  {
    accessorKey: "updated_at",
    header: "Updated",
    cell: ({ row }) => formatDate(row.original.updated_at),
  },
]

export function ModelClient({ data }: { data: ModelConfigRow[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Model Configuration</h1>
        <p className="text-muted-foreground text-sm">
          LLM model settings stored across global and project scopes.
        </p>
      </div>
      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground text-sm">
            No model configuration found. Set your model in{" "}
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
