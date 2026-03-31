"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import { Badge } from "@/components/ui/badge"

export interface RecordingRow {
  id: string
  session_id: string | null
  title: string | null
  duration_ms: number | null
  transcript: string | null
  audio_path: string | null
  format: string | null
  status: string
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

function formatDuration(ms: number | null): string {
  if (ms == null) return "\u2014"
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}

const columns: ColumnDef<RecordingRow>[] = [
  {
    accessorKey: "title",
    header: "Title",
    cell: ({ row }) => (
      <span className="font-medium">
        {row.original.title || `Recording ${row.original.id.slice(0, 8)}`}
      </span>
    ),
  },
  {
    accessorKey: "duration_ms",
    header: "Duration",
    cell: ({ row }) => formatDuration(row.original.duration_ms),
  },
  {
    accessorKey: "format",
    header: "Format",
    cell: ({ row }) =>
      row.original.format ? (
        <Badge variant="secondary" className="text-xs">{row.original.format}</Badge>
      ) : "\u2014",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const s = row.original.status.toLowerCase()
      const cls = s === "completed" ? "bg-green-50 text-green-700" : s === "failed" ? "bg-red-50 text-red-700" : "bg-yellow-50 text-yellow-700"
      return <Badge className={`rounded-full ${cls}`}>{row.original.status}</Badge>
    },
  },
  {
    accessorKey: "transcript",
    header: "Transcript",
    cell: ({ row }) => {
      const text = row.original.transcript
      if (!text) return <span className="text-muted-foreground">\u2014</span>
      return (
        <span className="text-xs text-muted-foreground" title={text}>
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

export function RecordingsClient({ data }: { data: RecordingRow[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Recordings</h1>
        <p className="text-muted-foreground text-sm">Audio recordings and transcripts.</p>
      </div>
      <DataTable
        columns={columns}
        data={data}
        filterColumn="title"
        filterPlaceholder="Filter by title..."
      />
    </div>
  )
}
