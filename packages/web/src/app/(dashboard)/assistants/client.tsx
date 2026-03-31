"use client"

import { Badge } from "@/components/ui/badge"
import type { AssistantConfigRow, RegisteredAssistantRow } from "./page"

function formatDate(date: string | number | null): string {
  if (!date) return "\u2014"
  const d = new Date(typeof date === "number" && date < 1e12 ? date * 1000 : date)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function statusColor(status: string): string {
  const s = status.toLowerCase()
  if (["active", "running"].includes(s)) return "bg-blue-500"
  if (["completed", "done"].includes(s)) return "bg-green-500"
  if (["failed", "error"].includes(s)) return "bg-red-500"
  return "bg-gray-400"
}

function AssistantCard({ name, model, status, type, createdAt, isConfig }: {
  name: string
  model?: string | null
  status?: string
  type?: string | null
  createdAt?: string | number | null
  isConfig?: boolean
}) {
  const initials = name.slice(0, 2).toUpperCase()
  const colors = ["bg-blue-100 text-blue-700", "bg-purple-100 text-purple-700", "bg-green-100 text-green-700", "bg-orange-100 text-orange-700", "bg-pink-100 text-pink-700"]
  const colorIdx = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length
  const avatarClass = colors[colorIdx]

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarClass}`}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold truncate">{name}</h3>
            {status && (
              <span className={`h-2 w-2 rounded-full ${statusColor(status)}`} title={status} />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {model && (
              <Badge variant="secondary" className="text-xs">{model}</Badge>
            )}
            {type && (
              <Badge variant="outline" className="text-xs">{type}</Badge>
            )}
            {isConfig && (
              <Badge className="text-xs bg-purple-50 text-purple-700">configured</Badge>
            )}
          </div>
          {createdAt && (
            <p className="text-xs text-muted-foreground mt-2">Created {formatDate(createdAt)}</p>
          )}
        </div>
      </div>
    </div>
  )
}

export function AssistantsClient({
  configData,
  registeredData,
}: {
  configData: AssistantConfigRow[]
  registeredData: RegisteredAssistantRow[]
}) {
  const hasConfig = configData.length > 0
  const hasRegistered = registeredData.length > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Assistants</h1>
        <p className="text-muted-foreground text-sm">Configured and registered assistant profiles.</p>
      </div>

      {hasConfig && (
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Configurations</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {configData.map((a) => (
              <AssistantCard
                key={a.id}
                name={a.name}
                model={a.model}
                createdAt={a.created_at}
                isConfig
              />
            ))}
          </div>
        </div>
      )}

      {hasRegistered && (
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Registered Instances</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {registeredData.map((a) => (
              <AssistantCard
                key={a.id}
                name={a.name}
                model={a.model}
                status={a.status}
                type={a.type}
                createdAt={a.created_at}
              />
            ))}
          </div>
        </div>
      )}

      {!hasConfig && !hasRegistered && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <span className="text-3xl">🤖</span>
          </div>
          <h3 className="text-lg font-semibold">No assistants yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Create an assistant from the terminal to get started.</p>
        </div>
      )}
    </div>
  )
}
