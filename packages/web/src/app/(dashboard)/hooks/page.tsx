import { getDb } from "@/lib/db"
import { HooksClient } from "./client"

export interface HookRow {
  id: string
  event: string
  matcher: string | null
  type: string
  name: string
  description: string | null
  command: string | null
  prompt: string | null
  enabled: number
  status_message: string | null
  scope: string | null
  source: string | null
  priority: number
  created_at: string
}

export default function HooksPage() {
  let data: HookRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare(
        "SELECT id, event, matcher, type, name, description, command, prompt, enabled, status_message, scope, source, priority, created_at FROM hooks ORDER BY created_at DESC LIMIT 500"
      )
      .all() as HookRow[]
  } catch {
    /* table may not exist */
  }
  return <HooksClient data={data} />
}
