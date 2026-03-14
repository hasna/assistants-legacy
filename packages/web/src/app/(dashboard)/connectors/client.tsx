"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import { Badge } from "@/components/ui/badge"
import type { ConnectorRow } from "./page"

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

function parseData(raw: string): { name?: string; version?: string; description?: string; toolCount?: number } {
  try {
    const parsed = JSON.parse(raw)
    return {
      name: parsed.name ?? parsed.displayName ?? undefined,
      version: parsed.version ?? undefined,
      description: parsed.description ?? undefined,
      toolCount: Array.isArray(parsed.tools) ? parsed.tools.length : undefined,
    }
  } catch {
    return {}
  }
}

const columns: ColumnDef<ConnectorRow>[] = [
  {
    accessorKey: "key",
    header: "Connector",
    cell: ({ row }) => {
      const parsed = parseData(row.original.data)
      return (
        <div>
          <span className="font-medium">{parsed.name ?? row.original.key}</span>
          {parsed.version && (
            <span className="ml-1 text-xs text-muted-foreground">v{parsed.version}</span>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }) => {
      const parsed = parseData(row.original.data)
      const desc = parsed.description
      return (
        <span className="text-sm text-muted-foreground">
          {desc ? (desc.length > 80 ? desc.slice(0, 80) + "\u2026" : desc) : "\u2014"}
        </span>
      )
    },
  },
  {
    accessorKey: "tools",
    header: "Tools",
    cell: ({ row }) => {
      const parsed = parseData(row.original.data)
      if (parsed.toolCount === undefined) return <span className="text-muted-foreground">\u2014</span>
      return (
        <Badge variant="secondary">{parsed.toolCount} tools</Badge>
      )
    },
  },
  {
    accessorKey: "cached_at",
    header: "Cached",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{formatDate(row.original.cached_at)}</span>
    ),
  },
]

export function ConnectorsClient({ data }: { data: ConnectorRow[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Connectors</h1>
        <p className="text-muted-foreground text-sm">
          Installed connectors and their cached metadata.
        </p>
      </div>
      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground text-sm">
            No connectors cached. Install connectors via{" "}
            <code className="bg-muted rounded px-1 py-0.5 text-xs">
              connect-*
            </code>{" "}
            CLI tools.
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data}
          filterColumn="key"
          filterPlaceholder="Filter by name..."
        />
      )}
    </div>
  )
}
