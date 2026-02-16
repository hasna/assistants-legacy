"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import { Badge } from "@/components/ui/badge"
import type { SkillRow } from "./page"

const columns: ColumnDef<SkillRow>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.name}</span>
    ),
  },
  {
    accessorKey: "path",
    header: "Path",
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.path}</span>
    ),
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className={
          row.original.type === "built-in"
            ? "bg-blue-100 text-blue-800"
            : "bg-green-100 text-green-800"
        }
      >
        {row.original.type}
      </Badge>
    ),
  },
]

export function SkillsClient({ data }: { data: SkillRow[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Skills</h1>
        <p className="text-muted-foreground text-sm">
          Discovered skills from user and built-in directories.
        </p>
      </div>
      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground text-sm">
            No skills found. Add skills to{" "}
            <code className="bg-muted rounded px-1 py-0.5 text-xs">
              ~/.assistants/skills/
            </code>{" "}
            to get started.
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data}
          filterColumn="name"
          filterPlaceholder="Filter by name..."
        />
      )}
    </div>
  )
}
