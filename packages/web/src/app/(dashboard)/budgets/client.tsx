"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import type { BudgetRow } from "./page"

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

const columns: ColumnDef<BudgetRow>[] = [
  {
    accessorKey: "scope",
    header: "Scope",
  },
  {
    accessorKey: "scope_id",
    header: "Scope ID",
  },
  {
    accessorKey: "input_tokens",
    header: "Input Tokens",
    cell: ({ row }) => row.original.input_tokens.toLocaleString(),
  },
  {
    accessorKey: "output_tokens",
    header: "Output Tokens",
    cell: ({ row }) => row.original.output_tokens.toLocaleString(),
  },
  {
    accessorKey: "total_tokens",
    header: "Total Tokens",
    cell: ({ row }) => row.original.total_tokens.toLocaleString(),
  },
  {
    accessorKey: "api_calls",
    header: "API Calls",
    cell: ({ row }) => row.original.api_calls.toLocaleString(),
  },
  {
    accessorKey: "tool_calls",
    header: "Tool Calls",
    cell: ({ row }) => row.original.tool_calls.toLocaleString(),
  },
  {
    accessorKey: "estimated_cost_usd",
    header: "Est. Cost",
    cell: ({ row }) => `$${row.original.estimated_cost_usd.toFixed(2)}`,
  },
  {
    accessorKey: "updated_at",
    header: "Updated",
    cell: ({ row }) => formatDate(row.original.updated_at),
  },
]

export function BudgetsClient({ data }: { data: BudgetRow[] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Budgets</h1>
        <p className="text-muted-foreground text-sm">Token usage and cost tracking across scopes.</p>
      </div>
      <DataTable
        columns={columns}
        data={data}
        filterColumn="scope"
        filterPlaceholder="Filter by scope..."
      />
    </div>
  )
}
