import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { randomUUID } from 'crypto'

export async function POST(req: Request) {
  const body = await req.json() as {
    event?: string
    matcher?: string
    type?: string
    name?: string
    description?: string
    command?: string
    prompt?: string
    scope?: string
    priority?: number
  }

  if (!body.event || !body.name || !body.type) {
    return NextResponse.json({ error: 'event, name, and type are required' }, { status: 400 })
  }

  try {
    const db = getDb()

    // Ensure hooks table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS hooks (
        id TEXT PRIMARY KEY,
        event TEXT NOT NULL,
        matcher TEXT,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        command TEXT,
        prompt TEXT,
        enabled INTEGER DEFAULT 1,
        status_message TEXT,
        scope TEXT,
        source TEXT,
        priority INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      )
    `)

    const id = randomUUID()
    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO hooks (id, event, matcher, type, name, description, command, prompt, enabled, scope, source, priority, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'web', ?, ?)
    `).run(id, body.event, body.matcher ?? null, body.type, body.name, body.description ?? null, body.command ?? null, body.prompt ?? null, body.scope ?? null, body.priority ?? 0, now)

    return NextResponse.json({ success: true, id })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
