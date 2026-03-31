"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"

export interface ProjectRow {
  id: string
  project_path: string
  name: string
  description: string | null
  context: string | null
  created_at: string
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

const columns: ColumnDef<ProjectRow>[] = [
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "project_path",
    header: "Project Path",
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => formatDate(row.original.created_at),
  },
]

export function ProjectsClient({ data }: { data: ProjectRow[] }) {
  useAutoRefresh()
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground text-sm">
            Registered projects with their paths and context configurations.
          </p>
        </div>
        <button className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent hover:-translate-y-px transition-all duration-150" title="Coming soon">+ Add Project</button>
      </div>
      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 p-12 text-center">
          <p className="text-muted-foreground text-sm">
            No projects registered yet. Projects are created automatically when
            you start a session in a directory.
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
