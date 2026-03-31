"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import { Badge } from "@/components/ui/badge"
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog"
import { toast } from "@/lib/toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"

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
    interval: "rounded-full bg-blue-50 text-blue-700",
    cron: "rounded-full bg-purple-50 text-purple-700",
    once: "rounded-full bg-gray-50 text-gray-600",
    random: "rounded-full bg-orange-50 text-orange-700",
  }
  const cls = colors[type] ?? "rounded-full bg-gray-50 text-gray-600"
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
    return <Badge className="rounded-full bg-blue-50 text-blue-700">{status}</Badge>
  }
  if (["completed", "done", "success"].includes(s)) {
    return <Badge className="rounded-full bg-green-50 text-green-700">{status}</Badge>
  }
  if (["failed", "error"].includes(s)) {
    return <Badge className="rounded-full bg-red-50 text-red-700">{status}</Badge>
  }
  if (["pending", "queued"].includes(s)) {
    return <Badge className="rounded-full bg-yellow-50 text-yellow-700">{status}</Badge>
  }
  return <Badge className="rounded-full">{status}</Badge>
}

const columns: ColumnDef<ScheduleRow>[] = [
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
    id: "actions",
    header: "",
    cell: function ActionsCell({ row }) {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const router = useRouter()
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const [confirmOpen, setConfirmOpen] = useState(false)
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
            <button onClick={() => handle("pause")} className="rounded-lg px-2 py-1 text-xs border border-border hover:bg-accent hover:-translate-y-px transition-all duration-150" title="Pause">Pause</button>
          ) : (
            <button onClick={() => handle("resume")} className="rounded-lg px-2 py-1 text-xs border border-border hover:bg-accent hover:-translate-y-px transition-all duration-150" title="Resume">Resume</button>
          )}
          <button onClick={() => setConfirmOpen(true)} className="rounded-lg px-2 py-1 text-xs border border-border hover:bg-red-50 hover:text-red-600 hover:-translate-y-px transition-all duration-150" title="Delete">Delete</button>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Delete this schedule?"
            description="This action cannot be undone."
            confirmLabel="Delete"
            variant="destructive"
            onConfirm={() => { setConfirmOpen(false); handle("delete") }}
          />
        </div>
      )
    },
  },
]

function NewScheduleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
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
    if (res.ok) { toast.success("Schedule created"); onOpenChange(false); router.refresh(); setCommand("") }
    else toast.error("Failed to create schedule")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Schedule</DialogTitle>
        </DialogHeader>
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
        <div className="flex gap-2 justify-end">
          <button onClick={() => onOpenChange(false)} className="rounded border px-4 py-1.5 text-sm hover:bg-accent">Cancel</button>
          <button onClick={save} disabled={saving} className="rounded bg-primary text-primary-foreground px-4 py-1.5 text-sm hover:bg-primary/90 disabled:opacity-50">{saving ? "Creating..." : "Create"}</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function SchedulesClient({ data }: { data: ScheduleRow[] }) {
  useAutoRefresh()
  const [showNew, setShowNew] = useState(false)
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Schedules</h1>
        <button onClick={() => setShowNew(true)} className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 hover:-translate-y-px transition-all duration-150 shadow-xs hover:shadow-sm">
          + New Schedule
        </button>
      </div>
      <NewScheduleDialog open={showNew} onOpenChange={setShowNew} />
      <DataTable
        columns={columns}
        data={data}
        filterColumn="command"
        filterPlaceholder="Filter by command..."
      />
    </div>
  )
}
