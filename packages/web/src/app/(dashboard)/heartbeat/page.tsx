import { getDb } from "@/lib/db"
import { HeartbeatClient } from "./client"

export interface HeartbeatRow {
  id: number
  session_id: string
  status: string
  energy: number | null
  context_tokens: number | null
  action: string | null
  timestamp: string
}

export default function HeartbeatPage() {
  let data: HeartbeatRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare(
        "SELECT id, session_id, status, energy, context_tokens, action, timestamp FROM heartbeat_history ORDER BY timestamp DESC LIMIT 500"
      )
      .all() as HeartbeatRow[]
  } catch {
    /* table may not exist */
  }
  return <HeartbeatClient data={data} />
}
