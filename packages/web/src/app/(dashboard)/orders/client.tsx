"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import { Badge } from "@/components/ui/badge"

export interface OrderRow {
  id: string
  store_name: string
  order_number: string
  description: string | null
  status: string
  total_amount: number | null
  currency: string | null
  tracking_number: string | null
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

const columns: ColumnDef<OrderRow>[] = [
  {
    accessorKey: "store_name",
    header: "Store",
  },
  {
    accessorKey: "order_number",
    header: "Order #",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => statusBadge(row.original.status),
  },
  {
    accessorKey: "total_amount",
    header: "Total",
    cell: ({ row }) => {
      const amount = row.original.total_amount
      const currency = row.original.currency ?? "USD"
      if (amount == null) return "\u2014"
      return `${currency} ${amount.toFixed(2)}`
    },
  },
  {
    accessorKey: "tracking_number",
    header: "Tracking",
    cell: ({ row }) => row.original.tracking_number ?? "\u2014",
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => formatDate(row.original.created_at),
  },
]

export function OrdersClient({ data }: { data: OrderRow[] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground text-sm">Order tracking across stores and marketplaces.</p>
        </div>
        <button className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent hover:-translate-y-px transition-all duration-150" title="Coming soon">+ New Order</button>
      </div>
      <DataTable
        columns={columns}
        data={data}
        filterColumn="store_name"
        filterPlaceholder="Filter by store..."
      />
    </div>
  )
}
