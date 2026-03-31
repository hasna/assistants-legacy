"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"

export interface CostRow {
  id: string
  session_id: string | null
  model: string | null
  input_tokens: number
  output_tokens: number
  cost: number
  created_at: string | number
}

function formatDate(date: string | number | null): string {
  if (!date) return "\u2014"
  const d = new Date(typeof date === "number" && date < 1e12 ? date * 1000 : date)
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatCost(cost: number): string {
  return cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

const columns: ColumnDef<CostRow>[] = [
  {
    accessorKey: "model",
    header: "Model",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.model || "\u2014"}</span>
    ),
  },
  {
    accessorKey: "input_tokens",
    header: "Input",
    cell: ({ row }) => formatTokens(row.original.input_tokens),
  },
  {
    accessorKey: "output_tokens",
    header: "Output",
    cell: ({ row }) => formatTokens(row.original.output_tokens),
  },
  {
    accessorKey: "cost",
    header: "Cost",
    cell: ({ row }) => (
      <span className="font-mono tabular-nums">{formatCost(row.original.cost)}</span>
    ),
  },
  {
    accessorKey: "created_at",
    header: "Date",
    cell: ({ row }) => formatDate(row.original.created_at),
  },
]

export function EconomyClient({
  data,
  totalSpend,
  todaySpend,
}: {
  data: CostRow[]
  totalSpend: number
  todaySpend: number
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Economy</h1>
        <p className="text-muted-foreground text-sm">Token usage and cost tracking.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-2xl font-bold text-green-600">{formatCost(totalSpend)}</div>
          <div className="text-xs text-muted-foreground mt-1">Total spend</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-2xl font-bold text-blue-600">{formatCost(todaySpend)}</div>
          <div className="text-xs text-muted-foreground mt-1">Today</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-2xl font-bold">{data.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Usage records</div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data}
        filterColumn="model"
        filterPlaceholder="Filter by model..."
      />
    </div>
  )
}
