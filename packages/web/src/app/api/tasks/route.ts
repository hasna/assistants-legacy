import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { randomUUID } from 'crypto'

export async function POST(req: Request) {
  try {
    const body = await req.json() as { description: string; priority?: string; status?: string }
    if (!body.description?.trim()) {
      return NextResponse.json({ error: 'description required' }, { status: 400 })
    }
    const db = getDb()
    const id = randomUUID()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO tasks (id, description, status, priority, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, body.description.trim(), body.status ?? 'pending', body.priority ?? 'normal', now, now)
    return NextResponse.json({ ok: true, id })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
