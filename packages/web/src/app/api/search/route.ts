import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

interface SearchResult {
  type: string
  id: string
  title: string
  subtitle?: string
  href: string
}

function safeSearch(db: ReturnType<typeof getDb>, table: string, columns: string[], term: string, type: string, hrefPrefix: string, titleCol: string, subtitleCol?: string): SearchResult[] {
  try {
    const where = columns.map((c) => `${c} LIKE ?`).join(" OR ")
    const params = columns.map(() => `%${term}%`)
    const rows = db.prepare(`SELECT id, ${titleCol}${subtitleCol ? `, ${subtitleCol}` : ""} FROM ${table} WHERE ${where} LIMIT 5`).all(...params) as Record<string, unknown>[]
    return rows.map((r) => ({
      type,
      id: String(r.id),
      title: String(r[titleCol] || r.id),
      subtitle: subtitleCol ? String(r[subtitleCol] || "") : undefined,
      href: `${hrefPrefix}`,
    }))
  } catch {
    return []
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = url.searchParams.get("q")?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  try {
    const db = getDb()
    const results: SearchResult[] = [
      ...safeSearch(db, "persisted_sessions", ["label", "id"], q, "session", "/sessions", "label", "cwd"),
      ...safeSearch(db, "tasks", ["description", "id"], q, "task", "/tasks", "description", "status"),
      ...safeSearch(db, "memories", ["key", "value", "summary"], q, "memory", "/memory", "key", "scope"),
      ...safeSearch(db, "schedules", ["command"], q, "schedule", "/schedules", "command", "status"),
    ]
    return NextResponse.json({ results: results.slice(0, 15) })
  } catch {
    return NextResponse.json({ results: [] })
  }
}
