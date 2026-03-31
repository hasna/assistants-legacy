"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import type { WalletCardRow } from "./page"

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

const columns: ColumnDef<WalletCardRow>[] = [
  {
    accessorKey: "id",
    header: "ID",
    cell: ({ row }) => (
      <code className="text-xs">{row.original.id.slice(0, 8)}</code>
    ),
  },
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "card_number",
    header: "Card Number",
    cell: ({ row }) => {
      const masked = "****" + row.original.card_number.slice(-4)
      return <code className="text-xs">{masked}</code>
    },
  },
  {
    accessorKey: "card_type",
    header: "Card Type",
    cell: ({ row }) => row.original.card_type ?? "\u2014",
  },
  {
    id: "expiry",
    header: "Expiry",
    cell: ({ row }) => {
      const month = String(row.original.expiry_month).padStart(2, "0")
      const year = String(row.original.expiry_year).slice(-2)
      return `${month}/${year}`
    },
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => formatDate(row.original.created_at),
  },
]

export function WalletClient({ data }: { data: WalletCardRow[] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Wallet</h1>
        <p className="text-muted-foreground text-sm">Payment cards and billing information.</p>
      </div>
      <DataTable
        columns={columns}
        data={data}
        filterColumn="name"
        filterPlaceholder="Filter by name..."
      />
    </div>
  )
}
