"use client"

import { useState } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ContactRow, CompanyRow } from "./page"

function formatDate(date: string | number | null): string {
  if (!date) return "\u2014"
  const d = new Date(typeof date === "number" && date < 1e12 ? date * 1000 : date)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

const contactColumns: ColumnDef<ContactRow>[] = [
  {
    accessorKey: "display_name",
    header: "Name",
    cell: ({ row }) => (
      <div>
        <span className="font-medium">{row.original.display_name || `${row.original.first_name ?? ""} ${row.original.last_name ?? ""}`.trim() || "—"}</span>
        {row.original.job_title && <span className="ml-1.5 text-xs text-muted-foreground">{row.original.job_title}</span>}
      </div>
    ),
  },
  {
    accessorKey: "company_name",
    header: "Company",
    cell: ({ row }) => row.original.company_name ?? <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: "primary_email",
    header: "Email",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {row.original.primary_email ?? "—"}
      </span>
    ),
  },
  {
    accessorKey: "primary_phone",
    header: "Phone",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {row.original.primary_phone ?? "—"}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const s = row.original.status
      if (!s || s === "active") return null
      return <Badge variant="outline">{s}</Badge>
    },
  },
  {
    accessorKey: "updated_at",
    header: "Updated",
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.updated_at)}</span>,
  },
]

const companyColumns: ColumnDef<CompanyRow>[] = [
  {
    accessorKey: "name",
    header: "Company",
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: "domain",
    header: "Domain",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground font-mono">{row.original.domain ?? "—"}</span>
    ),
  },
  {
    accessorKey: "industry",
    header: "Industry",
    cell: ({ row }) => row.original.industry ?? <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: "created_at",
    header: "Added",
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.created_at)}</span>,
  },
]

const emptyState = (label: string, cmd: string) => (
  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
    <p className="text-muted-foreground text-sm">
      No {label} yet. Use the <code className="bg-muted rounded px-1 py-0.5 text-xs">{cmd}</code> tool or @hasna/contacts CLI.
    </p>
  </div>
)

export function ContactsClient({ contacts, companies }: { contacts: ContactRow[]; companies: CompanyRow[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contacts</h1>
        <p className="text-muted-foreground text-sm">
          Stored in <code className="bg-muted rounded px-1 py-0.5 text-xs">~/.contacts/contacts.db</code> via @hasna/contacts
        </p>
      </div>
      <Tabs defaultValue="contacts">
        <TabsList>
          <TabsTrigger value="contacts">Contacts ({contacts.length})</TabsTrigger>
          <TabsTrigger value="companies">Companies ({companies.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="contacts" className="mt-4">
          {contacts.length === 0 ? emptyState("contacts", "contacts_create") : (
            <DataTable columns={contactColumns} data={contacts} filterColumn="display_name" filterPlaceholder="Filter by name..." />
          )}
        </TabsContent>
        <TabsContent value="companies" className="mt-4">
          {companies.length === 0 ? emptyState("companies", "contacts_companies_create") : (
            <DataTable columns={companyColumns} data={companies} filterColumn="name" filterPlaceholder="Filter by company..." />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
