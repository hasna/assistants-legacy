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

export interface MemoryStats {
  byImportance: Record<number, number>
  byScope: Record<string, number>
  total: number
}

export default function MemoryPage() {
  let data: MemoryRow[] = []
  const stats: MemoryStats = { byImportance: {}, byScope: {}, total: 0 }
  try {
    const db = getDb()
    data = db
      .prepare(
        "SELECT id, scope, scope_id, category, key, value, summary, importance, tags, source, created_at, updated_at FROM memories ORDER BY importance DESC, updated_at DESC LIMIT 500"
      )
      .all() as MemoryRow[]

    stats.total = data.length
    for (const m of data) {
      const imp = m.importance ?? 5
      stats.byImportance[imp] = (stats.byImportance[imp] || 0) + 1
      stats.byScope[m.scope] = (stats.byScope[m.scope] || 0) + 1
    }
  } catch {
    /* table may not exist */
  }
  return <MemoryClient data={data} stats={stats} />
}
