"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import { Badge } from "@/components/ui/badge"
import type { AssistantConfigRow, RegisteredAssistantRow } from "./page"

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

function statusBadge(status: string) {
  const s = status.toLowerCase()
  if (["active", "running", "in_progress"].includes(s)) {
    return <Badge className="bg-blue-100 text-blue-800">{status}</Badge>
  }
  if (["completed", "done", "success"].includes(s)) {
    return <Badge className="bg-green-100 text-green-800">{status}</Badge>
  }
  if (["failed", "error"].includes(s)) {
    return <Badge className="bg-red-100 text-red-800">{status}</Badge>
  }
  if (["pending", "queued"].includes(s)) {
    return <Badge className="bg-yellow-100 text-yellow-800">{status}</Badge>
  }
  return <Badge>{status}</Badge>
}

const configColumns: ColumnDef<AssistantConfigRow>[] = [
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
    accessorKey: "model",
    header: "Model",
    cell: ({ row }) => row.original.model ?? "\u2014",
  },
  {
    accessorKey: "system_prompt",
    header: "System Prompt",
    cell: ({ row }) => {
      const val = row.original.system_prompt
      if (!val) return "\u2014"
      return (
        <span className="text-sm" title={val}>
          {val.length > 80 ? val.slice(0, 80) + "\u2026" : val}
        </span>
      )
    },
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

const registeredColumns: ColumnDef<RegisteredAssistantRow>[] = [
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
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => row.original.type ?? "\u2014",
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }) => row.original.description ?? "\u2014",
  },
  {
    accessorKey: "model",
    header: "Model",
    cell: ({ row }) => row.original.model ?? "\u2014",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => statusBadge(row.original.status),
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => formatDate(row.original.created_at),
  },
]

export function AssistantsClient({
  configData,
  registeredData,
}: {
  configData: AssistantConfigRow[]
  registeredData: RegisteredAssistantRow[]
}) {
  const hasConfig = configData.length > 0
  const hasRegistered = registeredData.length > 0

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Assistants</h1>

      {hasConfig && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Assistant Configurations</h2>
          <DataTable
            columns={configColumns}
            data={configData}
            filterColumn="name"
            filterPlaceholder="Filter by name..."
          />
        </div>
      )}

      {hasRegistered && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Registered Assistants</h2>
          <DataTable
            columns={registeredColumns}
            data={registeredData}
            filterColumn="name"
            filterPlaceholder="Filter by name..."
          />
        </div>
      )}

      {!hasConfig && !hasRegistered && (
        <DataTable
          columns={configColumns}
          data={[]}
          filterColumn="name"
          filterPlaceholder="Filter by name..."
        />
      )}
    </div>
  )
}
