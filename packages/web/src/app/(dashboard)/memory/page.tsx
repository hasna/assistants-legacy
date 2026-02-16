import { getDb } from "@/lib/db"
import { MemoryClient } from "./client"

export interface MemoryRow {
  id: string
  scope: string
  scope_id: string | null
  category: string
  key: string
  value: string
  summary: string | null
  importance: number
  tags: string
  source: string
  created_at: string
  updated_at: string
}

export default function MemoryPage() {
  let data: MemoryRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare(
        "SELECT id, scope, scope_id, category, key, value, summary, importance, tags, source, created_at, updated_at FROM memories ORDER BY importance DESC, updated_at DESC LIMIT 500"
      )
      .all() as MemoryRow[]
  } catch {
    /* table may not exist */
  }
  return <MemoryClient data={data} />
}
