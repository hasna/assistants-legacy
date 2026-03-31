"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import { Badge } from "@/components/ui/badge"
import type { SecretRow } from "./page"

function formatDate(date: string | number | null): string {
  if (!date) return "\u2014"
  const d = new Date(typeof date === "number" && date < 1e12 ? date * 1000 : date)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

function typeBadge(type: string) {
  const colors: Record<string, string> = {
    api_key: "rounded-full bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    password: "rounded-full bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    token: "rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    credential: "rounded-full bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    other: "rounded-full bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  }
  return <Badge className={colors[type] ?? colors.other}>{type}</Badge>
}

const columns: ColumnDef<SecretRow>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <span className="font-mono text-sm">{row.original.name}</span>,
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => typeBadge(row.original.type),
  },
  {
    accessorKey: "namespace",
    header: "Scope",
    cell: ({ row }) => (
      <Badge variant="outline">{row.original.namespace}</Badge>
    ),
  },
  {
    accessorKey: "label",
    header: "Label",
    cell: ({ row }) => row.original.label ?? <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: "expires_at",
    header: "Expires",
    cell: ({ row }) => {
      if (!row.original.expires_at) return <span className="text-muted-foreground">never</span>
      const expired = new Date(row.original.expires_at) < new Date()
      return (
        <span className={expired ? "text-red-500" : "text-muted-foreground"}>
          {expired ? "EXPIRED " : ""}{new Date(row.original.expires_at).toLocaleDateString()}
        </span>
      )
    },
  },
  {
    accessorKey: "updated_at",
    header: "Updated",
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.updated_at)}</span>,
  },
]

export function SecretsClient({ data }: { data: SecretRow[] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Secrets</h1>
        <p className="text-muted-foreground text-sm">
          Stored in <code className="bg-muted rounded px-1 py-0.5 text-xs">~/.open-secrets/vault.db</code> via @hasna/secrets
        </p>
      </div>
      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 p-12 text-center">
          <p className="text-muted-foreground text-sm">
            No secrets stored. Use <code className="bg-muted rounded px-1 py-0.5 text-xs">secrets set &lt;key&gt; &lt;value&gt;</code> or the <code className="bg-muted rounded px-1 py-0.5 text-xs">secrets_set</code> tool.
          </p>
        </div>
      ) : (
        <DataTable columns={columns} data={data} filterColumn="name" filterPlaceholder="Filter by name..." />
      )}
    </div>
  )
}
