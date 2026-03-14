import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams.get('q') ?? ''
    if (!q.trim()) return NextResponse.json({ sessions: [] })

    const db = getDb()
    const term = `%${q.toLowerCase()}%`
    const sessions = db.prepare(`
      SELECT id, cwd, started_at, updated_at, label, status
      FROM persisted_sessions
      WHERE LOWER(cwd) LIKE ? OR LOWER(COALESCE(label, '')) LIKE ? OR LOWER(id) LIKE ?
      ORDER BY updated_at DESC
      LIMIT 20
    `).all(term, term, term)

    return NextResponse.json({ sessions })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
