"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import { Badge } from "@/components/ui/badge"
import type { HookRow } from "./page"

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

const columns: ColumnDef<HookRow>[] = [
  {
    accessorKey: "id",
    header: "ID",
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.id.slice(0, 8)}</span>
    ),
  },
  {
    accessorKey: "event",
    header: "Event",
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.name}</span>
    ),
  },
  {
    accessorKey: "type",
    header: "Type",
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }) => {
      const text = row.original.description
      if (!text) return <span className="text-muted-foreground">{"\u2014"}</span>
      return (
        <span className="max-w-xs truncate" title={text}>
          {text.length > 60 ? text.slice(0, 60) + "\u2026" : text}
        </span>
      )
    },
  },
  {
    accessorKey: "command",
    header: "Command",
    cell: ({ row }) => {
      const text = row.original.command
      if (!text) return <span className="text-muted-foreground">{"\u2014"}</span>
      return (
        <span className="font-mono text-xs" title={text}>
          {text.length > 40 ? text.slice(0, 40) + "\u2026" : text}
        </span>
      )
    },
  },
  {
    accessorKey: "enabled",
    header: "Enabled",
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className={
          row.original.enabled
            ? "bg-green-100 text-green-800"
            : "bg-gray-100 text-gray-800"
        }
      >
        {row.original.enabled ? "\u2713" : "\u2717"}
      </Badge>
    ),
  },
  {
    accessorKey: "scope",
    header: "Scope",
    cell: ({ row }) =>
      row.original.scope || (
        <span className="text-muted-foreground">{"\u2014"}</span>
      ),
  },
  {
    accessorKey: "priority",
    header: "Priority",
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => formatDate(row.original.created_at),
  },
]

export function HooksClient({ data }: { data: HookRow[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hooks</h1>
        <p className="text-muted-foreground text-sm">
          Lifecycle hooks and event interceptors.
        </p>
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
