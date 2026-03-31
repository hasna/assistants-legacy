"use client"

import { useState, useCallback, useEffect } from "react"
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
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog"
import { toast } from "@/lib/toast"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import type { SkillRow } from "./page"

interface RegistrySkill {
  name: string
  displayName: string
  description: string
  category: string
  tags: string[]
}

function InstallDialog({ open, onOpenChange, onInstalled }: { open: boolean; onOpenChange: (v: boolean) => void; onInstalled: () => void }) {
  const [search, setSearch] = useState("")
  const [results, setResults] = useState<RegistrySkill[]>([])
  const [loading, setLoading] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const doSearch = useCallback(async (q: string) => {
    setLoading(true)
    setError(null)
    try {
      const url = q ? `/api/skills/registry?q=${encodeURIComponent(q)}` : "/api/skills/registry"
      const res = await fetch(url)
      const data = await res.json()
      setResults(data.skills ?? [])
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
      const res = await fetch("/api/skills/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? "Install failed")
      toast.success(`Skill "${name}" installed`)
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
          <DialogTitle>Install Skill</DialogTitle>
          <DialogDescription>Search and install from the @hasna/skills registry</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input placeholder="Search skills..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doSearch(search)} />
          <Button onClick={() => doSearch(search)} disabled={loading} variant="outline" size="sm">{loading ? "..." : "Search"}</Button>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex-1 overflow-auto space-y-1 min-h-0">
          {results.slice(0, 50).map((s) => (
            <div key={s.name} className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-accent/50 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{s.displayName || s.name}</span>
                  <Badge variant="outline" className="text-[10px]">{s.category}</Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">{s.description}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => handleInstall(s.name)} disabled={installing === s.name} className="ml-2 shrink-0">
                {installing === s.name ? "Installing..." : "Install"}
              </Button>
            </div>
          ))}
          {!loading && results.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No skills found.</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CreateDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("")
  const [tags, setTags] = useState("")
  const [isGlobal, setIsGlobal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!name.trim()) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch("/api/skills/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined, category: category.trim() || undefined, tags: tags.trim() || undefined, global: isGlobal }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? "Create failed")
      toast.success("Skill created")
      onCreated()
      onOpenChange(false)
      setName(""); setDescription(""); setCategory(""); setTags("")
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
          <DialogTitle>Create Skill</DialogTitle>
          <DialogDescription>Scaffold a new custom skill</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input placeholder="my-skill" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Description</Label><Input placeholder="What does this skill do?" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div><Label>Category</Label><Input placeholder="Development Tools" value={category} onChange={(e) => setCategory(e.target.value)} /></div>
          <div><Label>Tags (comma-separated)</Label><Input placeholder="api,testing" value={tags} onChange={(e) => setTags(e.target.value)} /></div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="skill-global" checked={isGlobal} onChange={(e) => setIsGlobal(e.target.checked)} />
            <Label htmlFor="skill-global">Global scope</Label>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button onClick={handleCreate} disabled={creating || !name.trim()} className="w-full">{creating ? "Creating..." : "Create Skill"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function SkillsClient({ data: initialData }: { data: SkillRow[] }) {
  useAutoRefresh()
  const [data, setData] = useState(initialData)
  const [showInstall, setShowInstall] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null)

  const refresh = useCallback(() => { window.location.reload() }, [])

  const requestDelete = (name: string) => {
    setConfirmTarget(name)
    setConfirmOpen(true)
  }

  const handleDelete = async () => {
    const name = confirmTarget
    if (!name) return
    setConfirmOpen(false)
    setDeleting(name)
    try {
      await fetch("/api/skills/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) })
      toast.success(`Skill "${name}" deleted`)
      setData((prev) => prev.filter((r) => r.name !== name))
    } catch { toast.error("Failed to delete skill") } finally { setDeleting(null); setConfirmTarget(null) }
  }

  const columns: ColumnDef<SkillRow>[] = [
    { accessorKey: "name", header: "Name", cell: ({ row }) => (<div><span className="font-medium">{row.original.name}</span>{row.original.argumentHint && <span className="ml-1 text-xs text-muted-foreground">{row.original.argumentHint}</span>}</div>) },
    { accessorKey: "description", header: "Description", cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.description ?? "\u2014"}</span> },
    { accessorKey: "type", header: "Type", cell: ({ row }) => (<Badge variant="outline" className={row.original.type === "built-in" ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"}>{row.original.type}</Badge>) },
    { accessorKey: "triggers", header: "Triggers", cell: ({ row }) => { const t = row.original.triggers; if (!t.length) return <span className="text-muted-foreground">{"\u2014"}</span>; return <div className="flex flex-wrap gap-1">{t.map((x) => <Badge key={x} variant="secondary" className="text-xs">{x}</Badge>)}</div> } },
    { accessorKey: "path", header: "Path", cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground truncate max-w-[200px] block">{row.original.path}</span> },
    { id: "actions", header: "", cell: ({ row }) => (<Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => requestDelete(row.original.name)} disabled={deleting === row.original.name}>{deleting === row.original.name ? "..." : "Delete"}</Button>) },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="shrink-0">
          <h1 className="text-2xl font-bold tracking-tight">Skills</h1>
          <p className="text-muted-foreground text-sm">Discovered skills from user and built-in directories.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>↻ Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>+ Create Skill</Button>
          <Button size="sm" onClick={() => setShowInstall(true)}>+ Install from Registry</Button>
        </div>
      </div>
      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground text-sm mb-4">No skills found.</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowCreate(true)}>Create a Skill</Button>
            <Button onClick={() => setShowInstall(true)}>Install from Registry</Button>
          </div>
        </div>
      ) : (
        <DataTable columns={columns} data={data} filterColumn="name" filterPlaceholder="Filter skills..." />
      )}
      <InstallDialog open={showInstall} onOpenChange={setShowInstall} onInstalled={refresh} />
      <CreateDialog open={showCreate} onOpenChange={setShowCreate} onCreated={refresh} />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete skill "${confirmTarget}"?`}
        description="This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
