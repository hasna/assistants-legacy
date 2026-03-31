"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import { Badge } from "@/components/ui/badge"
import type { LogRow } from "./page"

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

function resultBadgeClass(result: string): string {
  switch (result.toLowerCase()) {
    case "pass":
    case "success":
    case "completed":
    case "done":
      return "rounded-full bg-green-50 text-green-700 border-green-200"
    case "block":
    case "blocked":
    case "failed":
    case "error":
      return "rounded-full bg-red-50 text-red-700 border-red-200"
    case "pending":
    case "queued":
      return "rounded-full bg-yellow-50 text-yellow-700 border-yellow-200"
    case "active":
    case "running":
    case "in_progress":
      return "rounded-full bg-blue-50 text-blue-700 border-blue-200"
    default:
      return "rounded-full"
  }
}

const columns: ColumnDef<LogRow>[] = [
  {
    accessorKey: "rule_name",
    header: "Rule",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.rule_name}</span>
    ),
  },
  {
    accessorKey: "result",
    header: "Result",
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className={resultBadgeClass(row.original.result)}
      >
        {row.original.result}
      </Badge>
    ),
  },
  {
    accessorKey: "score",
    header: "Score",
    cell: ({ row }) =>
      row.original.score !== null ? (
        row.original.score
      ) : (
        <span className="text-muted-foreground">{"\u2014"}</span>
      ),
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => formatDate(row.original.created_at),
  },
]

export function LogsClient({ data }: { data: LogRow[] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Guardrail Logs</h1>
        <p className="text-muted-foreground text-sm">
          Guardrail evaluations and security audit trail.
        </p>
      </div>
      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 p-12 text-center">
          <p className="text-muted-foreground text-sm">No guardrail evaluations yet.</p>
          <p className="text-muted-foreground text-xs mt-1">These appear when guardrail rules are triggered during a session.</p>
        </div>
      ) : (
      <DataTable
        columns={columns}
        data={data}
        filterColumn="rule_name"
        filterPlaceholder="Filter by rule name..."
      />
      )}
    </div>
  )
}
