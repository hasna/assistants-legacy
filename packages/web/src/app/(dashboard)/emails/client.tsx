"use client"

import { useState } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import { Badge } from "@/components/ui/badge"

export interface EmailRow {
  id: string
  from_address: string | null
  to_address: string | null
  subject: string | null
  body: string | null
  status: string | null
  direction: string | null
  created_at: string | number
}

function formatDate(date: string | number | null): string {
  if (!date) return "\u2014"
  const d = new Date(typeof date === "number" && date < 1e12 ? date * 1000 : date)
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const sentColumns: ColumnDef<EmailRow>[] = [
  {
    accessorKey: "to_address",
    header: "To",
    cell: ({ row }) => <span className="font-medium">{row.original.to_address || "\u2014"}</span>,
  },
  {
    accessorKey: "subject",
    header: "Subject",
    cell: ({ row }) => row.original.subject || <span className="text-muted-foreground">(no subject)</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const s = (row.original.status || "sent").toLowerCase()
      const cls = s === "delivered" || s === "sent" ? "bg-green-50 text-green-700" : s === "failed" ? "bg-red-50 text-red-700" : "bg-gray-50 text-gray-600"
      return <Badge className={`rounded-full ${cls}`}>{row.original.status || "sent"}</Badge>
    },
  },
  {
    accessorKey: "created_at",
    header: "Date",
    cell: ({ row }) => formatDate(row.original.created_at),
  },
]

const inboxColumns: ColumnDef<EmailRow>[] = [
  {
    accessorKey: "from_address",
    header: "From",
    cell: ({ row }) => <span className="font-medium">{row.original.from_address || "\u2014"}</span>,
  },
  {
    accessorKey: "subject",
    header: "Subject",
    cell: ({ row }) => row.original.subject || <span className="text-muted-foreground">(no subject)</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const s = (row.original.status || "received").toLowerCase()
      const cls = s === "read" ? "bg-gray-50 text-gray-600" : "bg-blue-50 text-blue-700"
      return <Badge className={`rounded-full ${cls}`}>{row.original.status || "received"}</Badge>
    },
  },
  {
    accessorKey: "created_at",
    header: "Date",
    cell: ({ row }) => formatDate(row.original.created_at),
  },
]

export function EmailsClient({ sent, inbox }: { sent: EmailRow[]; inbox: EmailRow[] }) {
  const [tab, setTab] = useState<"sent" | "inbox">("inbox")

  return (
    <div className="flex flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Emails</h1>
        <p className="text-muted-foreground text-sm">Sent and received emails.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setTab("inbox")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "inbox" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Inbox ({inbox.length})
        </button>
        <button
          onClick={() => setTab("sent")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "sent" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Sent ({sent.length})
        </button>
      </div>

      {tab === "inbox" ? (
        <DataTable columns={inboxColumns} data={inbox} filterColumn="from_address" filterPlaceholder="Filter by sender..." />
      ) : (
        <DataTable columns={sentColumns} data={sent} filterColumn="to_address" filterPlaceholder="Filter by recipient..." />
      )}
    </div>
  )
}
