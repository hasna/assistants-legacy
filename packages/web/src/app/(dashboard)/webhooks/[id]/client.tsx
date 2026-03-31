"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"

interface WebhookData {
  id: string
  name: string
  source: string
  url: string
  secret: string | null
  events: string
  status: string
  delivery_count: number
  last_delivery_at: string | null
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
  if (["active", "enabled"].includes(s))
    return <Badge className="rounded-full bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">{status}</Badge>
  if (["inactive", "disabled", "paused"].includes(s))
    return <Badge className="rounded-full bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400">{status}</Badge>
  if (["error", "failed"].includes(s))
    return <Badge className="rounded-full bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300">{status}</Badge>
  return <Badge className="rounded-full">{status}</Badge>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="text-sm">{children}</div>
    </div>
  )
}

export function WebhookDetailClient({ data }: { data: WebhookData }) {
  const events = data.events ? data.events.split(",").map((e) => e.trim()).filter(Boolean) : []

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Link href="/webhooks" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Webhooks
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <h1 className="text-2xl font-bold tracking-tight">{data.name}</h1>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {statusBadge(data.status)}
          <span>{data.source}</span>
          <span>{data.delivery_count} deliveries</span>
        </div>
      </div>

      {/* Details */}
      <div className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold mb-3">Details</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="Name">{data.name}</Field>
          <Field label="Source">{data.source}</Field>
          <Field label="Status">{statusBadge(data.status)}</Field>
          <Field label="URL">
            <span className="font-mono text-xs break-all">{data.url}</span>
          </Field>
          <Field label="Delivery Count">{data.delivery_count}</Field>
          <Field label="Last Delivery">{formatDate(data.last_delivery_at)}</Field>
          <Field label="Created">{formatDate(data.created_at)}</Field>
        </div>
      </div>

      {/* Events */}
      {events.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold mb-2">Events</h2>
          <div className="flex flex-wrap gap-1.5">
            {events.map((event) => (
              <Badge key={event} variant="secondary" className="text-xs font-mono">
                {event}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Secret (masked) */}
      {data.secret && (
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold mb-2">Secret</h2>
          <span className="font-mono text-xs text-muted-foreground">{"*".repeat(32)}</span>
        </div>
      )}
    </div>
  )
}
