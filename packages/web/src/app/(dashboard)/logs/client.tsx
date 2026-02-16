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
      return "bg-green-100 text-green-800"
    case "block":
    case "blocked":
    case "failed":
    case "error":
      return "bg-red-100 text-red-800"
    case "pending":
    case "queued":
      return "bg-yellow-100 text-yellow-800"
    case "active":
    case "running":
    case "in_progress":
      return "bg-blue-100 text-blue-800"
    default:
      return ""
  }
}

const columns: ColumnDef<LogRow>[] = [
  {
    accessorKey: "id",
    header: "ID",
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.id.slice(0, 8)}</span>
    ),
  },
  {
    accessorKey: "session_id",
    header: "Session",
    cell: ({ row }) =>
      row.original.session_id ? (
        <span className="font-mono text-xs">
          {row.original.session_id.slice(0, 8)}
        </span>
      ) : (
        <span className="text-muted-foreground">{"\u2014"}</span>
      ),
  },
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
    accessorKey: "input_text",
    header: "Input",
    cell: ({ row }) => {
      const text = row.original.input_text
      return (
        <span className="max-w-xs truncate" title={text}>
          {text.length > 60 ? text.slice(0, 60) + "\u2026" : text}
        </span>
      )
    },
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => formatDate(row.original.created_at),
  },
]

export function LogsClient({ data }: { data: LogRow[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security Logs</h1>
        <p className="text-muted-foreground text-sm">
          Guardrail evaluations and security audit trail.
        </p>
      </div>
      <DataTable
        columns={columns}
        data={data}
        filterColumn="rule_name"
        filterPlaceholder="Filter by rule name..."
      />
    </div>
  )
}
