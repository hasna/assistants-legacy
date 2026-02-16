import { getDb } from "@/lib/db"
import { MessagesClient } from "./client"

export interface AssistantMessageRow {
  id: string
  thread_id: string | null
  from_assistant_id: string
  from_assistant_name: string
  to_assistant_id: string
  to_assistant_name: string
  subject: string | null
  body: string
  priority: string | null
  status: string
  created_at: string
}

export default function MessagesPage() {
  let data: AssistantMessageRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare(
        "SELECT id, thread_id, from_assistant_id, from_assistant_name, to_assistant_id, to_assistant_name, subject, body, priority, status, created_at FROM assistant_messages ORDER BY created_at DESC LIMIT 500"
      )
      .all() as AssistantMessageRow[]
  } catch {
    /* table may not exist */
  }
  return <MessagesClient data={data} />
}
