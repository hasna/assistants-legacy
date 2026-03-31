"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"

interface TranscriptSession {
  id: string
  cwd: string
  startedAt: number
  updatedAt: number
  label: string | null
  status: string
  assistantId: string | null
}

interface TranscriptMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp: number
  toolCalls?: Array<{ id: string; name: string; input?: unknown }>
  toolResults?: Array<{ toolCallId: string; content: string; isError?: boolean }>
}

function formatDate(ts: number): string {
  const d = new Date(ts < 1e12 ? ts * 1000 : ts)
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatTime(ts: number): string {
  const d = new Date(ts < 1e12 ? ts * 1000 : ts)
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function statusBadge(status: string) {
  const s = status.toLowerCase()
  if (["active", "running"].includes(s))
    return <Badge className="rounded-full bg-blue-50 text-blue-700">{status}</Badge>
  if (["completed", "done"].includes(s))
    return <Badge className="rounded-full bg-green-50 text-green-700">{status}</Badge>
  return <Badge className="rounded-full">{status}</Badge>
}

function roleBadge(role: string) {
  if (role === "user") return <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">User</span>
  if (role === "assistant") return <span className="text-xs font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">Assistant</span>
  return <span className="text-xs font-semibold text-gray-600 bg-gray-50 px-2 py-0.5 rounded-full">{role}</span>
}

function exportAsMarkdown(session: TranscriptSession, messages: TranscriptMessage[]) {
  const title = session.label || `Session ${session.id.slice(0, 8)}`
  const lines: string[] = [
    `# ${title}`,
    "",
    `- **Date**: ${new Date(session.startedAt < 1e12 ? session.startedAt * 1000 : session.startedAt).toISOString()}`,
    `- **Status**: ${session.status}`,
    `- **CWD**: ${session.cwd}`,
    `- **Messages**: ${messages.length}`,
    "",
    "---",
    "",
  ]

  for (const msg of messages) {
    const time = new Date(msg.timestamp < 1e12 ? msg.timestamp * 1000 : msg.timestamp)
      .toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    const role = msg.role === "user" ? "User" : msg.role === "assistant" ? "Assistant" : msg.role
    lines.push(`## ${role} (${time})`, "", msg.content, "")
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      lines.push(`> Tools: ${msg.toolCalls.map((tc) => tc.name).join(", ")}`, "")
    }
  }

  const blob = new Blob([lines.join("\n")], { type: "text/markdown" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${title.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}.md`
  a.click()
  URL.revokeObjectURL(url)
}

export function TranscriptClient({
  session,
  messages,
}: {
  session: TranscriptSession
  messages: TranscriptMessage[]
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/sessions" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Sessions
            </Link>
            <span className="text-muted-foreground/50">/</span>
            <h1 className="text-2xl font-bold tracking-tight">
              {session.label || `Session ${session.id.slice(0, 8)}`}
            </h1>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {statusBadge(session.status)}
            <span>{formatDate(session.startedAt)}</span>
            <span className="font-mono text-xs">{session.cwd}</span>
            <span>{messages.length} messages</span>
          </div>
        </div>
        <button
          onClick={() => exportAsMarkdown(session, messages)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent hover:-translate-y-px transition-all duration-150"
        >
          Export Markdown
        </button>
      </div>

      {/* Messages */}
      <div className="flex flex-col gap-3">
        {messages.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            No messages in this session.
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`rounded-xl border p-4 ${
                msg.role === "user"
                  ? "bg-blue-50/50 border-blue-100 dark:bg-blue-950/20 dark:border-blue-900/30"
                  : msg.role === "assistant"
                    ? "bg-card border-border"
                    : "bg-muted/30 border-border/50"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                {roleBadge(msg.role)}
                <span className="text-xs text-muted-foreground">
                  {formatTime(msg.timestamp)}
                </span>
              </div>
              <div className="text-sm whitespace-pre-wrap break-words">
                {msg.content}
              </div>
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="mt-3 border-t pt-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Tool calls: {msg.toolCalls.length}
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {msg.toolCalls.map((tc) => (
                      <Badge
                        key={tc.id}
                        variant="secondary"
                        className="text-xs font-mono"
                      >
                        {tc.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
