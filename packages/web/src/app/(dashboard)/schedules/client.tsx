"use client"

import { useRouter } from "next/navigation"
import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/lib/toast"

/**
 * Parse raw schedule JSON string into a human-readable description.
 * e.g. {"kind":"interval","interval":120,"unit":"seconds"} → "Every 2 minutes"
 */
function parseSchedule(raw: string): { label: string; type: string } {
  try {
    const s = JSON.parse(raw) as Record<string, unknown>
    const kind = String(s.kind ?? "")

    if (kind === "interval") {
      const interval = Number(s.interval ?? 0)
      const unit = String(s.unit ?? "seconds")
      let seconds = interval
      if (unit === "minutes") seconds = interval * 60
      if (unit === "hours") seconds = interval * 3600

      if (seconds < 60) return { label: `Every ${seconds}s`, type: "interval" }
      if (seconds < 3600) return { label: `Every ${Math.round(seconds / 60)}m`, type: "interval" }
      return { label: `Every ${Math.round(seconds / 3600)}h`, type: "interval" }
    }

    if (kind === "cron") {
      const cron = String(s.cron ?? "")
      // Simple human labels for common cron patterns
      const cronMap: Record<string, string> = {
        "* * * * *": "Every minute",
        "*/5 * * * *": "Every 5 min",
        "*/10 * * * *": "Every 10 min",
        "*/15 * * * *": "Every 15 min",
        "*/30 * * * *": "Every 30 min",
        "0 * * * *": "Every hour",
        "0 0 * * *": "Daily midnight",
        "0 9 * * *": "Daily 9am",
        "0 9 * * 1": "Weekly Mon 9am",
      }
      return { label: cronMap[cron] ?? `Cron: ${cron}`, type: "cron" }
    }

    if (kind === "once" && s.at) {
      const date = new Date(String(s.at))
      return {
        label: `Once: ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
        type: "once",
      }
    }

    if (kind === "random") {
      const min = s.minInterval ?? "?"
      const max = s.maxInterval ?? "?"
      const unit = s.unit ?? "min"
      return { label: `Random ${min}–${max} ${unit}`, type: "random" }
    }

    return { label: raw.slice(0, 40), type: kind || "unknown" }
  } catch {
    return { label: raw.slice(0, 40), type: "unknown" }
  }
}

function scheduleTypeBadge(type: string) {
  const colors: Record<string, string> = {
    interval: "bg-blue-100 text-blue-800",
    cron: "bg-purple-100 text-purple-800",
    once: "bg-gray-100 text-gray-700",
    random: "bg-orange-100 text-orange-800",
  }
  const cls = colors[type] ?? "bg-gray-100 text-gray-600"
  return <Badge className={cls}>{type}</Badge>
}

export interface ScheduleRow {
  id: string
  project_path: string
  command: string
  schedule: string
  status: string
  session_id: string | null
  next_run_at: string | null
  last_run_at: string | null
  run_count: number
  created_at: string
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

const columns: ColumnDef<ScheduleRow>[] = [
  {
    accessorKey: "id",
    header: "ID",
    cell: ({ row }) => (
      <code className="text-xs">{row.original.id.slice(0, 8)}</code>
    ),
  },
  {
    accessorKey: "command",
    header: "Command",
  },
  {
    accessorKey: "schedule",
    header: "Type",
    cell: ({ row }) => {
      const { type } = parseSchedule(row.original.schedule)
      return scheduleTypeBadge(type)
    },
  },
  {
    id: "schedule_human",
    header: "Schedule",
    cell: ({ row }) => {
      const { label } = parseSchedule(row.original.schedule)
      return <span className="text-sm font-medium">{label}</span>
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => statusBadge(row.original.status),
  },
  {
    accessorKey: "next_run_at",
    header: "Next Run",
    cell: ({ row }) => formatDate(row.original.next_run_at),
  },
  {
    accessorKey: "last_run_at",
    header: "Last Run",
    cell: ({ row }) => formatDate(row.original.last_run_at),
  },
  {
    accessorKey: "run_count",
    header: "Run Count",
  },
  {
    accessorKey: "project_path",
    header: "Project",
    cell: ({ row }) => {
      const p = row.original.project_path
      if (!p) return <span className="text-muted-foreground">—</span>
      const parts = p.replace(/\\/g, "/").split("/")
      const name = parts[parts.length - 1] || p
      return <span className="text-xs" title={p}>{name}</span>
    },
  },
  {
    id: "actions",
    header: "",
    cell: function ActionsCell({ row }) {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const router = useRouter()
      const isActive = row.original.status === "active"

      const handle = async (action: "pause" | "resume" | "delete") => {
        const res = await fetch(`/api/schedules/${row.original.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        })
        if (res.ok) {
          toast.success(action === "delete" ? "Schedule deleted" : action === "pause" ? "Schedule paused" : "Schedule resumed")
          router.refresh()
        } else {
          toast.error(`Failed to ${action} schedule`)
        }
      }

      return (
        <div className="flex items-center gap-1">
          {isActive ? (
            <button onClick={() => handle("pause")} className="rounded px-2 py-1 text-xs border hover:bg-accent" title="Pause">⏸</button>
          ) : (
            <button onClick={() => handle("resume")} className="rounded px-2 py-1 text-xs border hover:bg-accent" title="Resume">▶</button>
          )}
          <button onClick={() => { if (confirm("Delete this schedule?")) handle("delete") }} className="rounded px-2 py-1 text-xs border hover:bg-red-50 hover:text-red-600" title="Delete">🗑</button>
        </div>
      )
    },
  },
]

export function SchedulesClient({ data }: { data: ScheduleRow[] }) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Schedules</h1>
      <DataTable
        columns={columns}
        data={data}
        filterColumn="command"
        filterPlaceholder="Filter by command..."
      />
    </div>
  )
}
