import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function POST(req: Request) {
  const body = await req.json() as { id?: string; enabled?: boolean }
  if (!body.id) {
    return NextResponse.json({ error: 'Hook ID required' }, { status: 400 })
  }

  try {
    const db = getDb()
    const enabled = body.enabled === undefined ? undefined : (body.enabled ? 1 : 0)

    if (enabled !== undefined) {
      db.prepare('UPDATE hooks SET enabled = ? WHERE id = ?').run(enabled, body.id)
    } else {
      // Toggle
      db.prepare('UPDATE hooks SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END WHERE id = ?').run(body.id)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
