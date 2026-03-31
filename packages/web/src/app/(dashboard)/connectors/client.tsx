"use client"

import { useEffect, useState, useCallback } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog"
import { toast } from "@/lib/toast"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import type { ConnectorRow } from "./page"

interface RegistryConnector {
  name: string
  displayName: string
  description: string
  category: string
  tags: string[]
  version?: string
}

function useConnectorStatus(connectorName: string) {
  const [status, setStatus] = useState<"checking" | "ok" | "unavailable">("checking")
  const [key, setKey] = useState(0)

  useEffect(() => {
    setStatus("checking")
    fetch(`/api/connectors/status?name=${encodeURIComponent(connectorName)}`, { signal: AbortSignal.timeout(3000) })
      .then((r) => r.json() as Promise<{ ok: boolean }>)
      .then((d) => setStatus(d.ok ? "ok" : "unavailable"))
      .catch(() => setStatus("unavailable"))
  }, [connectorName, key])

  return { status, retest: () => setKey((k) => k + 1) }
}

function StatusDot({ name }: { name: string }) {
  const { status, retest } = useConnectorStatus(name)
  const dotClass =
    status === "checking"
      ? "bg-gray-300 animate-pulse"
      : status === "ok"
        ? "bg-green-500"
        : "bg-red-400"

  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block w-2 h-2 rounded-full ${dotClass}`} />
      <button
        onClick={retest}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        disabled={status === "checking"}
      >
        ↻
      </button>
    </div>
  )
}

function formatDate(date: string | number | null): string {
  if (!date) return "—"
  const d = new Date(typeof date === "number" && date < 1e12 ? date * 1000 : date)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

function parseData(raw: string): { name?: string; version?: string; description?: string; toolCount?: number } {
  try {
    const parsed = JSON.parse(raw)
    return {
      name: parsed.name ?? parsed.displayName,
      version: parsed.version,
      description: parsed.description,
      toolCount: Array.isArray(parsed.tools) ? parsed.tools.length : undefined,
    }
  } catch {
    return {}
  }
}

function InstallDialog({ open, onOpenChange, onInstalled }: { open: boolean; onOpenChange: (v: boolean) => void; onInstalled: () => void }) {
  const [search, setSearch] = useState("")
  const [results, setResults] = useState<RegistryConnector[]>([])
  const [loading, setLoading] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const doSearch = useCallback(async (q: string) => {
    setLoading(true)
    setError(null)
    try {
      const url = q ? `/api/connectors/list?q=${encodeURIComponent(q)}` : "/api/connectors/list"
      const res = await fetch(url)
      const data = await res.json()
      setResults(data.connectors ?? [])
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) doSearch("")
  }, [open, doSearch])

  const handleInstall = async (name: string) => {
    setInstalling(name)
    setError(null)
    try {
      const res = await fetch("/api/connectors/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? "Install failed")
      toast.success(`Connector "${name}" installed`)
      onInstalled()
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      toast.error(msg)
    } finally {
      setInstalling(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Install Connector</DialogTitle>
          <DialogDescription>Search and install from the @hasna/connectors registry (843 connectors)</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            placeholder="Search connectors (e.g. stripe, gmail, slack)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch(search)}
          />
          <Button onClick={() => doSearch(search)} disabled={loading} variant="outline" size="sm">
            {loading ? "..." : "Search"}
          </Button>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex-1 overflow-auto space-y-1 min-h-0">
          {results.slice(0, 50).map((c) => (
            <div key={c.name} className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-accent/50 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{c.displayName || c.name}</span>
                  <Badge variant="outline" className="text-[10px]">{c.category}</Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">{c.description}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleInstall(c.name)}
                disabled={installing === c.name}
                className="ml-2 shrink-0"
              >
                {installing === c.name ? "Installing..." : "Install"}
              </Button>
            </div>
          ))}
          {!loading && results.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No connectors found. Try a different search.</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ConnectorsClient({ data: initialData }: { data: ConnectorRow[] }) {
  useAutoRefresh()
  const [data, setData] = useState(initialData)
  const [showInstall, setShowInstall] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null)

  const refresh = useCallback(() => {
    window.location.reload()
  }, [])

  const requestRemove = (name: string) => {
    setConfirmTarget(name)
    setConfirmOpen(true)
  }

  const handleRemove = async () => {
    const name = confirmTarget
    if (!name) return
    setConfirmOpen(false)
    setRemoving(name)
    try {
      await fetch("/api/connectors/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      toast.success(`Connector "${name}" removed`)
      setData((prev) => prev.filter((r) => r.key !== name))
    } catch {
      toast.error("Failed to remove connector")
    } finally {
      setRemoving(null)
      setConfirmTarget(null)
    }
  }

  const columns: ColumnDef<ConnectorRow>[] = [
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusDot name={row.original.key} />,
    },
    {
      accessorKey: "key",
      header: "Connector",
      cell: ({ row }) => {
        const parsed = parseData(row.original.data)
        return (
          <div>
            <span className="font-medium">{parsed.name ?? row.original.key}</span>
            {parsed.version && <span className="ml-1 text-xs text-muted-foreground">v{parsed.version}</span>}
          </div>
        )
      },
    },
    {
      id: "description",
      header: "Description",
      cell: ({ row }) => {
        const parsed = parseData(row.original.data)
        const desc = parsed.description
        return <span className="text-sm text-muted-foreground">{desc ? (desc.length > 80 ? desc.slice(0, 80) + "…" : desc) : "—"}</span>
      },
    },
    {
      id: "tools",
      header: "Tools",
      cell: ({ row }) => {
        const parsed = parseData(row.original.data)
        if (parsed.toolCount === undefined) return <span className="text-muted-foreground">—</span>
        return <Badge variant="secondary">{parsed.toolCount} tools</Badge>
      },
    },
    {
      accessorKey: "cached_at",
      header: "Cached",
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.cached_at)}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="ghost"
          className="text-red-500 hover:text-red-700 hover:bg-red-50"
          onClick={() => requestRemove(row.original.key)}
          disabled={removing === row.original.key}
        >
          {removing === row.original.key ? "..." : "Remove"}
        </Button>
      ),
    },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="shrink-0">
          <h1 className="text-2xl font-bold tracking-tight">Connectors</h1>
          <p className="text-muted-foreground text-sm">Installed connectors and their cached metadata.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            ↻ Refresh
          </Button>
          <Button size="sm" onClick={() => setShowInstall(true)}>
            + Install Connector
          </Button>
        </div>
      </div>
      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground text-sm mb-4">No connectors cached yet.</p>
          <Button onClick={() => setShowInstall(true)}>Install Your First Connector</Button>
        </div>
      ) : (
        <DataTable columns={columns} data={data} filterColumn="key" filterPlaceholder="Filter connectors..." />
      )}
      <InstallDialog open={showInstall} onOpenChange={setShowInstall} onInstalled={refresh} />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Remove connector "${confirmTarget}"?`}
        description="This action cannot be undone."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleRemove}
      />
    </div>
  )
}
