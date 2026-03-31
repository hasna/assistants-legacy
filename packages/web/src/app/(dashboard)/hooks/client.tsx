"use client"

import { useState, useCallback } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/dashboard/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog"
import { toast } from "@/lib/toast"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import type { HookRow } from "./page"

const HOOK_EVENTS = [
  "SessionStart", "SessionEnd", "UserPromptSubmit",
  "PreToolUse", "PostToolUse", "PostToolUseFailure",
  "PermissionRequest", "Notification",
  "SubassistantStart", "SubassistantStop",
  "PreCompact", "Stop",
]

const HOOK_TYPES = ["cmd", "llm", "ast"]

function formatDate(date: string | number | null): string {
  if (!date) return "\u2014"
  const d = new Date(typeof date === "number" && date < 1e12 ? date * 1000 : date)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

function CreateHookDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [event, setEvent] = useState("")
  const [type, setType] = useState("")
  const [name, setName] = useState("")
  const [matcher, setMatcher] = useState("")
  const [description, setDescription] = useState("")
  const [command, setCommand] = useState("")
  const [prompt, setPrompt] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!event || !type || !name.trim()) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch("/api/hooks/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event,
          type,
          name: name.trim(),
          matcher: matcher.trim() || undefined,
          description: description.trim() || undefined,
          command: type === "cmd" ? command.trim() || undefined : undefined,
          prompt: type === "llm" ? prompt.trim() || undefined : undefined,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? "Create failed")
      toast.success("Hook created")
      onCreated()
      onOpenChange(false)
      setEvent(""); setType(""); setName(""); setMatcher(""); setDescription(""); setCommand(""); setPrompt("")
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      toast.error(msg)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Hook</DialogTitle>
          <DialogDescription>Add a new lifecycle hook</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Event</Label>
            <Select value={event} onValueChange={setEvent}>
              <SelectTrigger><SelectValue placeholder="Select event..." /></SelectTrigger>
              <SelectContent>
                {HOOK_EVENTS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
              <SelectContent>
                {HOOK_TYPES.map((t) => <SelectItem key={t} value={t}>{t === "cmd" ? "Command" : t === "llm" ? "LLM Prompt" : "Assistant"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Name</Label><Input placeholder="my-hook" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Matcher (optional)</Label><Input placeholder="tool_name or regex pattern" value={matcher} onChange={(e) => setMatcher(e.target.value)} /></div>
          <div><Label>Description (optional)</Label><Input placeholder="What does this hook do?" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          {type === "cmd" && <div><Label>Command</Label><Input placeholder="echo 'hello'" value={command} onChange={(e) => setCommand(e.target.value)} /></div>}
          {type === "llm" && <div><Label>Prompt</Label><Input placeholder="Summarize the tool output" value={prompt} onChange={(e) => setPrompt(e.target.value)} /></div>}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button onClick={handleCreate} disabled={creating || !event || !type || !name.trim()} className="w-full">
            {creating ? "Creating..." : "Create Hook"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function HooksClient({ data: initialData }: { data: HookRow[] }) {
  useAutoRefresh()
  const [data, setData] = useState(initialData)
  const [showCreate, setShowCreate] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string } | null>(null)

  const refresh = useCallback(() => { window.location.reload() }, [])

  const handleToggle = async (id: string) => {
    setToggling(id)
    try {
      await fetch("/api/hooks/toggle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
      setData((prev) => prev.map((h) => h.id === id ? { ...h, enabled: h.enabled ? 0 : 1 } : h))
      toast.success("Hook toggled")
    } catch { toast.error("Failed to toggle hook") } finally { setToggling(null) }
  }

  const requestDelete = (id: string, name: string) => {
    setConfirmTarget({ id, name })
    setConfirmOpen(true)
  }

  const handleDelete = async () => {
    const target = confirmTarget
    if (!target) return
    setConfirmOpen(false)
    setDeleting(target.id)
    try {
      await fetch("/api/hooks/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: target.id }) })
      toast.success("Hook deleted")
      setData((prev) => prev.filter((h) => h.id !== target.id))
    } catch { toast.error("Failed to delete hook") } finally { setDeleting(null); setConfirmTarget(null) }
  }

  const columns: ColumnDef<HookRow>[] = [
    { accessorKey: "event", header: "Event", cell: ({ row }) => <Badge variant="outline">{row.original.event}</Badge> },
    { accessorKey: "name", header: "Name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { accessorKey: "type", header: "Type", cell: ({ row }) => <Badge variant="secondary">{row.original.type}</Badge> },
    {
      accessorKey: "description", header: "Description",
      cell: ({ row }) => {
        const text = row.original.description
        if (!text) return <span className="text-muted-foreground">{"\u2014"}</span>
        return <span className="max-w-xs truncate block" title={text}>{text.length > 60 ? text.slice(0, 60) + "\u2026" : text}</span>
      },
    },
    {
      accessorKey: "command", header: "Command/Prompt",
      cell: ({ row }) => {
        const text = row.original.command || row.original.prompt
        if (!text) return <span className="text-muted-foreground">{"\u2014"}</span>
        return <span className="font-mono text-xs" title={text}>{text.length > 40 ? text.slice(0, 40) + "\u2026" : text}</span>
      },
    },
    {
      accessorKey: "matcher", header: "Matcher",
      cell: ({ row }) => row.original.matcher ? <code className="text-xs bg-muted px-1 rounded">{row.original.matcher}</code> : <span className="text-muted-foreground">{"\u2014"}</span>,
    },
    {
      id: "enabled", header: "Enabled",
      cell: ({ row }) => (
        <Button
          size="sm"
          variant={row.original.enabled ? "default" : "outline"}
          className={row.original.enabled ? "bg-green-600 hover:bg-green-700 text-white h-7 px-2" : "h-7 px-2"}
          onClick={() => handleToggle(row.original.id)}
          disabled={toggling === row.original.id}
        >
          {toggling === row.original.id ? "..." : row.original.enabled ? "ON" : "OFF"}
        </Button>
      ),
    },
    {
      id: "actions", header: "",
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="ghost"
          className="text-red-500 hover:text-red-700 hover:bg-red-50"
          onClick={() => requestDelete(row.original.id, row.original.name)}
          disabled={deleting === row.original.id}
        >
          {deleting === row.original.id ? "..." : "Delete"}
        </Button>
      ),
    },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="shrink-0">
          <h1 className="text-2xl font-bold tracking-tight">Hooks</h1>
          <p className="text-muted-foreground text-sm">Lifecycle hooks and event interceptors.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>↻ Refresh</Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>+ Create Hook</Button>
        </div>
      </div>
      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground text-sm mb-4">No hooks configured.</p>
          <Button onClick={() => setShowCreate(true)}>Create Your First Hook</Button>
        </div>
      ) : (
        <DataTable columns={columns} data={data} filterColumn="name" filterPlaceholder="Filter hooks..." />
      )}
      <CreateHookDialog open={showCreate} onOpenChange={setShowCreate} onCreated={refresh} />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete hook "${confirmTarget?.name}"?`}
        description="This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
