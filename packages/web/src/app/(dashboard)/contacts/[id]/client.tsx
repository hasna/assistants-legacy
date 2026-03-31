"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"

interface ContactData {
  id: string
  display_name: string
  first_name: string | null
  last_name: string | null
  job_title: string | null
  primary_email: string | null
  primary_phone: string | null
  company_name: string | null
  company_id: string | null
  notes: string | null
  addresses: string | null
  status: string
  archived: number
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

function statusBadge(status: string) {
  const s = status.toLowerCase()
  if (["active"].includes(s))
    return <Badge className="rounded-full bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">{status}</Badge>
  if (["inactive", "archived"].includes(s))
    return <Badge className="rounded-full bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400">{status}</Badge>
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

export function ContactDetailClient({ data }: { data: ContactData }) {
  const fullName = data.display_name || `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim() || "Unknown"

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Link href="/contacts" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Contacts
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <h1 className="text-2xl font-bold tracking-tight">{fullName}</h1>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {statusBadge(data.status)}
          {data.job_title && <span>{data.job_title}</span>}
          {data.company_name && <span>at <span className="font-medium text-foreground">{data.company_name}</span></span>}
        </div>
      </div>

      {/* Contact Info */}
      <div className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold mb-3">Contact Information</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="Name">{fullName}</Field>
          {data.first_name && <Field label="First Name">{data.first_name}</Field>}
          {data.last_name && <Field label="Last Name">{data.last_name}</Field>}
          <Field label="Email">
            {data.primary_email ? (
              <a href={`mailto:${data.primary_email}`} className="text-blue-600 hover:underline dark:text-blue-400">
                {data.primary_email}
              </a>
            ) : "\u2014"}
          </Field>
          <Field label="Phone">{data.primary_phone || "\u2014"}</Field>
          <Field label="Company">{data.company_name || "\u2014"}</Field>
          {data.job_title && <Field label="Job Title">{data.job_title}</Field>}
          <Field label="Status">{statusBadge(data.status)}</Field>
          <Field label="Created">{formatDate(data.created_at)}</Field>
          <Field label="Updated">{formatDate(data.updated_at)}</Field>
        </div>
      </div>

      {/* Addresses */}
      {data.addresses && (
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold mb-2">Addresses</h2>
          <pre className="text-sm whitespace-pre-wrap break-words font-mono bg-muted/50 rounded-lg p-3">
            {data.addresses}
          </pre>
        </div>
      )}

      {/* Notes */}
      {data.notes && (
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold mb-2">Notes</h2>
          <pre className="text-sm whitespace-pre-wrap break-words font-mono bg-muted/50 rounded-lg p-3">
            {data.notes}
          </pre>
        </div>
      )}
    </div>
  )
}
