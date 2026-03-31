import { getDb } from "@/lib/db"
import { notFound } from "next/navigation"
import { TranscriptClient } from "./client"

interface SessionRow {
  id: string
  cwd: string
  started_at: number
  updated_at: number
  label: string | null
  status: string
  assistant_id: string | null
}

interface MessageRow {
  id: string
  session_id: string
  role: string
  content: string
  timestamp: number
  tool_calls: string | null
  tool_results: string | null
}

export default async function SessionTranscriptPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let session: SessionRow | null = null
  let messages: MessageRow[] = []

  try {
    const db = getDb()
    session = db
      .prepare("SELECT * FROM persisted_sessions WHERE id = ?")
      .get(id) as SessionRow | null

    if (session) {
      messages = db
        .prepare(
          "SELECT * FROM session_messages WHERE session_id = ? ORDER BY timestamp ASC LIMIT 1000"
        )
        .all(id) as MessageRow[]
    }
  } catch {
    /* table may not exist */
  }

  if (!session) {
    notFound()
  }

  return (
    <TranscriptClient
      session={{
        id: session.id,
        cwd: session.cwd,
        startedAt: session.started_at,
        updatedAt: session.updated_at,
        label: session.label,
        status: session.status,
        assistantId: session.assistant_id,
      }}
      messages={messages.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
        timestamp: m.timestamp,
        toolCalls: m.tool_calls ? JSON.parse(m.tool_calls) : undefined,
        toolResults: m.tool_results ? JSON.parse(m.tool_results) : undefined,
      }))}
    />
  )
}
