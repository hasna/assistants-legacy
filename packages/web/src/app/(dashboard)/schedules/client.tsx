"use client"

import { useState } from "react"
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
  data: string | null
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
    cell: ({ row }) => {
      const date = formatDate(row.original.last_run_at)
      // Try to parse last result from data JSON
      let resultIcon: string | null = null
      try {
        const d = JSON.parse(row.original.data ?? '{}') as Record<string, unknown>
        const lastResult = d.lastResult ?? d.result ?? d.last_result
        if (typeof lastResult === 'string') {
          const r = lastResult.toLowerCase()
          if (r === 'success' || r === 'completed' || r === 'ok') resultIcon = '✓'
          else if (r === 'error' || r === 'failed' || r === 'failure') resultIcon = '✗'
        }
      } catch { /**/ }
      return (
        <div className="flex items-center gap-1.5">
          {resultIcon && (
            <span className={`text-xs font-bold ${resultIcon === '✓' ? 'text-green-600' : 'text-red-600'}`}>{resultIcon}</span>
          )}
          <span>{date}</span>
        </div>
      )
    },
  },
  {
    accessorKey: "run_count",
    header: "Runs",
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">{row.original.run_count ?? 0}</span>
    ),
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

function NewScheduleForm({ onClose }: { onClose: () => void }) {
  const [command, setCommand] = useState("")
  const [scheduleType, setScheduleType] = useState<'interval' | 'cron' | 'once'>('interval')
  const [intervalValue, setIntervalValue] = useState("60")
  const [intervalUnit, setIntervalUnit] = useState("seconds")
  const [cronExpression, setCronExpression] = useState("*/5 * * * *")
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  const save = async () => {
    if (!command.trim()) { toast.error("Command is required"); return }
    setSaving(true)
    const res = await fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: command.trim(), scheduleType, intervalValue: parseInt(intervalValue), intervalUnit, cronExpression }),
    })
    setSaving(false)
    if (res.ok) { toast.success("Schedule created"); onClose(); router.refresh() }
    else toast.error("Failed to create schedule")
  }

  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">New Schedule</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">✕</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Command *</label>
          <input className="w-full rounded border px-2 py-1.5 text-sm mt-0.5" placeholder="/my-skill or /command" value={command} onChange={e => setCommand(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Schedule Type</label>
          <div className="flex rounded-lg border overflow-hidden text-xs mt-0.5">
            {(['interval', 'cron', 'once'] as const).map(t => (
              <button key={t} onClick={() => setScheduleType(t)} className={`px-3 py-1.5 flex-1 ${scheduleType === t ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>{t}</button>
            ))}
          </div>
        </div>
        {scheduleType === 'interval' && (
          <>
            <div>
              <label className="text-xs text-muted-foreground">Every</label>
              <input type="number" min={1} className="w-full rounded border px-2 py-1 text-sm mt-0.5" value={intervalValue} onChange={e => setIntervalValue(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Unit</label>
              <select className="w-full rounded border px-2 py-1 text-sm mt-0.5" value={intervalUnit} onChange={e => setIntervalUnit(e.target.value)}>
                <option value="seconds">seconds</option>
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
              </select>
            </div>
          </>
        )}
        {scheduleType === 'cron' && (
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground">Cron Expression</label>
            <input className="w-full rounded border px-2 py-1 text-sm mt-0.5 font-mono" placeholder="*/5 * * * *" value={cronExpression} onChange={e => setCronExpression(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-0.5">Format: minute hour day month weekday</p>
          </div>
        )}
        {scheduleType === 'once' && (
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground">Runs immediately (once)</label>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="rounded bg-primary text-primary-foreground px-4 py-1.5 text-sm hover:bg-primary/90 disabled:opacity-50">{saving ? "Creating…" : "Create Schedule"}</button>
        <button onClick={onClose} className="rounded border px-4 py-1.5 text-sm hover:bg-accent">Cancel</button>
      </div>
    </div>
  )
}

export function SchedulesClient({ data }: { data: ScheduleRow[] }) {
  const [showNew, setShowNew] = useState(false)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Schedules</h1>
        <button onClick={() => setShowNew(true)} className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90">
          + New Schedule
        </button>
      </div>
      {showNew && <NewScheduleForm onClose={() => setShowNew(false)} />}
      <DataTable
        columns={columns}
        data={data}
        filterColumn="command"
        filterPlaceholder="Filter by command..."
      />
    </div>
  )
}
